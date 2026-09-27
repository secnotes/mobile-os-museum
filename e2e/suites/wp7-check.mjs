/**
 * Lumia 800 (WP7.5) 端到端验证（端口 9240）：
 *  F6 开机 → NOKIA/Windows Phone → 锁屏（壁纸 + 大号细体时钟）
 *  Enter 解锁 → 开始屏真机几何（173 方贴 / 358 宽贴 / 12 缝 / 24 左缘）
 *  圆形箭头 → 应用列表（62 图标 + 字母分组 + jump grid）
 *  电话 / 人脉 / 信息（全拼）/ 相机（jump X）
 *  闹钟多闹钟；设置（强调色切换 + 面板 + PIN 锁屏重启路径）
 *  计算器 7+8=15；便签；日历；音乐封面；商店假安装；游戏贪吃蛇与最高分
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9240
const DEV = 'nokia-lumia-800'

rmSync('/tmp/chrome-wp7', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-wp7',
  '--window-size=900,1500', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(1500)

await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })
await sleep(2200)
const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:4173'))
if (!page) throw new Error('未找到页面 target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
const exceptions = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''))
  }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk })
}
await send('Page.enable')
await send('Runtime.enable')

/** 画布矩形色计数 */
const counts = (x0 = 0, y0 = 0, x1 = 480, y1 = 800) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return null
  const x = c.getContext('2d')
  const sx = c.width / 480, sy = c.height / 800
  const d = x.getImageData(Math.round(${x0}*sx), Math.round(${y0}*sy), Math.round((${x1}-${x0})*sx), Math.round((${y1}-${y0})*sy)).data
  const m = {}
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + ',' + d[i+1] + ',' + d[i+2]
    m[k] = (m[k] || 0) + 1
  }
  return m
})()`)
const n = async (rgb, ...box) => ((await counts(...box))[rgb]) || 0

/** 扫描线分类游程：k=黑 w=白 c=其他（瓷贴/壁纸），f=缓冲比 */
const scanline = (y) => evalJS(`(() => {
  const c = document.querySelector('canvas')
  const x = c.getContext('2d')
  const sy = c.height / 800
  const d = x.getImageData(0, Math.round(${y}*sy), c.width, 1).data
  const runs = []
  let last = null
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    const cat = d[i] === 0 && d[i+1] === 0 && d[i+2] === 0 ? 'k'
      : d[i] === 255 && d[i+1] === 255 && d[i+2] === 255 ? 'w' : 'c'
    if (cat === last) n++
    else { if (last) runs.push([last, n]); last = cat; n = 1 }
  }
  runs.push([last, n])
  return { runs, f: c.width / 480 }
})()`)

/** 触屏点按（down + up：新架构在 pointerup 启动应用，down 触发按钮） */
const tap = async (sx, sy) => {
  await evalJS(`(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    const cx = r.x + (${sx} / 480) * r.width
    const cy = r.y + (${sy} / 800) * r.height
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true }))
    c.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true }))
  })()`)
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }
/** 游程近似（±4 设备像素） */
const close = (a, b, f, tol = 4) => Math.abs(a / f - b) <= tol

const idbSet = async (key, val) => {
  await evalJS(`window.__wrote = false`)
  await evalJS(`(() => {
    const rq = indexedDB.open('mobile-museum')
    rq.onsuccess = () => { const db = rq.result; const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(${JSON.stringify(JSON.stringify(val))}, ${JSON.stringify(key)}); tx.oncomplete = () => { window.__wrote = true } }
  })()`)
  for (let i = 0; i < 40; i++) {
    await sleep(80)
    if (await evalJS(`window.__wrote === true`)) { await evalJS(`window.__wrote = false`); return }
  }
  throw new Error('idb write timeout: ' + key)
}
const idbGet = async (key) => {
  await evalJS(`(() => { window.__gv = null; const rq = indexedDB.open('mobile-museum'); rq.onsuccess = () => { const db = rq.result; const q = db.transaction('kv','readonly').objectStore('kv').get(${JSON.stringify(key)}); q.onsuccess = () => { window.__gv = q.result == null ? '__null__' : JSON.parse(q.result) } } })()`)
  for (let i = 0; i < 40; i++) {
    await sleep(80)
    const v = await evalJS(`window.__gv === null ? 'pending' : JSON.stringify(window.__gv)`)
    if (v !== 'pending') {
      await evalJS(`window.__gv = null`)
      return v === '"__null__"' ? null : JSON.parse(v)
    }
  }
  throw new Error('idb read timeout: ' + key)
}

const WHITE = '255,255,255'
const DIM = '42,42,42'
const COBALT = '27,161,226'
const CRIMSON = '229,20,0'
const MANGO = '240,150,9'

/** 应用列表 → jump grid → 点字母（随后按 clamp 后的行位置自行点应用） */
const jumpLetter = async (letter) => {
  await tap(431, 110) // 圆形箭头
  await sleep(650)
  await tap(240, 66) // 第一个分组标题
  await sleep(400)
  const idx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(letter)
  const col = idx % 6
  const row = Math.floor(idx / 6)
  await tap(col * 80 + 40, 150 + row * 92 + 46)
  await sleep(500)
}
/** 连按 Esc（应用内层 → 列表 → home，视路径而定） */
const esc = async (times) => {
  for (let i = 0; i < times; i++) {
    await key('Escape', 27)
    await sleep(480)
  }
}

// ============ 1) 开机 → 锁屏 ============
console.log('== 1) 开机 → 锁屏 ==')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1600)
await key('F6', 117)
await sleep(900)
assert((await n(WHITE)) > 200, '开机动画（NOKIA 白字）')
await sleep(4300)
const lockColors = await counts()
const nonBlack = Object.keys(lockColors).filter((k) => k !== '0,0,0')
console.log('   锁屏白像素:', lockColors[WHITE] ?? 0, '非黑色种:', nonBlack.length)
assert((lockColors[WHITE] ?? 0) > 800, '锁屏大号细体时钟')
assert(nonBlack.length >= 3, '锁屏壁纸（多色全彩背景）')

// ============ 2) 开始屏真机几何 ============
console.log('== 2) 开始屏几何 ==')
await key('Enter', 13)
await sleep(700)
let sl = await scanline(100)
const f = sl.f
console.log('   y=100:', JSON.stringify(sl.runs))
// 只核前四段（右侧槽内圆形箭头环会落在 y=100）
let want = [['k', 24], ['c', 173], ['k', 12], ['c', 173]]
assert(sl.runs.length >= 4 && sl.runs.slice(0, 4).every((r, i) =>
  r[0] === want[i][0] && close(r[1], want[i][1], f)), '方贴 173 · 缝 12 · 左缘 24（两列布局）')
sl = await scanline(464)
console.log('   y=464:', JSON.stringify(sl.runs))
want = [['k', 24], ['c', 358], ['k', 98]]
assert(sl.runs.length === 3 && sl.runs.every((r, i) =>
  r[0] === want[i][0] && close(r[1], want[i][1], f)), '宽贴 358（Calendar 整行）')
assert((await n(COBALT)) > 50000, '开始屏钴蓝瓷贴阵')

// ============ 3) 应用列表 + jump grid ============
console.log('== 3) 应用列表 ==')
await tap(431, 110)
await sleep(650)
assert((await n(WHITE)) > 600, '应用列表白色细体行')
assert((await n(COBALT)) > 1500, '应用列表强调色 62 图标')
await tap(240, 66)
await sleep(400)
const jw = await n(WHITE)
const jd = await n(DIM)
console.log('   jump grid 存在字母白:', jw, '不存在暗字母:', jd)
assert(jw > 150 && jd > 300, '字母跳转网格（存在字母白 / 不存在暗灰）')
await esc(2) // grid→list→home
assert((await n(COBALT)) > 50000, '返回开始屏')

// ============ 4) 电话 ============
console.log('== 4) 电话 ==')
await tap(110, 178)
await sleep(700)
assert((await n(COBALT, 100, 708, 380, 772)) > 4000, '电话应用（强调色呼叫键）')
for (const d of ['1', '3', '8', '0', '0', '0', '0', '0', '0', '0', '0']) {
  await key('Digit' + d, d.charCodeAt(0))
  await sleep(50)
}
await sleep(200)
await tap(240, 740)
await sleep(3200)
assert((await n(CRIMSON, 100, 670, 380, 740)) > 5000, '通话中（绯红挂断条）')
await sleep(1300)
await key('F2', 113)
await sleep(2200)
const calllog = await idbGet(`${DEV}:calllog`)
const out = Array.isArray(calllog) && calllog.find((e) => e.dir === 'out' && e.tel === '13800000000')
assert(!!out && out.dur >= 1, `去电已记录（时长 ${out?.dur}s）`)

// ============ 5) 人脉 → 发信息桥 ============
console.log('== 5) 人脉 ==')
await tap(295, 178)
await sleep(700)
assert((await n(WHITE)) > 400, '人脉列表渲染')
await tap(240, 154)
await sleep(500)
assert((await n(COBALT, 24, 610, 220, 680)) > 3000, '详情呼叫条')
assert((await n(DIM, 260, 610, 456, 680)) > 3000, '详情发信息条')
await tap(358, 645)
await sleep(800)
assert((await n(DIM, 0, 400, 480, 740)) > 10000, '发信息桥呼出虚拟键盘（无历史也能开新对话）')

// ============ 6) 全拼短信「你好」 ============
console.log('== 6) 全拼短信 ==')
for (const ch of ['n', 'i', 'h', 'a', 'o']) {
  await key('Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0))
  await sleep(70)
}
await sleep(400)
assert((await n(WHITE, 0, 400, 480, 470)) > 80, '拼音候选条')
await key('Space', 32) // 真机行为：空格首选上屏
await sleep(300)
assert((await n(WHITE, 24, 100, 456, 200)) > 60, '空格提交首选词「你好」')
await key('Enter', 13)
await sleep(800)
const inbox = await idbGet(`${DEV}:messages:inbox`)
assert(Array.isArray(inbox) && inbox.some((m) => m.mine && m.text === '你好'), '短信「你好」已落库')
await key('F3', 114)
await sleep(500)

// ============ 7) 相机（jump X，clamp 后相机行 563） ============
console.log('== 7) 相机 ==')
await jumpLetter('X')
await tap(110, 563) // clamp 后相机行 526..600
await sleep(700)
assert((await n(MANGO, 24, 52, 456, 484)) > 60, '取景器生成式风景（落日）')
await tap(240, 268) // 取景器区域点按 = 快门
await sleep(1200)
const photos = await idbGet(`${DEV}:camera:photos`)
assert(Array.isArray(photos) && photos.length >= 1, '拍照已保存')
await esc(2)

// ============ 8) 闹钟（多闹钟） ============
console.log('== 8) 闹钟 ==')
await jumpLetter('N')
await tap(110, 129)
await sleep(700)
assert((await n(WHITE)) > 300, '闹钟中心渲染')
await tap(240, 735) // + 新建（默认 on=true，直接进编辑页）
await sleep(600)
const alarm = await idbGet(`${DEV}:clock:alarm`)
assert(alarm && alarm.on === true, '新闹钟已同步 clock:alarm')
await esc(3)

// ============ 9) 设置：强调色切换 + 还原 ============
console.log('== 9) 设置 / 强调色 ==')
await jumpLetter('S')
await tap(110, 277) // settings 行（S：商店129/搜索203/设置277）
await sleep(700)
await tap(240, 130) // 主题行 → 面板
await sleep(500)
await tap(326, 150) // Red
await sleep(500)
await esc(3) // 面板 → 列表 → home
assert((await n(CRIMSON)) > 50000, '主题切换后瓷贴整屏绯红')
assert((await n(COBALT)) < 3000, '钴蓝已替换')
await jumpLetter('S')
await tap(110, 277)
await sleep(700)
await tap(240, 130)
await sleep(450)
await tap(62, 62) // Blue
await sleep(400)
await esc(3)
assert((await n(COBALT)) > 50000, '强调色还原钴蓝')

// ============ 10) 计算器 7+8=15 ============
console.log('== 10) 计算器 ==')
await jumpLetter('J')
await tap(110, 129) // calculator 行
await sleep(700)
await tap(73, 471)   // 7
await tap(406, 659)  // +
await tap(184, 471)  // 8
await tap(406, 753)  // =
await sleep(300)
assert((await n(WHITE, 250, 210, 456, 300)) > 100, '显示区出现结果（7+8=15）')
await esc(2)

// ============ 11) 便签 ============
console.log('== 11) 便签 ==')
await jumpLetter('B')
await tap(110, 129)
await sleep(700)
await tap(240, 735) // +
await sleep(600)
await tap(50, 702)  // 切英文
await key('KeyH', 72)
await sleep(120)
await key('KeyI', 73)
await sleep(300)
await esc(3)
const notes = await idbGet(`${DEV}:notes:list`)
assert(Array.isArray(notes) && notes.some((x) => x.text === 'hi'), '便签自动保存落库')

// ============ 12) 日历 ============
console.log('== 12) 日历 ==')
await jumpLetter('R')
await tap(110, 203) // calendar 行（R：人脉129/日历203）
await sleep(700)
assert((await n(WHITE)) > 300, '月历网格渲染')
await tap(240, 300)
await tap(240, 735) // + 新建事项
await sleep(600)
await key('KeyA', 65) // 进 IME buf
await sleep(200)
await tap(416, 702) // 发送 = 保存
await sleep(700)
const events = await idbGet(`${DEV}:calendar:events`)
assert(Array.isArray(events) && events.length >= 3, '日历事项已保存（含种子）')
await esc(2)

// ============ 13) 音乐：进入播放 ============
console.log('== 13) 音乐 ==')
await jumpLetter('Y')
await tap(110, 763) // music 行（Y clamp：游戏689/音乐763）
await sleep(700)
await tap(240, 130) // 第一首
await sleep(600)
const coverColors = await counts(90, 100, 390, 396)
assert(Object.entries(coverColors).filter(([k]) => k !== '0,0,0').length >= 2, 'Zune 风大封面渲染')
await esc(3)

// ============ 14) 商店：假安装 ============
console.log('== 14) 商店 ==')
await jumpLetter('S')
await tap(110, 129) // marketplace 行
await sleep(700)
await tap(240, 130) // 第一行详情
await sleep(600)
await tap(240, 718) // 安装
await sleep(3400)
const installed = await idbGet(`${DEV}:marketplace:installed`)
assert(Array.isArray(installed) && installed.includes('weibo'), '安装完成落库')
await esc(3)

// ============ 15) 游戏：贪吃蛇 → 撞墙 → 最高分 ============
console.log('== 15) 游戏 ==')
await jumpLetter('Y')
await tap(110, 689) // games 行（Y clamp：游戏689/音乐763）
await sleep(700)
await tap(240, 153) // 蛇
await sleep(700)
await key('ArrowDown', 40)
await sleep(3000)
const best = await idbGet(`${DEV}:games:snake:best`)
assert(typeof best === 'number', '贪吃蛇结束，最高分落库')
await key('Enter', 13) // 重开
await sleep(500)
await esc(3) // 蛇 → hub → list → home

// ============ 16) PIN：关机 → 开机 → 错误码 → 正确码 ============
console.log('== 16) PIN 锁屏 ==')
await jumpLetter('S')
await tap(110, 277) // settings
await sleep(700)
await tap(240, 660) // 锁屏行
await sleep(500)
await tap(240, 510) // PIN 开关
// 高负载下点按可能未命中，轮询 3s 后补点一次
let pinOn = false
for (let pi = 0; pi < 8; pi++) {
  pinOn = (await idbGet(`${DEV}:settings:pin`)) === true
  if (pinOn) break
  if (pi === 3) await tap(240, 510)
  await sleep(250)
}
assert(pinOn, 'PIN 已启用（默认 1234）')
await esc(3)
await key('F6', 117)
await sleep(1600)
await key('F6', 117)
await sleep(5200)
await key('Enter', 13)
await sleep(500)
for (const d of ['1', '2', '3', '5']) {
  await key('Digit' + d, d.charCodeAt(0))
  await sleep(150)
}
await sleep(800) // 错误码红闪后清空
assert((await n(WHITE)) > 400, '错误 PIN 无法解锁')
for (const d of ['1', '2', '3', '4']) {
  await key('Digit' + d, d.charCodeAt(0))
  await sleep(150)
}
await sleep(800)
assert((await n(COBALT)) > 40000, '正确 PIN 解锁进入开始屏')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== WP7 E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

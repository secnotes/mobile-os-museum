/**
 * 苹果 iPhone 2G（iPhone OS 1.0）无视觉 E2E（端口 9243）：
 *  关机空屏 → P 开机（Apple logo → 白闪）→ 锁屏（大时钟/日期/滑动来解锁）→
 *  Springboard（图标网格 + Dock + 短信·Mail 角标）→
 *  Phone 拨号 10086 外呼（回铃 → 接通绿计时 → 挂断 → calllog out）→
 *  Text 会话 + 软键盘发送 HI → 自动回复 →
 *  Camera 拍照（闪光 → camera:photos 增长）→
 *  Settings 换铃声（ringtone:idx）+ 语言切换（英 ↔ 中，蓝色 ✓）→
 *  情景来电①：关机重启后锁屏滑动接听（incall → calllog in 已接）→
 *  情景来电②：主屏开放态来电点拒接（calllog missed）→
 *  P 关机。断言基于画布像素计数 + IndexedDB 轮询。
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9243
const DEV = 'apple-iphone-2g'

rmSync('/tmp/chrome-iphone', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-iphone',
  '--window-size=900,1400', 'about:blank',
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
await send('Page.enable')
await send('Runtime.enable')

/** 画布调色板计数：{ 'r,g,b': n } */
const counts = () => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return null
  const x = c.getContext('2d')
  const d = x.getImageData(0, 0, c.width, c.height).data
  const m = {}
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + ',' + d[i+1] + ',' + d[i+2]
    m[k] = (m[k] || 0) + 1
  }
  return m
})()`)
const n = async (rgb) => (await counts())[rgb] || 0
/** 屏幕坐标 (0..320, 0..480) → 矩形内指定色计数 */
const rectN = (rgb, x0, y0, x1, y1) => evalJS(`(() => {
  const c = document.querySelector('canvas')
  const x = c.getContext('2d')
  const sx = c.width / 320, sy = c.height / 480
  const d = x.getImageData(Math.round(${x0}*sx), Math.round(${y0}*sy), Math.round((${x1}-${x0})*sx), Math.round((${y1}-${y0})*sy)).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i]+','+d[i+1]+','+d[i+2] === '${rgb}') n++
  return n
})()`)
const total = () => evalJS(`(() => { const c = document.querySelector('canvas'); return c.width * c.height })()`)
const pct = async (rgb) => (await n(rgb)) / await total()
/** 矩形内自定义谓词计数；pred 为像素 (r,g,b) → bool 的 JS 表达式字符串 */
const rectWhere = (x0, y0, x1, y1, pred) => evalJS(`(() => {
  const c = document.querySelector('canvas'); const x = c.getContext('2d')
  const sx = c.width / 320, sy = c.height / 480
  const d = x.getImageData(Math.round(${x0}*sx), Math.round(${y0}*sy), Math.round((${x1}-${x0})*sx), Math.round((${y1}-${y0})*sy)).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i+1], b = d[i+2]; if (${pred}) n++ }
  return n
})()`)
/** 触屏点按（down + up，屏幕坐标） */
const tap = async (sx, sy) => {
  await evalJS(`(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    const opts = {
      clientX: r.x + (${sx} / 320) * r.width,
      clientY: r.y + (${sy} / 480) * r.height,
      bubbles: true,
    }
    c.dispatchEvent(new PointerEvent('pointerdown', opts))
    c.dispatchEvent(new PointerEvent('pointerup', opts))
  })()`)
}
/** 触屏拖拽：屏幕坐标点序列（首点 down、末点 up） */
const drag = async (pts) => {
  const arr = pts.map(([x, y]) => `[${x},${y}]`).join(',')
  await evalJS(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
    const pt = (type, x, y) => c.dispatchEvent(new PointerEvent(type, {
      clientX: r.x + (x/320)*r.width, clientY: r.y + (y/480)*r.height, bubbles: true,
    }))
    const pts = [${arr}]
    pt('pointerdown', pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) pt('pointermove', pts[i][0], pts[i][1])
    pt('pointerup', pts[pts.length-1][0], pts[pts.length-1][1])
  })()`)
}
/** 点按机壳实体键（.pbtn[data-key]） */
const clickKey = async (k) => {
  const ok = await evalJS(`(() => {
    const b = document.querySelector('.pbtn[data-key="${k}"]')
    if (!b) return false
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return true
  })()`)
  if (!ok) throw new Error('未找到机壳键: ' + k)
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }
/** IndexedDB 读（裸键） */
const idbGet = (k) => evalJS(`(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mobile-museum'); r.onsuccess = () => res(r.result) })
  return await new Promise((res) => { const t = db.transaction('kv').objectStore('kv').get('${k}'); t.onsuccess = () => res(t.result) })
})()`)
/** IndexedDB 写（确认提交后再返回，保证 onChange 已派发） */
const idbSet = (k, v) => evalJS(`(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mobile-museum'); r.onsuccess = () => res(r.result) })
  await new Promise((res) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(${JSON.stringify(JSON.stringify(v))}, '${k}'); t.oncomplete = () => res() })
})()`)
const jget = async (k, dflt = null) => { const v = await idbGet(k); return v === null || v === undefined ? dflt : JSON.parse(v) }
/** 轮询直到谓词成立（基于 IDB） */
const waitFor = async (fn, ms, tag) => {
  const t0 = Date.now()
  let v = await fn()
  while (!v && Date.now() - t0 < ms) { await sleep(400); v = await fn() }
  if (!v) throw new Error('等待超时: ' + tag)
  return v
}

// iPhone OS 1.0 调色板（src/os/iphoneos/palette.ts）
const BLACK = '0,0,0'
const WHITE = '255,255,255'
const INK = '28,28,28'
const BADGE_RED = '243,16,47'
const GREEN = '68,192,74'
const BLUE = '22,113,224'
const SLIDER_TRACK = '61,61,61'

// ================= 1) 关机态 =================
console.log('1) 进入苹果 iPhone 2G')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1200)
const canvas = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('   画布:', JSON.stringify(canvas))
assert(canvas.w === 352 && canvas.h === 528, '画布 352×528（320×480 ×1.1）')
assert(await pct(BLACK) > 0.95, '关机态近空屏')

// ================= 2) 开机：Apple logo → 白闪 → 锁屏 =================
console.log('2) P 开机：Apple logo')
await key('KeyP', 80)
// logo 位图可能略晚于黑底出现，轮询 2s（避免高负载时 flake）
let whiteN = 0
let blackP = 0
for (let li = 0; li < 20; li++) {
  whiteN = await n(WHITE)
  blackP = await pct(BLACK)
  if (whiteN > 300) break
  await sleep(100)
}
console.log('   黑底:', blackP.toFixed(2), '白 logo:', whiteN)
assert(blackP > 0.85, '开机黑底')
assert(whiteN > 300 && whiteN < 8000, '白色 Apple logo')
await sleep(500)
assert((await n(WHITE)) > 300, '开机进行中（logo 保持）')
await sleep(2500) // 共约 3.5s → 锁屏（含末尾白闪）
const clockWhite = await rectN(WHITE, 50, 120, 270, 185)
const trackN = await rectN(SLIDER_TRACK, 8, 424, 312, 464)
console.log('   大时钟白:', clockWhite, '滑条轨:', trackN)
assert(clockWhite > 600, '进入锁屏（60px 大时钟）')
assert(trackN > 3000, 'slide to unlock 灰色滑条轨')

// ================= 3) 解锁 → Springboard =================
console.log('3) 锁屏点按无效，滑条解锁')
await tap(160, 240)
await sleep(200)
assert((await rectN(WHITE, 50, 120, 270, 185)) > 600, '锁屏点按不解锁（真机须滑动）')
await drag([[40, 444], [120, 444], [200, 444], [280, 444]])
await sleep(600)
blackP = await pct(BLACK)
const badgeN = await n(BADGE_RED)
const dockGray = await rectWhere(6, 391, 314, 478, 'r===g && g===b && b>20 && b<125')
console.log('   Springboard 黑底:', blackP.toFixed(2), '角标红:', badgeN, 'Dock 灰:', dockGray)
assert(blackP > 0.45, 'Springboard 黑底（1.0 无壁纸）')
assert(badgeN > 150, '短信 + Mail 红色角标（各 1 未读）')
assert(dockGray > 5000, 'Dock 磨砂灰渐变条')

// ================= 4) Phone 拨号外呼 10086 =================
console.log('4) Dock Phone → 拨号 10086 外呼')
await tap(53, 424) // Dock Phone 中心
await sleep(800)
// 真机 1.0 默认落在个人收藏标签，切到拨号键盘（第 4 个 tab）
await tap(224, 455) // 拨号键盘 tab
await sleep(500)
// 12 键布局：1(53,122) 0(160,332) 8(160,262) 6(267,192)
for (const [x, y] of [[53, 122], [160, 332], [160, 332], [160, 262], [267, 192]]) {
  await tap(x, y)
  await sleep(140)
}
const numWhite = await rectN(WHITE, 60, 40, 260, 72)
console.log('   号码区白色:', numWhite)
assert(numWhite > 100, '黑底号码显示 10086（白字）')
await tap(160, 398) // 绿色呼叫圆键
await sleep(900)
const redish = await rectWhere(64, 400, 256, 450, 'r>130 && g<110 && b<100')
console.log('   呼出红钮像素:', redish)
assert(redish > 1500, '正在呼出（红色挂断钮）')
await sleep(3800) // 共 ~4.7s：3.6s 接通 + ≥1s 计时
const timerGreen = await rectN(GREEN, 100, 150, 220, 174)
console.log('   绿计时:', timerGreen)
assert(timerGreen > 15, '接通，通话计时绿色 mm:ss')
await tap(160, 422) // 红色结束条
await sleep(700)
assert((await pct(BLACK)) > 0.45, '挂断回 Springboard')
const calllog = await jget(`${DEV}:calllog`, [])
const outE = calllog.find((e) => e.tel === '10086' && e.dir === 'out')
assert(!!outE, 'calllog 写入外呼记录')
assert(outE && outE.missed === false, '外呼未标记未接')
console.log('   外呼记录 dur =', outE.dur)

// ================= 5) Text 软键盘发送 → 自动回复 =================
console.log('5) 短信：打开首个会话，软键盘发送 HI')
await tap(44, 58) // 网格 (0,0) Text
await sleep(800)
const listWhite = await rectN(WHITE, 0, 64, 320, 130)
console.log('   会话列表白:', listWhite)
assert(listWhite > 8000, '会话列表渲染')
await tap(160, 94) // 第一行 → 线程（markThreadRead 落 IDB）
await sleep(500)
const threads0 = await jget(`${DEV}:sms:threads`, [])
assert(threads0.length >= 1, '至少一个会话')
const targetTel = threads0[0].tel
assert(targetTel, '取得首个会话号码')
await tap(160, 458) // 输入框 → 键盘弹起
await sleep(600)
// 软键盘（shift 初始开）：H 键中心 (192,344)、I 键 (240,291)
await tap(192, 344); await sleep(160)
await tap(240, 291); await sleep(160)
const draftInk = await rectN(INK, 18, 232, 250, 258)
console.log('   草稿墨色:', draftInk)
assert(draftInk > 5, '草稿 "HI" 出现在输入框')
await tap(283, 244) // Send
const sentThread = await waitFor(
  async () => {
    const ts = await jget(`${DEV}:sms:threads`, [])
    const t = ts.find((x) => x.tel === targetTel)
    return t && t.msgs.some((m) => m.dir === 'out' && m.text === 'HI') ? t : null
  },
  4000, '我方短信落库',
)
console.log('   已发送 HI 至', sentThread.name)
console.log('   等待自动回复（5–8s）…')
const repliedThread = await waitFor(
  async () => {
    const ts = await jget(`${DEV}:sms:threads`, [])
    const t = ts.find((x) => x.tel === targetTel)
    const last = t?.msgs[t.msgs.length - 1]
    return last && last.dir === 'in' && Date.now() - last.ts < 30000 ? t : null
  },
  12000, '自动回复',
)
console.log('   自动回复:', repliedThread.msgs[repliedThread.msgs.length - 1].text)
await clickKey('home')
await sleep(600)
assert((await pct(BLACK)) > 0.45, 'Home 键回 Springboard')

// ================= 6) Camera 拍照 =================
console.log('6) 相机：拍照 → camera:photos 增长')
// 首启 4 张种子照片仅在内存（未落 IDB）：键缺失时按 4 计
const photosBefore = (await jget(`${DEV}:camera:photos`, null))?.length ?? 4
await tap(272, 58) // 网格 (3,0) Camera
await waitFor(
  async () => ((await rectN(WHITE, 138, 426, 182, 470)) > 500),
  4000, '快门白色圆钮',
)
await tap(160, 448)
await waitFor(
  async () => ((await jget(`${DEV}:camera:photos`, [])).length === photosBefore + 1),
  4000, '照片落库',
)
const photosAfter = await jget(`${DEV}:camera:photos`, [])
console.log('   照片数:', photosBefore, '→', photosAfter.length)
await clickKey('home')
await sleep(600)

// ================= 7) Settings：换铃声 + 语言切换 =================
console.log('7) 设置：换铃声（#1 木琴）')
await tap(272, 226) // 网格 (3,2) Settings
await sleep(800)
// 真机 1.0 分组圆角表：root 第 2 组首行「声音」y≈230–274
await tap(160, 252); await sleep(500) // 声音
await tap(160, 100); await sleep(500) // 电话铃声（sounds 第 1 组首行 78–122）
await tap(160, 144); await sleep(500) // 第 2 首（ringtone row1 122–166）
assert((await jget(`${DEV}:ringtone:idx`, 0)) === 1, 'ringtone:idx = 1 已持久化')
await tap(30, 42); await sleep(400) // → 声音
await tap(30, 42); await sleep(400) // → 根
console.log('   语言：English ↔ 简体中文')
await tap(160, 404); await sleep(500) // 通用（root 第 3 组 382–426）
await tap(160, 208); await sleep(500) // 多语言环境（general 第 2 组 row1 186–230）
await tap(160, 100); await sleep(500) // 语言（intl 首行 78–122）
await tap(160, 144); await sleep(400) // English 行（122–166）
assert((await rectN(BLUE, 286, 122, 308, 166)) > 8, 'English 行蓝色 ✓')
await tap(160, 100); await sleep(400) // 切回简体中文（首行 78–122）
assert((await rectN(BLUE, 286, 78, 308, 122)) > 8, '简体中文 行蓝色 ✓')
await clickKey('home')
await sleep(600)

// ================= 8–9) 情景来电：锁屏接听 + 主屏拒接 =================
// 直接写 IDB 不触发页面内 Store 监听：先放两条事件（15s 锁屏态 / 40s 主屏态），
// 再离开设备并重新进入，让新 ScenarioScheduler 从设备入口重新计时。
console.log('8) 预置两路来电事件并重新进入设备')
const baseId = Date.now()
await idbSet(`${DEV}:events`, [
  { id: baseId + 101, type: 'call', from: '13800000000', name: '测试', delaySec: 15, fired: false },
  { id: baseId + 202, type: 'call', from: '13800000000', name: '测试', delaySec: 40, fired: false },
])
await evalJS(`location.hash = '#/'`); await sleep(1000) // 卸载 DeviceShell（停旧调度器）
const remountT = Date.now()
await evalJS(`location.hash = '#/device/${DEV}'`); await sleep(1300)
await key('KeyP', 80); await sleep(3500) // 开机 → 锁屏（约入口后 4.8s）
assert((await rectN(WHITE, 50, 120, 270, 185)) > 600, '重启后进入锁屏')
// 来电①在入口后 15s：检测 y188–214 的姓名粗白字（连续横跑 ≥12px），
// 不能用单点白色——地球壁纸的云也会产生白点。
const nameOnLock = () => evalJS(`(() => {
  const c = document.querySelector('canvas'); const x = c.getContext('2d')
  const sx = c.width/320, sy = c.height/480
  // 来电姓名（size 34，y≈207..231）；避开锁屏日期（size 18，y≈190..203）
  const d = x.getImageData(70*sx, 205*sy, 180*sx, 30*sy).data
  const w = Math.round(180*sx)
  let rows = 0
  for (let y = 0; y < Math.round(30*sy); y++) {
    let run = 0, best = 0
    for (let px = 0; px < w; px++) {
      const i = (y*w + px)*4
      if (d[i] > 225 && d[i+1] > 225 && d[i+2] > 225) { run++; best = Math.max(best, run) }
      else run = 0
    }
    if (best >= 12*sx) rows++
  }
  return rows >= 3
})()`)
await waitFor(nameOnLock, 14000, '锁屏来电')
console.log('   锁屏来电姓名出现（入口后', ((Date.now() - remountT) / 1000).toFixed(1), 's）')
assert((await rectN(SLIDER_TRACK, 8, 424, 312, 464)) > 2000, 'slide to answer 滑条')
await drag([[40, 444], [130, 444], [220, 444], [280, 444]])
await sleep(1900)
assert((await rectN(GREEN, 100, 150, 220, 174)) > 15, '滑动接听 → 通话绿计时')
await tap(160, 422) // 挂断
await sleep(700)
const log2 = await jget(`${DEV}:calllog`, [])
const inE = log2.find((e) => e.tel === '13800000000' && e.dir === 'in' && !e.missed)
assert(!!inE, 'calllog 含已接来电')
assert(inE && inE.dur >= 1, `通话时长 ≥1s（实际 ${inE?.dur}）`)

// ================= 9) 来电②：主屏拒接 =================
console.log('9) 等待第二路来电（主屏开放态 → 拒接记 missed）')
await waitFor(
  async () => ((await rectWhere(160, 390, 312, 458, 'g>120 && g-r>40 && g-b>40')) > 2000),
  26000, '主屏来电（绿色 Answer 胶囊）',
)
console.log('   主屏来电卡片出现（入口后', ((Date.now() - remountT) / 1000).toFixed(1), 's）')
await tap(82, 425) // 红色 Decline 胶囊（左）
await sleep(700)
assert((await pct(BLACK)) > 0.45, '拒接回 Springboard')
const log3 = await jget(`${DEV}:calllog`, [])
const missedE = log3.find((e) => e.tel === '13800000000' && e.missed)
assert(!!missedE, '拒接记录 missed: true, dur: 0')

// ================= 10) 关机 =================
console.log('10) P 关机')
await key('KeyP', 80)
await sleep(900)
assert((await pct(BLACK)) > 0.95, '屏幕熄灭')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== IPHONE 2G E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

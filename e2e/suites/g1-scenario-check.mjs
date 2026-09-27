/**
 * G1 (HTC Dream) 情景编排端到端验证（端口 9239）：
 *  - 设置页 5 设备 tab
 *  - IndexedDB 预置：联系人 + 来电事件(8s) + 来短信事件(18s) + 来电铃声选曲 5
 *  - 进入 G1 → 开机 → MENU×2 解锁 → 主屏 → 8s 全屏来电卡片
 *  - 点绿色接听 → 白底通话屏 → 点红色挂断
 *  - 断言 calllog 含 dir:in / 来短信 unread / Dialer Call Log tab / 名片夹 /
 *    设置铃声单选绿点（间接断言来电铃声）
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9239
const DEV = 'htc-dream'

rmSync('/tmp/chrome-g1sc', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-g1sc',
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
/** 屏幕坐标 (0..320, 0..480) → 画布内矩形色计数 */
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
/** 触屏点按（屏幕坐标） */
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
    // 必须抬手：否则 DeviceShell 的 550ms 长按定时器会误触发主屏 Add-to-Home
    c.dispatchEvent(new PointerEvent('pointerup', opts))
  })()`)
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

/** IndexedDB 写入（fire-and-forget + 轮询确认） */
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

// Android 调色板（src/os/android/palette.ts）
const INK = '26,26,26'
const WHITE = '255,255,255'
const DGREEN = '61,92,27'
const RED = '192,74,58'
const GRAY = '138,138,138'
const GREEN = '164,198,57'
const METAL = '111,111,111'

// ============ 1) 设置页：5 设备 tab ============
console.log('== 1) 设置页 ==')
await evalJS(`location.hash = '#/settings'`)
await sleep(900)
const stabCount = await evalJS(`document.querySelectorAll('.stab').length`)
console.log('   设备 tab 数:', stabCount)
assert(stabCount === 8, '设备 tab = 8（含 Bold 9000）')

// ============ 2) 预置数据 ============
console.log('== 2) 预置情景数据 ==')
const now = Date.now()
await idbSet(`${DEV}:contacts`, [{ name: '测试', tel: '13800000000' }])
await idbSet(`${DEV}:events`, [
  { id: now + 1, type: 'call', from: '13800000000', name: '测试', delaySec: 8, fired: false },
  { id: now + 2, type: 'sms', from: '13800000000', name: '测试', text: '你好吗', delaySec: 18, fired: false },
])
// 来电铃声 = 第 5 首（OS 与 Settings 共享此键）
await idbSet(`${DEV}:settings:ringtone`, 5)
console.log('   已写入 contacts + 2 events + ringtone#5')

// ============ 3) 进入 G1，开机 → 解锁 → 主屏 ============
console.log('== 3) 进入 G1 开机解锁 ==')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1500)
await key('F2', 113) // END 键唤醒开机
await sleep(4000) // T-Mobile 闪屏 + ANDROID 动画 → 锁屏
await key('F4', 115); await sleep(250)
await key('F4', 115); await sleep(500) // MENU×2 解锁 → 主屏
const homeGrip = await rectN(METAL, 114, 452, 206, 476)
console.log('   主屏握把灰像素:', homeGrip)
assert(homeGrip > 80, '解锁进入主屏（真机壁纸 + 底部金属握把）')

// ============ 4) 8s 来电 → 全屏卡片 ============
console.log('== 4) 等待来电（全屏卡片） ==')
await sleep(2500) // 事件 8s：解锁完成约 7s，再等 2.5s
const ringInk = await pct(INK)
const ansBtn = await rectN(DGREEN, 28, 380, 148, 436)
const rejBtn = await rectN(RED, 172, 380, 292, 436)
const avatar = await rectN(GRAY, 120, 115, 200, 195)
console.log('   深底占比:', ringInk.toFixed(2), '接听钮:', ansBtn, '拒接钮:', rejBtn, '头像:', avatar)
assert(ringInk > 0.5, '来电卡片深色底')
assert(ansBtn > 1500, '绿色接听按钮')
assert(rejBtn > 1500, '红色拒接按钮')
assert(avatar > 300, '灰色头像剪影')

// ============ 5) 点接听 → 通话屏 → 点挂断 ============
console.log('== 5) 接听 / 通话 / 挂断 ==')
await tap(88, 410) // 点绿色接听
await sleep(800)
const callWhite = await pct(WHITE)
const endBtn = await rectN(RED, 90, 380, 230, 436)
console.log('   通话屏白底:', callWhite.toFixed(2), '挂断钮:', endBtn)
assert(callWhite > 0.4, '通话屏白底')
assert(endBtn > 1500, '红色挂断按钮')
await sleep(2200) // 累积时长
await tap(160, 410) // 点红色挂断
await sleep(800)

// ============ 6) 通话记录 ============
console.log('== 6) 通话记录 ==')
const log = await idbGet(`${DEV}:calllog`)
console.log('   calllog:', JSON.stringify(log))
const inEntry = Array.isArray(log) && log.find((e) => e.dir === 'in' && e.tel === '13800000000')
assert(!!inEntry, '通话记录含一条来电')
assert(inEntry && !inEntry.missed, '来电标记为已接')
assert(inEntry && inEntry.dur >= 1, `通话时长 ≥1s (实际 ${inEntry?.dur})`)
const homeGrip2 = await rectN(METAL, 114, 452, 206, 476)
assert(homeGrip2 > 80, '挂断回主屏')

// ============ 7) 等来短信（22s 事件） ============
console.log('== 7) 等待来短信 ==')
await sleep(8000) // 事件在调度器启动后 18s
const inbox = await idbGet(`${DEV}:messages:inbox`)
const sms = Array.isArray(inbox) && inbox.find((m) => m.from === '13800000000' && m.text === '你好吗')
console.log('   inbox 条数:', Array.isArray(inbox) ? inbox.length : 0)
assert(!!sms, '收到来短信事件')
assert(sms && !sms.read, '来短信为未读')

// ============ 8) Dialer 的 Call Log tab ============
console.log('== 8) Dialer Call Log tab ==')
await tap(160, 468); await sleep(400) // 深色碳纤抽屉
await tap(280, 195); await sleep(600) // 电话 app（抽屉 idx7）
const dgreenBtn = await rectN(DGREEN, 100, 390, 220, 434)
console.log('   拨号 tab 呼叫钮:', dgreenBtn)
assert(dgreenBtn > 1000, '拨号 tab 渲染（绿色呼叫按钮）')
await tap(240, 40); await sleep(600) // 点 Call log tab（右半）
const logInk = await rectN(INK, 34, 58, 300, 100)
console.log('   记录列表第一行墨色:', logInk)
assert(logInk > 50, 'Call Log tab 列表有条目文字')
await key('Escape', 27); await sleep(300) // log tab → 回拨号 tab
await key('Escape', 27); await sleep(400) // 拨号 tab（空号）→ 退出 → 主屏

// ============ 9) 名片夹（持久化联系人） ============
console.log('== 9) 名片夹 ==')
await tap(160, 468); await sleep(400) // 深色碳纤抽屉
await tap(200, 195); await sleep(600) // 名片夹（抽屉 idx6）
const cRow = await rectN(INK, 72, 79, 300, 125)
console.log('   第一行名字区墨色:', cRow)
assert(cRow > 50, '名片夹列表渲染')
const stored = await idbGet(`${DEV}:contacts`)
assert(Array.isArray(stored) && stored[0]?.name === '测试', '联系人来自设备 store')
await key('Escape', 27); await sleep(300)

// ============ 10) 来电铃声选曲（间接断言） ============
console.log('== 10) 铃声选曲（来电铃声 #5） ==')
await tap(160, 468); await sleep(400) // 抽屉
await tap(40, 459); await sleep(600) // 设置（抽屉 idx16）
await tap(160, 170); await sleep(400) // 声音和显示（root idx2）
await tap(160, 128); await sleep(400) // 手机铃声（row1）→ 单选列表
const ringDot = await rectN(GREEN, 280, 265, 304, 290)
console.log('   #5 单选绿点像素:', ringDot)
assert(ringDot > 60, '来电铃声为预设第 5 首（绿色单选圆点）')
await key('Escape', 27); await sleep(250) // → sounddisp
await key('Escape', 27); await sleep(250) // → root
await key('Escape', 27); await sleep(400) // 退出

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== G1 SCENARIO E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

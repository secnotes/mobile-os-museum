/**
 * 诺基亚 1100 无视觉 E2E（96×65 真机屏 ×5）：
 * 握手开机 / 待机大时钟 / 外呼落裸键 calllog / 栈式菜单 / 铃声·闹钟·键盘锁设置落库 /
 * 09→2 Space Impact / 待机长按 C 手电筒 / 锁态 112 / reload 持久化。
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9229

rmSync('/tmp/chrome-1100', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-1100',
  '--window-size=900,1100', 'about:blank',
], { stdio: 'ignore' })
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
const evalJS = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
await send('Page.enable')
await send('Runtime.enable')

const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

// ---------- 键位（base 物理映射）：Enter=ok Esc=back Backspace=clear Q=soft1 W=soft2 Minus=* P=power ----------
const key = async (code, vk, holdMs = 0) => {
  const k = code.replace('Arrow', '').toLowerCase()
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  if (holdMs) await sleep(holdMs)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
const press = (code, vk) => key(code, vk, 0)
const digits = async (seq, gap = 140) => {
  for (const d of seq) { await press('Digit' + d, 48 + Number(d)); await sleep(gap) }
}
/** 进根功能表（菜单初始化含多个 IDB 读，留足时间） */
const openMenu = async () => { await press('Enter', 13); await sleep(700) }
/** 从根菜单用序号开子列表 */
const subMenu = async (num) => { await digits(num, 150); await sleep(1300) }
/** 退出 app 回到菜单帧，再逐层回待机 */
const exitToIdle = async (layers = 2) => {
  await press('KeyW', 87) // soft2：app 退出，恢复栈帧
  await sleep(700)
  for (let i = 0; i < layers; i++) { await press('Escape', 27); await sleep(700) }
}

// ---------- 像素探测 ----------
const countPx = (pred) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  const test = ${pred}
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i+1], d[i+2])) n++
  return n
})()`)
const dark = () => countPx('(r,g,b)=>r<100&&g<110&&b<100')
const light = () => countPx('(r,g,b)=>r>150&&g>170&&b>130')
/** 指定矩形内暗像素数（canvas 坐标） */
const regionDark = (x, y, w, h) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) n++
  return n
})()`)
/** 某一行在 x 区间内的暗像素数 */
const rowSpanDark = (y, x0, x1) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(${x0}, ${y}, ${x1 - x0}, 1).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) n++
  return n
})()`)

// 挂锁位图区域：screen (44..51,28..35) ×5
const PAD_X = 220, PAD_Y = 140, PAD_W = 40, PAD_H = 40
// 待机大时钟带：screen (~24..71, 22..35) ×5
const CLOCK_Y = 108, CLOCK_H = 70
// 「键盘已锁」提示框顶边：screen y24 ×5 = 120
const FRAME_Y = 121

// ---------- IndexedDB 直读（验证裸键落库） ----------
const idbGet = async (fullKey) => evalJS(`(async () => new Promise((resolve) => {
  const r = indexedDB.open('mobile-museum')
  r.onsuccess = () => {
    try {
      const g = r.result.transaction('kv', 'readonly').objectStore('kv').get(${JSON.stringify(fullKey)})
      g.onsuccess = () => resolve(g.result ?? null)
      g.onerror = () => resolve(null)
    } catch { resolve(null) }
  }
  r.onerror = () => resolve(null)
}))()`, true)
const idbJSON = async (fullKey) => {
  const raw = await idbGet(fullKey)
  return raw === null ? null : JSON.parse(raw)
}

// ================= 1) 进入展品：关机空屏 =================
console.log('1) 进入诺基亚 1100（关机态）')
await evalJS(`location.hash = '#/device/nokia-1100'`)
// 等 canvas 挂载（OS chunk + React 渲染），再给 init() 的关机底色留时间。
// 注意：不能用高频 CDP 轮询——实测会让 headless 下 init 尾段（IDB/raster）拖到轮询结束后才完成。
await sleep(900)
const canvas = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('  画布:', JSON.stringify(canvas))
assert(canvas.w === 480 && canvas.h === 325, '画布 480×325（96×65 ×5）')
const offDark = await dark()
console.log('  关机态暗像素:', offDark)
assert(offDark < 100, '关机态近空屏')

// ================= 2) 开机握手 → 待机 =================
console.log('2) 开机（原版握手动画）')
await key('KeyP', 80)
await sleep(2000)
assert(await dark() > 300, '握手动画渲染中')
await sleep(3600) // 动画收尾 → 待机
assert(await dark() > 400, '待机屏渲染（运营商+大时钟+状态栏）')

// ================= 3) 待机大时钟 =================
console.log('3) 待机中央大时钟')
const clockDark = await regionDark(110, CLOCK_Y, 260, CLOCK_H)
console.log('  时钟带暗像素:', clockDark)
assert(clockDark > 150, '居中大时钟在位（14px HH:MM）')

// ================= 4) 外呼 10086：接通挂断 → 裸键 calllog 含 out =================
console.log('4) 待机拨号外呼 10086')
await digits('10086')
await sleep(300)
assert(await dark() > 200, '拨号屏渲染')
await press('KeyQ', 81) // soft1/ok：呼叫
await sleep(3200) // 2.6s 接通 + 余量
assert(await dark() > 200, '通话屏渲染（计时器）')
await press('KeyW', 87) // soft2：挂断
await sleep(600)
assert(await dark() > 400, '挂断回待机')
const logAfterCall = await idbJSON('nokia-1100:calllog')
const lastCall = Array.isArray(logAfterCall) ? logAfterCall.at(-1) : null
console.log('  末条记录:', JSON.stringify(lastCall))
assert(lastCall && lastCall.tel === '10086' && lastCall.dir === 'out' && lastCall.missed === false,
  'IDB 裸键 calllog 追加 out 条目（修复后直接读裸键）')

// ================= 5) 03 Call register → 3 Dialled 见条目 =================
console.log('5) 03→3 已拨号码列表')
await openMenu()
await subMenu('03')
await press('Digit3', 51)
await sleep(1200)
const dialListDark = await dark()
console.log('  已拨列表暗像素:', dialListDark)
assert(dialListDark > 250, 'Dialled 列表渲染（含 10086）')
await exitToIdle(2)
assert(await dark() > 400, '回待机')

// ================= 6) 04 Tones → 1 Ringing tone：移动选曲落 tones:conf =================
console.log('6) 04→1 来电铃声选曲')
await openMenu()
await subMenu('04')
await press('Digit1', 49)
await sleep(1200)
// 真机：移动即选中；按 down：0→1 并保存
await press('ArrowDown', 40)
await sleep(600)
const tonesConf = await idbJSON('nokia-1100:tones:conf')
console.log('  tones:conf ringIdx =', tonesConf?.ringIdx)
assert(tonesConf && tonesConf.ringIdx === 1, '选曲落 tones:conf（ringIdx=1）')
await exitToIdle(2)

// ================= 7) 07 Alarm clock：开启并设 07:30 → alarm:conf =================
console.log('7) 07 闹钟：开 + 07:30')
await openMenu()
await press('Digit0', 48); await sleep(150)
await press('Digit7', 55)
await sleep(1400) // 直达叶子 app
await press('Enter', 13) // ok：打开开关 → 进入时间录入
await sleep(300)
await digits('0730', 130)
await press('Enter', 13) // ok：确认合法时间
await sleep(600)
const alarmConf = await idbJSON('nokia-1100:alarm:conf')
console.log('  alarm:conf =', JSON.stringify(alarmConf))
assert(alarmConf && alarmConf.on === true && alarmConf.h === 7 && alarmConf.m === 30,
  '闹钟配置落 alarm:conf（on 07:30）')
await press('KeyW', 87); await sleep(700) // app 退出（直接叶子，无菜单帧）
assert(await dark() > 400, '回待机')

// ================= 8) 09 Games → 2 Space Impact 特征屏 =================
console.log('8) 09→2 Space Impact')
await openMenu()
await subMenu('09')
await press('Digit2', 50)
await sleep(1300)
const siDark = await dark()
console.log('  空间大战暗像素:', siDark)
assert(siDark > 350, 'Space Impact 战斗屏渲染（舰体/敌机/星空）')
await exitToIdle(2)

// ================= 9) 待机长按 C ≥900ms → 手电筒 =================
console.log('9) 待机长按 C 进手电筒')
await key('Backspace', 8, 950) // 按住 950ms 再松（900ms 触发）
await sleep(300)
const torchDark = await dark()
const torchLight = await light()
console.log('  暗像素:', torchDark, '亮像素:', torchLight)
assert(torchDark > 60000, `手电筒满暗底（${torchDark}px）`)
assert(torchLight > 200, '中央亮条光束出现')
await press('Enter', 13) // 任意键：熄灭并退出
await sleep(500)
assert((await dark()) < 0.5 * 480 * 325, '熄灭后恢复正常待机（非满暗）')

// ================= 10) 自动键盘锁设置 + Menu+* 手动锁/解锁/锁态拦键 =================
console.log('10) 键盘锁')
// 10a. 06 Settings → 4 Automatic keyguard → 开启
await openMenu()
await subMenu('06')
await press('Digit4', 52)
await sleep(1300)
await press('Enter', 13) // ok：auto on
await sleep(500)
const kgConf = await idbJSON('nokia-1100:keyguard:conf')
console.log('  keyguard:conf =', JSON.stringify(kgConf))
assert(kgConf && kgConf.auto === true, '自动键盘锁落 keyguard:conf')
await exitToIdle(2)

// 10b. 手动 Menu+* 上锁
await press('Enter', 13); await sleep(200)
await press('Minus', 189)
await sleep(700)
const padLocked = await regionDark(PAD_X, PAD_Y, PAD_W, PAD_H)
console.log('  锁态挂锁区暗像素:', padLocked)
assert(padLocked > 250, '锁键盘：中央挂锁')

// 10c. 锁态数字键不进拨号（弹「键盘已锁」长框）
await press('Digit5', 53)
await sleep(400)
const frameSpan = await rowSpanDark(FRAME_Y, 20, 460)
console.log('  提示框顶行暗像素:', frameSpan)
assert(frameSpan > 350, '数字键被拦：键盘已锁提示框（未进拨号）')
await sleep(1100) // 等提示框消失 → 挂锁恢复

// 10d. Menu+* 解锁
await press('Enter', 13); await sleep(200)
await press('Minus', 189)
await sleep(700)
const padIdle = await regionDark(PAD_X, PAD_Y, PAD_W, PAD_H)
console.log('  解锁后挂锁区暗像素:', padIdle)
assert(padIdle < 200, '解锁：挂锁消失')
assert((await regionDark(110, CLOCK_Y, 260, CLOCK_H)) > 150, '回待机大时钟')

// ================= 11) 锁态 112 紧急号可拨 =================
console.log('11) 锁态拨 112')
await press('Enter', 13); await sleep(200)
await press('Minus', 189); await sleep(600) // 上锁
await digits('112', 130)
await press('Enter', 13) // ok：紧急呼叫 → DialUI
await sleep(700)
const emDialDark = await regionDark(110, CLOCK_Y, 260, CLOCK_H)
const emFrameSpan = await rowSpanDark(FRAME_Y, 20, 460)
console.log('  拨号带暗像素:', emDialDark, '提示框行:', emFrameSpan)
assert(emDialDark > 100, '112 进拨号界面（大号号码）')
assert(emFrameSpan < 200, '锁态拦截提示已让位')
await press('KeyW', 87) // 退出拨号
await sleep(600)
assert((await regionDark(110, CLOCK_Y, 260, CLOCK_H)) > 150, '回待机')

// ================= 12) reload：持久化数据仍在 =================
console.log('12) Reload 持久化')
await evalJS(`location.reload()`)
await sleep(2000)
assert(await dark() < 100, '重载后为关机态（电源不持久）')
const persisted = await idbJSON('nokia-1100:calllog')
assert(Array.isArray(persisted) && persisted.some((e) => e.tel === '10086' && e.dir === 'out'),
  'calllog 数据跨会话保留')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== NOKIA 1100 E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

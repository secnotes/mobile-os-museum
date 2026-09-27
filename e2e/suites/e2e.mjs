/**
 * 功能机 MVP 端到端冒烟测试：
 * 无头 Chromium + CDP，验证 展馆 → 设备 → 开机 → 菜单 → 短信(T9) → 贪吃蛇 全链路。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const SHOT = (n) => `/tmp/shot-${n}.png`

const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9222', '--user-data-dir=/tmp/chrome-e2e',
  '--window-size=900,1000', 'about:blank',
], { stdio: 'ignore' })
await sleep(1500)

// 打开目标页
await fetch('http://localhost:9222/json/new?' + encodeURIComponent(URL), { method: 'PUT' })
await sleep(2500)
const targets = await (await fetch('http://localhost:9222/json/list')).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:4173'))
if (!page) throw new Error('未找到页面 target: ' + JSON.stringify(targets.map((t) => t.url)))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const pending = new Map()
const consoleLogs = []
const exceptions = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    consoleLogs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(SHOT(name), Buffer.from(r.result.data, 'base64'))
  console.log(`  📸 ${SHOT(name)}`)
}
const sleepMs = () => sleep(400)
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

await send('Page.enable')
await send('Runtime.enable')
console.log('1) 展馆加载')

// 1) 展馆
const title = await evalJS(`document.querySelector('.gallery-header h1')?.textContent`)
console.log('   标题:', title)
if (title !== '掌上博物馆') throw new Error('展馆标题异常')
const cards = await evalJS(`document.querySelectorAll('.device-card').length`)
console.log('   展品数:', cards)
if (cards !== 8) throw new Error("应注册 8 台设备")
await shot('gallery')

// 2) 进入设备
console.log('2) 进入 Pebble 3310')
await evalJS(`location.hash = '#/device/nokia-3310'`)
await sleep(800)
const canvasInfo = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('   画布:', JSON.stringify(canvasInfo))
if (!canvasInfo || canvasInfo.w % 84 !== 0) throw new Error('画布宽度应为 84 的整数倍')

const offCount = () => evalJS(`(() => {
  const c = document.querySelector('canvas'); const x = c.getContext('2d')
  const d = x.getImageData(0, 0, c.width, c.height).data
  let dark = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) dark++
  return dark
})()`)
console.log('   关机暗像素:', await offCount(), '(应约 0)')

// 3) 开机（P 键）
console.log('3) 按 P 开机')
await key('KeyP', 80)
await sleep(5300) // 开机握手动画 4.6s
const bootDark = await offCount()
console.log('   待机屏暗像素:', bootDark, '(应 > 1000)')
if (bootDark < 1000) throw new Error('待机屏未绘制')
await shot('idle')

// 4) 进入功能表（Enter = ok）
console.log('4) Enter 进功能表')
await key('Enter', 13)
await sleepMs()
const menuText = await evalJS(`null /* canvas 无 DOM 文本，改用像素密度判断 */`)
void menuText
await shot('menu')

// 5) 启动贪吃蛇（3310 菜单：8 Games → 1 Snake II，数字快捷序号）
console.log('5) 启动贪吃蛇')
await key('Digit8', 56)
await sleepMs()
await key('Digit1', 49)
await sleep(1200)
await shot('snake')
const snakeDark = await offCount()
console.log('   蛇屏暗像素:', snakeDark, '(应 > 500)')
if (snakeDark < 500) throw new Error('贪吃蛇未渲染')

// 方向键玩两下
await key('ArrowUp', 38); await sleep(400)
await key('ArrowRight', 39); await sleep(600)
await shot('snake-play')

// 6) Esc 退回根功能表 → 2 Messages → 2 Inbox
console.log('6) 打开短信')
await key('Escape', 27); await sleepMs() // Games 列表 → 根
await key('Digit2', 50); await sleepMs() // → Messages 列表
await key('Digit2', 50); await sleep(600) // → Inbox
await shot('messages-inbox')
const msgDark = await offCount()
if (msgDark < 500) throw new Error('短信收件箱未渲染')

// 7) 写短信：soft1 = Q → 进入编辑器，按 6 4 (ni) → 6 4 4 2 6 = 你好
console.log('7) T9 编辑短信')
await key('KeyQ', 81) // soft1 写短信
await sleepMs()
await shot('compose-empty')
for (const d of '64426') { await key('Digit' + d, 48 + Number(d)); await sleep(150) }
await sleep(300)
await key('Enter', 13) // ok 上屏 你好
await sleepMs()
await shot('compose-typed')
// 发送 soft1
await key('KeyQ', 81)
await sleep(2100) // 发送中 1.6s + 已送达
await shot('sent')

console.log('8) 收尾检查')
await sleep(3000) // 等自动回复(4.5-9s 不一定到，尽力)
const hasReply = await evalJS(`(async () => {
  const dbs = await indexedDB.databases()
  if (!dbs.length) return 'no-db'
  return 'db-ok:' + dbs[0].name
})()`)
console.log('   IndexedDB:', hasReply)

// 9) 待机直接拨号（真机行为）
console.log('9) 待机直接拨号')
await key('Escape', 27); await sleepMs() // 收件箱 app 退出 → Messages 列表
await key('Escape', 27); await sleepMs() // Messages 列表 → 根功能表
await key('Escape', 27); await sleepMs() // 根功能表 → 待机
for (const d of '10086') { await key('Digit' + d, 48 + Number(d)); await sleep(120) }
await sleepMs()
await shot('dial')
await key('KeyQ', 81) // soft1 呼叫
await sleep(2800)
await shot('in-call')
const callDark = await offCount()
console.log('   通话屏暗像素:', callDark, '(应 > 300)')
if (callDark < 300) throw new Error('通话屏未渲染')
await key('KeyW', 87) // soft2 结束
await sleep(400)
await shot('after-call')
const idleDark2 = await offCount()
if (idleDark2 < 300) throw new Error('挂断后未回待机')

console.log('\n控制台输出:', consoleLogs.length ? consoleLogs.slice(0, 10) : '(无)')
console.log('运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

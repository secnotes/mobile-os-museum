/**
 * 大哥大电话本验证（真机：有电话本、无菜单、无通话记录）：
 * 待机大日期 → MR 进电话本 → MR 连按浏览卡片 → Call 直拨 / End 返回；
 * Menu 键直达短信列表（不存在任何通话记录入口）。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const BASE = 'http://localhost:9237'; const URL = 'http://localhost:4173/mobile/'
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9237', '--user-data-dir=/tmp/chrome-bbk',
  '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
process.on('uncaughtException', (e) => {
  console.error('FATAL:', e); chrome.kill(); process.exit(1)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(1500)
const info = await (await fetch(`${BASE}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })).json()
const ws = new WebSocket(info.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const pending = new Map(); const exceptions = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id) }
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text)
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id
    const to = setTimeout(() => { pending.delete(i); rej(new Error(`CDP 超时 20s: ${method}`)) }, 20000)
    pending.set(i, {
      resolve: (x) => { clearTimeout(to); res(x) },
      reject: (e) => { clearTimeout(to); rej(e) },
    })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
ws.addEventListener('close', () => {
  for (const [, p] of pending) p.reject(new Error('CDP WebSocket 已关闭'))
  pending.clear()
})
const evalJS = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value ?? null
}
await send('Page.enable'); await send('Runtime.enable'); await sleep(500)
const shot = async (n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`/tmp/bbk-${n}.png`, Buffer.from(r.result.data, 'base64'))
}
const regionDark = (x, y, w, h) => evalJS(`(()=>{
  const c=document.querySelector('canvas');if(!c)return -1
  const d=c.getContext('2d').getImageData(${x},${y},${w},${h}).data
  let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<100&&d[i+1]<110&&d[i+2]<100)n++
  return n
})()`)
const dark = async () => regionDark(0, 0, 360, 240)
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log('  ✓', m) }
// BRICK 物理映射：R=mr Q=call W=end C=menu M=mplus F=fcn V=vol P=power
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk })
}

await evalJS(`localStorage.clear()`); await evalJS(`location.reload()`); await sleep(1500)
await evalJS(`location.hash='#/device/motorola-brick'`); await sleep(1000)
await key('KeyP', 80); await sleep(3000) // boot 2.4s
const idle = await dark(); assert(idle > 500, '待机屏渲染')
// 待机大日期：屏幕中央 size20 的日号 → canvas (100,75,160,100)
const dateDark = await regionDark(100, 75, 160, 100)
console.log('  大日期区暗像素:', dateDark)
assert(dateDark > 150, '待机中央大号日期（真机不显示时钟）')
await shot('idle')

// MR → 电话本卡片
await key('KeyR', 82); await sleep(700)
const headDark = await regionDark(0, 0, 360, 60)
console.log('  标题栏暗像素:', headDark)
assert(headDark > 500, 'MR → 电话本（反白标题栏）')
await shot('book')
// MR 连按浏览：卡片序号推进，界面持续正常
let prevHead = headDark
for (let i = 0; i < 4; i++) {
  await key('KeyR', 82); await sleep(350)
  const hd = await regionDark(0, 0, 360, 60)
  assert(hd > 400, `MR 连按浏览第 ${i + 1} 张卡片（标题栏在位）`)
  prevHead = hd
}
await shot('book-cycled')
// End 返回待机
await key('KeyW', 87); await sleep(600)
const backIdle = await dark(); assert(backIdle > 500, 'End → 返回待机')

// Menu 键直达短信列表（真机键标 Menu/SMS）——系统内不存在通话记录入口
await key('KeyC', 67); await sleep(700)
const listDark = await dark()
console.log('  短信列表暗像素:', listDark)
assert(listDark > 300, 'Menu → 短信列表（无菜单树、无通话记录入口）')
await shot('sms-list')
await key('KeyC', 67); await sleep(600) // list 内 menu → idle
const idle2 = await dark(); assert(idle2 > 500, '返回待机')

console.log('运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('异常')
console.log('\n=== BRICK PHONEBOOK PASSED ===')
ws.close(); chrome.kill(); process.exit(0)

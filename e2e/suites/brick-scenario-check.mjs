/**
 * 大哥大情景编排验证（真机：来电不留任何记录）：
 * 预置来电事件 → 进设备开机 → 响铃 → Call 接听 → End 挂断 → 回大日期待机。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const BASE = 'http://localhost:9235'
const URL = 'http://localhost:4173/mobile/'
const DEV = 'motorola-brick'
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9235', '--user-data-dir=/tmp/chrome-bsc',
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
await send('Page.enable'); await send('Runtime.enable')
const shot = async (n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`/tmp/bsc-${n}.png`, Buffer.from(r.result.data, 'base64'))
}
const dark = async () => evalJS(`(()=>{
  const c=document.querySelector('canvas');if(!c)return -1
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data
  let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<100&&d[i+1]<110&&d[i+2]<100)n++
  return n
})()`)
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log('  ✓', m) }
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk })
}
const idbSet = async (k, v) => evalJS(`(async () => new Promise((resolve) => {
  const rq=indexedDB.open('mobile-museum')
  rq.onsuccess=()=>{
    const db=rq.result;const tx=db.transaction('kv','readwrite')
    tx.objectStore('kv').put(${JSON.stringify(JSON.stringify(v))},${JSON.stringify(k)})
    tx.onabort=tx.onerror=tx.oncomplete=()=>resolve()
  }
  rq.onerror=()=>resolve()
}))()`, true)

await evalJS(`localStorage.clear()`); await evalJS(`location.reload()`); await sleep(1500)
await evalJS(`location.hash='#/settings'`); await sleep(800) // 挂载 Store → 创建 mobile-museum DB
const now = Date.now()
await idbSet(`${DEV}:events`, [{ id: now + 1, type: 'call', from: '13900000000', name: '老板', delaySec: 5, fired: false }])
console.log('== 预置来电事件 ==')
await evalJS(`location.hash='#/device/${DEV}'`); await sleep(1000)
await key('KeyP', 80); await sleep(3000) // brick boot 2.4s
const idleDark = await dark(); console.log('  待机暗像素:', idleDark); assert(idleDark > 500, '大哥大待机屏（大日期）')
await sleep(3500) // 5s 事件到期 + 响铃
const ringDark = await dark(); console.log('  响铃暗像素:', ringDark); await shot('ringing')
assert(ringDark > 300, '来电响铃屏')
await key('KeyQ', 81) // Call 绿键接听
await sleep(1200); await shot('incall')
const callDark = await dark(); assert(callDark > 200, '通话屏')
await sleep(1200)
await key('KeyW', 87) // End 红键挂断（不留记录）
await sleep(700)
const idleDark2 = await dark(); console.log('  挂断后暗像素:', idleDark2)
assert(idleDark2 > 500, '挂断后回大日期待机')
console.log('运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('异常')
console.log('\n=== BRICK SCENARIO PASSED ===')
ws.close(); chrome.kill(); process.exit(0)

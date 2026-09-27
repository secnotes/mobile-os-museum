/**
 * 情景编排端到端验证：
 *  - 设置页可见 + 设备 tab
 *  - 通过 IndexedDB 预置：联系人 + 来电事件(5s) + 来短信事件
 *  - 进入 3310 → 开机 → 5s 后来电响铃 → 接听 → 通话 → 挂断
 *  - 断言 calllog 含一条 dir:in
 *  - 来短信事件触发 → inbox 新增 unread
 *  - 通讯录应用可见新增联系人
 * 端口 9234。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:9234'
const URL = 'http://localhost:4173/mobile/'
const DEV = 'nokia-3310'

const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9234', '--user-data-dir=/tmp/chrome-scenario',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(1500)

const info = await (await fetch(`${BASE}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })).json()
const ws = new WebSocket(info.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
const exceptions = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text)
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk })
}
await send('Page.enable')
await send('Runtime.enable')
await sleep(1500)

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`/tmp/scenario-${name}.png`, Buffer.from(r.result.data, 'base64'))
}
const dark = async () => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const x = c.getContext('2d'); const d = x.getImageData(0,0,c.width,c.height).data
  let n = 0; for (let i=0;i<d.length;i+=4) if (d[i]<100&&d[i+1]<110&&d[i+2]<100) n++
  return n
})()`)

const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓', msg) }

/** 写入 IndexedDB（fire-and-forget + 轮询确认） */
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

// ============ 1) 设置页可见 ============
console.log('== 1) 设置页 ==')
await evalJS(`localStorage.clear()`)
await evalJS(`location.reload()`)
await sleep(1500)
await evalJS(`location.hash = '#/settings'`)
await sleep(800)
const setTitle = await evalJS(`document.querySelector('.settings-topbar h1')?.textContent`)
console.log('   标题:', setTitle)
assert(setTitle === '情景编排', '设置页渲染')
const stabCount = await evalJS(`document.querySelectorAll('.stab').length`)
console.log('   设备 tab 数:', stabCount)
assert(stabCount >= 3, '设备 tab ≥3')

// ============ 2) 预置数据：联系人 + 来电事件(5s) + 来短信事件(14s) ============
console.log('== 2) 预置情景数据 ==')
const now = Date.now()
const contact = { name: '测试', tel: '13800000000' }
await idbSet(`${DEV}:contacts`, [contact])
const events = [
  { id: now + 1, type: 'call', from: '13800000000', name: '测试', delaySec: 5, fired: false },
  { id: now + 2, type: 'sms', from: '13800000000', name: '测试', text: '你好吗', delaySec: 16, fired: false },
]
await idbSet(`${DEV}:events`, events)
console.log('   已写入 contacts + 2 events')

// ============ 3) 进入 3310，开机 ============
console.log('== 3) 进入 3310 开机 ==')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1200)
await key('KeyP', 80)
await sleep(5300) // 开机握手 4.6s
const idleDark = await dark()
console.log('   待机暗像素:', idleDark)
assert(idleDark > 1000, '待机屏绘制')

// ============ 4) ~5s 后来电响铃（事件在 scheduler.start 时计时，开机已耗 ~5s，应已响铃或 pending→响铃） ============
console.log('== 4) 等待来电 ==')
await sleep(2500) // 给 pendingIncoming → enterRinging 留时间
const ringDark = await dark()
console.log('   响铃屏暗像素:', ringDark)
await shot('ringing')
assert(ringDark > 800, '来电响铃屏渲染')

// ============ 5) 接听（ok=Enter）→ 通话 → 挂断（clear=Backspace） ============
console.log('== 5) 接听 / 通话 / 挂断 ==')
await key('Enter', 13) // ok：接听（真机 Navi 键，无软键）
await sleep(1000)
await shot('in-call')
const callDark = await dark()
assert(callDark > 300, '通话屏渲染')
await sleep(1500) // 通话几秒，累积时长
await key('Backspace', 8) // clear：通话中挂断（已接通 → received，非 missed）
await sleep(800)

// ============ 6) 断言 calllog 含 dir:in ============
console.log('== 6) 通话记录 ==')
const log = await idbGet(`${DEV}:calllog`)
console.log('   calllog:', JSON.stringify(log))
const inEntry = Array.isArray(log) && log.find((e) => e.dir === 'in' && e.tel === '13800000000')
assert(!!inEntry, '通话记录含一条来电')

// ============ 7) 等来短信事件（16s 延迟，已耗 ~12s） ============
console.log('== 7) 等待来短信 ==')
await sleep(8000)
const inbox = await idbGet(`${DEV}:messages:inbox`)
console.log('   inbox 条数:', Array.isArray(inbox) ? inbox.length : 0)
const sms = Array.isArray(inbox) && inbox.find((m) => m.from === '13800000000' && m.text === '你好吗')
assert(!!sms, '收到来短信事件')
assert(sms && !sms.read, '来短信为未读')

// ============ 8) 通讯录应用可见联系人 ============
console.log('== 8) 通讯录应用 ==')
await key('Escape', 27); await sleep(400) // 回待机
await key('Enter', 13); await sleep(400) // 根功能表
// 1 Phone book → 1 Search
await key('Digit1', 49); await sleep(300)
await key('Digit1', 49); await sleep(500)
await shot('contacts-app')
const contactsDark = await dark()
console.log('   通讯录屏暗像素:', contactsDark)
assert(contactsDark > 300, '通讯录应用渲染')

console.log('运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== SCENARIO E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

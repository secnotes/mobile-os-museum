/**
 * S60 (N73) 情景编排端到端验证（端口 9238）：
 *  - 设置页 5 设备 tab
 *  - IndexedDB 预置：联系人 + 来电事件(5s) + 来短信事件(16s)
 *  - 进入 N73 → 开机（来电落在 boot → pendingIncoming → 待机触发响铃）
 *  - S60 标准来电屏（蓝条）→ soft1 接听（白底蓝条通话屏）→ soft2 挂断
 *  - 断言 calllog 含 dir:in / 来短信 unread / 名片夹 + 通讯记录 app 渲染
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9238
const DEV = 'nokia-n73'

rmSync('/tmp/chrome-s60sc', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-s60sc',
  '--window-size=900,1100', 'about:blank',
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
const total = () => evalJS(`(() => { const c = document.querySelector('canvas'); return c.width * c.height })()`)
const pct = async (rgb) => (await n(rgb)) / await total()
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

// S60 调色板（src/os/s60/palette.ts）
const BLUE = '47,111,208'
const WHITE = '244,247,250'
const GREEN = '78,155,78'

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
  { id: now + 1, type: 'call', from: '13800000000', name: '测试', delaySec: 5, fired: false },
  { id: now + 2, type: 'sms', from: '13800000000', name: '测试', text: '你好吗', delaySec: 16, fired: false },
])
console.log('   已写入 contacts + 2 events')

// ============ 3) 进入 N73，开机 ============
console.log('== 3) 进入 N73 开机 ==')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1200)
await key('KeyP', 80)
await sleep(6200) // 两阶段开机（字标 1s + 握手 4.5s）→ 待机
const idleBlue = await n(BLUE)
console.log('   待机蓝像素:', idleBlue)
assert(idleBlue > 2000, '待机屏绘制')

// ============ 4) 来电（事件 5s 落在 boot → pending → 待机响铃） ============
console.log('== 4) 等待来电 ==')
await sleep(2500)
const ringBlue = await n(BLUE)
const ringWhite = await n(WHITE)
console.log('   响铃屏 蓝条:', ringBlue, '白底:', ringWhite)
assert(ringBlue > 5000, 'S60 来电屏顶部蓝条')
assert(ringWhite > 30000, '来电屏白底')

// ============ 5) soft1 接听 → 白底蓝条通话屏 → soft2 挂断 ============
console.log('== 5) 接听 / 通话 / 挂断 ==')
await key('KeyQ', 81) // soft1 接听
await sleep(800)
const callWhite = await pct(WHITE)
const callBlue = await n(BLUE)
const callGreenPct = await pct(GREEN)
console.log('   通话屏 白底占比:', callWhite.toFixed(2), '蓝条:', callBlue, '绿:', callGreenPct.toFixed(3))
assert(callWhite > 0.5, '来电接通为白底通话屏')
assert(callBlue > 4000, '顶部蓝色来电状态条')
assert(callGreenPct < 0.05, '非整屏绿')
await sleep(2200) // 累积通话时长
await key('KeyW', 87) // soft2 挂断
await sleep(2200) // callend 1.4s → 待机

// ============ 6) 通话记录 ============
console.log('== 6) 通话记录 ==')
const log = await idbGet(`${DEV}:calllog`)
console.log('   calllog:', JSON.stringify(log))
const inEntry = Array.isArray(log) && log.find((e) => e.dir === 'in' && e.tel === '13800000000')
assert(!!inEntry, '通话记录含一条来电')
assert(inEntry && !inEntry.missed, '来电标记为已接')
assert(inEntry && inEntry.dur >= 1, `通话时长 ≥1s (实际 ${inEntry?.dur})`)

// ============ 7) 等来短信 ============
console.log('== 7) 等待来短信 ==')
await sleep(6000)
const inbox = await idbGet(`${DEV}:messages:inbox`)
const sms = Array.isArray(inbox) && inbox.find((m) => m.from === '13800000000' && m.text === '你好吗')
console.log('   inbox 条数:', Array.isArray(inbox) ? inbox.length : 0)
assert(!!sms, '收到来短信事件')
assert(sms && !sms.read, '来短信为未读')

// ============ 8) 名片夹（顶级 idx0） ============
console.log('== 8) 名片夹 ==')
await key('ArrowUp', 38); await sleep(400) // 待机 ↑ 进功能表
await key('Enter', 13); await sleep(600) // idx0 = 名片夹
const cBlue = await n(BLUE)
const cWhite = await n(WHITE)
console.log('   名片夹 蓝条:', cBlue, '白底:', cWhite)
assert(cBlue > 1000 && cWhite > 30000, '名片夹渲染（持久化数据）')
const stored = await idbGet(`${DEV}:contacts`)
assert(Array.isArray(stored) && stored[0]?.name === '测试', '联系人来自设备 store')
await key('Escape', 27); await sleep(500) // 回菜单

// ============ 9) 通讯记录 app（工具文件夹 idx18） ============
console.log('== 9) 通讯记录 app ==')
for (let i = 0; i < 8; i++) { await key('ArrowRight', 39); await sleep(140) } // 0→8 工具
await key('Enter', 13); await sleep(450)
for (let i = 0; i < 6; i++) { await key('ArrowDown', 40); await sleep(140) } // 0→3→…→18
await key('Enter', 13); await sleep(600)
const lWhite = await n(WHITE)
console.log('   记录 白底:', lWhite)
assert(lWhite > 30000, '记录 app 渲染')
await key('Escape', 27); await sleep(400)

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== S60 SCENARIO E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

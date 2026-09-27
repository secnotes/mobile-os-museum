/**
 * Lumia 800 (WP7.5) 情景编排端到端验证（端口 9241）：
 *  - 设置页 6 设备 tab
 *  - IndexedDB 预置：联系人 + 来电事件(8s) + 来短信事件(18s)
 *  - 进入 Lumia 800 → F6 开机 → Enter 解锁 → 开始屏
 *  - 8s 来电：Mango 来电页（接听/忽略双条）→ 点接听 → 通话 → 点挂断
 *  - 断言 calllog 含 dir:in 已接
 *  - 18s 来短信 unread；重启后锁屏显示「N 信息」未读行
 *  - 信息应用：线程列表 → 对话（标记已读落库）
 *  - 人脉：预置联系人详情 → 呼叫桥（预填号码进电话应用）
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9241
const DEV = 'nokia-lumia-800'

rmSync('/tmp/chrome-wp7sc', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-wp7sc',
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

/** 画布矩形色计数（设备坐标 0..480 / 0..800） */
const n = async (rgb, x0 = 0, y0 = 0, x1 = 480, y1 = 800) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return null
  const x = c.getContext('2d')
  const sx = c.width / 480, sy = c.height / 800
  const d = x.getImageData(Math.round(${x0}*sx), Math.round(${y0}*sy), Math.round((${x1}-${x0})*sx), Math.round((${y1}-${y0})*sy)).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i]+','+d[i+1]+','+d[i+2] === '${rgb}') n++
  return n
})()`)
/** 完整点按：开始屏在 pointerup 启动应用 */
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
/** 仅按下：来电/通话/人脉按钮在 pointerdown 触发，且不补 up（避免误触开始屏） */
const tapDown = async (sx, sy) => {
  await evalJS(`(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: r.x + (${sx} / 480) * r.width,
      clientY: r.y + (${sy} / 800) * r.height,
      bubbles: true,
    }))
  })()`)
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

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
const GRAY = '138,138,138'
const DIM = '42,42,42'
const COBALT = '27,161,226'
const CRIMSON = '229,20,0'

// ============ 1) 设置页：6 设备 tab ============
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
console.log('   已写入 contacts + 2 events')

// ============ 3) 进入 Lumia 800，开机 → 解锁 ============
console.log('== 3) 开机解锁 ==')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1600)
await key('F6', 117)
await sleep(5200) // 4.2s 开机动画 → 锁屏
await key('Enter', 13)
await sleep(600)
const homeCobalt = await n(COBALT)
console.log('   开始屏钴蓝瓷贴:', homeCobalt)
assert(homeCobalt > 55000, '解锁进入开始屏')

// ============ 4) 8s 来电 → Mango 来电页 ============
console.log('== 4) 等待来电 ==')
await sleep(4000)
const ansBar = await n(COBALT, 24, 570, 456, 640)
const igBar = await n(DIM, 24, 660, 456, 730)
const nameWhite = await n(WHITE, 0, 120, 480, 280)
console.log('   接听条:', ansBar, '忽略条:', igBar, '姓名白字:', nameWhite)
assert(ansBar > 6000, '来电页接听条（强调色）')
assert(igBar > 6000, '来电页忽略条（暗灰）')
assert(nameWhite > 300, '来电页姓名大字')

// ============ 5) 接听 → 通话 → 挂断 ============
console.log('== 5) 接听 / 通话 / 挂断 ==')
await tapDown(240, 605) // 接听条在 down 触发
await sleep(800)
const endBar = await n(CRIMSON, 100, 630, 380, 700)
console.log('   通话挂断条:', endBar)
assert(endBar > 6000, '通话中（绯红挂断条）')
await sleep(2200)
await tapDown(240, 665) // 仅 down：up 会误触开始屏图片贴
await sleep(900)
const log = await idbGet(`${DEV}:calllog`)
console.log('   calllog:', JSON.stringify(log))
const inEntry = Array.isArray(log) && log.find((e) => e.dir === 'in' && e.tel === '13800000000')
assert(!!inEntry, '通话记录含一条来电')
assert(inEntry && !inEntry.missed, '来电标记为已接')
assert(inEntry && inEntry.dur >= 1, `通话时长 ≥1s (实际 ${inEntry?.dur})`)
const homeCobalt2 = await n(COBALT)
assert(homeCobalt2 > 55000, '挂断回开始屏')

// ============ 6) 18s 来短信 ============
console.log('== 6) 等待来短信 ==')
await sleep(7500)
const inbox = await idbGet(`${DEV}:messages:inbox`)
const sms = Array.isArray(inbox) && inbox.find((m) => m.from === '13800000000' && m.text === '你好吗')
console.log('   inbox 条数:', Array.isArray(inbox) ? inbox.length : 0)
assert(!!sms, '收到来短信事件')
assert(sms && !sms.read, '来短信为未读')

// ============ 7) 重启 → 锁屏未读行 ============
console.log('== 7) 锁屏未读角标 ==')
await key('F6', 117)
await sleep(1600)
await key('F6', 117)
await sleep(5200)
const lockBadge = await n(GRAY, 150, 310, 330, 345)
console.log('   锁屏未读行灰字:', lockBadge)
assert(lockBadge > 80, '锁屏显示「1 信息」未读行')

// ============ 8) 信息应用：线程 → 对话已读 ============
console.log('== 8) 信息应用 ==')
await key('Enter', 13)
await sleep(700)
await tap(110, 364) // 信息方贴（第二行左）
await sleep(800)
const listWhite = await n(WHITE, 0, 100, 480, 400)
console.log('   线程列表白字:', listWhite)
assert(listWhite > 400, '线程列表渲染')
await tap(240, 154) // 第一行（测试线程，最新）
await sleep(800)
const bubbleDim = await n(DIM, 0, 110, 480, 700)
console.log('   对话气泡暗灰:', bubbleDim)
assert(bubbleDim > 2000, '对话视图气泡渲染')
const inbox2 = await idbGet(`${DEV}:messages:inbox`)
const sms2 = Array.isArray(inbox2) && inbox2.find((m) => m.from === '13800000000' && m.text === '你好吗')
assert(sms2 && sms2.read, '打开对话后来短信标记已读')
await key('F3', 114) // 开始键回开始屏
await sleep(600)

// ============ 9) 人脉：预置联系人 → 呼叫桥 ============
console.log('== 9) 人脉 ==')
await tap(295, 178) // 人脉方贴（第一行右）
await sleep(800)
const peopleWhite = await n(WHITE)
console.log('   人脉白字:', peopleWhite)
assert(peopleWhite > 400, '人脉列表渲染（预置联系人）')
await tap(240, 154) // 第一行：测试
await sleep(600)
const callBar = await n(COBALT, 24, 610, 220, 680)
console.log('   呼叫条:', callBar)
assert(callBar > 4000, '详情呼叫条')
await tapDown(122, 645) // 呼叫 → 电话应用预填号码
await sleep(900)
const dialCobalt = await n(COBALT, 100, 708, 380, 772)
const numWhite = await n(WHITE, 0, 180, 480, 280)
console.log('   拨号呼叫键:', dialCobalt, '号码白字:', numWhite)
assert(dialCobalt > 5000, '呼叫桥跳转电话应用')
assert(numWhite > 200, '号码已预填')
await key('F3', 114)
await sleep(500)
const homeCobalt3 = await n(COBALT)
assert(homeCobalt3 > 55000, '回开始屏')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== WP7 SCENARIO E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

/**
 * BlackBerry Bold 9000 无视觉 E2E（480×320 真机屏 ×1.5）：
 * 关机空屏 / 开机 3s 握手 → 主屏 Precision 壁纸 / Messages 收发与自动回复落库 /
 * Phone 外呼接通计时落 bb:calllog / BBM 气泡收发 / Camera 拍照落 bb:photos /
 * Options 铃声选定落 bb:ringtone + 中英切换 / 情景来电接听 / 来短信注入 / 关机 / reload 持久化。
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9244
const DEV = 'blackberry-bold-9000'

rmSync('/tmp/chrome-bb', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-bb',
  '--window-size=1100,1000', 'about:blank',
], { stdio: 'ignore' })
// 失败也必须回收 chromium（防止孤儿进程占住端口/内存）
process.on('uncaughtException', (e) => {
  console.error('FATAL:', e)
  chrome.kill()
  process.exit(1)
})
await sleep(4000)
await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })
await sleep(2600)
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
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id).resolve(msg); pending.delete(msg.id) }
  else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''))
  }
}
// 快速失败：ws 断连或 20s 无响应一律 reject（防止导航销毁执行上下文后永久挂起）
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id
    const to = setTimeout(() => {
      pending.delete(i)
      rej(new Error(`CDP 超时 20s 无响应: ${method}`))
    }, 20000)
    pending.set(i, {
      resolve: (msg) => { clearTimeout(to); res(msg) },
      reject: (e) => { clearTimeout(to); rej(e) },
    })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
ws.addEventListener('close', () => {
  for (const [, p] of pending) p.reject(new Error('CDP WebSocket 已关闭'))
  pending.clear()
})
const evalJS = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.result?.exceptionDetails) {
    throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  }
  return r.result?.result?.value ?? null
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
await send('Page.enable')
await send('Runtime.enable')

const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

// ---------- 键位（QWERTY 物理映射）：F1=call F2=end F4=menu F6=power Enter=ok Esc=back Backspace=clear ----------
const key = async (code, vk, holdMs = 0) => {
  const k = code.replace('Arrow', '').replace('Digit', '').toLowerCase()
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  if (holdMs) await sleep(holdMs)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
const press = (code, vk) => key(code, vk, 0)
const digits = async (seq, gap = 180) => {
  for (const d of seq) { await press('Digit' + d, 48 + Number(d)); await sleep(gap) }
}
const letters = async (seq, gap = 150) => {
  for (const ch of seq) { await press('Key' + ch.toUpperCase(), 65 + (ch.charCodeAt(0) - 97)); await sleep(gap) }
}

// ---------- 像素探测（canvas 元素坐标 720×480） ----------
const countPx = (pred) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  const test = ${pred}
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i+1], d[i+2])) n++
  return n
})()`)
const regionCount = (pred, x, y, w, h) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data
  const test = ${pred}
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i+1], d[i+2])) n++
  return n
})()`)
const nonWhite = () => countPx('(r,g,b)=>!(r>240&&g>240&&b>240)')
const bluePx = () => countPx('(r,g,b)=>b>110&&b-r>45&&b-g>20')
const darkPx = () => countPx('(r,g,b)=>r<70&&g<80&&b<95')
const selectBlue = () => countPx('(r,g,b)=>r>=8&&r<=42&&g>=66&&g<=112&&b>=175&&b<=222')

// ---------- IndexedDB 直读 ----------
const idbRaw = async (fullKey) => evalJS(`(async () => new Promise((resolve) => {
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
  const raw = await idbRaw(fullKey)
  return raw === null ? null : JSON.parse(raw)
}
/** 直接删 IDB 键（测试隔离） */
const idbDelete = async (fullKey) => {
  await evalJS(`(async () => new Promise((resolve) => {
    const r = indexedDB.open('mobile-museum')
    r.onsuccess = () => {
      try {
        const tx = r.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').delete(${JSON.stringify(fullKey)})
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () => resolve()
      } catch { resolve() }
    }
    r.onerror = () => resolve()
  }))()`, true)
}
/** 直接写 IDB（不经页面 Store）——调度器启动时会读到 */
const idbSet = async (fullKey, val) => {
  await evalJS(`(async () => new Promise((resolve) => {
    const r = indexedDB.open('mobile-museum')
    r.onsuccess = () => {
      try {
        const tx = r.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(${JSON.stringify(JSON.stringify(val))}, ${JSON.stringify(fullKey)})
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () => resolve()
      } catch { resolve() }
    }
    r.onerror = () => resolve()
  }))()`, true)
}

/**
 * 确保 IDB schema 与 App 完全一致（v1 + kv 仓库）。
 * 全新 profile 上若先用无版本 open() 触碰数据库，可能建出无对象仓库的空库，
 * 导致 App 的版本化 open 不再触发 upgrade、直写 eval 永久挂起。
 * 这里一律删库重建，与 App 的 open('mobile-museum', 1) 升级步骤相同。
 */
const ensureIDB = () => evalJS(`(async () => new Promise((resolve) => {
  const del = indexedDB.deleteDatabase('mobile-museum')
  const rebuild = () => {
    const r = indexedDB.open('mobile-museum', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => { r.result.close(); resolve() }
    r.onerror = () => resolve()
  }
  del.onsuccess = del.onerror = del.onblocked = rebuild
}))()`, true)

// ================= 1) 进入展品：关机近白空屏 =================
console.log('1) 进入黑莓 Bold 9000（关机态）')
await ensureIDB()
// 测试隔离：清掉既往运行残留
for (const k of ['bb:threads', 'bb:bbm', 'bb:photos', 'bb:calllog',
  'bb:ringtone', 'bb:vibe', 'bb:alarm', 'events']) {
  await idbDelete(`${DEV}:${k}`)
}

// 情景事件必须在进入设备前写入：调度器启动时 scheduleAll 读取
// （直连 IDB put 不触发页面 Store.onChange）
const now0 = Date.now()
await idbSet(`${DEV}:events`, [
  { id: now0 + 1, type: 'call', from: '13900001111', name: '老李', delaySec: 44, fired: false },
  { id: now0 + 2, type: 'sms', from: '13900001111', name: '老李', text: 'E2E短信', delaySec: 70, fired: false },
])

await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(2500)
const canvas = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('  画布:', JSON.stringify(canvas))
assert(canvas.w === 720 && canvas.h === 480, '画布 720×480（480×320 ×1.5）')
const offPx = await nonWhite()
console.log('  关机态非白像素:', offPx)
assert(offPx < 3000, '关机态近白空屏')

// ================= 2) 开机：3s BlackBerry 握手 → 主屏 =================
console.log('2) 开机握手 → 主屏')
await press('F6', 117)
await sleep(4200) // boot 3.0s + 余量
const homeBlue = await bluePx()
console.log('  主屏蓝色像素:', homeBlue)
assert(homeBlue > 4000, '主屏 Precision 蓝色壁纸渲染')

// ================= 3) Messages：妈妈会话 → 发信 → 2.2s 自动回复 =================
console.log('3) Messages 收发')
await press('Enter', 13) // homeSel=0：messages
await sleep(800)
assert((await countPx('(r,g,b)=>r>245&&g>245&&b>245')) > 160000, '消息列表白底渲染')
assert((await regionCount('(r,g,b)=>r<90&&g<90&&b<90', 0, 50, 720, 150)) > 200,
  '列表行文字在位（姓名/预览）')
await press('Enter', 13) // 打开妈妈线程并标记已读
await sleep(800)
await press('Enter', 13) // 进撰写
await sleep(300)
await letters('hi')
await press('Enter', 13) // 发送
await sleep(3000) // 回复 2.2s
const threadsAfter = await idbJSON(`${DEV}:bb:threads`)
const mom = Array.isArray(threadsAfter) && threadsAfter.find((t) => t.tel === '13800000000')
console.log('  妈妈线程消息数:', mom?.msgs.length, '末条:', mom?.msgs.at(-1)?.dir, 'unread:', mom?.unread)
assert(mom && mom.msgs.length === 3 && mom.msgs.at(-1).dir === 'in' && mom.unread === true,
  '发信落库且 2.2s 后自动回复（未读恢复）')
await press('F2', 113) // End：回主屏
await sleep(600)

// ================= 5) Phone：外呼 5551234，2.6s 接通计时，挂断落 bb:calllog =================
console.log('4) Phone 外呼接通')
await press('F1', 112) // 启动 phone
await sleep(600)
await digits('5551234')
await press('F1', 112) // 呼叫
await sleep(3400) // 2.6s 接通
const sel1 = await selectBlue()
console.log('  通话屏 SELECT 蓝像素:', sel1)
assert(sel1 > 100, '通话屏渲染（蓝色计时/元素）')
await sleep(2000)
await press('F2', 113) // 挂断
await sleep(700)
const log1 = await idbJSON(`${DEV}:bb:calllog`)
const outEntry = Array.isArray(log1) && log1.find((e) => e.tel === '5551234')
console.log('  外呼条目:', JSON.stringify(outEntry))
assert(outEntry && outEntry.dir === 'out' && outEntry.missed === false && outEntry.dur >= 1,
  'bb:calllog 含外呼条目且计时 ≥1s')

// ================= 6) BBM：进会话发信，2s 回复 =================
console.log('5) BBM 气泡收发')
for (let i = 0; i < 6; i++) { await press('ArrowDown', 40); await sleep(120) }
await press('Enter', 13) // bbm 联系人列表
await sleep(800)
await press('Enter', 13) // 进会话
await sleep(300)
await press('Enter', 13) // 进撰写
await letters('hi')
await press('Enter', 13) // 发送
await sleep(2800) // 回复 2s + 轮询 700ms
const bbmAfter = await idbJSON(`${DEV}:bb:bbm`)
const bbmC = Array.isArray(bbmAfter) && bbmAfter.find((c) => c.id === 1)
console.log('  BBM 联系人消息数:', bbmC?.msgs.length, JSON.stringify(bbmC?.msgs.map((m) => m.dir)))
assert(bbmC && bbmC.msgs.length === 3
  && bbmC.msgs[0].dir === 'in' && bbmC.msgs[1].dir === 'out' && bbmC.msgs[2].dir === 'in',
  'bb:bbm 落库：种子来信 + 发信 + 2s 自动回复')
await press('F2', 113)
await sleep(600)

// ================= 7) Camera：取景器 → 拍照 → bb:photos =================
console.log('6) Camera 拍照')
await press('ArrowUp', 38) // homeSel 6→5 camera
await sleep(200)
await press('Enter', 13)
await sleep(1000)
const vfDark = await darkPx()
console.log('  取景器暗像素:', vfDark)
assert(vfDark > 120000, '相机取景器暗底渲染')
await press('Enter', 13) // 快门
await sleep(2200) // 白闪 + 预览
const photosAfter = await idbJSON(`${DEV}:bb:photos`)
console.log('  照片数:', Array.isArray(photosAfter) ? photosAfter.length : 0)
assert(Array.isArray(photosAfter) && photosAfter.length === 1, 'bb:photos 落库一张照片')
await press('F2', 113)
await sleep(600)

// ================= 8) Options：铃声选定 + 中英语言切换 =================
console.log('7) Options 铃声 / 语言')
for (let i = 0; i < 3; i++) { await press('ArrowDown', 40); await sleep(130) }
await press('Enter', 13) // options
await sleep(800)
await press('Enter', 13) // sel0：进铃声页
await sleep(400)
await press('ArrowDown', 40); await sleep(200) // 铃声列表 sel1
await press('Enter', 13) // 选定
await sleep(250)
assert((await idbJSON(`${DEV}:bb:ringtone`)) === 1, 'bb:ringtone=1 落库')
await press('Escape', 27) // ring → main
await sleep(400)
await press('ArrowDown', 40); await sleep(130)
await press('ArrowDown', 40); await sleep(130) // sel2 language
await press('Enter', 13) // zh → en
await sleep(400)
const lang1 = await evalJS(`localStorage.getItem('museum:lang')`)
assert(lang1 === 'en', '语言切换为 English')
await press('Enter', 13) // en → zh
await sleep(400)
const lang2 = await evalJS(`localStorage.getItem('museum:lang')`)
assert(lang2 === 'zh', '语言切回中文')

// ================= 9) 情景来电（44s）：接听 → 挂断 =================
console.log('8) 等待情景来电并接听')
await sleep(11000) // 等到 ~44s
// 来电屏：顶部蓝色标题条
const titleBlue = await regionCount('(r,g,b)=>b>120&&b-r>50', 0, 0, 720, 80)
console.log('  来电标题条蓝像素:', titleBlue)
assert(titleBlue > 2000, '来电全屏渲染（蓝色标题条）')
await press('F1', 112) // 接听
await sleep(2500)
await press('F2', 113) // 挂断
await sleep(800)
const log2 = await idbJSON(`${DEV}:bb:calllog`)
const inEntry = Array.isArray(log2) && log2.find((e) => e.tel === '13900001111')
console.log('  来电条目:', JSON.stringify(inEntry))
assert(inEntry && inEntry.dir === 'in' && inEntry.missed === false && inEntry.dur >= 1,
  '接听话术落 bb:calllog：in 已接计时')

// ================= 10) 来短信注入（70s） =================
console.log('9) 等待来短信')
// 轮询直读 IDB 等短信（事件 70s，前面流程约 49s）
let smsThread = null
for (let tI = 0; tI < 30; tI++) {
  const threads10 = await idbJSON(`${DEV}:bb:threads`)
  smsThread = Array.isArray(threads10) && threads10.find((t) => t.tel === '13900001111')
  if (smsThread && smsThread.msgs.some((m) => m.text === 'E2E短信')) break
  smsThread = null
  await sleep(1000)
}
console.log('  短信线程:', JSON.stringify(smsThread?.msgs))
assert(smsThread && smsThread.unread === true && smsThread.msgs.some((m) => m.text === 'E2E短信' && m.dir === 'in'),
  '情景来短信注入 bb:threads（未读）')

// ================= 11) 关机 =================
console.log('10) 关机')
await press('F6', 117)
await sleep(1700) // 1.1s 关机动画后清屏
const offFinal = await nonWhite()
console.log('  关机后非白像素:', offFinal)
assert(offFinal < 3000, '关机回近白空屏')

// ================= 12) Reload：数据持久化 =================
console.log('11) Reload 持久化')
await evalJS(`location.reload()`)
await sleep(2500)
const persisted = await idbJSON(`${DEV}:bb:calllog`)
assert(Array.isArray(persisted) && persisted.some((e) => e.tel === '5551234' && e.dir === 'out')
  && persisted.some((e) => e.tel === '13900001111' && e.dir === 'in'),
  'bb:calllog 跨会话保留（外呼 + 来电）')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== BLACKBERRY BOLD 9000 E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

/**
 * 诺基亚 3310 无视觉 E2E（84×48 真机屏 ×5 = 420×240）：
 * 待机三断言（无大数字 / 左缘竖虚线信号 / 底部居中 Menu）/
 * 3 Chat / 7 divert 设号激活打勾 / 8→4·3·2 三游戏 /
 * 1→2 新增姓名落裸键 contacts / 11→1·3 Alarm·Stopwatch 落库 /
 * 外呼 10086 后 4→3 Dialled / 预置来电 clear 拒接记 missed / 6→3 恢复出厂清空。
 */
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9247
const DEV = 'nokia-3310'

rmSync('/tmp/chrome-3310', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-3310',
  '--window-size=900,1100', 'about:blank',
], { stdio: 'ignore' })
process.on('uncaughtException', (e) => {
  console.error('FATAL:', e); chrome.kill(); process.exit(1)
})
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
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg); pending.delete(msg.id)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''))
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id
    const to = setTimeout(() => {
      pending.delete(i)
      rej(new Error(`CDP 超时 20s 无响应: ${method}`))
    }, 20000)
    pending.set(i, {
      resolve: (m) => { clearTimeout(to); res(m) },
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
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
await send('Page.enable')
await send('Runtime.enable')

const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

// ---------- 键位（base 物理映射）：Enter=ok Esc=back Backspace=clear Q=soft1 W=soft2 P=power ----------
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
const openMenu = async () => { await press('Enter', 13); await sleep(800) }
/**
 * 当前菜单帧内按快捷序号（3310 单位、'11' 两位）：
 * MenuUI 数字缓冲 1500ms，必须等其到期提交，再留叶子启动时间。
 */
const menuNum = async (num, afterMs = 700) => {
  for (const d of num) {
    await press('Digit' + d, 48 + Number(d))
    await sleep(150)
  }
  await sleep(1600) // 缓冲到期提交
  await sleep(afterMs) // 叶子/子帧初始化
}
/** 菜单帧逐层回待机 */
const backToIdle = async (layers = 2) => {
  for (let i = 0; i < layers; i++) { await press('Escape', 27); await sleep(700) }
}

// ---------- 像素探测（canvas 420×240 = 84×48 ×5） ----------
const countPx = (pred) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  const test = ${pred}
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i+1], d[i+2])) n++
  return n
})()`)
const dark = () => countPx('(r,g,b)=>r<100&&g<110&&b<100')
const regionDark = (x, y, w, h) => evalJS(`(() => {
  const c = document.querySelector('canvas'); if (!c) return -1
  const d = c.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) n++
  return n
})()`)
const shot = async (n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`/tmp/n3310-${n}.png`, Buffer.from(r.result.data, 'base64'))
}

// ---------- IndexedDB 直连（确保 schema：先挂载 Store，再删残留） ----------
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
const idbDelete = async (fullKey) => evalJS(`(async () => new Promise((resolve) => {
  const r = indexedDB.open('mobile-museum')
  r.onsuccess = () => {
    try {
      const tx = r.result.transaction('kv', 'readwrite')
      tx.objectStore('kv').delete(${JSON.stringify(fullKey)})
      tx.onabort = tx.onerror = tx.oncomplete = () => resolve()
    } catch { resolve() }
  }
  r.onerror = () => resolve()
}))()`, true)
const idbSet = async (fullKey, value) => evalJS(`(async () => new Promise((resolve) => {
  const r = indexedDB.open('mobile-museum')
  r.onsuccess = () => {
    try {
      const tx = r.result.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(${JSON.stringify(JSON.stringify(value))}, ${JSON.stringify(fullKey)})
      tx.onabort = tx.onerror = tx.oncomplete = () => resolve()
    } catch { resolve() }
  }
  r.onerror = () => resolve()
}))()`, true)

// ================= 0) 清场：删库重建 + 去本设备残留键 =================
console.log('0) 清场（IDB schema + 残留键）')
await evalJS(`localStorage.clear()`)
await evalJS(`location.reload()`)
await sleep(1500)
await ensureIDB()
for (const k of [
  'events', 'contacts', 'calllog',
  'chat:threads', 'divert:conf', 'alarm:conf', 'stopwatch:state',
]) await idbDelete(`${DEV}:${k}`)

// ================= 1) 进入展品：关机空屏 =================
console.log('1) 进入诺基亚 3310（关机态）')
await evalJS(`location.hash = '#/device/${DEV}'`)
// 等 canvas 挂载（OS chunk + React 渲染），避免高频轮询拖慢 init
await sleep(900)
const canvas = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('  画布:', JSON.stringify(canvas))
assert(canvas.w === 420 && canvas.h === 240, '画布 420×240（84×48 ×5）')
const offDark = await dark()
console.log('  关机态暗像素:', offDark)
assert(offDark < 100, '关机态近空屏')

// ================= 2) 开机握手 → 待机 =================
console.log('2) 开机（原版握手动画）')
await key('KeyP', 80)
await sleep(2000)
assert(await dark() > 200, '握手动画渲染中')
await sleep(3800) // 4.5s 握手收尾 → 待机
assert(await dark() > 200, '待机屏渲染（运营商+虚线信号+Menu）')

// ================= 3) 待机三断言 =================
console.log('3) 待机三断言')
// 3a. 运营商行（基线屏幕 y11）与底部 Menu（y38）之间是空带：无大数字
const centerDark = await regionDark(60, 105, 300, 70)
console.log('  中央空带暗像素:', centerDark)
assert(centerDark < 150, '中央无大时钟/大数字（真机 3310 待机无钟）')
// 3b. 左缘竖虚线信号（x=0/1；底段屏幕 y34 向上）
const edgeDark = await regionDark(0, 105, 12, 85)
console.log('  左缘虚线区暗像素:', edgeDark)
assert(edgeDark > 100, '最左缘竖虚线信号列在位')
// 3c. 底部居中 Navi 引导字 Menu（屏幕 y38 → canvas y190）
const menuDark = await regionDark(140, 182, 140, 32)
console.log('  底部 Menu 区暗像素:', menuDark)
assert(menuDark > 150, '底部居中「Menu」引导字在位')
await shot('idle')

// ================= 4) 3 直达 Chat =================
console.log('4) 3 → Chat')
await openMenu()
await menuNum('3') // 直达叶子 app
const chatDark = await dark()
console.log('  Chat 暗像素:', chatDark)
assert(chatDark > 300, 'Chat 屏渲染（反白标题栏+对话区）')
const threads = await idbJSON(`${DEV}:chat:threads`)
assert(Array.isArray(threads) && threads.length === 1 && Array.isArray(threads[0].lines),
  'chat:threads 已种子化（默认对象妈妈）')
await shot('chat')
await press('Escape', 27); await sleep(800) // app 退出；根菜单帧
await press('Escape', 27); await sleep(700) // 根 → 待机
assert(await dark() > 200, '回待机')

// ================= 5) 7 divert：设号激活打勾 =================
console.log('5) 7 → Call divert：设号 + Activate')
await openMenu()
await menuNum('7', 500)
await press('Enter', 13) // ok：第一项条件 → 号码编辑
await sleep(400)
await digits('13912345678', 110)
await press('Enter', 13) // ok：Activate（buf≥3 位）
await sleep(700)
const dvConf = await idbJSON(`${DEV}:divert:conf`)
console.log('  divert:conf =', JSON.stringify(dvConf))
const dv0 = dvConf?.[0] ?? dvConf?.['0']
assert(dv0 && dv0.on === true && dv0.num === '13912345678',
  'divert:conf 落库：条件 0 激活（界面同步打 √）')
await shot('divert')
await press('Backspace', 8); await sleep(700) // clear：退出 app → 根菜单帧
await press('Escape', 27); await sleep(700) // 根 → 待机
assert(await dark() > 200, '回待机')

// ================= 6) 8 Games：4 Bantumi / 3 Pairs / 2 Space Impact =================
console.log('6) 8 → Games')
await openMenu()
await menuNum('8', 500) // 进 Games 列表帧

console.log('6a. 8→4 Bantumi：合法走一步')
await menuNum('4')
await press('Enter', 13) // title PRESS OK → 开局
await sleep(500)
await press('Digit6', 54) // 光标右移一坑（避开初始坑立即落子）
await sleep(200)
await press('Enter', 13) // 落子
await sleep(1600) // 700ms AI 落子 + 余量
const boardDark = await regionDark(0, 55, 420, 105)
console.log('  棋盘区暗像素:', boardDark)
assert(boardDark > 200, 'Bantumi 棋盘渲染（两排 6 坑+端坑），玩家落子后 AI 已应')
await shot('bantumi')
await press('Escape', 27); await sleep(800) // 回 Games 列表帧

console.log('6b. 8→3 Pairs II：开局翻牌')
await menuNum('3')
await press('Enter', 13) // title → deal
await sleep(500)
const pairsDark = await regionDark(0, 50, 420, 150)
console.log('  牌桌暗像素:', pairsDark)
assert(pairsDark > 500, 'Pairs 牌桌渲染（24 张实心牌背）')
await shot('pairs')
await press('Escape', 27); await sleep(800) // 回 Games 列表帧

console.log('6c. 8→2 Space Impact：战斗屏')
await menuNum('2')
const siDark = await dark()
console.log('  空间大战暗像素:', siDark)
assert(siDark > 350, 'Space Impact 战斗屏渲染（舰体/敌机/星空）')
await shot('space')
await press('Escape', 27); await sleep(800) // 回 Games 列表帧
await backToIdle(2) // Games → root → idle
assert(await dark() > 200, '回待机')

// ================= 7) 1→2 Add name：裸键 contacts 增长 =================
console.log('7) 1 Phone book → 2 Add name')
const before = (await idbJSON(`${DEV}:contacts`)) ?? []
const beforeN = Array.isArray(before) ? before.length : 0
console.log('  新增前联系人数:', beforeN)
await openMenu()
await menuNum('1', 500) // Phone book 列表帧
await menuNum('2') // Add name → 姓名编辑
await press('Equal', 187) // #（BASE：Equal='#'）切 py → en，英文多击输入确定
await sleep(300)
// bob：2×2=b，6×3=o，2×2=b（多击间隔 < 900ms 窗口；真机大写需再轮 3 档，此处用小写）
await press('Digit2', 50); await sleep(130)
await press('Digit2', 50); await sleep(130)
await press('Digit6', 54); await sleep(120)
await press('Digit6', 54); await sleep(120)
await press('Digit6', 54); await sleep(120)
await press('Digit2', 50); await sleep(130)
await press('Digit2', 50); await sleep(1100) // 等多击到期提交
await press('KeyQ', 81) // soft1：确认姓名 → 号码编辑
await sleep(700)
await digits('13900139000', 110)
await press('KeyQ', 81) // soft1：确认号码 → 保存+toast
await sleep(1600) // toast 1.1s 后自动退出 app → Phone book 帧
const after = await idbJSON(`${DEV}:contacts`)
const last = Array.isArray(after) ? after.at(-1) : null
console.log('  新增后末条:', JSON.stringify(last))
// IDB 原本为空时，UI 内存列表是 4 条情景种子（loadContacts 不写回种子），保存后整表落库
const baseN = beforeN || 4
assert(Array.isArray(after) && after.length === baseN + 1,
  `裸键 contacts 落库且增长 +1（${baseN} → ${baseN + 1}）`)
assert(last && last.name === 'bob' && last.tel === '13900139000',
  '新联系人落库：bob / 13900139000')
await backToIdle(2) // Phone book → root → idle
assert(await dark() > 200, '回待机')

// ================= 8) 11→1 Alarm / 11→3 Stopwatch 落库 =================
console.log('8) 11 Clock → 1 Alarm / 3 Stopwatch')
await openMenu()
await menuNum('11', 500) // Clock 列表帧
await menuNum('1') // Alarm
await press('Enter', 13) // ok：开 → 进入时间录入
await sleep(400)
await digits('0730', 130)
await press('Enter', 13) // ok：确认
await sleep(600)
const alConf = await idbJSON(`${DEV}:alarm:conf`)
console.log('  alarm:conf =', JSON.stringify(alConf))
assert(alConf && alConf.on === true && alConf.h === 7 && alConf.m === 30,
  'alarm:conf 落库（on 07:30）')
await press('Escape', 27); await sleep(800) // 退出 → Clock 帧

await menuNum('3') // Stopwatch
await press('Enter', 13) // ok：启动
await sleep(500)
const swState = await idbJSON(`${DEV}:stopwatch:state`)
console.log('  stopwatch:state =', JSON.stringify(swState))
assert(swState && swState.run === true && typeof swState.startAt === 'number',
  'stopwatch:state 落库（运行中 startAt）')
await shot('stopwatch')
await press('Escape', 27); await sleep(800) // 退出（运行中可后台）→ Clock 帧
await backToIdle(2) // Clock → root → idle
assert(await dark() > 200, '回待机')

// ================= 9) 外呼 10086：接通挂断 → 4→3 Dialled =================
console.log('9) 外呼 10086 → 4→3 Dialled')
await digits('10086')
await sleep(300)
assert(await dark() > 200, '拨号屏渲染')
await press('Enter', 13) // ok：呼叫
await sleep(3200) // 2.6s 接通 + 余量
assert(await dark() > 200, '通话屏（计时器）')
await press('KeyW', 87) // soft2：挂断（接通后才记录）
await sleep(700)
assert(await dark() > 200, '挂断回待机')
await openMenu()
await menuNum('4', 500) // Call register 帧
await menuNum('3') // Dialled
const dlDark = await dark()
console.log('  Dialled 暗像素:', dlDark)
assert(dlDark > 250, 'Dialled 列表渲染（含 10086）')
const log1 = await idbJSON(`${DEV}:calllog`)
const outLast = Array.isArray(log1) ? log1.at(-1) : null
console.log('  末条:', JSON.stringify(outLast))
assert(outLast && outLast.tel === '10086' && outLast.dir === 'out' && outLast.missed === false,
  '裸键 calllog 追加 out 条目（10086）')
await shot('dialled')
await backToIdle(3) // 退出 app → Call register 帧 → root → idle
assert(await dark() > 200, '回待机')

// ================= 10) 预置来电：clear 拒接 → missed =================
console.log('10) 预置来电事件（5s 后响铃）→ clear 拒接')
await evalJS(`location.hash = '#/settings'`); await sleep(900) // 挂载 Store
await idbSet(`${DEV}:events`, [{
  id: Date.now() + 1, type: 'call', from: '13900000000', name: '老板', delaySec: 5, fired: false,
}])
await evalJS(`location.hash = '#/device/${DEV}'`); await sleep(1000)
await key('KeyP', 80)
await sleep(5800) // 开机握手 4.5s → 待机；5s 事件随即到期
let ringingSeen = false
for (let i = 0; i < 8; i++) {
  // 来电屏：屏幕中央 12px 名字行 → canvas y100..150 暗像素显著
  const probe = await regionDark(120, 95, 180, 60)
  if (probe > 250) { ringingSeen = true; break }
  await sleep(700)
}
console.log('  响铃屏命中:', ringingSeen)
assert(ringingSeen, '来电响铃屏已渲染')
await shot('ringing')
await press('Backspace', 8) // clear：拒接（未接通 → missed）
await sleep(900)
assert(await dark() > 200, '拒接后回待机')
const log2 = await idbJSON(`${DEV}:calllog`)
const missLast = Array.isArray(log2) ? log2.at(-1) : null
console.log('  末条:', JSON.stringify(missLast))
assert(missLast && missLast.tel === '13900000000' && missLast.dir === 'in' && missLast.missed === true,
  '手动拒接记为未接来电（missed:true）')

// ================= 11) 6→3 恢复出厂：IDB 清空 =================
console.log('11) 6 Settings → 3 Restore factory settings')
await openMenu()
await menuNum('6', 500) // Settings 帧
await menuNum('3') // factory 页
await press('Enter', 13) // ok：确认恢复
await sleep(2600) // clearAll + done 1.4s 自动退出
const clearedLog = await idbJSON(`${DEV}:calllog`)
const clearedContacts = await idbJSON(`${DEV}:contacts`)
console.log('  calllog:', clearedLog, ' contacts:', clearedContacts)
assert(clearedLog === null && clearedContacts === null,
  '恢复出厂后本设备裸键已清空（clearAll）')
await shot('after-factory')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== NOKIA 3310 E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

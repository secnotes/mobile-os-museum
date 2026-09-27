/**
 * HTC Dream（T-Mobile G1, Android 1.0）无视觉 E2E v4：
 * 黑底两阶段开机（T·Mobile/G1 缩放 → 发光 ANDROID 字标扫光）→ 锁屏 →
 * MALMO 表盘主屏 + 底部四快捷方式（无搜索挂件）+ 三屏滑页 → 深色碳纤抽屉（19 应用）→
 * MENU 图标网格 / F5 搜索对话框 / 行式短信收发 / Recent apps / 通知栏手势 /
 * 触屏拨号盘白底通话 / 计算器 / 日历 / 横屏相机→图片 / Gmail 星标 / 地图缩放 /
 * 音乐 / 名片夹联动 / 浏览器 / Market 安装→Manage apps 第三方项 / YouTube /
 * Amazon→音乐联动 / IM / Email 设置 / 语音拨号 / 系统闹钟响铃 / 设置十项
 * （含日期时间 24h / 语言区域）/ Global actions 静音 / 恢复出厂 / 长按电源关机。
 * 断言基于画布像素计数 + IndexedDB 轮询。
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9231

rmSync('/tmp/chrome-g1', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-g1',
  '--window-size=900,1400', 'about:blank',
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
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''))
  }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
/** 长按：keyDown 后保持 ms（InputBus 450ms 触发 repeat）再 keyUp */
const hold = async (code, vk, ms = 700) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await sleep(ms)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
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
/** 屏幕坐标 (0..320, 0..480) → 矩形内指定色计数 */
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
/** 矩形内「偏蓝」像素（B-R>30 且 B>120）：壁纸天空 / 照片天空 */
const rectBlueish = (x0, y0, x1, y1) => evalJS(`(() => {
  const c=document.querySelector('canvas'); const x=c.getContext('2d'); const sx=c.width/320, sy=c.height/480
  const d=x.getImageData(Math.round(${x0}*sx),Math.round(${y0}*sy),Math.round((${x1}-${x0})*sx),Math.round((${y1}-${y0})*sy)).data
  let n=0; for(let i=0;i<d.length;i+=4){ if(d[i+2]-d[i]>30 && d[i+2]>120) n++ } return n
})()`)
const rectGrayish = (x0,y0,x1,y1) => evalJS(`(() => {
  const c=document.querySelector('canvas'); const x=c.getContext('2d'); const sx=c.width/320, sy=c.height/480
  const d=x.getImageData(Math.round(${x0}*sx),Math.round(${y0}*sy),Math.round((${x1}-${x0})*sx),Math.round((${y1}-${y0})*sy)).data
  let n=0; for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; if(Math.abs(r-g)<12&&Math.abs(g-b)<12&&r>110&&r<170) n++ } return n
})()`)
/** 默认壁纸（蓝色湖泊）可见性：采样左上 (20,60,60,100) */
const wpVisible = () => rectBlueish(20, 60, 80, 160)
/** 主屏底部抽屉握把灰像素（真机金属灰 #6f6f6f） */
const drawerHandle = () => rectN('111,111,111', 114, 452, 206, 476)
/** 全屏唯一颜色数（真机 PNG = 数千色） */
const uniqueColors = () => evalJS(`(() => { const c=document.querySelector('canvas'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; const m={}; for(let i=0;i<d.length;i+=4){m[d[i]+','+d[i+1]+','+d[i+2]]=1} return Object.keys(m).length })()`)
/** 触屏点按 */
const tap = async (sx, sy) => {
  await evalJS(`(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    const px = r.x + (${sx} / 320) * r.width
    const py = r.y + (${sy} / 480) * r.height
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: px, clientY: py, bubbles: true }))
    c.dispatchEvent(new PointerEvent('pointerup', { clientX: px, clientY: py, bubbles: true }))
  })()`)
}
/** 触屏拖拽：屏幕坐标点序列（首点 down、末点 up） */
const drag = async (pts) => {
  const arr = pts.map(([x, y]) => `[${x},${y}]`).join(',')
  await evalJS(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
    const pt = (type, x, y) => c.dispatchEvent(new PointerEvent(type, {
      clientX: r.x + (x/320)*r.width, clientY: r.y + (y/480)*r.height, bubbles: true,
    }))
    const pts = [${arr}]
    pt('pointerdown', pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) pt('pointermove', pts[i][0], pts[i][1])
    pt('pointerup', pts[pts.length-1][0], pts[pts.length-1][1])
  })()`)
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }
const idbGet = (k) => evalJS(`(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mobile-museum'); r.onsuccess = () => res(r.result) })
  return await new Promise((res) => { const t = db.transaction('kv').objectStore('kv').get('${k}'); t.onsuccess = () => res(t.result) })
})()`)
const idbSet = (k, v) => evalJS(`(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mobile-museum'); r.onsuccess = () => res(r.result) })
  await new Promise((res) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(${JSON.stringify(JSON.stringify(v))}, '${k}'); t.oncomplete = () => res() })
})()`)
const jget = async (k, dflt = null) => { const v = await idbGet(k); return v === null || v === undefined ? dflt : JSON.parse(v) }

// Android 1.0 调色板（src/os/android/palette.ts）
const INK = '26,26,26'
const WHITE = '255,255,255'
const GREEN = '164,198,57'
const BLUE = '91,138,198'
const AMBER = '232,162,61'
const DGREEN = '61,92,27'
const RED = '192,74,58'
const GRAY = '138,138,138'
const PALE = '214,214,214'
const BAR = '16,16,16'
const PANEL = '38,38,38'
const ORANGE = '255,155,0'
const METAL = '111,111,111'
const MSGIN = '236,251,255'
const OFFBG = '0,0,0' // 关机态：缓冲全空（透明像素读为 0,0,0）

/** 主屏 → 抽屉 → 方向键定位应用 → 启动（抽屉每次复位 sel=0） */
const launch = async (i) => {
  await tap(160, 468)
  await sleep(350)
  const rows = Math.floor(i / 4), cols = i % 4
  for (let k = 0; k < rows; k++) { await key('ArrowDown', 40); await sleep(80) }
  for (let k = 0; k < cols; k++) { await key('ArrowRight', 39); await sleep(80) }
  await key('Enter', 13)
  await sleep(650)
}

// ================= 1) 关机态 =================
console.log('1) 进入 HTC Dream（T-Mobile G1）')
await evalJS(`location.hash = '#/device/htc-dream'`)
await sleep(1200)
const canvas = await evalJS(`(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null })()`)
console.log('  画布:', JSON.stringify(canvas))
assert(canvas.w === 352 && canvas.h === 528, '画布 352×528（320×480 ×1.1）')
assert(await pct(OFFBG) > 0.95, '关机态近空屏')

// ================= 2) 黑底开机 =================
console.log('2) END 唤醒：黑底 T·Mobile / G1 缩放')
await key('F2', 113)
const c1 = await counts() // 动画起点帧（~t0）
await sleep(600)
let p = await pct(BAR)
let w = await n(WHITE)
console.log('  开机黑底:', p.toFixed(2), '白字像素:', w)
assert(p > 0.8, '首阶段黑底（真机无白底闪屏）')
assert(w > 200 && w < 60000, '白色「T·Mobile」+「G1」文字')
// 动画在动：与起点帧的计数差（窗口覆盖 logo 0.55→~1 缩放）
const c2 = await counts()
let diff = 0
for (const k of new Set([...Object.keys(c1), ...Object.keys(c2)])) diff += Math.abs((c1[k] || 0) - (c2[k] || 0))
console.log('  帧间变化像素:', diff)
assert(diff > 800, '开机动画推进（logo 缩放）')
await sleep(900) // t≈1.5s：发光 ANDROID 字标阶段
p = await pct(BAR)
w = await n(WHITE)
console.log('  字标阶段黑底:', p.toFixed(2), '白:', w)
assert(p > 0.6, '第二阶段仍为黑底')
assert(w > 150, 'ANDROID 发光字标 / 字母可见')
await sleep(2500) // 共 3.9s → 锁屏
const panelN = await n(PANEL)
console.log('  锁屏面板像素:', panelN)
assert(panelN > 30000, '进入锁屏（深灰信息面板）')

// ================= 3) 锁屏 + 主屏 =================
console.log('3) 锁屏：触屏不可解锁，MENU×2')
await tap(160, 240)
await sleep(200)
assert((await n(PANEL)) > 30000, '锁屏点按无效（真机须 MENU 键）')
assert(await rectN(WHITE, 40, 160, 280, 215) > 400, '锁屏大号白色时间')
await key('F4', 115); await sleep(250)
await key('F4', 115); await sleep(500)
const handle = await drawerHandle()
console.log('  底部握把灰像素:', handle)
assert(handle > 80, '解锁进入主屏')
// MALMO 表盘
const diskN = await rectN(WHITE, 118, 92, 202, 178)
const tickN = await rectN(INK, 118, 92, 202, 178)
console.log('  MALMO 白盘:', diskN, '黑刻度/针:', tickN)
assert(diskN > 2000, 'MALMO 表盘白色盘面（程序生成挂件）')
assert(tickN > 150, 'MALMO 刻度与指针')
// 真机 1.0 默认布局：MALMO 表盘 + 底部一排 Dialer/Contacts/Browser/Maps 快捷方式（gy3 → cy=357）
// 搜索挂件是 1.5 Cupcake 才有，1.0 主屏无搜索栏
const row3Labels = await evalJS(`(()=>{const c=document.querySelector('canvas');const x=c.getContext('2d');const sx=c.width/320,sy=c.height/480;const d=x.getImageData(0,Math.round(370*sy),c.width,Math.round(22*sy)).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]>200&&d[i+2]>200)n++;return n})()`)
console.log('  底排快捷方式标签亮像素:', row3Labels)
assert(row3Labels > 200, '底部四快捷方式标签（Dialer/Contacts/Browser/Maps）')
// gy2 无 Google 搜索挂件白条（1.5 才有，1.0 不应出现）
const noSearchBar = await rectN(WHITE, 30, 243, 290, 280)
console.log('  gy2 搜索挂件白卡（应近 0）:', noSearchBar)
assert(noSearchBar < 1500, '主屏无 Google 搜索挂件（真机 1.0）')
assert(await wpVisible() > 400, '真机默认壁纸（蓝色湖泊）')

// ================= 4) 三屏滑页 =================
console.log('4) 三屏滑页（0.32W 阈值，持久化）')
assert((await jget('htc-dream:launcher:page', 1)) === 1, '默认居中页')
await drag([[290, 320], [200, 320], [60, 320], [20, 320]])
await sleep(400)
let pg = await jget('htc-dream:launcher:page')
console.log('  左扫后页:', pg)
assert(pg === 2, '左扫 → 第 3 页并持久化')
await drag([[20, 320], [120, 320], [260, 320], [300, 320]])
await sleep(400)
pg = await jget('htc-dream:launcher:page')
console.log('  右扫后页:', pg)
assert(pg === 1, '右扫 → 回第 2 页')

// ================= 5) 深色碳纤抽屉 =================
console.log('5) 点握把 → 深色碳纤抽屉（19 应用）')
await tap(160, 468)
await sleep(400)
p = await pct(WHITE)
const orangeN = await n(ORANGE)
const uc = await uniqueColors()
console.log('  抽屉白占比:', p.toFixed(3), '橙聚焦框:', orangeN, '唯一色:', uc)
assert(p < 0.1, '抽屉深色碳纤（非白底）')
assert(orangeN > 80, '橙色聚焦框 #ff9b00（真机聚焦态）')
assert(uc > 600, '真机 PNG 图标网格（19 应用）')
// 真机标签：白字带抗锯齿与细微投影，纯色核心不多但整体明亮。
// 数标签带上的亮像素（lum≥160），而非要求 200 个纯白
const labelBright = await evalJS(`(()=>{const c=document.querySelector('canvas');const x=c.getContext('2d');const sx=c.width/320,sy=c.height/480;const d=x.getImageData(0,Math.round(390*sy),c.width,Math.round(50*sy)).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])>=160)n++;return n})()`)
console.log('  标签行亮像素:', labelBright)
assert(labelBright > 600, '白色应用标签（抗锯齿白字）')
await key('Escape', 27); await sleep(350)
assert(await wpVisible() > 400, '关闭抽屉回主屏')

// ================= 5.5) MENU 图标网格 + 搜索键 =================
console.log('5.5) MENU → 图标网格；F5 → Google 搜索对话框')
await key('F4', 115); await sleep(400)
const menuPanel = await rectN(PANEL, 0, 284, 320, 480)
const menuOrange = await n(ORANGE)
console.log('  MENU 面板 PANEL:', menuPanel, '橙聚焦:', menuOrange)
assert(menuPanel > 4000, 'MENU 底部深色面板（真机 1.0 图标网格）')
assert(menuOrange > 80, 'MENU 橙色聚焦框')
await key('Escape', 27); await sleep(300) // 关闭回主屏
// F5 搜索键 → 搜索对话框
await key('F5', 116); await sleep(400)
const searchSheetWhite = await rectN(WHITE, 6, 31, 314, 127)
console.log('  搜索对话框白卡:', searchSheetWhite)
assert(searchSheetWhite > 500, 'Google 搜索对话框')
for (const [c, vk] of [['KeyG', 71], ['Digit1', 49]]) { await key(c, vk); await sleep(110) }
await key('Enter', 13); await sleep(1400) // 提交 → Browser 载入
const inBrowser = (await n(GREEN)) > 20 || (await pct(WHITE)) > 0.4
console.log('  浏览器载入/白底:', inBrowser)
assert(inBrowser, '搜索提交进入浏览器（经 setPendingQuery）')
await key('Escape', 27); await sleep(500) // article → bmarks
await key('Escape', 27); await sleep(500) // bmarks → exit
assert(await wpVisible() > 400, '返回主屏')

// ================= 6) 短信收发（行式会话，无气泡） =================
console.log('6) 短信：行式会话 + QWERTY 发送 → 自动回复')
// 测试隔离：直接放一条未读短信，不依赖首启种子（重复跑套件时种子早已被标记已读）
const seedTs = Date.now() - 60000
await idbSet('htc-dream:messages:inbox', [{
  id: seedTs, from: '妈妈', text: '晚上回家吃饭吗', ts: seedTs, read: false, mine: false,
}])
await launch(13)
p = await pct(WHITE)
const amberTs = await n(AMBER)
console.log('  会话列表白底:', p.toFixed(2), '未读琥珀:', amberTs)
assert(p > 0.55, '会话列表渲染')
assert(amberTs > 15, '未读时间戳琥珀色')
await key('Enter', 13); await sleep(500) // 进首个会话
// 真机 1.0 无气泡：对方行 MSGIN 浅蓝整行
const msginN = await rectN(MSGIN, 0, 80, 320, 400)
console.log('  收件行 MSGIN:', msginN)
assert(msginN > 300, '无气泡行式会话（MSGIN 整行底色）')
for (const [c, vk] of [['KeyH', 72], ['KeyI', 73], ['Space', 32], ['KeyM', 77], ['KeyO', 79], ['KeyM', 77]]) {
  await key(c, vk); await sleep(110)
}
const draftInk = await rectN(INK, 0, 428, 320, 480)
console.log('  草稿墨色:', draftInk)
assert(draftInk > 30, '草稿 "hi mom" 出现在输入行')
await key('Enter', 13) // 发送
await sleep(1400)
const inbox1 = await jget('htc-dream:messages:inbox', [])
assert(inbox1.some((m) => m.mine && m.text === 'hi mom'), '我方短信已入收件箱')
console.log('  等待自动回复…')
let inbox2 = inbox1
for (let i = 0; i < 20; i++) {
  await sleep(700)
  inbox2 = await jget('htc-dream:messages:inbox', [])
  if (inbox2.length > inbox1.length) break
}
console.log('  最后一条:', inbox2[inbox2.length - 1]?.text)
assert(inbox2.length === inbox1.length + 1 && !inbox2[inbox2.length - 1].mine, '收到自动回复')
await key('Escape', 27); await sleep(250)
await key('Escape', 27); await sleep(400)
assert(await wpVisible() > 400, '返回主屏')

// ================= 7) Recent apps（长按 HOME） =================
console.log('7) 长按 HOME → Recent apps')
await hold('F3', 114, 700)
const sheetWhite = await rectN(WHITE, 10, 320, 310, 470)
console.log('  工作表白卡:', sheetWhite)
assert(sheetWhite > 4000, 'Recent apps 底部工作表')
assert(await rectN(METAL, 10, 322, 310, 410) > 800, '灰色标题栏')
await key('Escape', 27); await sleep(400)
assert(await wpVisible() > 400, '关闭回主屏')

// ================= 8) 通知栏手势 =================
console.log('8) 拖拽下拉通知栏 → 清除 → 上推收起')
assert(inbox2.some((m) => !m.read && !m.mine), '存在未读短信')
// 真机手势：必须从状态栏（y≤31）起拖
await drag([[160, 20], [160, 100], [160, 200], [160, 260]])
await sleep(400)
let panelP = await pct(PANEL)
console.log('  通知面板 PANEL 占比:', panelP.toFixed(2))
assert(panelP > 0.2, '拖拽拉出通知栏')
let titleWhite = await rectN(WHITE, 30, 60, 240, 110)
console.log('  未读条目白标题:', titleWhite)
assert(titleWhite > 60, '通知条目（未读短信）')
await tap(252, 17); await sleep(400) // 清除
titleWhite = await rectN(WHITE, 30, 60, 240, 110)
const emptyGray = await rectGrayish(60, 95, 260, 125)
console.log('  清除后标题:', titleWhite, '空态灰字:', emptyGray)
assert(titleWhite < 30, '清除后条目消失')
assert(emptyGray > 10, '「暂无通知」空态')
await drag([[160, 260], [160, 180], [160, 100], [160, 20]])
await sleep(400)
assert(await wpVisible() > 400, '上推收起回主屏')

// ================= 9) 拨号通话 =================
console.log('9) 拨号 10086 → 白底通话 → 挂断')
await launch(7)
assert(await rectN(DGREEN, 100, 388, 220, 436) > 1500, '绿色呼叫按钮')
// 触屏拨号盘（3×4 圆角 PALE 键，真机 1.0 布局）
const padKeys = await rectN(PALE, 12, 119, 308, 340)
console.log('  拨号盘 PALE 键像素:', padKeys)
assert(padKeys > 2000, '触屏拨号盘 3×4 键')
for (const d of '10086') { await key('Digit' + d, 48 + Number(d)); await sleep(110) }
await tap(160, 414)
await sleep(700) // calling
let redN = await rectN(RED, 100, 388, 220, 436)
console.log('  呼出红钮:', redN)
assert(redN > 1500, '正在呼出（红色 End 键）')
await sleep(2600) // 接通
const gN = await n(GREEN)
console.log('  接通绿计时:', gN)
assert(gN > 80, '通话计时中（绿色）')
assert(await pct(WHITE) > 0.5, '通话界面白底')
await tap(160, 414); await sleep(2200) // 挂断 → callend → 退出
assert(await wpVisible() > 400, '挂断回主屏')
const calllog = await jget('htc-dream:calllog', [])
const outE = calllog.find((e) => e.dir === 'out')
assert(!!outE, '通话记录写入')
console.log('  呼出记录:', JSON.stringify(outE))

// ================= 10) 计算器 =================
console.log('10) 计算器：QWERTY 7 + 8 = 15')
await launch(3)
assert(await pct(PANEL) > 0.4, '计算器深灰底')
const gdisp = async () => rectN(GREEN, 8, 33, 312, 95)
await key('Key7', 55); await sleep(120)
await key('KeyP', 80); await sleep(120) // 'p' → +
await key('Key8', 56); await sleep(120)
await key('Enter', 13); await sleep(300)
const ga = await gdisp()
console.log('  绿结果像素:', ga)
assert(ga > 120, '7+8=15（绿色结果）')
await key('Escape', 27); await sleep(400)
assert(await wpVisible() > 400, '返回主屏')

// ================= 11) 日历 =================
console.log('11) 日历：2008 年 10 月，22 日发布日')
await launch(4)
assert(await pct(WHITE) > 0.5, '月视图白底')
const dg = await n(DGREEN)
console.log('  选中块深绿:', dg)
assert(dg > 1000, '22 日深绿选中块')
await key('Enter', 13); await sleep(300)
const evGreen = await rectN(GREEN, 46, 180, 280, 205)
console.log('  日程绿字:', evGreen)
assert(evGreen > 20, 'G1 发布日程浮层')
await key('Escape', 27); await sleep(200)
await key('Escape', 27); await sleep(400)

// ================= 12) 相机 + 图片 =================
console.log('12) 横屏正向相机（240×160）→ 拍照 → Pictures')
await idbSet('htc-dream:camera:photos', []) // 隔离：清掉历史照片
await launch(5)
const skyN = await rectBlueish(20, 40, 240, 200)
console.log('  取景天空:', skyN)
assert(skyN > 2000, '取景器风景渲染')
// 快门圆 (294,412) r24：白圈红芯
assert(await rectN(RED, 278, 396, 310, 428) > 300, '红色快门芯')
await tap(294, 412)
await sleep(600)
const photos = await jget('htc-dream:camera:photos', [])
console.log('  已存照片:', photos.length, photos[0] ? `${photos[0].w}×${photos[0].h}` : '')
assert(photos.length === 1 && photos[0].w === 240 && photos[0].h === 160, '照片 240×160 已持久化')
await key('Escape', 27); await sleep(400)
// Pictures
await launch(15)
assert(await pct(WHITE) > 0.4, 'Pictures 白底网格')
await tap(55, 96); await sleep(450) // 第一缩略图 → 全屏
const fullSky = await rectBlueish(40, 150, 280, 260)
console.log('  全屏照片天空:', fullSky)
assert(fullSky > 1500, '全屏查看照片')
await key('Escape', 27); await sleep(400) // 全屏 → 网格
await key('Escape', 27); await sleep(400) // 退出

// ================= 13) Gmail =================
console.log('13) Gmail：收件箱 → 阅读 → 星标持久化')
await idbSet('htc-dream:gmail:stars', []) // 隔离：清掉历史星标
await launch(9)
assert(await pct(WHITE) > 0.5, 'Gmail 标签页白底')
await key('Enter', 13); await sleep(400) // Inbox
assert(await pct(WHITE) > 0.5, '收件箱列表')
await key('Enter', 13); await sleep(400) // 读第一封
assert((await n(INK)) > 800, '邮件正文渲染')
await key('Enter', 13); await sleep(400) // 加星
const stars = await jget('htc-dream:gmail:stars', [])
console.log('  stars:', JSON.stringify(stars))
assert(stars.includes(0), '星标已持久化')
await key('Escape', 27); await sleep(200) // → list
await key('Escape', 27); await sleep(200) // → labels
await key('Escape', 27); await sleep(400) // 退出

// ================= 14) 地图 =================
console.log('14) 地图：缩放改变街区密度')
await launch(11)
// 真机矢量图：白路为细网格线、街区浅灰，整屏浅亮而非纯白
const mapLight = await evalJS(`(()=>{const c=document.querySelector('canvas');const x=c.getContext('2d');const y0=Math.round(25/480*c.height);const d=x.getImageData(0,y0,c.width,c.height-y0).data;let n=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if((r>240&&g>240&&b>240)||(Math.abs(r-214)<10&&Math.abs(g-214)<10&&Math.abs(b-214)<10))n++}return n})()`)
assert(mapLight / (320 * 455) > 0.5, '地图浅底路网（白路 + 浅灰街区）')
const bA = await n(GREEN)
await key('Equal', 187); await sleep(400) // '#' → zoom+1
const bB = await n(GREEN)
console.log('  绿地块:', bA, '→', bB)
assert(bA > 1000, '街区渲染')
assert(Math.abs(bB - bA) > 300, '放大后街区密度变化')
await key('Escape', 27); await sleep(400)

// ================= 15) 音乐 =================
console.log('15) 音乐：曲目 → 正在播放')
await launch(14)
assert(await pct(INK) > 0.5, '音乐深色根页')
await key('ArrowDown', 40); await sleep(200) // tile 2 = Songs
await key('Enter', 13); await sleep(400)
await key('Enter', 13); await sleep(500) // 第一首 → now
const nowAmber = await rectN(AMBER, 130, 300, 190, 360)
console.log('  琥珀播放钮:', nowAmber)
assert(nowAmber > 400, '正在播放（琥珀播放/暂停大按钮）')
await key('Escape', 27); await sleep(200) // → songs
await key('Escape', 27); await sleep(200) // → root
await key('Escape', 27); await sleep(400) // 退出

// ================= 16) 名片夹联动 =================
console.log('16) 名片夹：联系人详情 → 拨号预填')
await launch(6)
assert(await pct(WHITE) > 0.5, '名片夹白底列表')
await key('Enter', 13); await sleep(400) // 详情
assert((await n(INK)) > 300, '联系人详情渲染')
await tap(160, 414); await sleep(500) // 呼叫按钮 → host.dial
const preInk = await rectN(INK, 40, 180, 280, 255)
console.log('  预填号码墨色:', preInk)
assert(preInk > 200, '拨号盘预填联系人号码')
// BACK 逐位删号，删空后再按一次才退出
for (let i = 0; i < 14; i++) { await key('Escape', 27); await sleep(60) }
await sleep(400)
assert(await wpVisible() > 400, '返回主屏')

// ================= 17) 浏览器 =================
console.log('17) 浏览器：书签 → Google 主页 → 搜索载入文章')
await launch(2)
assert(await pct(WHITE) > 0.4, '书签页渲染')
await tap(160, 102); await sleep(500) // Google 书签 → home
const cc = await counts()
console.log('  字标 蓝:', cc[BLUE], '红:', cc[RED], '黄:', cc[AMBER], '绿:', cc[GREEN])
assert((cc[BLUE] || 0) > 80 && (cc[RED] || 0) > 30 && (cc[AMBER] || 0) > 30 && (cc[GREEN] || 0) > 30, 'Google 彩色字标')
await tap(160, 240); await sleep(400) // 搜索框 → query sheet
await key('KeyG', 71); await sleep(100)
await key('Digit1', 49); await sleep(100)
await key('Enter', 13); await sleep(1500) // loading 1.1s → article
assert(await pct(WHITE) > 0.5 && (await n(INK)) > 1000, '文章页渲染')
await key('Escape', 27); await sleep(300) // → bmarks
await key('Escape', 27); await sleep(400) // 退出

// ================= 18) Market 安装 + Manage apps =================
console.log('18) Android Market：权限 → 下载 2.6s → 安装')
await launch(12)
assert(await pct(INK) > 0.4, 'Market 主页深色 BETA 版')
assert((await rectN(ORANGE, 12, 202, 300, 246)) > 5000, '橙色入口行（All apps/Games/Downloads）')
await key('Enter', 13); await sleep(400) // All apps → cat
await key('Enter', 13); await sleep(400) // 第一行 → detail
assert((await n(INK)) > 300, '应用详情页')
await key('Enter', 13); await sleep(300) // → perm
await key('Enter', 13) // OK → startDownload
for (let i = 0; i < 20; i++) {
  await sleep(500)
  const inst = await jget('htc-dream:market:installed', [])
  if (inst.includes(0)) break
}
const installed = await jget('htc-dream:market:installed', [])
const notifExtra = await jget('htc-dream:notif:extra', [])
console.log('  installed:', JSON.stringify(installed), '| 下载通知:', notifExtra.length)
assert(installed.includes(0), 'Market 应用安装并持久化')
assert(notifExtra.length >= 1, '下载/安装状态写入通知')
await key('Escape', 27); await sleep(300) // detail → market home
await key('Escape', 27); await sleep(400) // 退出
// Manage apps：第三方项出现在末尾，appinfo 含 Uninstall
await launch(16) // Settings
await tap(160, 275); await sleep(400) // Applications（root idx5）
await tap(160, 128); await sleep(500) // Manage applications（row1）
assert(await pct(WHITE) > 0.4, 'Manage apps 列表')
for (let i = 0; i < 19; i++) { await key('ArrowDown', 40); await sleep(50) } // 19 builtins → 20th
await key('Enter', 13); await sleep(500) // 第三方 appinfo
assert((await n(INK)) > 300, '第三方应用 appinfo')
for (let i = 0; i < 5; i++) { await key('ArrowDown', 40); await sleep(50) } // → Uninstall 行
await key('Enter', 13); await sleep(900) // uninstall → 回 manageapps
const afterUninst = await jget('htc-dream:market:installed', [])
console.log('  卸载后 installed:', JSON.stringify(afterUninst))
assert(!afterUninst.includes(0), 'Manage apps 卸载第三方应用')
await key('Escape', 27); await sleep(300) // manageapps → applications
await key('Escape', 27); await sleep(300) // → root
await key('Escape', 27); await sleep(400) // 退出

// ================= 19) YouTube =================
console.log('19) YouTube：缓冲 → 播放 → 暂停')
await launch(18)
assert(await pct(BAR) > 0.4, 'YouTube 列表深色')
await key('Enter', 13) // → player buf
await sleep(1700)
const vidInk = await rectN(INK, 4, 33, 316, 209)
assert(vidInk > 28000, '播放器深色视频区（视频框内以黑色为主）')
assert((await rectN(RED, 4, 215, 316, 224)) > 20, '红色播放进度条')
await key('Enter', 13); await sleep(300) // pause
assert((await rectN(WHITE, 130, 100, 190, 140)) > 60, '暂停指示（白色 ❚❚）')
await key('Escape', 27); await sleep(300) // → list
await key('Escape', 27); await sleep(400) // 退出

// ================= 20) Amazon MP3 → 音乐联动 =================
console.log('20) Amazon MP3：购买 Sideloader → 音乐曲库')
// 隔离：清掉历史购买（两个键都要清，否则 buy() 早退不写 downloaded）
await idbSet('htc-dream:amazon:purchases', [])
await idbSet('htc-dream:amazon:downloaded', [])
await launch(1)
assert(await pct(WHITE) > 0.4, 'Amazon 曲目列表')
await key('Enter', 13); await sleep(400) // 第一首 → buy
await key('Enter', 13); await sleep(2200) // 购买 → 下载 1.8s → list
const bought = await jget('htc-dream:amazon:downloaded', [])
console.log('  已购:', bought.map((t) => t.title).join(','))
assert(bought.length === 1 && bought[0].title === 'Sideloader', '已购 Sideloader（$0.89）')
await key('Escape', 27); await sleep(400)
// 音乐：曲库尾部 = 已购曲目，↑ 到尾行播放
await launch(14)
await key('ArrowDown', 40); await sleep(200) // tile Songs
await key('Enter', 13); await sleep(400)
await key('ArrowUp', 38); await sleep(200) // 尾行 = Sideloader
await key('Enter', 13); await sleep(500)
assert((await rectN(AMBER, 130, 300, 190, 360)) > 300, '已购曲目并入音乐并可播放')
await key('Escape', 27); await sleep(200)
await key('Escape', 27); await sleep(200)
await key('Escape', 27); await sleep(400)

// ================= 21) IM =================
console.log('21) IM：好友 → QWERTY 发送 → 自动回复')
await launch(10)
assert(await pct(WHITE) > 0.4, 'IM 好友列表')
await key('Enter', 13); await sleep(400) // 第一位好友
const inkBefore = await rectN(INK, 0, 60, 320, 440)
await key('KeyH', 72); await sleep(100)
await key('KeyI', 73); await sleep(100)
await key('Enter', 13) // 发送
let inkAfter = inkBefore
for (let i = 0; i < 8; i++) {
  await sleep(500)
  inkAfter = await rectN(INK, 0, 60, 320, 440)
  if (inkAfter > inkBefore + 20) break
}
console.log('  消息区墨色:', inkBefore, '→', inkAfter)
assert(inkAfter > inkBefore + 20, 'IM 发送 + 好友回复')
await key('Escape', 27); await sleep(300) // → list
await key('Escape', 27); await sleep(400) // 退出

// ================= 22) Email =================
console.log('22) Email：设置两字段 → 检查 → 收件箱')
await idbSet('htc-dream:email:setup', false) // 隔离：确保从设置页开始
await launch(8)
await key('Enter', 13); await sleep(250) // address → stage1
await key('Enter', 13) // password → checking
await sleep(2000)
assert(await jget('htc-dream:email:setup') === true, '设置完成已持久化')
assert(await pct(WHITE) > 0.4, '收件箱列表')
await key('Enter', 13); await sleep(400) // read
assert((await n(INK)) > 400, '邮件阅读页')
await key('Escape', 27); await sleep(300)
await key('Escape', 27); await sleep(400) // 退出

// ================= 23) 语音拨号 =================
console.log('23) Voice Dialer：聆听 → 候选 → 拨号联动')
await launch(17)
assert(await pct(INK) > 0.5, 'Listening 深灰面板')
assert((await rectN(GREEN, 60, 280, 260, 360)) > 100, '动态电平绿条')
await sleep(2300) // → results
assert(await rectN(WHITE, 20, 235, 300, 300) > 60, '识别候选（白色姓名）')
await key('Enter', 13); await sleep(500) // 第一候选 → dialer
assert((await rectN(INK, 40, 180, 280, 255)) > 200, '拨号盘预填候选号码')
for (let i = 0; i < 14; i++) { await key('Escape', 27); await sleep(60) }
await sleep(400)
assert(await wpVisible() > 400, '返回主屏')

// ================= 24) 系统闹钟到点响铃 =================
console.log('24) 系统闹钟：约 1 分钟后全屏响铃')
// 目标 = 下一个整分钟 +30s：最坏（now 恰在分钟边界后 1s）targetT-now ≈ 89s，
// 轮询 180×700ms=126s 足以覆盖整分钟窗口（checkAlarm 每 2s 跑一次）
const targetT = new Date(Math.ceil(Date.now() / 60000) * 60000 + 30000)
const prevT = new Date(targetT.getTime() - 60000)
await idbSet('htc-dream:clock:alarms', [{
  id: 999, on: true, h: targetT.getHours(), m: prevT.getMinutes(), days: 0x7f, label: '', snd: 4,
}])
await launch(0) // Clock：列表显示基准闹钟
await key('Enter', 13); await sleep(400) // → edit
await key('Enter', 13); await sleep(150) // fieldHM → 分
await key('ArrowRight', 39); await sleep(400) // 分 +1 → 目标
const ringAlarm = await jget('htc-dream:clock:alarms', [])
console.log('  设定:', JSON.stringify(ringAlarm[0]), '| 目标:',
  `${String(targetT.getHours()).padStart(2, '0')}:${String(targetT.getMinutes()).padStart(2, '0')}`)
await key('Escape', 27); await sleep(250) // → list
await key('Escape', 27); await sleep(400) // → home
let alarmRed = 0
// 最坏情况 targetT-now ≈ 89s；180×700ms=126s 轮询覆盖整个目标分钟窗口
for (let i = 0; i < 180 && alarmRed < 1200; i++) {
  alarmRed = await rectN(RED, 160, 384, 300, 440)
  await sleep(700)
}
console.log('  响铃红钮像素:', alarmRed)
assert(alarmRed > 1200, '到点全屏闹钟（红色 Dismiss 钮）')
assert((await rectN(DGREEN, 28, 384, 148, 440)) > 800, '深绿 Snooze 钮')
await key('Enter', 13); await sleep(600) // 非 call 键 → stop
assert(await wpVisible() > 400, '关闭闹钟回主屏')

// ================= 25) 设置十项 =================
console.log('25) 设置：真机同款十项 + 子页持久化')
await launch(16)
const rootInk = await rectN(INK, 20, 60, 300, 400)
console.log('  根菜单墨色:', rootInk)
assert(rootInk > 400, '根菜单十项渲染（含日期时间/语言区域）')
// 无线控制 → WLAN
await tap(160, 86); await sleep(400)
await tap(160, 128); await sleep(400) // WLAN row1
assert((await jget('htc-dream:settings:wifi')) === true, 'WLAN 开关持久化')
await key('Escape', 27); await sleep(350) // → root
// 安全和位置 → GPS / 图案
await tap(160, 254); await sleep(400)
await tap(160, 128); await sleep(400) // GPS row1
assert((await jget('htc-dream:settings:gps')) === true, 'GPS 持久化')
await tap(160, 170); await sleep(400) // pattern link row2
const patDots = await rectN(PALE, 80, 125, 240, 290)
console.log('  图案点阵浅灰:', patDots)
assert(patDots > 200, '解锁图案页 3×3 点阵（空心圆环）')
await key('Escape', 27); await sleep(300) // → security
await key('Escape', 27); await sleep(300) // → root
// 数据同步
await tap(160, 212); await sleep(400)
assert((await rectN(INK, 20, 60, 300, 400)) > 100, '数据同步子页')
await key('Escape', 27); await sleep(300)
// SD 卡：卸载确认 → 挂载
await tap(160, 338); await sleep(400)
await tap(160, 170); await sleep(300) // Unmount row2 → confirm
assert((await rectN(GREEN, 30, 300, 160, 344)) > 500, '确认框 OK 绿钮')
await tap(95, 322); await sleep(400)
assert((await jget('htc-dream:settings:sdunmounted')) === true, 'SD 已卸载并持久化')
await tap(160, 128); await sleep(400) // Mount row1
assert((await jget('htc-dream:settings:sdunmounted')) === false, '重新挂载')
await key('Escape', 27); await sleep(300)
// 日期和时间（root row7）：24 小时制开关持久化
await tap(160, 380); await sleep(400)
await tap(160, 210); await sleep(400) // 使用 24 小时制 toggle（row3）
assert((await jget('htc-dream:settings:h24')) === true, '24 小时制开关持久化')
await key('Escape', 27); await sleep(300) // → root
// 语言和区域（root row8）：中英单选切换
await tap(160, 422); await sleep(400)
await tap(160, 128); await sleep(400) // English（row1）
assert((await rectN(GREEN, 278, 110, 306, 132)) > 30, '英文项单选绿点')
await tap(160, 86); await sleep(400) // 切回中文（row0）
assert((await rectN(GREEN, 278, 66, 306, 88)) > 30, '中文项单选绿点')
await key('Escape', 27); await sleep(300) // → root
// 声音和显示：铃声 / 壁纸
await tap(160, 170); await sleep(400)
await tap(160, 128); await sleep(400) // 手机铃声 row1 → ringtones
await tap(160, 86); await sleep(400) // 第一首 → ringtone 0
assert((await jget('htc-dream:settings:ringtone')) === 0, '铃声选择持久化（试听）')
await key('Escape', 27); await sleep(300) // → sounddisp
// 从铃声页返回后选中行仍在 row1，壁纸是 row10：再按 9 次（11 行循环，不能按 10 次）
for (let i = 0; i < 9; i++) { await key('ArrowDown', 40); await sleep(60) }
await key('Enter', 13); await sleep(400) // → wallpaper 页
await key('ArrowDown', 40); await sleep(150)
await key('Enter', 13); await sleep(400) // Android 绿
assert((await jget('htc-dream:settings:wallpaper')) === 1, '壁纸持久化为 Android 绿')
await key('Escape', 27); await sleep(300) // → sounddisp
await key('Escape', 27); await sleep(300) // → root
// 关于手机（root row9，scroll=0 时不可见 → 重启设置后下滚 9 次进入）
await launch(16)
for (let i = 0; i < 9; i++) { await key('ArrowDown', 40); await sleep(60) }
await key('Enter', 13); await sleep(400)
assert(await pct(WHITE) > 0.5 && (await n(INK)) > 500, '关于手机（型号/固件/内核）')
await key('Escape', 27); await sleep(400) // 退出设置
assert((await pct(DGREEN)) > 0.25, '主屏壁纸已切换为 Android 绿')

// ================= 26) Global actions 静音 =================
console.log('26) 长按 END → Global actions：静音切换')
await hold('F2', 113, 700)
assert((await rectN(WHITE, 10, 300, 310, 470)) > 3000, 'Global actions 工作表')
await key('Enter', 13); await sleep(500) // Silent mode 即时切换
assert((await jget('htc-dream:settings:silent')) === true, '静音开启并持久化')
await hold('F2', 113, 700)
await key('Enter', 13); await sleep(500)
assert((await jget('htc-dream:settings:silent')) === false, '静音关闭')

// ================= 27) 恢复出厂 =================
console.log('27) 恢复出厂设置')
await launch(16)
for (let i = 0; i < 9; i++) { await key('ArrowDown', 40); await sleep(60) }
await key('Enter', 13); await sleep(400) // → 关于手机（root row9）
await tap(160, 401); await sleep(400) // 末行 Factory reset（about row8）
assert((await rectN(RED, 40, 384, 280, 420)) > 500, '出厂页红色重置钮')
await tap(160, 400); await sleep(300) // → confirm
await tap(95, 322) // OK → clearAll → 900ms 后 exit
await sleep(1400)
assert((await idbGet('htc-dream:messages:inbox')) === null, '全部数据已清除')
assert((await idbGet('htc-dream:settings:wallpaper')) === null, '设置已清除')
assert(await wpVisible() > 400, '回主屏并恢复默认壁纸')

// ================= 28) 长按电源关机 =================
console.log('28) 长按 POWER → Global actions → Power off')
await hold('F6', 117, 700)
assert((await rectN(WHITE, 10, 300, 310, 470)) > 3000, 'Global actions 工作表')
await key('ArrowDown', 40); await sleep(200)
await key('Enter', 13); await sleep(800) // 关机
p = await pct(BAR)
console.log('  关机黑占比:', p.toFixed(2))
assert(p > 0.9, '关机动画（全黑）')
await sleep(900)
p = await pct(OFFBG)
console.log('  熄灭后底色:', p.toFixed(2))
assert(p > 0.95, '屏幕熄灭')

console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== HTC DREAM (G1) E2E v4 ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

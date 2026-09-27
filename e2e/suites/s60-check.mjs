/**
 * 诺基亚 N73（S60 3rd）无视觉 E2E：
 * 两阶段开机、Active Standby 待机、功能表树、各应用特征像素 +
 * IndexedDB 持久化断言，全程不截图。
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9224
const DEV = 'nokia-n73'

rmSync('/tmp/chrome-s60', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-s60',
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
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''))
  }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expression, awaitP = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitP })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
/** IndexedDB 读取：fire-and-forget + 轮询（awaitPromise 会挂起） */
const idbGet = async (key) => {
  await evalJS(`(() => {
    window.__idbDone = false; window.__idbVal = null
    const r = indexedDB.open('mobile-museum', 1)
    r.onsuccess = () => {
      const g = r.result.transaction('kv').objectStore('kv').get(${JSON.stringify(key)})
      g.onsuccess = () => { window.__idbVal = g.result; window.__idbDone = true }
      g.onerror = () => { window.__idbDone = true }
    }
    r.onerror = () => { window.__idbDone = true }
  })()`)
  for (let i = 0; i < 40; i++) {
    await sleep(150)
    const done = await evalJS('window.__idbDone')
    if (done) {
      const v = await evalJS('window.__idbVal')
      return v === null || v === undefined ? null : JSON.parse(v)
    }
  }
  throw new Error('IDB 读取超时: ' + key)
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

await send('Page.enable')
await send('Runtime.enable')

// ---------- 页内工具：彩色画布 → ASCII + 调色板统计 ----------

const PAGE_UTILS = `
(() => {
  // 与 S60_PALETTE（src/os/s60/palette.ts）对应，末位 CYAN=宫格/待机选中
  const PAL = [
    [0xdf,0xe5,0xea,'.'], [0x1c,0x23,0x2b,'#'], [0xf4,0xf7,0xfa,'@'],
    [0x2f,0x6f,0xd0,'B'], [0x5f,0x9b,0xe8,'s'], [0xd9,0xb4,0x4a,'a'],
    [0x4e,0x9b,0x4e,'G'], [0xc4,0x4e,0x3d,'R'], [0x7d,0x85,0x90,'g'],
    [0x9f,0xd0,0xf5,'p'], [0x17,0x3a,0x63,'N'], [0x2c,0x2f,0x33,'D'],
    [0xf0,0xcf,0xbd,'l'], [0xcf,0x91,0x6b,'m'], [0xb5,0x75,0x52,'d'],
    [0x7c,0xca,0xff,'C'],
  ]
  const near = (r,g,b) => {
    let bi = 0, bd = 1e9
    for (let i = 0; i < PAL.length; i++) {
      const d = (PAL[i][0]-r)**2 + (PAL[i][1]-g)**2 + (PAL[i][2]-b)**2
      if (d < bd) { bd = d; bi = i }
    }
    return bi
  }
  window.__snap = () => {
    const c = document.querySelector('canvas'); if (!c) return null
    const x = c.getContext('2d')
    const W = c.width, H = c.height
    const d = x.getImageData(0, 0, W, H).data
    const counts = new Array(PAL.length).fill(0)
    const idx = new Uint8Array(W * H)
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const k = near(d[p], d[p+1], d[p+2]); idx[i] = k; counts[k]++
    }
    // ASCII：横向 3px、纵向 6px 采样 → 120×80
    let out = ''
    for (let y = 0; y < H; y += 6) {
      for (let x = 0; x < W; x += 3) out += PAL[idx[y * W + x]][3]
      out += '\\n'
    }
    return { ascii: out, counts, colors: counts.filter(c => c > 50).length, W, H }
  }
  // 像素级帧差：每 2px 采样归色索引，ms 后再采一次，统计变化样本数
  // （对稀疏噪点比颜色计数差灵敏得多）
  window.__frameDiff = (ms) => new Promise((res) => {
    const c = document.querySelector('canvas'); const x = c.getContext('2d')
    const sample = () => {
      const d = x.getImageData(0, 0, c.width, c.height).data
      const arr = []
      for (let y = 0; y < c.height; y += 2)
        for (let xx = 0; xx < c.width; xx += 2) {
          const p = (y * c.width + xx) * 4
          arr.push(near(d[p], d[p + 1], d[p + 2]))
        }
      return arr
    }
    const a = sample()
    setTimeout(() => {
      const b = sample()
      let n = 0
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
      res(n)
    }, ms)
  })
})()
`
await evalJS(PAGE_UTILS)

// 调色板索引: 0=bg 1=INK 2=WHITE 3=BLUE 4=SKY 5=AMBER 6=GREEN 7=RED 8=GRAY
// 9=PALE 10=NAVY 11=DARK 12-14=SKIN 15=CYAN
const snap = async () => evalJS('JSON.stringify(window.__snap())').then(JSON.parse)
/** 帧差（开机动画/取景噪点在动 = 两帧像素采样差异数） */
const snapDiff = (ms = 350) => evalJS(`window.__frameDiff(${ms})`, true)
const show = async (label) => {
  const s = await snap()
  console.log(`----- ${label} -----`)
  console.log(s.ascii)
  console.log(`  colors>50px: ${s.colors} | INK:${s.counts[1]} WHITE:${s.counts[2]} BLUE:${s.counts[3]} SKY:${s.counts[4]} AMBER:${s.counts[5]} GREEN:${s.counts[6]} PALE:${s.counts[9]} NAVY:${s.counts[10]} DARK:${s.counts[11]} CYAN:${s.counts[15]}`)
  return s
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }

// 物理键快捷方式
const K = {
  soft1: () => key('KeyQ', 81), soft2: () => key('KeyW', 87), ok: () => key('Enter', 13),
  back: () => key('Escape', 27), clear: () => key('Backspace', 8), power: () => key('KeyP', 80),
  up: () => key('ArrowUp', 38), down: () => key('ArrowDown', 40),
  left: () => key('ArrowLeft', 37), right: () => key('ArrowRight', 39),
  star: () => key('Minus', 189), hash: () => key('Equal', 187),
  digit: (d) => key('Digit' + d, 48 + Number(d)),
}
const TOTAL = 360 * 480

// ================= 1) 展馆 =================
console.log('1) 展馆')
const title = await evalJS(`document.querySelector('.gallery-header h1')?.textContent`)
assert(title === '掌上博物馆', '展馆标题')
const cards = await evalJS(`JSON.stringify([...document.querySelectorAll('.device-card')].map(c => ({
  year: c.querySelector('.device-card-year')?.textContent?.trim(),
  name: c.querySelector('.device-card-name')?.childNodes[0]?.textContent?.trim(),
})))`).then(JSON.parse)
console.log('  展品:', cards.map((c) => `${c.year} ${c.name}`).join(' | '))
assert(cards.length === 8, '共 8 台设备')
assert(cards.map((c) => c.year).join(',') === '1992,2000,2003,2006,2007,2008,2008,2011', '按年代排序 1992→2011')

// ================= 2) 进入 N73 =================
console.log('2) 进入诺基亚 N73')
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1000)
const shell = await evalJS(`JSON.stringify({
  s60: !!document.querySelector('.phone.s60'),
  antenna: !!document.querySelector('.phone-antenna'),
  canvas: (() => { const c = document.querySelector('canvas'); return { w: c?.width, h: c?.height } })(),
  keys: document.querySelectorAll('.phone.s60 .pbtn').length,
})`).then(JSON.parse)
console.log('  机壳:', JSON.stringify(shell))
assert(shell.s60, 's60 机壳类')
assert(!shell.antenna, '无外置天线')
assert(shell.canvas.w === 360 && shell.canvas.h === 480, '画布 360×480 (240×320 ×1.5)')
assert(shell.keys === 12 + 5 + 2 + 1, '实体按键齐全（数字12+导航5+软键2+C键1）')

// 关机态：纯底色
const offSnap = await snap()
assert(offSnap.counts[0] > 0.98 * TOTAL, '关机态纯底色')

// ================= 3) 开机：两阶段 =================
console.log('3) 开机（NOKIA 字标 → 握手 + Nokia tune → 待机）')
const skinPx = (s) => s.counts[12] + s.counts[13] + s.counts[14]
await K.power()
await sleep(450) // 阶段 0：白底蓝 NOKIA 字标
const stage0 = await snap()
assert(stage0.counts[2] > 0.55 * TOTAL, '阶段0 白底')
assert(stage0.counts[3] > 800, `阶段0 蓝色 NOKIA 字标 (${stage0.counts[3]}px)`)
assert(skinPx(stage0) === 0, '阶段0 握手尚未开始')
await sleep(1400) // t≈1.85s：握手阶段，双手伸入
const stage1 = await show('开机-握手')
assert(skinPx(stage1) > 300, `握手双手肤色出现 (${skinPx(stage1)}px)`)
const bootDiff = await snapDiff()
console.log('  动画帧差:', bootDiff)
assert(bootDiff > 100, '握手动画在推进')
await sleep(4100) // t≈5.95s：已进待机
const idle0 = await show('待机屏（zh）')
assert(idle0.colors >= 5, `彩色模式 ≥5 色 (实际 ${idle0.colors})`)
assert(idle0.counts[15] > 800, `活动待机图标选中块 CYAN (${idle0.counts[15]}px)`)
assert(idle0.counts[2] > 300, '左上大时钟/插件白字')
assert(idle0.counts[3] > 15000, '蓝调云气壁纸')

// ================= 4) 功能表宫格 =================
console.log('4) 功能表')
await K.up() // 待机 ↑ = 进功能表
await sleep(400)
const menu0 = await show('功能表宫格')
assert(menu0.counts[15] > 1500, `宫格选中块 CYAN (${menu0.counts[15]}px)`)
assert(menu0.counts[2] > 500, '12 顶级项白色标签')
// 下移 → 第二行（idx3），选中块仍在
await K.down(); await sleep(250)
const menu1 = await evalJS('JSON.stringify(window.__snap())').then(JSON.parse)
assert(menu1.counts[15] > 1500, '第二行选中仍有 CYAN 块')
await K.up(); await sleep(200) // 回到 idx0

// ================= 5) 信息：文件夹根 → 收件箱 → T9 → 自动回复 =================
console.log('5) 信息应用')
await K.right(); await sleep(200) // idx1 = 信息
await K.ok(); await sleep(500)
const msgRoot = await show('信息-文件夹根视图')
assert(msgRoot.counts[3] > 3000, '根视图蓝色选中行')
assert(msgRoot.counts[2] > 50000, '根视图白底')
const seeds = await idbGet(`${DEV}:messages:inbox`)
console.log('  种子:', seeds.map((m) => `${m.from}: ${m.text.slice(0, 12)}…`))
assert(seeds.length === 2, '种子短信 2 条')
assert(seeds.some((m) => m.from === '10086' && m.text.includes('GPRS')), '10086 欢迎信')
assert(seeds.some((m) => m.text.includes('彩信') || m.text.includes('MMS')), '妈妈短信')
// ↓ 到「收件箱」行 → 进入
await K.down(); await sleep(200)
await K.ok(); await sleep(450)
await show('信息-收件箱')
// 打开第一条 → 未读转已读
await K.ok(); await sleep(400)
await show('信息-阅读')
const afterRead = await idbGet(`${DEV}:messages:inbox`)
assert(afterRead[0]?.read === true, '阅读后标记已读并持久化')
await K.back(); await sleep(350) // 回收件箱
// soft1 = 写信息
await K.soft1(); await sleep(400)
await show('信息-编辑器(空)')
for (const d of '64426') { await K.digit(d); await sleep(170) }
await sleep(300)
await K.ok() // 上屏 你好
await sleep(400)
await show('信息-编辑器(你好)')
await K.soft1() // 发送
await sleep(2900) // sending 1.6 + sent 1.1 → 回收件箱
await show('信息-回收件箱')
const sentBox = await idbGet(`${DEV}:messages:inbox`)
assert(sentBox.some((m) => m.mine && m.text === '你好'), '发出的短信已入箱')
const evtAfterSend = await idbGet(`${DEV}:logevents`)
assert(evtAfterSend?.some((e) => e.kind === 'sms' && e.dir === 'out'), '事件日志记录短信发出')
console.log('  等自动回复…')
await sleep(10000)
const replied = await idbGet(`${DEV}:messages:inbox`)
console.log('  收件箱:', replied.map((m) => `${m.mine ? '我' : m.from}: ${m.text.slice(0, 10)}`))
assert(replied.length >= 4, '自动回复已到')
assert(replied.some((m) => !m.mine && !m.read), '回复未读标记')
const evtAfterReply = await idbGet(`${DEV}:logevents`)
assert(evtAfterReply.some((e) => e.kind === 'sms' && e.dir === 'in'), '事件日志记录短信接收')
// 退回菜单（信息从菜单启动 → 回功能表）
await K.back(); await sleep(300) // inbox → root
await K.back(); await sleep(450) // root → 功能表

// ================= 6) 名片夹 → 详情 → 呼叫 =================
console.log('6) 名片夹与呼叫')
await K.left(); await sleep(200) // idx0 = 名片夹
await K.ok(); await sleep(500)
await show('名片夹-列表')
const defContacts = await idbGet(`${DEV}:contacts`)
assert(defContacts?.length === 4, '默认联系人 4 条（设备级 store）')
await K.ok(); await sleep(400) // 详情卡：妈妈
const detail = await show('名片夹-详情卡')
assert(detail.counts[4] > 3000, `无分组头像 SKY 圆盘 (${detail.counts[4]}px)`)
await K.ok() // 中键呼叫
await sleep(700)
await show('正在呼叫-白底')
await sleep(2600)
const callScreen = await show('通话中-白底绿条')
assert(callScreen.counts[2] > 60000, '通话屏白底')
assert(callScreen.counts[6] > 8000, `顶部绿色状态条 (${callScreen.counts[6]}px)`)
// soft1 选项：静音/扬声器/保持
await K.soft1(); await sleep(300)
const optsOpen = await snap()
assert(optsOpen.counts[3] > 1000, '通话选项白色面板 + 蓝色选中行')
await K.soft2(); await sleep(300)
const optsClosed = await snap()
assert(optsClosed.counts[3] < 400, '选项面板关闭')
// soft2 挂断
await K.soft2(); await sleep(1800)
await show('通话结束 → 待机')
const calllog = await idbGet(`${DEV}:calllog`)
assert(calllog?.some((c) => c.dir === 'out' && c.name === '妈妈'), '通话记录写入去电条目')

// ================= 7) 相机（横屏） =================
console.log('7) 相机（横屏取景）')
await K.up(); await sleep(350) // 进功能表（rootSel=0）
for (let i = 0; i < 4; i++) { await K.right(); await sleep(160) } // idx4 多媒体
await K.ok(); await sleep(400) // MEDIA 文件夹，sel0 照相机
await K.ok(); await sleep(600)
const finder = await show('相机-横屏取景器')
assert(finder.colors >= 6, '取景画面多彩')
assert(finder.counts[6] > 5000, `近坡绿色 (${finder.counts[6]}px)`)
assert(finder.counts[10] > 2000, `远山藏青 (${finder.counts[10]}px)`)
assert(finder.counts[1] > 5000, '四角括号 + 底部软键栏 INK')
const finderDiff = await snapDiff(300)
console.log('  取景噪点帧差:', finderDiff)
assert(finderDiff > 50, '取景器噪点在动')
await K.up(); await sleep(250) // 数码变焦 +1 档
// 闪光灯关（自动→强制→关闭），关闭时无白闪直接拍
await K.star(); await sleep(200)
await K.star(); await sleep(200)
await K.ok()
await sleep(1400) // 快门 + saved 1s → 回取景
const photos1 = await idbGet(`${DEV}:camera:photos`)
console.log('  照片数:', photos1?.length, '首张像素:', photos1?.[0]?.length)
assert(photos1?.length === 1, '照片已保存')
assert(photos1[0].length === 64 * 48, '照片 64×48 横版')
assert(new Set(photos1[0]).size >= 4, '照片多彩')
// 相册
await K.soft2(); await sleep(500)
const gallery = await show('相机-相册')
assert(gallery.counts[11] > 40000, `相册深色底（照片居中，${gallery.counts[11]}px)`)
// 删除（C 两次）
await K.clear(); await sleep(250)
await K.clear(); await sleep(400)
const photos0 = await idbGet(`${DEV}:camera:photos`)
assert((photos0 ?? []).length === 0, '照片已删除，空相册自动回收景器')
await K.back(); await sleep(500) // 退应用 → 功能表(rootSel=4)

// ================= 8) 贪吃蛇 =================
console.log('8) 贪吃蛇')
await K.right(); await sleep(200) // idx5 游戏
await K.ok(); await sleep(400) // GAMES 文件夹
await K.ok(); await sleep(500)
const snake1 = await show('贪吃蛇')
assert(snake1.counts[6] > 200, '蛇身绿色')
await K.soft1(); await sleep(300) // 暂停
const paused = await show('贪吃蛇-已暂停')
assert(paused.counts[6] > 200, '暂停画面蛇身仍在')
await K.soft1(); await sleep(300) // 继续
await K.up(); await sleep(400)
await K.right(); await sleep(600)
const snake2 = await evalJS('JSON.stringify(window.__snap())').then(JSON.parse)
assert(snake2.counts[6] > 200, '蛇还活着')
await K.back(); await sleep(450) // 退出 → 功能表(rootSel=5)

// ================= 9) 设置树（drill-down） =================
console.log('9) 设置（drill-down 树）')
for (let i = 0; i < 3; i++) { await K.right(); await sleep(160) } // idx8 工具
await K.ok(); await sleep(400) // TOOLS
for (let i = 0; i < 4; i++) { await K.down(); await sleep(160) } // idx12 设置
await K.ok(); await sleep(500)
const setRoot = await show('设置-根（6 项）')
assert(setRoot.counts[3] > 2000, '设置根蓝色选中行')
assert(setRoot.counts[2] > 50000, '设置根白底')
// 主题模式（sel1）→ 壁纸就地循环
await K.down(); await sleep(200)
await K.ok(); await sleep(400)
await show('设置-主题模式')
await K.ok(); await sleep(300) // 壁纸 0→1
const confChg = await idbGet(`${DEV}:settings:conf`)
assert(confChg?.wallpaper === 1, '壁纸切换并即时持久化')
await K.back(); await sleep(300) // 回设置根（sel 仍在 1=主题模式）
// 再进主题把壁纸切回 0（后续待机断言依赖蓝调壁纸）
await K.ok(); await sleep(400)
await K.left(); await sleep(300)
const confBack = await idbGet(`${DEV}:settings:conf`)
assert(confBack?.wallpaper === 0, '壁纸切回蓝调')
await K.back(); await sleep(300)
// 设置根退出 → 功能表根(sel=8) → 待机
// （app 退出后 MenuUI 总是重建在功能表根，不恢复 TOOLS 文件夹）
await K.back(); await sleep(400) // 功能表根
await K.back(); await sleep(450) // 待机
const idleBack = await snap()
assert(idleBack.counts[3] > 15000, '待机仍是蓝调壁纸')

// ================= 10) 电源菜单 / 情景模式 / 键盘锁 / 真机码 =================
console.log('10) 电源菜单、情景模式、键盘锁、*#0000#')
await K.power(); await sleep(400)
const pm = await show('电源菜单')
assert(pm.counts[2] > 50000, '电源菜单白色面板')
assert(pm.counts[11] > 20000, '菜单外区域调暗')
// ↓×7 = 离线（关机0 锁1 标准2 无声3 会议4 户外5 寻呼机6 离线7）
for (let i = 0; i < 7; i++) { await K.down(); await sleep(140) }
await K.ok(); await sleep(400)
const confOff = await idbGet(`${DEV}:settings:conf`)
assert(confOff?.profile === 5, '切换到离线模式并持久化')
// 待机：信号位换成小飞机（白色像素在右上）
const idleOffline = await snap()
assert(idleOffline.counts[2] > 300, '离线待机正常绘制（小飞机）')
// 电源菜单 → 标准
await K.power(); await sleep(400)
await K.down(); await sleep(150)
await K.down(); await sleep(200) // idx2 标准
await K.ok(); await sleep(400)
const confStd = await idbGet(`${DEV}:settings:conf`)
assert(confStd?.profile === 0, '切回标准模式')
// 键盘锁：左软键 → *
await K.soft1(); await sleep(150)
await K.star(); await sleep(350)
const locked = await snap()
assert(locked.counts[1] > 3000, `锁定提示胶囊 INK (${locked.counts[1]}px)`)
// 解锁：左软键 → *
await K.soft1(); await sleep(150)
await K.star(); await sleep(400)
const unlocked = await snap()
assert(unlocked.counts[1] < 1000, '解锁后提示胶囊消失')
// 真机码 *#0000# → 版本页
await K.star(); await sleep(150)
await K.hash(); await sleep(150)
for (let i = 0; i < 4; i++) { await K.digit(0); await sleep(140) }
await sleep(400)
const about = await show('版本信息页（*#0000#）')
assert(about.counts[1] > 5000, '版本页标题栏 INK')
await K.back(); await sleep(450) // 回待机

// ================= 11) 其余应用巡检 =================
console.log('11) 其余应用巡检')
// rootSel=8（工具）→ 进功能表 → TOOLS 文件夹
await K.up(); await sleep(400)
await K.ok(); await sleep(450)
// 每个应用退出后 MenuUI 总是重建在功能表根（sel=rootSel=8），
// 需重新进 TOOLS 并横向定位（宫格 right = +1）
const toolsAt = async (sel) => {
  await K.ok(); await sleep(400) // 根 idx8 → TOOLS sel0
  for (let i = 0; i < sel; i++) { await K.right(); await sleep(110) }
}
// -- 文件管理（sel0）--
await K.ok(); await sleep(500)
const fm = await show('文件管理-存储选择')
assert(fm.counts[3] > 5000, '蓝选中行（手机存储）')
await K.down(); await sleep(250) // 切到存储卡
await K.back(); await sleep(450) // 退出 → 功能表根(rootSel=8)
await toolsAt(1)
// -- 计算器（sel1）--
await K.ok(); await sleep(500)
const calc1 = await show('计算器')
assert(calc1.counts[3] > 1000, '默认聚焦「=」蓝块')
await K.digit(2); await sleep(200)
await K.right(); await sleep(200) // 焦点右移到「+」
await K.ok(); await sleep(200)
await K.digit(3); await sleep(200)
await K.left(); await sleep(200) // 回「=」
await K.ok(); await sleep(300) // 2+3=5
const calc2 = await snap()
assert(calc2.counts[3] > 1000, '计算完成，焦点仍在')
await K.back(); await sleep(400) // → 功能表根
await toolsAt(2)
// -- 记事本（sel2）--
await K.ok(); await sleep(500)
await show('记事本-空列表')
await K.soft1(); await sleep(400) // 新建
for (const d of '64426') { await K.digit(d); await sleep(170) }
await K.ok(); await sleep(300) // 你好
await K.soft2(); await sleep(500) // 自动保存并关闭编辑 → 列表
const notes1 = await idbGet(`${DEV}:notes:notes`)
assert(notes1?.length === 1 && notes1[0].body === '你好', '记事本持久化（notes 键）')
await K.back(); await sleep(400) // 列表退出 → 功能表根
await toolsAt(3)
// -- 时钟（sel3）--
await K.ok(); await sleep(500)
const clk1 = await show('时钟-闹钟列表')
assert(clk1.counts[3] > 2000, '闹钟蓝色选中行')
assert(clk1.counts[6] > 200, '种子闹钟 ON 绿色开关')
await K.ok(); await sleep(300) // 关闭闹钟
const alarmsOff = await idbGet(`${DEV}:clock:alarms`)
assert(alarmsOff?.[0]?.on === false, '闹钟关闭并持久化')
await K.ok(); await sleep(300) // 重开
const alarmsOn = await idbGet(`${DEV}:clock:alarms`)
assert(alarmsOn?.[0]?.on === true, '闹钟重新开启')
await K.hash(); await sleep(400) // 世界时钟
const world = await show('时钟-世界时钟')
assert(world.counts[10] > 5000, '世界时钟 NAVY 行')
await K.soft2(); await sleep(400) // 回列表
await K.back(); await sleep(400) // 列表退出 → 功能表根
await toolsAt(4)
// -- 单位换算（sel4）--
await K.ok(); await sleep(500)
const conv = await show('单位换算')
assert(conv.counts[10] > 5000, '结果区 NAVY 底')
await K.digit(2); await sleep(160)
await K.digit(5); await sleep(250) // 值 25
await K.right(); await sleep(300) // 循环目标单位
await K.back(); await sleep(400) // → 功能表根
await toolsAt(5)
// -- 词典（sel5）--
await K.ok(); await sleep(500)
const dict = await show('词典')
assert(dict.counts[3] > 500, '词条蓝色文字')
await K.back(); await sleep(400) // → 功能表根(sel=8)
// -- 影音（idx11）：RealPlayer / 可视收音机 / 音乐播放器 --
for (let i = 0; i < 3; i++) { await K.right(); await sleep(160) } // 8→11
await K.ok(); await sleep(450) // AV 文件夹 sel0
await K.ok(); await sleep(500) // RealPlayer 列表
await K.ok(); await sleep(700) // 播放
const rp = await show('RealPlayer-播放')
assert(rp.counts[1] > 20000, '视频区 INK 底')
assert(rp.counts[7] > 80, `红色进度条在推进 (${rp.counts[7]}px)`)
await K.ok(); await sleep(300) // 暂停
await K.soft2(); await sleep(300) // 回列表
await K.back(); await sleep(400) // 列表退出 → 功能表根(rootSel=11)
await K.ok(); await sleep(450) // 重进 AV 文件夹 sel0
await K.right(); await sleep(200) // sel1 可视收音机
await K.ok(); await sleep(500)
await show('可视收音机-关闭')
await K.soft1(); await sleep(400) // 开机（fmStatic 噪流）
const radioOn = await snap()
assert(radioOn.counts[3] > 2000, '开机后频率大字变蓝')
await K.right(); await sleep(300) // 调谐
await K.back(); await sleep(400) // 退出（dispose 停噪流）→ 功能表根
await K.ok(); await sleep(450) // 重进 AV sel0
await K.right(); await sleep(150)
await K.right(); await sleep(200) // sel2 音乐播放器
await K.ok(); await sleep(500)
await show('音乐播放器-曲目列表')
await K.ok(); await sleep(800) // Now playing
const now = await show('音乐播放器-Now playing')
assert(now.counts[3] > 80, `蓝色进度条推进 (${now.counts[3]}px)`)
await K.ok(); await sleep(300) // 暂停
await K.back(); await sleep(300) // 回列表
await K.back(); await sleep(400) // 列表退出 → 功能表根(rootSel=11)
// -- 服务（idx6）--
for (let i = 0; i < 5; i++) { await K.left(); await sleep(160) } // 11→6
await K.ok(); await sleep(500)
await show('服务-书签主页')
await K.down(); await sleep(200)
await K.ok(); await sleep(500) // 打开离线页面
await show('服务-离线页面')
await K.soft2(); await sleep(400) // 返回书签主页
await K.back(); await sleep(450) // 退出 → 功能表根(sel=6)
await K.back(); await sleep(450) // 待机

// ================= 12) 待机直接拨号 =================
console.log('12) 待机直接拨号')
for (const d of '10086') { await K.digit(d); await sleep(140) }
await sleep(300)
const dial = await show('拨号-10086')
assert(dial.counts[1] > 5000, '拨号屏 INK 状态栏')
await K.soft1(); await sleep(500) // 呼叫
await sleep(2700)
const direct = await show('通话中-10086')
assert(direct.counts[2] > 60000 && direct.counts[6] > 8000, '白底绿条通话屏')
await K.soft2(); await sleep(1900) // 挂断 → 待机

// ================= 13) 英文切换 =================
console.log('13) 切英文')
await evalJS(`localStorage.setItem('museum:lang', 'en'); location.reload()`)
await sleep(2500)
await evalJS(PAGE_UTILS)
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1000)
await K.power()
await sleep(6000) // 两阶段开机完整
const enIdle = await show('Idle (en)')
assert(enIdle.counts[3] > 15000, 'EN 待机壁纸正常')
// 功能表（rootSel 记忆在 6=服务）→ 左 6 次回首项 Contacts
await K.up(); await sleep(400)
for (let i = 0; i < 6; i++) { await K.left(); await sleep(140) }
await K.ok(); await sleep(600) // Contacts
await show('Contacts list (en)')
await K.ok(); await sleep(400) // detail
await K.ok(); await sleep(3100) // call → connected
const enCall = await show('In call (en)')
assert(enCall.counts[2] > 60000 && enCall.counts[6] > 8000, 'White bg + green status bar')
await K.soft2(); await sleep(1900)
// 切回中文
await evalJS(`localStorage.setItem('museum:lang', 'zh'); location.reload()`)
await sleep(2500)
await evalJS(PAGE_UTILS)
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1000)
await K.power()
await sleep(6000)
const zhIdle = await show('待机屏（切回 zh）')
assert(zhIdle.counts[3] > 15000, '回到中文待机正常')

// ================= 14) 恢复出厂（设置树，密码 12345） =================
console.log('14) 恢复出厂设置')
await K.up(); await sleep(400) // 功能表 rootSel=0
for (let i = 0; i < 8; i++) { await K.right(); await sleep(150) } // idx8 工具
await K.ok(); await sleep(400)
for (let i = 0; i < 4; i++) { await K.down(); await sleep(150) } // idx12 设置
await K.ok(); await sleep(500)
for (let i = 0; i < 5; i++) { await K.down(); await sleep(150) } // sel5 恢复出厂
await K.ok(); await sleep(400) // 密码输入面板
for (const d of '12345') { await K.digit(d); await sleep(150) }
await K.ok(); await sleep(600) // 提交 → clearAll + resetDone 提示
// 第一键关闭提示，随后逐层退出
await K.back(); await sleep(300)
await K.back(); await sleep(350) // 退出设置 → 功能表
await K.back(); await sleep(450) // 待机
const resetConf = await idbGet(`${DEV}:settings:conf`)
assert(resetConf?.wallpaper === 0 && resetConf?.profile === 0, 'conf 已恢复默认')
const resetNotes = await idbGet(`${DEV}:notes:notes`)
assert(resetNotes === null, '记事本数据已清空')
const resetIdle = await snap()
assert(resetIdle.counts[3] > 15000, '恢复后待机蓝调壁纸正常')

// ================= 15) 关机 =================
console.log('15) 关机')
await K.power(); await sleep(400) // 电源菜单
await K.ok(); await sleep(1200) // sel0 关机
const offSnap2 = await snap()
assert(offSnap2.counts[0] > 0.98 * TOTAL, '关机后纯底色')

// ================= 16) 单色机回归 =================
console.log('16) 功能机回归 (nokia-3310)')
await evalJS(`location.hash = '#/device/nokia-3310'`)
await sleep(1000)
await K.power()
await sleep(5300)
const fpDark = await evalJS(`(() => {
  const c = document.querySelector('canvas'); const x = c.getContext('2d')
  const d = x.getImageData(0, 0, c.width, c.height).data
  let dark = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) dark++
  return dark
})()`)
console.log('  功能机待机暗像素:', fpDark)
assert(fpDark > 300, '功能机待机屏正常（无大时钟，阈值随之下调）')

console.log('17) 大哥大回归 (motorola-brick)')
await evalJS(`location.hash = '#/device/motorola-brick'`)
await sleep(1000)
await K.power()
await sleep(3400)
const brickDark = await evalJS(`(() => {
  const c = document.querySelector('canvas'); const x = c.getContext('2d')
  const d = x.getImageData(0, 0, c.width, c.height).data
  let dark = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i+1] < 110 && d[i+2] < 100) dark++
  return dark
})()`)
console.log('  大哥大待机暗像素:', brickDark)
assert(brickDark > 500, '大哥大待机屏正常')

// ================= 收尾 =================
console.log('\n运行时异常:', exceptions.length ? exceptions : '无 ✓')
if (exceptions.length) throw new Error('存在运行时异常')
console.log('\n=== S60 E2E ALL PASSED ===')
ws.close()
chrome.kill()
process.exit(0)

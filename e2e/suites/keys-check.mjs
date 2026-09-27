/** 键盘外观无视觉验证：computed style 几何/clip-path/键标断言（三机壳各自真机形态） */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
rmSync('/tmp/chrome-keys', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9227', '--user-data-dir=/tmp/chrome-keys',
  '--window-size=760,1400', 'about:blank',
], { stdio: 'ignore' })
await sleep(1500)
await fetch('http://localhost:9227/json/new?' + encodeURIComponent(URL), { method: 'PUT' })
await sleep(2200)
const targets = await (await fetch('http://localhost:9227/json/list')).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:4173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

/** 抓取当前机壳的全部几何信息 */
const probe = `(() => {
  const q = (sel) => document.querySelector(sel)
  const qa = (sel) => [...document.querySelectorAll(sel)]
  const cs = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop) : null
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
  }
  const btnInfo = (el) => {
    const s = getComputedStyle(el)
    return { key: el.dataset.key ?? '', ...box(el),
      rotate: s.rotate, translate: s.translate, radius: s.borderRadius,
      bg: s.backgroundImage.slice(0, 80), color: s.color }
  }
  const phone = q('.phone')
  return JSON.stringify({
    cls: phone?.className,
    phoneBox: box(phone),
    brand: q('.brand')?.textContent ?? null,
    sidePower: qa('.phone-power').length,
    navKeys: qa('.n1100-nav .pbtn, .n3310-nav .pbtn').map(btnInfo),
    digitKeys: qa('.keypad .pbtn').map(btnInfo),
    gridKeys: qa('.brick-grid .pbtn').map(btnInfo),
    antenna: q('.phone-antenna') ? { ...box(q('.phone-antenna')), left: cs(q('.phone-antenna'), 'left'),
      translate: cs(q('.phone-antenna'), 'translate'), top: cs(q('.phone-antenna'), 'top') } : null,
    earpieceCup: q('.earpiece-cup') ? cs(q('.earpiece-cup'), 'border-radius') : null,
    earpieceDots: q('.earpiece-dots') ? { bg: cs(q('.earpiece-dots'), 'background-image').slice(0, 70), box: box(q('.earpiece-dots')) } : null,
    triC: q('.tri-c') ? { clip: cs(q('.tri-c'), 'clip-path'), radius: cs(q('.tri-c'), 'border-radius') } : null,
    triR: q('.tri-r') ? { clip: cs(q('.tri-r'), 'clip-path'), sub: qa('.tri-r .tri').map((b) => b.dataset.key) } : null,
    navi: q('.n3310-nav .navi-key') ? { radius: cs(q('.n3310-nav .navi-key'), 'border-radius'),
      after: { w: cs(q('.n3310-nav .navi-key'), 'width') } } : null,
    topPower: q('.n3310-power') ? box(q('.n3310-power')) : null,
    plate: q('.n1100-plate') ? { brand: q('.n1100-plate .brand')?.textContent, box: box(q('.n1100-plate')) } : null,
    nkOk: q('.nk-ok')?.dataset.key ?? null,
    nkPower: q('.nk-power')?.dataset.key ?? null,
    navOk: q('.nav-ok') ? { radius: cs(q('.nav-ok'), 'border-radius'), bg: cs(q('.nav-ok'), 'background-image').slice(0, 70) } : null,
    softL: q('.soft-l .soft-label')?.textContent ?? null,
    softR: q('.soft-r .soft-label')?.textContent ?? null,
  })
})()`

// ================= Nokia 3310：三键 Navi + 波浪键 + 机顶电源 =================
console.log('\n=== nokia-3310 ===')
await evalJS(`location.hash = '#/device/nokia-3310'`)
await sleep(1000)
const p3310 = JSON.parse(await evalJS(probe))
console.log(`  机壳: ${p3310.cls} | 侧置电源数: ${p3310.sidePower}`)
assert(p3310.cls.includes('n3310'), 'n3310 布局类')
assert(p3310.sidePower === 0, '无侧置电源（电源在机顶）')
assert(p3310.topPower && p3310.topPower.h > 10 && p3310.topPower.w > 20, '机顶电源凸块存在')

// 三键 Navi：C / Navi / 连体双热区
const navByKey = Object.fromEntries(p3310.navKeys.map((k) => [k.key, k]))
assert(navByKey.clear && navByKey.ok && navByKey.up && navByKey.down, 'Navi 行四热区：clear/ok/up/down')
assert(p3310.triC && norm(p3310.triC.clip).startsWith('polygon('), 'C 键三角 clip-path')
assert(/50%\s*0%?/.test(norm(p3310.triC.clip)) && /100%\s*100%/.test(norm(p3310.triC.clip)) && /0%\s*100%/.test(norm(p3310.triC.clip)),
  'C 键顶点在上（50% 0 / 100% 100% / 0 100%）')
assert(p3310.triR && p3310.triR.sub.join(',') === 'up,down', '右连体键内含 up/down 双热区')
assert(p3310.navi && p3310.navi.radius === '999px', 'Navi 银胶囊圆角 999px')

// 波浪键：12 胶囊，三列 ±5° 与纵向错位
assert(p3310.digitKeys.length === 12, '12 个数字键')
assert(p3310.digitKeys.every((k) => k.radius === '999px'), '数字键全胶囊形')
const wave = [p3310.digitKeys[0], p3310.digitKeys[1], p3310.digitKeys[2]]
assert(wave[0].rotate === '-5deg' && wave[2].rotate === '5deg', '左右两列 ±5° 倾斜')
assert(wave[1].rotate === 'none', '中列无倾斜')
assert(wave[0].translate === '0px 4px' && wave[1].translate === '0px -3px' && wave[2].translate === '0px 4px',
  '三列纵向错位 4 / -3 / 4px')
assert(p3310.earpieceDots && p3310.earpieceDots.bg.includes('radial-gradient'), '点状听筒（径向圆点排）')

// ================= Nokia 1100：方形膜片键 + 3×2 导航，无左右 =================
console.log('\n=== nokia-1100 ===')
await evalJS(`location.hash = '#/device/nokia-1100'`)
await sleep(1000)
const p1100 = JSON.parse(await evalJS(probe))
console.log(`  机壳: ${p1100.cls} | 侧置电源数: ${p1100.sidePower}`)
assert(p1100.cls.includes('n1100'), 'n1100 布局类')
assert(p1100.sidePower === 0, '无侧置电源（电源在膜片导航内）')
assert(p1100.nkPower === 'power', '面板导航电源键 data-key=power')
assert(p1100.plate && p1100.plate.brand === 'NOKIA', '顶部银面板含 NOKIA 厂牌')

// 3×2 导航：power/up/clear/ok/down，无 left/right
const navSet = new Set(p1100.navKeys.map((k) => k.key))
assert([...navSet].join(',') === 'power,up,clear,ok,down', '导航仅五热区：power/up/clear/ok/down')
assert(!navSet.has('left') && !navSet.has('right'), '导航无左右键（真机只有上下）')
assert(p1100.nkOk === 'ok', 'Navi 键 data-key=ok')

// 12 方形密封膜片键：小圆角、无旋转无错位
assert(p1100.digitKeys.length === 12, '12 个数字键')
assert(p1100.digitKeys.every((k) => k.radius === '6px'), '数字键方形（圆角 6px，非胶囊）')
assert(p1100.digitKeys.every((k) => k.rotate === 'none'), '数字键全部无倾斜（无波浪）')
assert(p1100.digitKeys.every((k) => k.translate === 'none'), '数字键无纵向错位')

// ================= Motorola 3200：21 键网格 + 中央天线 + 杯状听筒 =================
console.log('\n=== motorola-brick ===')
await evalJS(`location.hash = '#/device/motorola-brick'`)
await sleep(1000)
const brick = JSON.parse(await evalJS(probe))
console.log(`  机壳: ${brick.cls} | 网格键: ${brick.gridKeys.length} | 侧置电源数: ${brick.sidePower}`)
assert(brick.cls.includes('brick'), 'brick 布局类')
assert(brick.gridKeys.length === 21, '21 键（3×7 网格）')
assert(brick.sidePower === 0, '无侧置电源（电源在网格内）')

// 天线：机顶中央（computed left 已解析为 px，改用包围盒中心对齐判断）
const antennaCx = brick.antenna.x + brick.antenna.w / 2
const phoneCx = brick.phoneBox.x + brick.phoneBox.w / 2
assert(brick.antenna && Math.abs(antennaCx - phoneCx) < 3, `天线水平居中（偏差 ${Math.abs(antennaCx - phoneCx).toFixed(1)}px）`)
assert(brick.antenna.h >= 200, `天线外凸长度 ${brick.antenna.h}px ≥ 200`)
assert(parseFloat(brick.antenna.top) < -180, '天线自机顶向上伸出（top ≤ -180px）')

// 杯状听筒
assert(brick.earpieceCup === '50%', '杯状听筒为正圆（border-radius 50%）')

// 红绿 Call/End + 琥珀电源
const gridByKey = Object.fromEntries(brick.gridKeys.map((k) => [k.key, k]))
assert(gridByKey.call && /76,\s*165,\s*106/.test(gridByKey.call.bg), 'Call 键绿色渐变')
assert(gridByKey.end && /177,\s*77,\s*82/.test(gridByKey.end.bg), 'End 键红色渐变')
assert(gridByKey.power && gridByKey.power.color === 'rgb(217, 161, 59)', '电源键琥珀色')
assert(gridByKey.mr && gridByKey.mplus && gridByKey.menu && gridByKey.fcn && gridByKey.vol && gridByKey.clear,
  'MR / M+ / MENU / FCN / VOL / a-c 功能键齐备')

// ================= Nokia N73（S60）：摇杆 + 软键 =================
console.log('\n=== nokia-n73 ===')
await evalJS(`location.hash = '#/device/nokia-n73'`)
await sleep(1000)
const n73 = JSON.parse(await evalJS(probe))
console.log(`  机壳: ${n73.cls} | 品牌: ${n73.brand}`)
assert(n73.cls.includes('s60'), 's60 布局类')
assert(n73.brand === 'Nokia', '机壳品牌 Nokia')
assert(n73.navOk && n73.navOk.radius === '50%', '摇杆圆形')
assert(n73.navOk.bg.includes('radial-gradient'), '摇杆凸起观感（径向渐变）')
assert(n73.softL === '' && n73.softR === '', '软键无键标（标签在屏幕上）')
assert(n73.digitKeys.length === 12 && n73.digitKeys.every((k) => k.w > k.h), '12 个横向长方形数字键')

// ---------- HTC Dream（G1）：轨迹球 + 绿/红键 + 侧滑全键盘 ----------
console.log('\n=== htc-dream ===')
await evalJS(`location.hash = '#/device/htc-dream'`)
await sleep(1000)
const g1 = JSON.parse(await evalJS(`(() => {
  const q = (sel) => document.querySelector(sel)
  const cs = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop) : null
  const r = (el) => el ? { w: +el.getBoundingClientRect().width.toFixed(1), h: +el.getBoundingClientRect().height.toFixed(1) } : null
  return JSON.stringify({
    cls: q('.phone')?.className,
    brand: q('.brand')?.textContent,
    ball: { radius: cs(q('.g1-track-ball'), 'border-radius'), bg: cs(q('.g1-track-ball'), 'background-image').slice(0, 80) },
    call: { bg: cs(q('.g1-call'), 'background-image') },
    end: { bg: cs(q('.g1-end'), 'background-image') },
    qkeys: [...document.querySelectorAll('.g1-qwerty .g1-qkey')].map((k) => k.textContent),
    qwerty: r(q('.g1-qwerty')),
    chin: cs(q('.phone'), 'border-radius'),
  })
})()`))
console.log('  机壳类:', g1.cls, '| 品牌:', g1.brand, '| 下巴圆角:', g1.chin)
assert(g1.cls.includes('g1'), 'g1 布局类')
assert(g1.brand === 'T · Mobile', '面板品牌 T · Mobile（运营商）')
assert(g1.chin.includes('84px'), '下巴弧度（84px 大圆角）')
assert(g1.ball.radius === '50%' && g1.ball.bg.includes('radial-gradient'), '轨迹球圆形凸起（径向渐变）')
assert(g1.call.bg.includes('63, 165, 63') || /#63a53f|63, 165, 63|rgb\(99, 165, 63\)/i.test(g1.call.bg), '呼叫键绿色渐变')
assert(/192, 74, 58|176, 72, 63|c04a3a|b0483f/i.test(g1.end.bg), '挂断键红色渐变')
assert(g1.qkeys.length === 29, 'QWERTY 29 键（26 字母 + 空格 . ,）')
assert(g1.qkeys.slice(0, 10).join('') === 'qwertyuiop', '第一行 qwertyuiop')
assert(g1.qkeys[26] === '␣', '空格键')
assert(g1.qwerty && g1.qwerty.w > 200, '全键盘面板展开陈列')

ws.close()
chrome.kill()
process.exit(0)

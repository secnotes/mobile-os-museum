/** 白天主题样式验证（端口 9242）：卡片四边一致 + 无低对比文字（计算样式对比度断言） */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9242

rmSync('/tmp/chrome-theme', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-theme',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(1500)
await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })
await sleep(2200)
const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:4173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value ?? null
}
const assert = (cond, msg) => { if (!cond) throw new Error('✗ ' + msg); console.log('  ✓ ' + msg) }
await send('Page.enable')

// ---- 切到白天主题，刷新 ----
await evalJS(`localStorage.setItem('museum:theme', 'light'); location.reload()`)
await sleep(1500)

// 1) 卡片四边样式一致
const borders = await evalJS(`(() => {
  const c = document.querySelector('.device-card')
  const s = getComputedStyle(c)
  return { top: s.borderTopWidth, left: s.borderLeftWidth, right: s.borderRightWidth, bottom: s.borderBottomWidth,
           topColor: s.borderTopColor, leftColor: s.borderLeftColor }
})()`)
console.log('   卡片边框:', JSON.stringify(borders))
assert(borders.left === borders.top && borders.right === borders.top && borders.bottom === borders.top, '四边宽度一致（无左侧粗线）')
assert(borders.leftColor === borders.topColor, '四边颜色一致')

// 2) 对比度工具：元素文字 vs 背景的 WCAG 对比度
await evalJS(`window.__contrast = (sel) => {
  const el = document.querySelector(sel); if (!el) return null
  const s = getComputedStyle(el)
  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g).map(Number)
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2])
  }
  const fg = s.color
  let bg = 'rgba(0, 0, 0, 0)', node = el
  while (node && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
    bg = getComputedStyle(node).backgroundColor
    node = node.parentElement
  }
  const l1 = lum(fg), l2 = lum(bg)
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  return { sel, fg, bg, ratio: Math.round(ratio * 100) / 100 }
}`)

// 3) 展馆页关键文字对比度
console.log('== 展馆页（白天） ==')
for (const sel of ['.gallery-intro', '.device-card-name', '.device-card-maker', '.boot-btn', '.gallery-sub']) {
  const c = await evalJS(`JSON.stringify(window.__contrast('${sel}'))`).then(JSON.parse)
  console.log(`   ${sel}: ${c.fg} on ${c.bg} = ${c.ratio}:1`)
  assert(c.ratio >= 3, `${sel} 对比度 ≥3:1`)
}

// 4) 设置页（白天）
await evalJS(`location.hash = '#/settings'`)
await sleep(900)
console.log('== 设置页（白天） ==')
for (const sel of ['.settings-desc', '.stab', '.stab.active', '.sec-tab.active', '.ed-add input', '.ed-add button']) {
  const c = await evalJS(`JSON.stringify(window.__contrast('${sel}'))`).then(JSON.parse)
  if (!c) { console.log(`   ${sel}: 不存在（当前 tab 无此元素）`); continue }
  console.log(`   ${sel}: ${c.fg} on ${c.bg} = ${c.ratio}:1`)
  assert(c.ratio >= 3, `${sel} 对比度 ≥3:1`)
}

// 5) 夜间主题回归抽查
await evalJS(`localStorage.setItem('museum:theme', 'dark'); location.hash = '#/'; location.reload()`)
await sleep(1500)
await evalJS(`window.__contrast = (sel) => {
  const el = document.querySelector(sel); if (!el) return null
  const s = getComputedStyle(el)
  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g).map(Number)
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2])
  }
  const fg = s.color
  let bg = 'rgba(0, 0, 0, 0)', node = el
  while (node && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
    bg = getComputedStyle(node).backgroundColor
    node = node.parentElement
  }
  const l1 = lum(fg), l2 = lum(bg)
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  return { sel, fg, bg, ratio: Math.round(ratio * 100) / 100 }
}`)
console.log('== 展馆页（夜间） ==')
for (const sel of ['.gallery-intro', '.boot-btn']) {
  const c = await evalJS(`JSON.stringify(window.__contrast('${sel}'))`).then(JSON.parse)
  console.log(`   ${sel}: ${c.fg} on ${c.bg} = ${c.ratio}:1`)
  assert(c.ratio >= 3, `${sel} 对比度 ≥3:1`)
}

console.log('\n=== THEME STYLE CHECK ALL PASSED ===')
ws.close(); chrome.kill(); process.exit(0)

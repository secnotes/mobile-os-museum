/**
 * iPhone 各状态截图：通过 CDP 驱动 headless Chromium，把 canvas 截成 PNG。
 * 用法：node e2e/iphone-shots.mjs [state...]
 *   state ∈ boot lock home settings phone clock calc notes sms weather maps safari
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const URL = 'http://localhost:4173/mobile/'
const PORT = 9251
const DEV = 'apple-iphone-2g'
const OUT = '/tmp/iphone-shots'
const STATES = process.argv.slice(2).length ? process.argv.slice(2) : ['boot', 'lock', 'home', 'settings', 'phone', 'clock', 'calc', 'notes', 'weather', 'maps', 'safari', 'sms']

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
rmSync('/tmp/chrome-iphone-shots', { recursive: true, force: true })
const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-iphone-shots',
  '--window-size=900,1400', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(1500)
await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })
await sleep(2000)
const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:4173'))
if (!page) throw new Error('未找到页面 target')
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('页面求值异常: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value ?? null
}
const key = async (code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Arrow', '').toLowerCase() || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
const tap = async (sx, sy) => {
  await evalJS(`(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    const opts = { clientX: r.x + (${sx} / 320) * r.width, clientY: r.y + (${sy} / 480) * r.height, bubbles: true }
    c.dispatchEvent(new PointerEvent('pointerdown', opts))
    c.dispatchEvent(new PointerEvent('pointerup', opts))
  })()`)
}
const drag = async (pts) => {
  const arr = pts.map(([x, y]) => `[${x},${y}]`).join(',')
  await evalJS(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
    const pt = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.x + (x/320)*r.width, clientY: r.y + (y/480)*r.height, bubbles: true }))
    const pts = [${arr}]
    pt('pointerdown', pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) pt('pointermove', pts[i][0], pts[i][1])
    pt('pointerup', pts[pts.length-1][0], pts[pts.length-1][1])
  })()`)
}
const clickKey = async (k) => {
  await evalJS(`(() => {
    const b = document.querySelector('.pbtn[data-key="${k}"]')
    if (!b) return false
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return true
  })()`)
}
await send('Page.enable')

/** 截 canvas 为 PNG（只截 canvas 元素，不含机壳） */
const shot = async (name) => {
  // 等 1 帧渲染
  await sleep(400)
  const data = await send('Page.captureScreenshot', { format: 'png', clip: await evalJS(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }
  })()`) })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data.result.data, 'base64'))
  console.log('  截图: ' + name)
}

const has = (s) => STATES.includes(s)

// 进入设备
await evalJS(`location.hash = '#/device/${DEV}'`)
await sleep(1000)

if (has('boot')) {
  // 开机动画：开机后立即截（logo 阶段）
  await key('KeyP', 80)
  await sleep(900) // t≈0.9s，logo 已显
  await shot('boot')
}

if (has('lock')) {
  // 等开机完成进锁屏
  await sleep(2500)
  await shot('lock')
  // 解锁
  await drag([[40, 444], [130, 444], [220, 444], [280, 444]])
  await sleep(700)
}

if (has('home')) await shot('home')

if (has('settings')) {
  await tap(272, 226); await sleep(800) // Settings
  await shot('settings-root')
  await tap(160, 252); await sleep(700) // 声音
  await shot('settings-sounds')
  await tap(30, 42); await sleep(500) // 回根
  await tap(160, 404); await sleep(700) // 通用
  await shot('settings-general')
  await clickKey('home'); await sleep(600)
}

if (has('phone')) {
  await tap(53, 424); await sleep(800) // Phone
  await tap(224, 455); await sleep(600) // 拨号键盘 tab
  await shot('phone-keypad')
  // 拨几个号
  for (const [x, y] of [[53, 122], [160, 332], [160, 262], [267, 192]]) { await tap(x, y); await sleep(120) }
  await sleep(200)
  await shot('phone-dialed')
  await clickKey('home'); await sleep(600)
}

if (has('clock')) {
  await tap(53, 226); await sleep(800) // Clock（网格 (0,2)）
  await shot('clock-world')
  await tap(240, 455); await sleep(600) // 闹钟 tab
  await shot('clock-alarm')
  await tap(80, 455); await sleep(600) // 秒表
  await shot('clock-stopwatch')
  await clickKey('home'); await sleep(600)
}

if (has('calc')) {
  await tap(272, 226); await sleep(800) // Calculator（网格 (3,2)）
  await shot('calc')
  await clickKey('home'); await sleep(600)
}

if (has('notes')) {
  await tap(272, 282); await sleep(800) // Notes（网格 (2,3)）
  await shot('notes')
  await clickKey('home'); await sleep(600)
}

if (has('weather')) {
  await tap(272, 170); await sleep(800) // Weather（网格 (3,1)）
  await shot('weather')
  await clickKey('home'); await sleep(600)
}

if (has('maps')) {
  await tap(168, 170); await sleep(800) // Maps（网格 (2,1)）
  await shot('maps')
  await clickKey('home'); await sleep(600)
}

if (has('safari')) {
  await tap(244, 424); await sleep(800) // Safari dock
  await shot('safari')
  await clickKey('home'); await sleep(600)
}

if (has('sms')) {
  await tap(44, 58); await sleep(800) // Text（网格 (0,0)）
  await shot('sms-list')
  await tap(160, 94); await sleep(700) // 进入会话
  await shot('sms-thread')
  await clickKey('home'); await sleep(600)
}

ws.close()
chrome.kill()
process.exit(0)

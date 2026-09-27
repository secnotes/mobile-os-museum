import type { Screen } from '../../hal/screen'
import { C } from './palette'

/** Lumia 800 屏幕几何：480×800 WVGA；顶部系统托盘（黑底白图标） */
export const W = 480
export const H = 800
export const TRAY_H = 32

/**
 * Metro 字体栈：Segoe WP 的开源度量等价物 Open Sans（与 Segoe 同出 Steve Matteson 笔下），
 * Light 300 字重是 Metro 排版的灵魂；中文回落 Droid Sans Fallback。
 * Segoe WP 专有无法分发，Open Sans Light 是最接近的合法替身。
 */
export const F_LIGHT = (px: number) => `300 ${px}px "Open Sans","Droid Sans Fallback",sans-serif`
export const F_REG = (px: number) => `400 ${px}px "Open Sans","Droid Sans Fallback",sans-serif`
export const F_SEMI = (px: number) => `600 ${px}px "Open Sans","Droid Sans Fallback",sans-serif`

/** 轻微软角的矩形（Metro 控件：直角为主，键盘键面/按钮带 4px 圆角） */
export function roundRect(
  s: Screen,
  x: number, y: number, w: number, h: number, r: number,
  fill: number, stroke: number | null,
) {
  const rs = r * r
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const cx = dx < r ? r - dx : dx >= w - r ? dx - (w - r - 1) : 0
      const cy = dy < r ? r - dy : dy >= h - r ? dy - (h - r - 1) : 0
      if (cx * cx + cy * cy > rs) continue
      const edge =
        dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1 ||
        (dx === r && dy < r) || (dx === w - r - 1 && dy < r) ||
        (dx === r && dy >= h - r) || (dx === w - r - 1 && dy >= h - r)
      if (edge) {
        if (stroke !== null) s.pset(x + dx, y + dy, stroke)
      } else if (fill >= 0) {
        s.pset(x + dx, y + dy, fill)
      }
    }
}

/** 展开的系统托盘高度（Mango：点状态栏后托盘下扩出第二行文字） */
export const TRAY_EXP_H = 66

// ---------- 托盘显隐（真机 Mango：默认隐藏，点顶部边缘唤出，数秒后自动收回） ----------

let trayUntil = 0
let trayTimer: ReturnType<typeof setTimeout> | null = null
const trayListeners = new Set<() => void>()

/** 托盘当前是否可见 */
export function trayShown(): boolean {
  return Date.now() < trayUntil
}

/** 托盘显隐变化订阅（OS 与各应用注册重绘；返回退订函数） */
export function onTrayChange(fn: () => void): () => void {
  trayListeners.add(fn)
  return () => trayListeners.delete(fn)
}

function emitTray() {
  for (const fn of [...trayListeners]) fn()
}

/** 唤出托盘，ms 后自动收回（真机点顶部边缘的手感） */
export function peekTray(ms = 3500) {
  const was = trayShown()
  trayUntil = Date.now() + ms
  if (trayTimer) clearTimeout(trayTimer)
  trayTimer = setTimeout(() => {
    trayUntil = 0
    trayTimer = null
    emitTray()
  }, ms)
  if (!was) emitTray()
}

/** 立即收回托盘 */
export function hideTray() {
  if (trayTimer) { clearTimeout(trayTimer); trayTimer = null }
  if (!trayShown()) return
  trayUntil = 0
  emitTray()
}

/**
 * 系统托盘（黑底白图标，Metro 托盘）。
 * 真机 Mango：默认隐藏，仅唤出时绘制；左侧信号柱 + WiFi（有未读时前置信封）；
 * 右侧细体时钟；电池仅低电或充电时显示（真机如此）。force 用于锁屏常显。
 */
export function tray(
  s: Screen,
  opts: { unread: boolean; batteryPct: number; charging?: boolean; clock: string; force?: boolean },
) {
  s.fillRect(0, 0, W, TRAY_H, C.BLACK)
  if (!opts.force && !trayShown()) return
  let x = 12
  if (opts.unread) {
    // 未读信息：信封图标（白）
    for (let i = 0; i < 14; i++) s.pset(x + i, 8, C.WHITE)
    for (let i = 0; i < 14; i++) s.pset(x + i, 20, C.WHITE)
    for (let i = 0; i < 13; i++) { s.pset(x, 8 + i, C.WHITE); s.pset(x + 13, 8 + i, C.WHITE) }
    for (let i = 0; i < 7; i++) s.pset(x + 1 + i, 10 + (i > 3 ? 1 : 0), C.BLACK)
    for (let i = 0; i < 6; i++) { s.pset(x + 1 + i, 10 + Math.floor(i / 2), C.BLACK); s.pset(x + 7 + i, 10 + Math.floor((6 - i) / 2), C.BLACK) }
    x += 22
  }
  // 信号条（白）
  for (let i = 0; i < 5; i++) {
    const bh = 4 + i * 3
    s.fillRect(x + i * 6, 22 - bh, 4, bh, C.WHITE)
  }
  x += 32
  // WiFi 扇形（白，真机信号旁）
  for (let r = 3; r <= 9; r += 3) {
    for (let a = -50; a <= 50; a += 4) {
      const rad = ((a - 90) * Math.PI) / 180
      s.pset(x + 6 + Math.round(Math.cos(rad) * r), 20 + Math.round(Math.sin(rad) * r), C.WHITE)
    }
  }
  s.fillRect(x + 5, 19, 3, 3, C.WHITE)
  // 右侧：细体时钟（最右）；电池仅低电/充电时显示，在时钟左边
  const cw = s.measure(opts.clock, { size: 17, font: F_LIGHT(17) })
  const clockX = W - 10 - cw
  s.text(clockX, 7, opts.clock, { size: 17, font: F_LIGHT(17), color: C.WHITE })
  if (opts.charging || opts.batteryPct <= 25) {
    const bx = clockX - 24
    const cells = Math.ceil(opts.batteryPct / 20)
    s.fillRect(bx, 9, 14, 1, C.WHITE)
    s.fillRect(bx, 20, 14, 1, C.WHITE)
    s.fillRect(bx, 9, 1, 12, C.WHITE)
    s.fillRect(bx + 14, 9, 1, 12, C.WHITE)
    s.fillRect(bx + 16, 12, 2, 6, C.WHITE)
    for (let i = 0; i < 5; i++)
      if (i < cells) s.fillRect(bx + 2 + i * 3, 11, 2, 9, C.WHITE)
    if (opts.charging) {
      // 充电闪电
      s.line(bx + 8, 11, bx + 5, 16, C.WHITE)
      s.line(bx + 5, 16, bx + 9, 16, C.WHITE)
      s.line(bx + 9, 16, bx + 6, 21, C.WHITE)
    }
  }
}

/**
 * 展开托盘的第二行（Mango：点状态栏展开，再点收起）：
 * 左侧运营商全称，右侧数据网络制式，覆盖在内容之上。
 */
export function trayExpandedStrip(
  s: Screen,
  opts: { carrier: string; dataNet: string },
) {
  s.fillRect(0, TRAY_H, W, TRAY_EXP_H - TRAY_H, C.BLACK)
  s.text(12, 40, opts.carrier, { size: 19, font: F_REG(19), color: C.WHITE })
  s.textRight(W - 10, 40, opts.dataNet, { size: 19, font: F_REG(19), color: C.WHITE })
}

/** 按像素宽度换行（汉字/西文混排通用） */
export function wrapText(s: Screen, text: string, maxW: number, size: number, font?: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const test = line + ch
    if (s.measure(test, { size, font }) > maxW && line) {
      lines.push(line)
      line = ch
    } else {
      line = test
    }
  }
  lines.push(line)
  return lines
}

/** 截断到指定像素宽度 */
export function clipToWidth(s: Screen, text: string, maxW: number, size: number, font?: string): string {
  let out = ''
  for (const ch of text) {
    if (s.measure(out + ch, { size, font }) > maxW) break
    out += ch
  }
  return out
}

// ---------- Metro 纯白几何字形（瓷贴/应用列表共用） ----------

/** 电话听筒：45° 斜置胶囊，两端加大圆头（Metro 电话瓷贴字形） */
export function glyphPhone(s: Screen, cx: number, cy: number, u: number, color: number) {
  const t = Math.max(4, Math.round(u * 0.18))
  const half = u * 0.3
  for (let i = 0; i <= half * 2; i++) {
    const x = Math.round(cx - half + i)
    const y = Math.round(cy + half - i)
    s.fillRect(x - (t >> 1), y - (t >> 1), t, t, color)
  }
  const r = Math.round(t * 0.85)
  for (const [ex, ey] of [[-half, half], [half, -half]] as const) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) s.pset(cx + ex + dx, cy + ey + dy, color)
  }
}

/** 信息气泡：圆角方块 + 三点 + 尾巴 */
export function glyphMessage(s: Screen, cx: number, cy: number, u: number, color: number) {
  roundRect(s, cx - u / 2, cy - u * 0.34, u, u * 0.62, 6, color, null)
  // 左下尾巴
  for (let i = 0; i < Math.round(u * 0.18); i++)
    s.fillRect(cx - u / 2 + i, cy + u * 0.28 + i, Math.round(u * 0.14), 2, color)
  // 三个点（挖孔用底色，由调用方决定；这里用黑）
  for (let i = -1; i <= 1; i++) {
    const r = Math.max(1, Math.round(u * 0.06))
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) s.pset(cx + i * u * 0.22, cy - u * 0.03, C.BLACK)
  }
}

/** 人脉：头像剪影（头 + 肩） */
export function glyphPerson(s: Screen, cx: number, cy: number, u: number, color: number) {
  const hr = u * 0.2
  for (let dy = -hr; dy <= hr; dy++)
    for (let dx = -hr; dx <= hr; dx++)
      if (dx * dx + dy * dy <= hr * hr) s.pset(cx + dx, cy - u * 0.18 + dy, color)
  roundRect(s, cx - u * 0.3, cy + u * 0.04, u * 0.6, u * 0.3, Math.round(u * 0.14), color, null)
}

/** 相机：机身 + 镜头 */
export function glyphCamera(s: Screen, cx: number, cy: number, u: number, color: number) {
  roundRect(s, cx - u * 0.38, cy - u * 0.2, u * 0.76, u * 0.5, 4, color, null)
  roundRect(s, cx - u * 0.1, cy - u * 0.3, u * 0.22, u * 0.12, 2, color, null)
  const r = u * 0.15
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + u * 0.05 + dy, C.BLACK)
}

/** 闹钟：双铃表盘 */
export function glyphAlarm(s: Screen, cx: number, cy: number, u: number, color: number) {
  const r = u * 0.3
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + u * 0.04 + dy, color)
  s.fillRect(cx - u * 0.28, cy - u * 0.32, u * 0.14, u * 0.14, color)
  s.fillRect(cx + u * 0.14, cy - u * 0.32, u * 0.14, u * 0.14, color)
  // 指针（挖黑）
  s.fillRect(cx - 1, cy - u * 0.1 + u * 0.04, 2, u * 0.16, C.BLACK)
  s.fillRect(cx, cy + u * 0.02, u * 0.14, 2, C.BLACK)
}

/** 设置：齿轮（圆环 + 八齿） */
export function glyphSettings(s: Screen, cx: number, cy: number, u: number, color: number) {
  const rOut = u * 0.3
  const rIn = u * 0.18
  for (let dy = -rOut; dy <= rOut; dy++)
    for (let dx = -rOut; dx <= rOut; dx++) {
      const dd = dx * dx + dy * dy
      if (dd <= rOut * rOut && dd >= rIn * rIn) s.pset(cx + dx, cy + dy, color)
    }
  // 八个齿
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    for (let t = rOut; t <= rOut + u * 0.1; t++)
      s.fillRect(Math.round(cx + Math.cos(a) * t) - 2, Math.round(cy + Math.sin(a) * t) - 2, 4, 4, color)
  }
}

/** 向右箭头 ›：左缘最高、向右收窄的竖条序列 */
export function glyphArrow(s: Screen, cx: number, cy: number, u: number, color: number) {
  const half = u / 2
  for (let i = 0; i < half; i++) {
    s.fillRect(Math.round(cx - half + i), Math.round(cy - half + i), 3, Math.round(u - i * 2), color)
  }
}

/** 返回键 ‹：右缘最高、向左收窄 */
export function glyphBack(s: Screen, cx: number, cy: number, u: number, color: number) {
  const half = u / 2
  for (let i = 0; i < half; i++) {
    s.fillRect(Math.round(cx + half - i - 3), Math.round(cy - half + i), 3, Math.round(u - i * 2), color)
  }
}

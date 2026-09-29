import type { Screen } from '../../hal/screen'
import { C } from './palette'
import { maskPhone } from './glyphBitmaps'

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

/**
 * WP7 复选框（38×38，行内右侧控件）：3px 白边框方框；
 * 勾选 = 主题色底 + 白色 X。WP7 设置项的开关就是这种 checkbox
 * （滑动开关是 WP8 才引入的，Mango 没有）。
 */
export function checkbox(s: Screen, x: number, y: number, on: boolean, accent: number) {
  const B = 38, T = 3
  if (on) {
    s.fillRect(x, y, B, B, accent)
    // 白色 X：两条 4px 粗对角线（内区 5..33）
    for (let i = 0; i <= 24; i++) {
      s.fillRect(x + 5 + i, y + 5 + i, 4, 4, C.WHITE)
      s.fillRect(x + 5 + i, y + 29 - i, 4, 4, C.WHITE)
    }
  } else {
    s.fillRect(x, y, B, T, C.WHITE)
    s.fillRect(x, y + B - T, B, T, C.WHITE)
    s.fillRect(x, y, T, B, C.WHITE)
    s.fillRect(x + B - T, y, T, B, C.WHITE)
  }
}

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
 * 真机 Mango：默认隐藏，仅唤出时绘制；左侧信号柱 + WiFi；
 * 右侧细体时钟；电池仅低电或充电时显示（真机如此）。
 * 真机状态栏不显示运营商名、不显示未读信封（未读提示在消息磁贴上）。
 * 所有图标在 32px 托盘内垂直居中（中心 y≈16），底部对齐 y≈24。
 * force 用于锁屏常显。
 */
export function tray(
  s: Screen,
  opts: { unread: boolean; batteryPct: number; charging?: boolean; clock: string; force?: boolean },
) {
  void opts.unread // 真机 Mango 状态栏无未读信封（提示在消息磁贴）
  s.fillRect(0, 0, W, TRAY_H, C.BLACK)
  if (!opts.force && !trayShown()) return
  let x = 12
  // 信号柱（白）：5 柱递增，与 WiFi/时钟同高（真机三组图标视觉等高、共底对齐 y=24）
  for (let i = 0; i < 5; i++) {
    const bh = 3 + i * 2
    s.fillRect(x + i * 5, 24 - bh, 3, bh, C.WHITE)
  }
  x += 28
  // WiFi 扇形（白）：三道弧 + 圆点，描粗（2×2 填充）求清晰；底部对齐 y=24
  const wfx = x + 6, wfy = 21
  for (let r = 3; r <= 9; r += 3) {
    for (let a = -55; a <= 55; a += 2) {
      const rad = ((a - 90) * Math.PI) / 180
      s.fillRect(wfx + Math.round(Math.cos(rad) * r), wfy + Math.round(Math.sin(rad) * r), 2, 2, C.WHITE)
    }
  }
  s.fillRect(wfx - 1, 20, 4, 4, C.WHITE)
  // 右侧：时钟（最右，Regular 字重求清晰，垂直居中）；电池仅低电/充电时显示，在时钟左边
  const cw = s.measure(opts.clock, { size: 16, font: F_REG(16) })
  const clockX = W - 10 - cw
  s.text(clockX, 9, opts.clock, { size: 16, font: F_REG(16), color: C.WHITE })
  if (opts.charging || opts.batteryPct <= 25) {
    const bx = clockX - 24
    const cells = Math.ceil(opts.batteryPct / 20)
    s.fillRect(bx, 10, 14, 1, C.WHITE)
    s.fillRect(bx, 22, 14, 1, C.WHITE)
    s.fillRect(bx, 10, 1, 13, C.WHITE)
    s.fillRect(bx + 14, 10, 1, 13, C.WHITE)
    s.fillRect(bx + 16, 13, 2, 6, C.WHITE)
    for (let i = 0; i < 5; i++)
      if (i < cells) s.fillRect(bx + 2 + i * 3, 12, 2, 10, C.WHITE)
    if (opts.charging) {
      // 充电闪电
      s.line(bx + 8, 12, bx + 5, 17, C.WHITE)
      s.line(bx + 5, 17, bx + 9, 17, C.WHITE)
      s.line(bx + 9, 17, bx + 6, 22, C.WHITE)
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

/**
 * 电话听筒：直接使用真机字形位图（见 glyphBitmaps.ts，源自真机参考 PNG，
 * 红色剪影按白色上色）。听筒左上、话筒右下，C 弧手柄弓向左侧，两端等大对称。
 */
export function glyphPhone(s: Screen, cx: number, cy: number, u: number, color: number) {
  // 位图内容几乎撑满整个掩码盒（~0.9），缩到 0.85u 使实际占比 ≈0.76u，
  // 与信息/人脉/相机等其他瓷贴图标的视觉大小一致
  maskPhone(s, cx, cy, Math.round(u * 0.85), color)
}

/** 信息气泡：方正圆角气泡 + 左下收窄长尾 + 三点（真机 Mango 信息瓷贴） */
export function glyphMessage(s: Screen, cx: number, cy: number, u: number, color: number, bg: number = C.BLACK) {
  const bw = Math.round(u * 0.70)
  const bh = Math.round(u * 0.56)
  const bx = Math.round(cx - bw / 2)
  const by = Math.round(cy - bh / 2 - u * 0.04)
  roundRect(s, bx, by, bw, bh, 7, color, null)
  // 左下尾巴：从气泡底部向下延伸、逐行收窄，略向左偏（真机尾巴尖朝下左）
  const tailH = Math.round(u * 0.20)
  const tailTopW = Math.round(u * 0.18)
  const tailX = bx + Math.round(u * 0.10)
  for (let i = 0; i < tailH; i++) {
    const w = Math.max(2, tailTopW - Math.round((i * tailTopW) / tailH))
    s.fillRect(tailX - Math.round(i * 0.35), by + bh + i - 1, w, 2, color)
  }
  // 三个点（挖孔透底色，水平居中于气泡）
  const dotCY = by + Math.round(bh / 2)
  for (let i = -1; i <= 1; i++) {
    const r = Math.max(1, Math.round(u * 0.055))
    const dxp = Math.round(i * u * 0.20)
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++)
        if (xx * xx + yy * yy <= r * r) s.pset(cx + dxp + xx, dotCY + yy, bg)
  }
}

/** 人脉：头像剪影（头 + 拱肩，连成一体） */
export function glyphPerson(s: Screen, cx: number, cy: number, u: number, color: number) {
  const hr = u * 0.19
  for (let dy = -hr; dy <= hr; dy++)
    for (let dx = -hr; dx <= hr; dx++)
      if (dx * dx + dy * dy <= hr * hr) s.pset(cx + dx, cy - u * 0.16 + dy, color)
  // 肩：上半圆拱，顶部与头相接
  const sr = u * 0.33
  const sy = cy + u * 0.3
  for (let dy = -sr; dy <= 0; dy++) {
    const w = Math.sqrt(sr * sr - dy * dy)
    s.fillRect(Math.round(cx - w), Math.round(sy + dy), Math.round(w * 2), 1, color)
  }
}

/** 相机：机身 + 镜头（透出底色） */
export function glyphCamera(s: Screen, cx: number, cy: number, u: number, color: number, bg: number = C.BLACK) {
  roundRect(s, cx - u * 0.38, cy - u * 0.2, u * 0.76, u * 0.5, 4, color, null)
  roundRect(s, cx - u * 0.1, cy - u * 0.3, u * 0.22, u * 0.12, 2, color, null)
  const r = u * 0.15
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + u * 0.05 + dy, bg)
}

/** 闹钟：圆表盘 + 双铃（45° 圆铃）+ 指针（透出底色） */
export function glyphAlarm(s: Screen, cx: number, cy: number, u: number, color: number, bg: number = C.BLACK) {
  const r = u * 0.3
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + u * 0.04 + dy, color)
  // 双铃：表盘两上角的小圆
  const br = Math.round(u * 0.1)
  for (const bx of [-u * 0.24, u * 0.24])
    for (let dy = -br; dy <= br; dy++)
      for (let dx = -br; dx <= br; dx++)
        if (dx * dx + dy * dy <= br * br) s.pset(Math.round(cx + bx + dx), Math.round(cy - u * 0.26 + dy), color)
  // 指针（挖孔透底色）
  s.fillRect(cx - 1, cy - u * 0.1 + u * 0.04, 2, u * 0.16, bg)
  s.fillRect(cx, cy + u * 0.02, u * 0.14, 2, bg)
}

/** 耳机（音乐+视频 hub 瓷贴字形）：头梁半环 + 两侧耳罩 */
export function glyphHeadphones(s: Screen, cx: number, cy: number, u: number, color: number) {
  const R = Math.round(u * 0.3)
  const band = Math.max(3, Math.round(u * 0.07))
  // 头梁：上半圆环
  for (let x = -R; x <= R; x++) {
    const yo = Math.sqrt(R * R - x * x)
    const ri = R - band
    const yi = Math.abs(x) <= ri ? Math.sqrt(ri * ri - x * x) : 0
    s.fillRect(cx + x, Math.round(cy - yo), 1, Math.max(1, Math.round(yo - yi)), color)
  }
  // 耳罩
  const cw = Math.round(u * 0.13)
  const ch = Math.round(u * 0.3)
  roundRect(s, cx - R - (cw >> 1), cy - Math.round(ch * 0.25), cw, ch, 2, color, null)
  roundRect(s, cx + R - (cw >> 1), cy - Math.round(ch * 0.25), cw, ch, 2, color, null)
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
  // 八个齿（粗矩形）
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    for (let t = rOut; t <= rOut + u * 0.09; t++)
      s.fillRect(Math.round(cx + Math.cos(a) * t) - 3, Math.round(cy + Math.sin(a) * t) - 3, 6, 6, color)
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

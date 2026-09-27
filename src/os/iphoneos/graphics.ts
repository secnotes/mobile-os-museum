import type { Screen } from '../../hal/screen'
import type { R } from './palette'

/**
 * UIKit 风格几何原语。Screen 只提供直角填充，这里按扫描线做圆角与纵向渐变。
 */

/** 圆角矩形填充（扫描线法：逐行算两侧内缩） */
export function rr(s: Screen, x: number, y: number, w: number, h: number, r: number, v: number) {
  r = Math.min(r, (w >> 1), (h >> 1))
  for (let dy = 0; dy < h; dy++) {
    let inset = 0
    if (dy < r || dy >= h - r) {
      const cy = dy < r ? r - dy - 0.5 : dy - (h - r) + 0.5
      inset = Math.round(r - Math.sqrt(Math.max(0, r * r - cy * cy)))
    }
    s.fillRect(x + inset, y + dy, w - inset * 2, 1, v)
  }
}

/** 圆角矩形描边 */
export function rrStroke(s: Screen, x: number, y: number, w: number, h: number, r: number, v: number, th = 1) {
  rr(s, x, y, w, th, r, v) // 上边
  rr(s, x, y + h - th, w, th, r, v) // 下边
  const sideH = h - 2 * Math.min(r, h >> 1)
  s.fillRect(x, y + r, th, sideH, v)
  s.fillRect(x + w - th, y + r, th, sideH, v)
}

/** 纵向渐变填充 */
export function gradV(s: Screen, x: number, y: number, w: number, h: number, rng: readonly [number, number]) {
  const [start, n] = rng
  if (h <= 0) return
  for (let j = 0; j < h; j++) {
    const t = n === 1 ? 0 : Math.floor((j / (h - 1)) * (n - 1))
    s.fillRect(x, y + j, w, 1, start + t)
  }
}

/** 圆角矩形 + 纵向渐变（导航栏/按钮） */
export function rrGrad(s: Screen, x: number, y: number, w: number, h: number, r: number, rng: readonly [number, number]) {
  const [start, n] = rng
  r = Math.min(r, (w >> 1), (h >> 1))
  for (let dy = 0; dy < h; dy++) {
    let inset = 0
    if (dy < r || dy >= h - r) {
      const cy = dy < r ? r - dy - 0.5 : dy - (h - r) + 0.5
      inset = Math.round(r - Math.sqrt(Math.max(0, r * r - cy * cy)))
    }
    const t = n === 1 ? 0 : Math.floor((dy / (h - 1)) * (n - 1))
    s.fillRect(x + inset, y + dy, w - inset * 2, 1, start + t)
  }
}

// Bayer 4×4 有序抖动（在 1.1× 放大下呈平滑 alpha 渐变，无规则斜线与雪花）
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/**
 * 玻璃高光：顶部 42% 区域盖一条向下渐隐的亮带（真机导航栏/tabbar 的 glossy）。
 * Bayer 有序抖动点灯，密度随行淡出；strength 越大越淡。
 */
export function gloss(s: Screen, x: number, y: number, w: number, h: number, r: number, light: number, strength = 3) {
  const bandH = Math.max(2, Math.round(h * 0.42))
  const topDensity = 0.62 / strength
  for (let dy = 0; dy < bandH; dy++) {
    let inset = 0
    if (dy < r) {
      const cy = r - dy - 0.5
      inset = Math.round(r - Math.sqrt(Math.max(0, r * r - cy * cy)))
    }
    const density = topDensity * (1 - dy / bandH)
    const bayerRow = BAYER[dy & 3]!
    for (let dx = inset; dx < w - inset; dx++) {
      if (bayerRow[dx & 3]! / 16 < density) s.pset(x + dx, y + dy, light)
    }
  }
}

/** 圆形（Home 键等） */
export function disc(s: Screen, cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, v)
}

/** 1px 圆环描边（rrStroke 在 1:1 正方上只能画切线，不能用于圆钮） */
export function discStroke(s: Screen, cx: number, cy: number, r: number, v: number) {
  const inner = (r - 1) * (r - 1)
  const outer = r * r
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy
      if (d <= outer && d > inner) s.pset(cx + dx, cy + dy, v)
    }
}

/** 稀疏网点遮罩：隔行隔列点灯模拟半透明黑（照片背景压暗） */
export function scrim(s: Screen, x: number, y: number, w: number, h: number, v: number, step = 2) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = dy & 1; dx < w; dx += step) s.pset(x + dx, y + dy, v)
}

export type { R }

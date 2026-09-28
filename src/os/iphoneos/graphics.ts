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

/**
 * 圆角矩形描边。旧实现把上下边用 rr(h=th) 画，r 被 rr 夹到 0 → 上下边变成
 * 贯穿全宽的 1px 横线（超出圆角主体），在角标/滑块/弹窗上下形成多余横线。
 * 正确做法：上下直边只画 x+r..x+w-r 段，左右直边只画 y+r..y+h-r 段，
 * 四角各画一段半径 r、厚 th 的四分之一圆环。
 */
export function rrStroke(s: Screen, x: number, y: number, w: number, h: number, r: number, v: number, th = 1) {
  r = Math.min(r, (w >> 1), (h >> 1))
  if (r <= 0) {
    // 无圆角：纯矩形描边
    s.fillRect(x, y, w, th, v)
    s.fillRect(x, y + h - th, w, th, v)
    s.fillRect(x, y + r, th, h - 2 * r, v)
    s.fillRect(x + w - th, y + r, th, h - 2 * r, v)
    return
  }
  // 四条直边（仅在两圆角之间）
  s.fillRect(x + r, y, w - 2 * r, th, v) // 上
  s.fillRect(x + r, y + h - th, w - 2 * r, th, v) // 下
  s.fillRect(x, y + r, th, h - 2 * r, v) // 左
  s.fillRect(x + w - th, y + r, th, h - 2 * r, v) // 右
  // 四角圆环段
  ringArc(s, x + r, y + r, r, th, v, -1, -1) // 左上
  ringArc(s, x + w - r - 1, y + r, r, th, v, 1, -1) // 右上
  ringArc(s, x + r, y + h - r - 1, r, th, v, -1, 1) // 左下
  ringArc(s, x + w - r - 1, y + h - r - 1, r, th, v, 1, 1) // 右下
}

/**
 * 四分之一圆环（描边圆角）。圆心 (cx,cy)，外半径 r，厚 th，
 * 仅画 qx/qy 指定象限（qx -1=左/+1=右，qy -1=上/+1=下）。
 */
function ringArc(s: Screen, cx: number, cy: number, r: number, th: number, v: number, qx: -1 | 1, qy: -1 | 1) {
  const outer2 = (r + 0.5) * (r + 0.5)
  const inner = r - th + 0.5
  const inner2 = inner * inner
  for (let dy = 0; dy <= r; dy++) {
    const py = cy + (qy < 0 ? -dy : dy)
    for (let dx = 0; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 > outer2) continue
      if (d2 < inner2) continue
      s.pset(cx + (qx < 0 ? -dx : dx), py, v)
    }
  }
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
 * 走 smooth 叠加层的原生 alpha 渐变（无 Bayer 抖动散点——抖动在深底上呈雪花）；
 * strength 越大越淡。单色机无 smooth 层时回退 Bayer 点阵。
 */
export function gloss(s: Screen, x: number, y: number, w: number, h: number, r: number, light: number, strength = 3) {
  const css = s.colorOf(light)
  if (s.glossSmooth && css.startsWith('rgb(')) {
    s.glossSmooth(x, y, w, h, r, css, 0.62 / strength)
    return
  }
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

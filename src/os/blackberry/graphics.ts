import type { Screen } from '../../hal/screen'

/**
 * BlackBerry 风格几何原语。Screen 只提供直角填充，这里按扫描线做圆角与纵向渐变。
 */

/** 圆角矩形填充（扫描线法） */
export function rr(s: Screen, x: number, y: number, w: number, h: number, r: number, v: number) {
  r = Math.min(r, w >> 1, h >> 1)
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
  rr(s, x, y, w, th, r, v)
  rr(s, x, y + h - th, w, th, r, v)
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

/** 圆角矩形 + 纵向渐变 */
export function rrGrad(s: Screen, x: number, y: number, w: number, h: number, r: number, rng: readonly [number, number]) {
  const [start, n] = rng
  r = Math.min(r, w >> 1, h >> 1)
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

/** 实心圆 */
export function disc(s: Screen, cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, v)
}

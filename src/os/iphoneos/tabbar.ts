import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD } from './fonts'
import { gloss } from './graphics'

export const TAB_H = 49

export interface TabItem {
  label: string
  icon: (s: Screen, x: number, y: number, v: number) => void
}

/**
 * 黑色标签栏：N 个等宽 tab，选中为 selColor（默认白），未选灰。
 */
export function drawTabBar(s: Screen, items: TabItem[], sel: number, selColor = C.WHITE) {
  const [start, n] = R.TAB
  for (let j = 0; j < TAB_H; j++) {
    const t = Math.floor((j / (TAB_H - 1)) * (n - 1))
    s.fillRect(0, 480 - TAB_H + j, 320, 1, start + t)
  }
  gloss(s, 0, 480 - TAB_H, 320, TAB_H, 0, C.WHITE, 4)
  s.fillRect(0, 480 - TAB_H, 320, 1, C.GRAY2)
  const w = 320 / items.length
  items.forEach((it, i) => {
    const cx = Math.round(w * i + w / 2)
    const v = i === sel ? selColor : C.GRAY4
    it.icon(s, cx, 480 - TAB_H + 15, v)
    s.textCenter(cx, 480 - TAB_H + 26, it.label, { size: 10, font: F_BOLD(10), color: v })
  })
}

/** tab 命中（x,y）→ 索引或 null */
export function tabHit(x: number, y: number, count: number): number | null {
  if (y < 480 - TAB_H) return null
  const w = 320 / count
  const idx = Math.floor(x / w)
  return idx >= 0 && idx < count ? idx : null
}

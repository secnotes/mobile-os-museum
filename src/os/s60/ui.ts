import type { Screen } from '../../hal/screen'
import { C } from './palette'

/** S60 屏幕几何：状态栏 / 内容区 / 软键栏 */
export const W = 240
export const H = 320
export const STATUS_H = 26
export const SOFT_H = 26
export const CONTENT_TOP = STATUS_H
export const CONTENT_BOTTOM = H - SOFT_H

/** 深色标题栏 + 白色标题（S60 顶栏风格） */
export function titleBar(s: Screen, title: string) {
  s.fillRect(0, 0, W, STATUS_H, C.INK)
  s.textCenter(W / 2, 5, title, { size: 13, color: C.WHITE })
}

/** 深色软键栏：左右两个白色标签 */
export function softBar(s: Screen, left: string, right: string) {
  s.fillRect(0, H - SOFT_H, W, SOFT_H, C.INK)
  if (left) s.text(10, H - SOFT_H + 6, left, { size: 12, color: C.WHITE })
  if (right) s.textRight(W - 10, H - SOFT_H + 6, right, { size: 12, color: C.WHITE })
}

/** 内容区底色（清屏但保留栏的画法：整屏清 + 重画底色） */
export function clearContent(s: Screen) {
  s.clear()
  s.fillRect(0, CONTENT_TOP, W, CONTENT_BOTTOM - CONTENT_TOP, C.WHITE)
}

/** 按像素宽度换行（汉字/西文混排通用） */
export function wrapText(s: Screen, text: string, maxW: number, size: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const test = line + ch
    if (s.measure(test, { size }) > maxW && line) {
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
export function clipToWidth(s: Screen, text: string, maxW: number, size: number): string {
  let out = ''
  for (const ch of text) {
    if (s.measure(out + ch, { size }) > maxW) break
    out += ch
  }
  return out
}

/** 彩色矩形边框（Screen.frameRect 固定用索引 1，需要其他色时用此） */
export function frameRectC(s: Screen, x: number, y: number, w: number, h: number, color: number) {
  s.line(x, y, x + w - 1, y, color)
  s.line(x, y + h - 1, x + w - 1, y + h - 1, color)
  s.line(x, y, x, y + h - 1, color)
  s.line(x + w - 1, y, x + w - 1, y + h - 1, color)
}

/** 实心圆 */
export function disc(s: Screen, cx: number, cy: number, r: number, color: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, color)
}

import type { Screen } from '../../hal/screen'
import { C } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rr, rrStroke } from './graphics'
import { chevron } from './widgets'

export const ROW_H = 44

export interface Row {
  /** 主标题 */
  t: string
  /** 右侧文字（无箭头） */
  v?: string
  /** 是否带 › 进入下一级 */
  nav?: boolean
  /** 蓝色文字行（如链接） */
  blue?: boolean
  /** 自定义右侧控件绘制（如开关，位置由实现方用全局坐标） */
  accessory?: (s: Screen) => void
  /** 左侧图标 */
  icon?: (s: Screen, x: number, y: number) => void
}

/**
 * 普通表（白底）。top 内容顶，clipH 可视高度；offsetY 滚动偏移。
 */
export function drawPlain(
  s: Screen,
  rows: Row[],
  top: number,
  clipH: number,
  offsetY: number,
): number {
  rows.forEach((r, i) => {
    const y = top + i * ROW_H - offsetY
    if (y < top - ROW_H || y >= top + clipH) return
    s.fillRect(0, y, 320, ROW_H, C.WHITE)
    let x = 10
    if (r.icon) { r.icon(s, x, y + 7); x += 36 }
    s.text(x, y + 12, r.t, { size: 17, font: F_REG(17), color: r.blue ? C.BLUE : C.INK })
    if (r.accessory) r.accessory(s)
    else if (r.v !== undefined)
      s.textRight(r.nav ? 296 : 310, y + 12, r.v, { size: 17, font: F_REG(17), color: C.GRAY3 })
    if (r.nav) chevron(s, 298, y + 22)
    s.fillRect(10, y + ROW_H - 1, 300, 1, C.GRAY6)
  })
  return rows.length * ROW_H
}

export interface Group {
  header?: string
  footer?: string
  rows: Row[]
}

/**
 * 分组表（灰底圆角组）。返回总内容高度。
 */
export function drawGrouped(
  s: Screen,
  groups: Group[],
  top: number,
  clipH: number,
  offsetY: number,
): number {
  let y = top
  for (const g of groups) {
    if (g.header) {
      if (y - offsetY >= top - 18 && y - offsetY < top + clipH)
        s.text(16, y - offsetY + 1, g.header, { size: 14, font: F_BOLD(14), color: C.HDR_GRAY })
      y += 20
    }
    const gh = g.rows.length * ROW_H
    const gy = y - offsetY
    if (gy + gh > top && gy < top + clipH) {
      // 1) 白色圆角组底
      rr(s, 8, gy, 304, gh, 10, C.WHITE)
      // 2) 行内容
      g.rows.forEach((r, i) => {
        const ry = gy + i * ROW_H
        if (ry < top - ROW_H || ry >= top + clipH) return
        let x = 10
        if (r.icon) { r.icon(s, x, ry + 7); x += 36 }
        s.text(x, ry + 12, r.t, { size: 17, font: F_REG(17), color: r.blue ? C.BLUE : C.INK })
        if (r.accessory) r.accessory(s)
        else if (r.v !== undefined)
          s.textRight(r.nav ? 296 : 310, ry + 12, r.v, { size: 17, font: F_REG(17), color: C.GRAY3 })
        if (r.nav) chevron(s, 298, ry + 22)
        if (i < g.rows.length - 1) s.fillRect(10, ry + ROW_H - 1, 300, 1, C.GRAY6)
      })
      // 3) 圆角边框（最后画，不与内容重叠）
      rrStroke(s, 8, gy, 304, gh, 10, C.GRAY5)
    }
    y += gh
    if (g.footer) {
      y += 10
      if (y - offsetY >= top - 14 && y - offsetY < top + clipH)
        y = wrapSmall(s, g.footer, 16, y - offsetY, 288) + offsetY
      y += 4
    } else y += 14
  }
  return y - top
}

/** 小字按宽换行（组脚注），返回结束 y */
export function wrapSmall(s: Screen, text: string, x: number, y: number, w: number): number {
  const size = 13
  let line = ''
  let cy = y
  for (const ch of text) {
    if (s.measure(line + ch, { size, font: F_REG(size) }) > w && line) {
      s.text(x, cy, line, { size, font: F_REG(size), color: C.GRAY3 })
      cy += 16
      line = ch
    } else line += ch
  }
  s.text(x, cy, line, { size, font: F_REG(size), color: C.GRAY3 })
  return cy + 16
}

/** 分组小节标题（真机灰字粗体） */
export function sectionHeader(s: Screen, text: string, x: number, y: number) {
  s.text(x, y, text, { size: 14, font: F_BOLD(14), color: C.HDR_GRAY })
}

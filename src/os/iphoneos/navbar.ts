import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { gloss, rrStroke } from './graphics'

export const NAV_Y = 20
export const NAV_H = 44

export interface NavRightButton {
  title: string
  bold?: boolean
  /** 蓝色文字态（在白底导航栏上） */
  light?: boolean
}

/**
 * 蓝色导航栏（y20–64，状态栏之下）：标题居中白字；
 * 左侧可选返回按钮（‹ 上级标题）；右侧可选文字按钮。
 */
export function drawNavBar(
  s: Screen,
  opts: { title: string; back?: string; right?: NavRightButton },
) {
  gradBar(s)
  // 标题
  s.textCenter(160, NAV_Y + 12, opts.title, { size: 19, font: F_BOLD(19), color: C.WHITE })
  // 返回按钮
  if (opts.back !== undefined) {
    const label = opts.back.length > 9 ? opts.back.slice(0, 9) : opts.back
    const w = Math.max(52, s.measure(label, { size: 13, font: F_REG(13) }) + 22)
    rrStroke(s, 6, NAV_Y + 7, w, 30, 5, C.WHITE)
    drawChevron(s, 11, NAV_Y + 22, C.WHITE)
    s.text(20, NAV_Y + 15, label, { size: 13, font: F_REG(13), color: C.WHITE })
  }
  // 右侧按钮
  if (opts.right) {
    const font = opts.right.bold ? F_BOLD(13) : F_REG(13)
    s.textRight(314, NAV_Y + 15, opts.right.title, { size: 13, font, color: opts.right.light ? C.BLUE : C.WHITE })
  }
}

/** 白底导航栏（如 Mail 某些页/Maps）：黑字 */
export function drawNavBarLight(
  s: Screen,
  opts: { title: string; back?: string; right?: NavRightButton },
) {
  s.fillRect(0, NAV_Y, 320, NAV_H, C.WHITE)
  s.fillRect(0, NAV_Y + NAV_H - 1, 320, 1, C.GRAY5)
  s.textCenter(160, NAV_Y + 12, opts.title, { size: 19, font: F_BOLD(19), color: C.INK })
  if (opts.back !== undefined) {
    const label = opts.back.length > 9 ? opts.back.slice(0, 9) : opts.back
    const w = Math.max(52, s.measure(label, { size: 13, font: F_REG(13) }) + 22)
    rrStroke(s, 6, NAV_Y + 7, w, 30, 5, C.BLUE)
    drawChevron(s, 11, NAV_Y + 22, C.BLUE)
    s.text(20, NAV_Y + 15, label, { size: 13, font: F_REG(13), color: C.BLUE })
  }
  if (opts.right) {
    const font = opts.right.bold ? F_BOLD(13) : F_REG(13)
    s.textRight(314, NAV_Y + 15, opts.right.title, { size: 13, font, color: C.BLUE })
  }
}

/** 导航栏点按命中：返回 'back' | 'right' | null */
export function navTap(x: number, y: number): 'back' | 'right' | null {
  if (y < NAV_Y || y >= NAV_Y + NAV_H) return null
  if (x < 80) return 'back'
  if (x > 240) return 'right'
  return null
}

function gradBar(s: Screen) {
  const [start, n] = R.NAV
  for (let j = 0; j < NAV_H; j++) {
    const t = Math.floor((j / (NAV_H - 1)) * (n - 1))
    s.fillRect(0, NAV_Y + j, 320, 1, start + t)
  }
  gloss(s, 0, NAV_Y, 320, NAV_H, 0, C.WHITE, 3)
}

/** 导航栏返回箭头 ‹（两段斜线，加粗） */
function drawChevron(s: Screen, x: number, cy: number, v: number) {
  for (let t = -1; t <= 1; t++) {
    s.line(x + 5, cy - 6 + t, x, cy + t, v)
    s.line(x, cy + t, x + 5, cy + 6 + t, v)
  }
}

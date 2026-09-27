import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rr, rrGrad, rrStroke, disc } from './graphics'

/** UISwitch：宽 48 高 27；ON 蓝底白钮（真机 ON 色为饱和蓝） */
export function drawSwitch(s: Screen, x: number, y: number, on: boolean) {
  if (on) {
    rrGrad(s, x, y, 48, 27, 13, R.BLUE_BTN)
    disc(s, x + 48 - 14, y + 13, 11, C.WHITE)
  } else {
    rr(s, x, y, 48, 27, 13, C.GRAY4)
    disc(s, x + 14, y + 13, 11, C.WHITE)
  }
}

/** 灰色 ›（列表行尾） */
export function chevron(s: Screen, x: number, cy: number) {
  for (let t = -1; t <= 1; t++) {
    s.line(x, cy - 5 + t, x + 6, cy + t, C.GRAY4)
    s.line(x + 6, cy + t, x, cy + 5 + t, C.GRAY4)
  }
}

/** 蓝色详情箭头 ⓘ 式圆按钮（Maps 用） */
export function detailButton(s: Screen, cx: number, cy: number) {
  disc(s, cx, cy, 9, C.WHITE)
  disc(s, cx, cy, 8, C.BLUE)
  s.textCenter(cx, cy - 6, '›', { size: 13, font: F_BOLD(13), color: C.WHITE })
}

/** 蓝色圆角按钮（导航栏外的普通按钮） */
export function blueButton(s: Screen, x: number, y: number, w: number, h: number, label: string) {
  rrGrad(s, x, y, w, h, 8, R.BLUE_BTN)
  s.textCenter(x + (w >> 1), y + (h >> 1) - 7, label, { size: 16, font: F_BOLD(16), color: C.WHITE })
}

/** 红色圆角按钮（删除/危险） */
export function redButton(s: Screen, x: number, y: number, w: number, h: number, label: string) {
  rrGrad(s, x, y, w, h, 8, R.RED_BTN)
  s.textCenter(x + (w >> 1), y + (h >> 1) - 7, label, { size: 16, font: F_BOLD(16), color: C.WHITE })
}

/** 绿色圆角按钮（接听） */
export function greenButton(s: Screen, x: number, y: number, w: number, h: number, label: string) {
  rrGrad(s, x, y, w, h, 8, R.GREEN_BTN)
  s.textCenter(x + (w >> 1), y + (h >> 1) - 7, label, { size: 16, font: F_BOLD(16), color: C.WHITE })
}

/** Springboard 角标：红圆白字（右上角） */
export function badge(s: Screen, cx: number, cy: number, n: number) {
  const text = n > 99 ? '…' : String(n)
  const tw = s.measure(text, { size: 13, font: F_BOLD(13) })
  const w = Math.max(20, tw + 10)
  rr(s, cx - w, cy - 9, w, 18, 9, C.BADGE_RED)
  rrStroke(s, cx - w, cy - 9, w, 18, 9, C.WHITE)
  s.textCenter(cx - (w >> 1), cy - 7, text, { size: 13, font: F_BOLD(13), color: C.WHITE })
}

/** 分段选中蓝条按钮（键盘上方候选区等） */
export function pill(s: Screen, x: number, y: number, w: number, h: number, label: string, active: boolean) {
  if (active) rrGrad(s, x, y, w, h, 6, R.BLUE_BTN)
  else rr(s, x, y, w, h, 6, C.GRAY6)
  s.textCenter(x + (w >> 1), y + (h >> 1) - 5, label, {
    size: 12, font: active ? F_BOLD(12) : F_REG(12), color: active ? C.WHITE : C.INK,
  })
}

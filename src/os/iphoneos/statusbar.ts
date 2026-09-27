import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD } from './fonts'

export const SB_H = 20
export const W = 320

/**
 * 状态栏（真机 20px）。
 * 布局：左 信号柱+运营商+Wi-Fi（或 EDGE "E"）｜中 时钟｜右 蓝牙+电池。
 * dark：Springboard/锁屏；light：应用内。
 */
export function statusBar(
  s: Screen,
  opts: {
    dark: boolean; batteryPct: number; clock: string; airplane?: boolean
    wifi?: boolean; bluetooth?: boolean
    /** 状态栏叠在应用彩色导航栏上：不画底色、用白图标 */
    onBar?: boolean
  },
) {
  const fg = opts.dark || opts.onBar ? C.WHITE : C.INK
  if (opts.dark) {
    s.fillRect(0, 0, W, SB_H, C.BLACK)
  } else if (!opts.onBar) {
    gradRow(s, R.STAT_L)
  }
  // 底部分隔线（浅色独立状态栏）
  if (!opts.dark && !opts.onBar) s.fillRect(0, SB_H - 1, W, 1, C.GRAY5)

  let x = 6
  if (opts.airplane) {
    // 飞行模式：小飞机（橙色）
    airplaneIcon(s, x, 3, C.ORANGE)
    x += 20
  } else {
    // 信号柱 5 根（真机圆角小条：顶端圆角、底端平齐）
    for (let i = 0; i < 5; i++) {
      const bh = 4 + i * 2
      const ty = SB_H - 4 - bh
      s.fillRect(x + i * 4, ty + 1, 3, bh - 1, fg)
      s.pset(x + i * 4 + 1, ty, fg)
    }
    x += 22
    s.text(x, 3, 'AT&T', { size: 12, font: F_BOLD(12), color: fg })
    x += s.measure('AT&T', { size: 12, font: F_BOLD(12) }) + 6
    // Wi-Fi 已连接：Wi-Fi 图标；否则 EDGE "E"
    if (opts.wifi === false) {
      s.text(x, 3, 'E', { size: 12, font: F_BOLD(12), color: fg })
    } else {
      wifiIcon(s, x + 6, 17, fg)
    }
  }

  // 居中时钟
  s.textCenter(W >> 1, 3, opts.clock, { size: 13, font: F_BOLD(13), color: fg })

  // 蓝牙：真机只在开启时显示
  if (opts.bluetooth === true && !opts.airplane) btIcon(s, W - 48, 3, fg)

  // 右：电池（外框 + 电量）
  const bx = W - 30
  const by = 5
  s.fillRect(bx, by, 1, 11, fg)
  s.fillRect(bx + 23, by, 1, 11, fg)
  s.fillRect(bx, by, 24, 1, fg)
  s.fillRect(bx, by + 10, 24, 1, fg)
  s.fillRect(bx + 25, by + 4, 2, 4, fg)
  const cells = Math.max(1, Math.round(opts.batteryPct / 100 * 20))
  const batColor = opts.batteryPct <= 20 ? C.RED : opts.dark ? C.GREEN : C.GREEN_D
  s.fillRect(bx + 2, by + 2, Math.min(cells, 20), 7, batColor)
}

function gradRow(s: Screen, rng: readonly [number, number]) {
  const [start, n] = rng
  for (let j = 0; j < SB_H; j++) {
    const t = Math.floor((j / (SB_H - 1)) * (n - 1))
    s.fillRect(0, j, W, 1, start + t)
  }
}

/** 小飞机图标（飞行模式） */
function airplaneIcon(s: Screen, x: number, y: number, v: number) {
  const rows = [
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '.###.',
    '#...#',
  ]
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] === '#') s.pset(x + i, y + j, v)
  })
}

/** 时钟字符串（真机 1.0：12 小时制带 AM/PM） */
export function clockString(d: Date): string {
  let h24 = d.getHours()
  const m = d.getMinutes()
  const ap = h24 < 12 ? 'AM' : 'PM'
  let h = h24 % 12
  if (h === 0) h = 12
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`
}

/** Wi-Fi 图标：3 道弧 + 底部圆点；(ox,oy) 为弧心 */
function wifiIcon(s: Screen, ox: number, oy: number, v: number) {
  s.fillRect(ox - 1, oy - 1, 2, 2, v)
  for (const r of [3, 5, 7]) {
    for (let a = -45; a <= 45; a += 9) {
      const rad = (a * Math.PI) / 180
      s.pset(ox + Math.round(r * Math.sin(rad)), oy - Math.round(r * Math.cos(rad)), v)
    }
  }
}

/** 蓝牙符文（3×8 点阵） */
function btIcon(s: Screen, x: number, y: number, v: number) {
  const rows = ['.#.', '##.', '.#.', '###', '.#.', '.##', '##.', '.#.']
  rows.forEach((r, j) => {
    for (let i = 0; i < 3; i++) if (r[i] === '#') s.pset(x + i, y + j, v)
  })
}

/** 英文完整星期（锁屏用，真机 1.0 为英文系统风格） */
export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
export const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function lockDateLine(d: Date, lang: 'zh' | 'en', months: string[]): string {
  if (lang === 'en') return `${WEEKDAYS_EN[d.getDay()]} ${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
  return `${WEEKDAYS_ZH[d.getDay()]} ${months[d.getMonth()]}${d.getDate()}日`
}

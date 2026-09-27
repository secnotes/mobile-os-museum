import type { Screen } from '../../hal/screen'
import { C } from './palette'

/** Android 屏幕几何：状态栏 / 内容区 */
export const W = 320
export const H = 480
export const STATUS_H = 25

/** 4×4 有序 Bayer 抖动阈值矩阵（0–15） */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const

/** 圆角矩形（Android 控件观感）：填充 + 1px 描边 */
export function roundRect(
  s: Screen,
  x: number, y: number, w: number, h: number, r: number,
  fill: number, stroke: number | null,
) {
  // 逐像素：四角 (dx²+dy² > r²) 之外的属于圆角矩形
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
        // 无描边时边缘像素仍需填充，否则圆角接缝处会漏出底色切缝
        s.pset(x + dx, y + dy, stroke ?? fill)
      } else if (fill >= 0) {
        s.pset(x + dx, y + dy, fill)
      }
    }
}

/**
 * 状态栏（Android 1.x 真机样式）：浅灰金属渐变底 + 深色图标文字。
 * 左=通知图标（未读信封/静音）；右=信号 → 电量 → 时钟。
 * 真机 1.x 状态栏不放运营商名（运营商在下拉面板头部与锁屏上）。
 */
export function statusBar(
  s: Screen,
  opts: { unread: boolean; batteryPct: number; carrier: string; clock: string; signalBars: number; silent?: boolean },
) {
  // 浅灰 → 金属灰竖向渐变（1.x 状态栏质感）：PALE 底 + GRAY 用 4×4 Bayer 有序抖动
  // 随深度加密（随机偏移的抖动在小尺寸下会读成雪花噪点），底部 1px 深灰压边
  s.fillRect(0, 0, W, STATUS_H, C.PALE)
  for (let y = 3; y < STATUS_H - 1; y++) {
    const th = Math.round(((y - 3) / (STATUS_H - 4)) * 15)
    for (let x = 0; x < W; x++) {
      if (BAYER4[((y & 3) << 2) | (x & 3)]! <= th) s.pset(x, y, C.GRAY)
    }
  }
  s.fillRect(0, STATUS_H - 1, W, 1, C.METAL)
  const INK = C.INK
  let x = 6
  // 左侧：未读短信信封（深）
  if (opts.unread) {
    const bx = x
    for (let i = 0; i < 9; i++) s.pset(bx + i, 6, INK)
    for (let i = 0; i < 9; i++) s.pset(bx + i, 13, INK)
    for (let i = 0; i < 8; i++) s.pset(bx, 6 + i, INK)
    for (let i = 0; i < 8; i++) s.pset(bx + 8, 6 + i, INK)
    for (let i = 0; i < 4; i++) s.pset(bx + 1 + i * 2, 8 + (i > 1 ? 1 : 0), INK)
    x += 14
  }
  // 静音：铃铛 + 斜杠（深）
  if (opts.silent) {
    s.fillRect(x + 3, 6, 5, 6, INK)
    s.fillRect(x + 4, 12, 3, 2, INK)
    s.line(x, 13, x + 10, 5, INK)
    x += 14
  }
  // 右侧真机顺序：信号 → 电量 → 时钟（深色，时钟最右）
  const clockW = s.measure(opts.clock, { size: 11 })
  const clockX = W - 5 - clockW
  s.text(clockX, 6, opts.clock, { size: 11, color: INK })
  // 电池（深框 + 电量格）
  const bx = clockX - 6 - 17
  const cells = Math.ceil(opts.batteryPct / 25)
  s.fillRect(bx, 7, 15, 1, INK)
  s.fillRect(bx, 15, 15, 1, INK)
  s.fillRect(bx, 7, 1, 9, INK)
  s.fillRect(bx + 14, 7, 1, 9, INK)
  s.fillRect(bx + 15, 9, 2, 5, INK)
  for (let i = 0; i < 4; i++)
    if (i < cells) s.fillRect(bx + 2 + i * 3, 9, 2, 5, INK)
  // 信号（深色 4 级阶梯）
  const sx = bx - 6 - 17
  for (let i = 0; i < 4; i++) {
    const bh = 3 + i * 2
    if (i < opts.signalBars) s.fillRect(sx + i * 4, 16 - bh, 2, bh, INK)
  }
}

/** T-Mobile 美区固件时间：12 小时制 + AM/PM（真机状态栏样式） */
export function time12(d: Date): string {
  const ap = d.getHours() >= 12 ? 'PM' : 'AM'
  let h = d.getHours() % 12
  if (h === 0) h = 12
  return `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`
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

/** Android 1.0 应用图标底板：28×28 圆角块 + 顶部高光层（旧版系统的立体图标观感） */
export function iconTile(s: Screen, x: number, y: number, base: number, hi: number) {
  roundRect(s, x, y, 28, 28, 7, base, null)
  roundRect(s, x + 2, y + 2, 24, 11, 4, hi, null)
}

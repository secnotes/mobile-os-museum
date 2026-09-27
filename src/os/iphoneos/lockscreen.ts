import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rr, rrGrad, rrStroke, scrim } from './graphics'
import { statusBar, clockString, lockDateLine } from './statusbar'
import { drawEarthWallpaper, drawAquaWallpaper } from './wallpaper'
import type { IpStrings } from './strings'

const TRACK_X = 8
const TRACK_Y = 424
const TRACK_W = 304
const KNOB_W = 62
const MAX_SLIDE = TRACK_W - KNOB_W

/**
 * 锁屏：大时钟 + 日期 + slide to unlock（1.0 样式）。
 * mode answer：来电在锁屏时 slide to answer。
 */
export class LockScreen {
  progress = 0
  private sliding = false
  private startX = 0
  animating = false

  draw(
    s: Screen,
    opts: { now: Date; t: number; mode: 'unlock' | 'answer'; name?: string; lang: 'zh' | 'en'; str: IpStrings; batteryPct: number; wallpaper?: number;
      /** 覆盖滑条标签（如 slide to power off） */
      label?: string;
      /** 关机滑条等：不画大时钟/日期与状态栏 */
      noClock?: boolean;
      /** 状态栏标志（飞行模式/蓝牙/Wi-Fi，来自设置存档） */
      sb?: { airplane?: boolean; bluetooth?: boolean; wifi?: boolean } },
  ) {
    s.fillRect(0, 0, 320, 480, C.BLACK)
    if (opts.wallpaper === 1) drawAquaWallpaper(s)
    else if (opts.wallpaper !== 2) drawEarthWallpaper(s)
    if (opts.noClock) {
      // 仅滑条（关机画面）
    } else if (opts.mode === 'answer' && opts.name) {
      // 来电锁屏（真机 1.0）：无大时钟，壁纸压暗 + 大姓名居中 + slide to answer
      scrim(s, 0, 0, 320, 480, C.BLACK, 2)
      statusBar(s, { dark: true, batteryPct: opts.batteryPct, clock: clockString(opts.now), ...opts.sb })
      s.textCenter(160, 196, opts.name, { size: 34, font: F_BOLD(34), color: C.WHITE })
    } else {
      statusBar(s, { dark: true, batteryPct: opts.batteryPct, clock: clockString(opts.now), ...opts.sb })
      // 大时钟（真机 1.0：视觉中心约在屏幕 1/3 处）
      const clk = clockString(opts.now)
      s.textCenter(160, 108, clk, { size: 60, font: F_BOLD(60), color: C.WHITE })
      // 日期
      const date = lockDateLine(opts.now, opts.lang, opts.str.months)
      s.textCenter(160, 184, date, { size: 18, font: F_REG(18), color: C.WHITE })
    }

    // 滑动条
    rr(s, TRACK_X, TRACK_Y, TRACK_W, 40, 20, C.SLIDER_TRACK)
    rrStroke(s, TRACK_X, TRACK_Y, TRACK_W, 40, 20, C.GRAY2)
    // 标签（移动高光扫过文字）
    const label = opts.label ?? (opts.mode === 'answer' ? opts.str.slideAnswer : opts.str.unlock)
    this.shimmerText(s, label, TRACK_Y + 12, opts.t)
    // 滑块（真机滑块中央刻有 › 箭头）
    const kx = TRACK_X + Math.round(this.progress * MAX_SLIDE)
    rrGrad(s, kx, TRACK_Y + 1, KNOB_W, 38, 19, R.KEY)
    rrStroke(s, kx, TRACK_Y + 1, KNOB_W, 38, 19, C.GRAY4)
    const ax = kx + (KNOB_W >> 1), ay = TRACK_Y + 20
    for (let t = -1; t <= 1; t++) {
      s.line(ax - 4, ay - 6 + t, ax + 3, ay + t, C.GRAY3)
      s.line(ax + 3, ay + t, ax - 4, ay + 6 + t, C.GRAY3)
    }
  }

  /** 拖拽；x=当前，sx=起点；在滑条区域内才生效 */
  onDrag(x: number, y: number, sx: number) {
    if (!this.sliding) {
      if (y < TRACK_Y - 12 || y > TRACK_Y + 52) return
      this.sliding = true
      this.startX = sx
      this.animating = false
    }
    const d = x - this.startX
    this.progress = Math.max(0, Math.min(1, d / MAX_SLIDE))
  }

  /** 抬手：progress 足够 → 'open'，否则弹回（animating） */
  onEnd(): 'open' | null {
    this.sliding = false
    if (this.progress >= 0.72) return 'open'
    this.animating = true
    return null
  }

  /** 回弹推进；dt 秒 */
  step(dt: number): boolean {
    if (!this.animating) return false
    this.progress += (0 - this.progress) * Math.min(1, dt * 12)
    if (this.progress < 0.01) {
      this.progress = 0
      this.animating = false
      return false
    }
    return true
  }

  /** 文字高光扫过：一个 6 字符宽的亮窗随时间循环移动 */
  private shimmerText(s: Screen, text: string, y: number, t: number) {
    const size = 18
    const totalW = s.measure(text, { size, font: F_REG(size) })
    let x = 160 - (totalW >> 1)
    // 亮窗位置：-3..len+3 循环
    const cycle = (t % 2.4) / 2.4
    const win = -3 + cycle * (text.length + 6)
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const d = Math.abs(i - win)
      if (d < 3.2) s.text(x, y, ch, { size, font: d < 1.4 ? F_BOLD(size) : F_REG(size), color: C.WHITE })
      else s.text(x, y, ch, { size, font: F_REG(size), color: C.LABEL_GRAY })
      x += s.measure(ch, { size, font: F_REG(size) })
    }
  }
}

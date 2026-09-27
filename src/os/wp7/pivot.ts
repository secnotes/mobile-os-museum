/**
 * Metro Pivot 列表组件：顶部一排浅色大标题（选中白、其余灰），
 * 左右滑动切换分页（复用 OS 的 Fx 做横向滑页），上下滑动纵向滚动，
 * 行支持开关（WP 滑动开关）与右箭头两种控件。
 * 设置 / 闹钟等长列表页统一使用。
 */
import type { AppContext } from '../../kernel/types'
import type { DeviceKey } from '../../hal/input'
import type { Screen } from '../../hal/screen'
import { C } from './palette'
import { W, TRAY_H, F_LIGHT, F_REG, roundRect, tray } from './ui'
import { PIVOT_TICK } from './ringtones'
import type { Fx } from './anim'
import { slideOpen, slideClose } from './anim'

export interface Row {
  title: string
  sub?: string
  h?: number
  /** 右侧控件：toggle=滑动开关；chevron=› 箭头 */
  control?: 'toggle' | 'chevron'
  /** toggle 当前态 */
  on?: boolean
  /** 点按（开关/箭头/整行） */
  tap?: () => void
  /** 自定义整行内容（此时标题不自动绘制） */
  custom?: (s: Screen, x: number, y: number, w: number) => void
}

export interface PivotDef {
  title: string
  rows: () => Row[]
}

const TITLE_Y = TRAY_H + 10
const CONTENT_Y = TRAY_H + 66
const LEFT = 24

export class ListPivot {
  private idx = 0
  private scroll = 0
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext, private defs: PivotDef[]) {
    this.offs.push(ctx.onKey((k) => this.onKey(k)))
    this.offs.push(ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(ctx.onSwipe((dir) => this.swipe(dir)))
    this.offs.push(ctx.onLang(() => this.draw()))
  }

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  get fx(): Fx | null {
    return (this.ctx.host.fx as Fx | undefined) ?? null
  }

  private accent(): number {
    return this.ctx.host.getAccent?.() ?? C.BLUE
  }

  // ---------- 输入 ----------

  private onKey(k: DeviceKey) {
    if (k === 'back') this.ctx.exit()
    else if (k === 'left') this.goto(this.idx - 1, false)
    else if (k === 'right') this.goto(this.idx + 1, true)
    else if (k === 'up' || k === 'down') {
      this.scroll += k === 'up' ? -ROW_STEP : ROW_STEP
      this.clampScroll()
      this.draw()
    }
  }

  swipe(dir: 'up' | 'down' | 'left' | 'right') {
    if (dir === 'left') this.goto(this.idx + 1, true)
    else if (dir === 'right') this.goto(this.idx - 1, false)
    else {
      this.scroll += dir === 'up' ? ROW_STEP : -ROW_STEP
      this.clampScroll()
      this.draw()
    }
  }

  private goto(i: number, forward: boolean) {
    if (i < 0 || i >= this.defs.length || i === this.idx) return
    const s = this.ctx.screen
    const fx = this.fx
    if (fx) {
      const before = s.snapshot()
      this.idx = i
      this.scroll = 0
      this.draw()
      const after = s.snapshot()
      if (forward) slideOpen(fx, s, W, this.ctx.device.screen.h, before, after, () => this.endAnim())
      else slideClose(fx, s, W, this.ctx.device.screen.h, before, after, () => this.endAnim())
    } else {
      this.idx = i
      this.scroll = 0
      this.draw()
    }
    this.ctx.audio.melody(PIVOT_TICK, 200)
  }

  private endAnim() {
    this.ctx.screen.clearOverlays()
    this.draw()
  }

  private onTap(x: number, y: number) {
    // 标题行：点标题切换
    if (y < CONTENT_Y - 10) {
      let tx = LEFT
      for (let i = 0; i < this.defs.length; i++) {
        const title = this.defs[i]!.title
        const tw = this.ctx.screen.measure(title, { size: 32, font: F_LIGHT(32) }) + 36
        if (x >= tx && x < tx + tw) {
          this.goto(i, i > this.idx)
          return
        }
        tx += tw
      }
      return
    }
    const rows = this.defs[this.idx]!.rows()
    let ry = CONTENT_Y - this.scroll
    for (const r of rows) {
      const h = r.h ?? (r.sub ? 82 : 64)
      if (y >= ry && y < ry + h) {
        r.tap?.()
        return
      }
      ry += h
    }
  }

  private contentH(): number {
    let h = CONTENT_Y
    for (const r of this.defs[this.idx]!.rows()) h += r.h ?? (r.sub ? 82 : 64)
    return h
  }

  private clampScroll() {
    const H = this.ctx.device.screen.h
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.contentH() - H)))
  }

  // ---------- 绘制 ----------

  draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const H = s.h
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    // Pivot 标题
    let tx = LEFT
    this.defs.forEach((p, i) => {
      const selected = i === this.idx
      const w = s.measure(p.title, { size: 32, font: F_LIGHT(32) })
      s.text(tx, TITLE_Y, p.title, {
        size: 32, font: F_LIGHT(32), color: selected ? C.WHITE : C.GRAY,
      })
      tx += w + 36
    })
    // 行
    const rows = this.defs[this.idx]!.rows()
    let ry = CONTENT_Y - this.scroll
    for (const r of rows) {
      const h = r.h ?? (r.sub ? 82 : 64)
      if (ry > TRAY_H && ry < H) {
        if (r.custom) r.custom(s, LEFT, ry, W - LEFT * 2)
        else this.drawRow(r, ry, h)
      }
      ry += h
    }
    s.render()
  }

  private drawRow(r: Row, ry: number, h: number) {
    const s = this.ctx.screen
    if (r.sub) {
      s.text(LEFT, ry, r.title, { size: 26, font: F_REG(26), color: C.WHITE })
      s.text(LEFT, ry + 34, r.sub, { size: 20, font: F_REG(20), color: C.GRAY })
    } else {
      s.text(LEFT, ry + 2, r.title, { size: 26, font: F_REG(26), color: C.WHITE })
    }
    // 分隔线
    s.fillRect(LEFT, ry + h - 2, W - LEFT * 2, 1, C.DIM)
    if (r.control === 'chevron') {
      for (let i = 0; i < 14; i++) {
        const w = 3
        s.fillRect(W - 36 + i, ry + h / 2 - 12 + i, w, 24 - i * 2, C.WHITE)
      }
    } else if (r.control === 'toggle') {
      this.drawSwitch(W - 78, ry + h / 2 - 12, !!r.on)
    }
  }

  /** WP 滑动开关：46×24 圆角轨道 + 白色圆钮 */
  private drawSwitch(x: number, y: number, on: boolean) {
    const s = this.ctx.screen
    const accent = this.accent()
    if (on) roundRect(s, x, y, 56, 26, 13, accent, null)
    else roundRect(s, x, y, 56, 26, 13, C.DIM, C.GRAY)
    const kx = on ? x + 56 - 24 : x + 2
    for (let dy = 0; dy < 22; dy++)
      for (let dx = 0; dx < 22; dx++)
        if (dx * dx + dy * dy <= 121) s.pset(kx + dx, y + 2 + dy, C.WHITE)
  }
}

const ROW_STEP = 240

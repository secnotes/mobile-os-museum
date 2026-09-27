import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, rrStroke } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Calendar：月视图（事件圆点）↔ 日程视图（小时块）。
 */

interface CalEvent {
  dayKey: string // YYYY-M-D（当月）
  h: number
  title: string
  dur: number
}

type Mode = 'month' | 'day'

const WD = ['一', '二', '三', '四', '五', '六', '日']
const WD_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export class CalendarApp extends BBApp {
  private mode: Mode = 'month'
  private view = new Date()
  private selDay = new Date()
  private dayOff = 0
  private events: CalEvent[] = []

  protected onStart() {
    const now = new Date()
    this.view = new Date(now.getFullYear(), now.getMonth(), 1)
    this.selDay = now
    const zh = this.ctx.lang.get() === 'zh'
    this.events = [
      { dayKey: keyOf(dateAt(now, 2)), h: 10, dur: 1, title: zh ? '团队周会' : 'Team meeting' },
      { dayKey: keyOf(dateAt(now, 5)), h: 19, dur: 2, title: zh ? '家庭聚餐' : 'Family dinner' },
      { dayKey: keyOf(dateAt(now, 9)), h: 9, dur: 1, title: zh ? '看牙医' : 'Dentist' },
    ]
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'month') this.drawMonth()
    else this.drawDay()
    s.render()
  }

  private header(title: string) {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 36, 0, [C.WP2, 3])
    s.text(12, 8, title, { size: 19, color: C.WHITE })
  }

  private drawMonth() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    const title = en
      ? this.view.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      : `${this.view.getFullYear()}${en ? '' : '年'}${this.view.getMonth() + 1}${en ? '' : '月'}`
    this.header(title)
    const names = en ? WD_EN : WD
    const gx = 24, gy = 48, cw = 62, chH = 36
    names.forEach((w, i) => {
      const weekend = i >= 5
      s.text(gx + i * cw + cw / 2 - 4, gy - 2, w, {
        size: 13, color: weekend ? C.RED : C.G6,
      })
    })
    const first = new Date(this.view.getFullYear(), this.view.getMonth(), 1)
    const startDow = (first.getDay() + 6) % 7
    const daysInMonth = new Date(this.view.getFullYear(), this.view.getMonth() + 1, 0).getDate()
    const busyDays = new Set(
      this.events.map((e) => parseInt(e.dayKey.split('-')[2]!, 10)),
    )
    for (let d = 1; d <= daysInMonth; d++) {
      const idx = startDow + d - 1
      const r = Math.floor(idx / 7), c = idx % 7
      const x = gx + c * cw, y = gy + r * chH
      const isSel = sameDay(this.selDay, new Date(this.view.getFullYear(), this.view.getMonth(), d))
      const isToday = sameDay(new Date(), new Date(this.view.getFullYear(), this.view.getMonth(), d))
      if (isSel) rr(s, x + 2, y + 1, cw - 6, chH - 4, 5, C.SELECT)
      else if (isToday) rrStroke(s, x + 2, y + 1, cw - 6, chH - 4, 5, C.RED)
      s.text(x + cw / 2 - 5, y + 4, String(d), {
        size: 16, color: isSel ? C.WHITE : c >= 5 ? C.RED : C.INK,
      })
      if (busyDays.has(d)) {
        s.fillRect(x + cw / 2 - 2, y + chH - 8, 4, 3, isSel ? C.WHITE : C.GOLD)
      }
    }
  }

  private drawDay() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    this.header(en
      ? this.selDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : `${this.selDay.getMonth() + 1}/${this.selDay.getDate()}`)
    const x0 = 52, w = 410, hourH = 30
    const dayEv = this.events.filter((e) => e.dayKey === keyOf(this.selDay))
    for (let h = 7; h <= 21; h++) {
      const y = 40 + (h - 7) * hourH - this.dayOff
      if (y < 40 - hourH || y > 320) continue
      s.text(8, y + 8, `${String(h).padStart(2, '0')}:00`, { size: 11, color: C.G5 })
      s.fillRect(x0, y, w, 1, C.G2)
    }
    dayEv.forEach((e) => {
      const y = 40 + (e.h - 7) * hourH - this.dayOff
      rr(s, x0 + 4, y + 2, w - 12, e.dur * hourH - 4, 4, C.FIELD_BG)
      rrStroke(s, x0 + 4, y + 2, w - 12, e.dur * hourH - 4, 4, C.SELECT)
      s.text(x0 + 12, y + 8, e.title, { size: 14, color: C.SELECT })
    })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'month') this.monthKey(k)
    else this.dayKey(k)
  }

  private monthKey(k: DeviceKey) {
    if (k === 'left') this.changeMonth(-1)
    else if (k === 'right') this.changeMonth(1)
    else if (k === 'up') this.changeDay(-7)
    else if (k === 'down') this.changeDay(7)
    else if (k === 'ok') { this.mode = 'day'; this.dayOff = 0 }
    else return
    this.draw()
  }

  private dayKey(k: DeviceKey) {
    if (k === 'up') this.dayOff = Math.max(0, this.dayOff - 30)
    else if (k === 'down') this.dayOff += 30
    else if (k === 'back') this.mode = 'month'
    else return
    this.draw()
  }

  private changeMonth(d: number) {
    this.view = new Date(this.view.getFullYear(), this.view.getMonth() + d, 1)
    this.selDay = new Date(this.view.getFullYear(), this.view.getMonth(), Math.min(this.selDay.getDate(),
      new Date(this.view.getFullYear(), this.view.getMonth() + 1, 0).getDate()))
  }

  private changeDay(d: number) {
    const nd = new Date(this.selDay)
    nd.setDate(nd.getDate() + d)
    if (nd.getMonth() !== this.view.getMonth() || nd.getFullYear() !== this.view.getFullYear()) {
      this.view = new Date(nd.getFullYear(), nd.getMonth(), 1)
    }
    this.selDay = nd
  }

  protected menuItems(): MenuCommand[] {
    return this.mode === 'day'
      ? [{ label: this.str.back, fn: () => { this.mode = 'month'; this.draw() } }]
      : [{ label: this.str.ok, fn: () => { this.mode = 'day'; this.draw() } }]
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dateAt(base: Date, addDays: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + addDays)
  return d
}

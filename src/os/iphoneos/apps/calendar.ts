import type { Screen } from '../../../hal/screen'
import type { AppContext } from '../../../kernel/types'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad, rrStroke, gloss, gradV, disc } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp, type Bridge } from './common'
import { iconCalendar } from '../icons'
import { Scroller } from '../scroll'

interface CalEvent {
  day: string
  title: string
  place: string
  start: string
  end: string
}

type View = 'list' | 'day' | 'month'

const NAV_Y = 20
const NAV_H = 44
const TOOL_Y = 437
const TOOL_H = 43
// 月视图
const WEEK_Y = 90
const GRID_Y = 108
const CELL_H = 54
const CELL_W = 320 / 7
// 日视图
const DAY_STRIP_Y = 64
const DAY_START_H = 8
const DAY_ROWS = 12
const ROW_H = Math.floor((TOOL_Y - (DAY_STRIP_Y + 24)) / DAY_ROWS)
const GRID_TOP = DAY_STRIP_Y + 24

/**
 * 日历（真机 iPhone OS 1.0 样式）：
 * 顶部蓝钢导航栏；月视图（月份头/周日列/日期格）→ 日视图（时刻度议程）；
 * 底部蓝钢工具栏：Today + List/Day/Month 分段控件。1.0 事件仅从电脑同步，机上只读。
 */
class CalendarApp extends IphoneApp {
  private view: View = 'month'
  private cursor: Date
  private selDay: Date
  private events: CalEvent[] = []
  private listSc = new Scroller(() => this.draw())

  constructor(ctx: AppContext, b: Bridge) {
    super(ctx, b)
    const now = b.now()
    this.cursor = new Date(now.getFullYear(), now.getMonth(), 1)
    this.selDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  start() {
    super.start()
    const today = this.bridge.now()
    const k = dayKey(today)
    const k2 = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2))
    const en = this.ctx.lang.get() === 'en'
    const defs: CalEvent[] = [
      { day: k, title: en ? 'Team Meeting' : '团队会议', place: en ? 'Campus' : '公司', start: '10:00', end: '11:00' },
      { day: k2, title: en ? 'Dinner with Mom' : '和妈妈吃饭', place: '', start: '18:30', end: '20:00' },
    ]
    this.events = defs
    void this.ctx.store.get<CalEvent[]>('events').then((v) => {
      if (v) { this.events = v; this.draw() }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.WHITE)
    // 蓝钢导航栏（延伸到状态栏后，与真机一致）
    gradV(s, 0, 0, 320, NAV_Y + NAV_H, R.CAL_NAV)
    gloss(s, 0, NAV_Y, 320, NAV_H, 0, C.WHITE, 3)
    s.fillRect(0, NAV_Y + NAV_H - 1, 320, 1, C.GRAY4)
    s.textCenter(160, NAV_Y + 12, this.str.apps.calendar, { size: 19, font: F_BOLD(19), color: C.WHITE })
    statusBar(s, { dark: false, onBar: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })

    if (this.view === 'month') this.drawMonth(s)
    else if (this.view === 'day') this.drawDay(s)
    else this.drawList(s)
    this.drawToolbar(s)
  }

  // ---------- 月视图 ----------
  private drawMonth(s: Screen) {
    // 月份头
    s.text(12, 68, '‹', { size: 26, font: F_BOLD(26), color: C.INK })
    s.textRight(308, 68, '›', { size: 26, font: F_BOLD(26), color: C.INK })
    s.textCenter(160, 71, this.titleMonth(), { size: 18, font: F_BOLD(18), color: C.INK })
    // 周日列头
    for (let i = 0; i < 7; i++) {
      s.textCenter(Math.round(i * CELL_W + CELL_W / 2), WEEK_Y + 2, this.str.weekdayMin[i], {
        size: 11, font: F_BOLD(11), color: C.GRAY3,
      })
    }
    s.fillRect(0, WEEK_Y + 16, 320, 1, C.GRAY6)
    // 日期格
    const y0 = this.cursor.getFullYear()
    const m0 = this.cursor.getMonth()
    const first = new Date(y0, m0, 1).getDay()
    const dim = new Date(y0, m0 + 1, 0).getDate()
    const todayK = dayKey(this.bridge.now())
    const selK = dayKey(this.selDay)
    for (let i = 0; i < 42; i++) {
      const d = i - first + 1
      const col = i % 7
      const row = Math.floor(i / 7)
      const x = Math.round(col * CELL_W)
      const y = GRID_Y + row * CELL_H
      const inMonth = d >= 1 && d <= dim
      const date = new Date(y0, m0 + (d < 1 ? -1 : d > dim ? 1 : 0), inMonth ? d : d < 1 ? dim + d : d - dim)
      const key = dayKey(date)
      const isSel = key === selK
      const isToday = key === todayK
      if (isSel) rrGrad(s, x + 9, y + 5, 27, 27, 5, R.CAL_NAV)
      else if (isToday) rrStroke(s, x + 9, y + 5, 27, 27, 5, C.GRAY3)
      const numColor = !inMonth ? C.GRAY4 : isSel ? C.WHITE : C.INK
      s.textCenter(x + 22, y + 9, String(date.getDate()), { size: 16, font: F_REG(16), color: numColor })
      // 事件小圆点
      if (this.events.some((e) => e.day === key)) disc(s, x + 15, y + 35, 2, isSel ? C.WHITE : C.GRAY3)
      // 格线
      s.fillRect(0, y + CELL_H - 1, 320, 1, C.GRAY6)
      if (col > 0) s.fillRect(x, GRID_Y, 1, CELL_H * 6, C.GRAY6)
    }
  }

  // ---------- 日视图 ----------
  private drawDay(s: Screen) {
    // 日期扫条
    s.text(10, DAY_STRIP_Y + 4, '‹', { size: 24, font: F_BOLD(24), color: C.INK })
    s.textRight(310, DAY_STRIP_Y + 4, '›', { size: 24, font: F_BOLD(24), color: C.INK })
    const wd = this.str.weekdayLong[this.selDay.getDay()]
    const label = this.ctx.lang.get() === 'en'
      ? `${wd}, ${this.str.months[this.selDay.getMonth()].slice(0, 3)} ${this.selDay.getDate()}`
      : `${wd} ${this.selDay.getMonth() + 1}月${this.selDay.getDate()}日`
    s.textCenter(160, DAY_STRIP_Y + 8, label, { size: 14, font: F_BOLD(14), color: C.GRAY3 })
    // 时刻度
    for (let r = 0; r <= DAY_ROWS; r++) {
      const y = GRID_TOP + r * ROW_H
      s.fillRect(34, y, 286, 1, C.GRAY6)
      if (r < DAY_ROWS) {
        s.text(6, y + 3, this.hourLabel(DAY_START_H + r), { size: 10, font: F_REG(10), color: C.GRAY3 })
      }
    }
    s.fillRect(34, GRID_TOP, 1, ROW_H * DAY_ROWS, C.GRAY6)
    // 事件块
    const k = dayKey(this.selDay)
    for (const e of this.events) {
      if (e.day !== k) continue
      const sh = parseHour(e.start), eh = parseHour(e.end)
      const y = GRID_TOP + (sh - DAY_START_H) * ROW_H
      const h = Math.max(22, Math.round((eh - sh) * ROW_H) - 2)
      rrGrad(s, 38, y, 276, h, 6, R.SET_NAV)
      s.text(48, y + 5, e.title, { size: 14, font: F_BOLD(14), color: C.WHITE, maxWidth: 256 })
      if (h >= 38 && e.place) s.text(48, y + 23, e.place, { size: 11, font: F_REG(11), color: C.WHITE })
    }
  }

  // ---------- 列表视图 ----------
  private drawList(s: Screen) {
    const evs = this.sortedEvents()
    if (!evs.length) {
      s.textCenter(160, 120, this.str.noEvents, { size: 17, font: F_REG(17), color: C.GRAY3 })
      this.listSc.setContent(0, TOOL_Y - 64)
      return
    }
    let y = 64
    for (const g of this.groupEvents(evs)) {
      y += 22
      y += g.evs.length * 44
    }
    this.listSc.setContent(y - 64, TOOL_Y - 64)
    const off = this.listSc.offset
    let yy = 64
    for (const g of this.groupEvents(evs)) {
      const hy = yy - off
      if (hy >= 64 && hy < TOOL_Y) {
        s.fillRect(0, hy, 320, 22, C.GRAY7)
        s.text(12, hy + 4, this.groupLabel(g.day), { size: 13, font: F_BOLD(13), color: C.GRAY3 })
      }
      yy += 22
      for (const e of g.evs) {
        const ry = yy - off
        if (ry >= 64 && ry < TOOL_Y) {
          s.text(12, ry + 13, e.start, { size: 13, font: F_REG(13), color: C.GRAY3 })
          s.text(68, ry + 12, e.title, { size: 16, font: F_REG(16), color: C.INK, maxWidth: 240 })
          s.fillRect(68, ry + 43, 240, 1, C.GRAY6)
        }
        yy += 44
      }
    }
  }

  // ---------- 底部工具栏 ----------
  private drawToolbar(s: Screen) {
    gradV(s, 0, TOOL_Y, 320, TOOL_H, R.CAL_NAV)
    s.fillRect(0, TOOL_Y, 320, 1, C.GRAY4)
    // Today
    rrStroke(s, 8, TOOL_Y + 7, 56, 28, 6, C.WHITE)
    s.textCenter(36, TOOL_Y + 15, this.str.calToday, { size: 13, font: F_BOLD(13), color: C.WHITE })
    // 分段控件
    const sx = 84, sw = 228, sh = 30
    rr(s, sx, TOOL_Y + 6, sw, sh, 6, C.WHITE)
    rrStroke(s, sx, TOOL_Y + 6, sw, sh, 6, C.WHITE)
    const names = [this.str.calList, this.str.calDay, this.str.calMonth]
    const active = this.view === 'list' ? 0 : this.view === 'day' ? 1 : 2
    for (let i = 0; i < 3; i++) {
      const x = sx + i * 76
      if (i === active) rrGrad(s, x + 1, TOOL_Y + 7, 74, 28, 5, R.CAL_NAV)
      if (i > 0) s.fillRect(x, TOOL_Y + 12, 1, 18, C.GRAY5)
      s.textCenter(x + 38, TOOL_Y + 15, names[i], {
        size: 13, font: i === active ? F_BOLD(13) : F_REG(13), color: i === active ? C.WHITE : C.INK,
      })
    }
  }

  // ---------- 交互 ----------
  protected statusTap(): boolean {
    if (this.view !== 'list') return false
    this.listSc.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    if (y >= TOOL_Y) {
      if (x < 72) { this.goToday(); return }
      const idx = Math.floor((x - 84) / 76)
      const views: View[] = ['list', 'day', 'month']
      if (idx >= 0 && idx < 3 && views[idx] !== this.view) { this.view = views[idx]!; this.draw() }
      return
    }
    if (this.view === 'month') {
      if (y >= 64 && y < WEEK_Y) {
        if (x < 60) this.shiftMonth(-1)
        else if (x > 260) this.shiftMonth(1)
        return
      }
      if (y >= GRID_Y && y < GRID_Y + CELL_H * 6) {
        const col = Math.floor(x / CELL_W)
        const row = Math.floor((y - GRID_Y) / CELL_H)
        const first = new Date(this.cursor.getFullYear(), this.cursor.getMonth(), 1).getDay()
        const d = row * 7 + col - first + 1
        const y0 = this.cursor.getFullYear(), m0 = this.cursor.getMonth()
        const dim = new Date(y0, m0 + 1, 0).getDate()
        const date = new Date(y0, m0 + (d < 1 ? -1 : d > dim ? 1 : 0), d < 1 ? dim + d : d > dim ? d - dim : d)
        this.selDay = date
        this.cursor = new Date(date.getFullYear(), date.getMonth(), 1)
        this.view = 'day'
        this.draw()
      }
    } else if (this.view === 'day') {
      if (y >= DAY_STRIP_Y && y < DAY_STRIP_Y + 24) {
        if (x < 60) this.shiftDay(-1)
        else if (x > 260) this.shiftDay(1)
      }
    } else {
      // 列表点行 → 日视图
      const off = this.listSc.offset
      let yy = 64
      const evs = this.sortedEvents()
      for (const g of this.groupEvents(evs)) {
        yy += 22
        for (const _e of g.evs) {
          if (y >= yy - off && y < yy - off + 44) {
            this.selDay = parseDay(g.day)
            this.cursor = new Date(this.selDay.getFullYear(), this.selDay.getMonth(), 1)
            this.view = 'day'
            this.draw()
            return
          }
          yy += 44
        }
      }
    }
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.view === 'list' && y >= 64 && y < TOOL_Y) this.listSc.onDrag(y, sy)
  }

  protected dragEnd() {
    this.listSc.onEnd()
  }

  protected frame(dt: number) {
    if (this.listSc.step(dt)) return
  }

  // ---------- 辅助 ----------
  private titleMonth(): string {
    const m = this.str.months[this.cursor.getMonth()]
    return this.ctx.lang.get() === 'en'
      ? `${m} ${this.cursor.getFullYear()}`
      : `${this.cursor.getFullYear()} ${m}`
  }

  private hourLabel(h: number): string {
    if (this.ctx.lang.get() === 'en') {
      if (h === 0) return '12 AM'
      if (h === 12) return '12 PM'
      return h < 12 ? `${h} AM` : `${h - 12} PM`
    }
    return `${h}:00`
  }

  private sortedEvents(): CalEvent[] {
    return [...this.events].sort((a, b) =>
      a.day === b.day ? a.start.localeCompare(b.start) : a.day.localeCompare(b.day))
  }

  private groupEvents(evs: CalEvent[]): Array<{ day: string; evs: CalEvent[] }> {
    const groups: Array<{ day: string; evs: CalEvent[] }> = []
    for (const e of evs) {
      const g = groups.find((x) => x.day === e.day)
      if (g) g.evs.push(e)
      else groups.push({ day: e.day, evs: [e] })
    }
    return groups
  }

  private groupLabel(day: string): string {
    const d = parseDay(day)
    const today = this.bridge.now()
    const t1 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diff = Math.round((d.getTime() - t1.getTime()) / 86400000)
    if (this.ctx.lang.get() === 'en') {
      if (diff === 0) return 'Today'
      if (diff === 1) return 'Tomorrow'
      return `${this.str.weekdayLong[d.getDay()]}, ${this.str.months[d.getMonth()].slice(0, 3)} ${d.getDate()}`
    }
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    return `${this.str.weekdayLong[d.getDay()]} ${d.getMonth() + 1}月${d.getDate()}日`
  }

  private goToday() {
    const now = this.bridge.now()
    this.selDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    this.cursor = new Date(now.getFullYear(), now.getMonth(), 1)
    if (this.view === 'list') {
      // 跳到今天的组首
      let yy = 64
      for (const g of this.groupEvents(this.sortedEvents())) {
        if (g.day === dayKey(this.selDay)) { this.listSc.offset = Math.max(0, yy - 64); break }
        yy += 22 + g.evs.length * 44
      }
    }
    this.draw()
  }

  private shiftMonth(d: number) {
    this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + d, 1)
    this.draw()
  }

  private shiftDay(d: number) {
    const nd = new Date(this.selDay.getFullYear(), this.selDay.getMonth(), this.selDay.getDate() + d)
    this.selDay = nd
    this.cursor = new Date(nd.getFullYear(), nd.getMonth(), 1)
    this.draw()
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDay(k: string): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}
function parseHour(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) + (m ?? 0) / 60
}

export const calendarFactory = miniApp('calendar', '日历', iconCalendar, (ctx, b) => new CalendarApp(ctx, b))

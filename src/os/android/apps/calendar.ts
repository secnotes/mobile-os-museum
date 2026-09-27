import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile } from '../ui'

/** 2008 年 10 月：1 日是周三，共 31 天，22 日 = G1 发布日 */
const YEAR = 2008
const FIRST_DOW = 3 // 周三
const DAYS = 31
const LAUNCH_DAY = 22

/**
 * Android 1.0 日历：月视图网格 + 轨迹球选日，确认看当日日程。
 * 2008-10-22 是 G1 发布日（有日程），其余为空。
 */
export const calendarApp: MiniApp = {
  id: 'calendar',
  name: '日历',
  nameEn: 'Calendar',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 白底 + 顶部红条 + 大日期（真机日历图标显示 31）
    s.fillRect(x + 4, y + 4, 20, 4, C.RED)
    s.text(x + 7, y + 11, '31', { size: 12, color: C.INK })
  },
  start(ctx: AppContext) {
    const ui = new CalendarUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class CalendarUI {
  private sel = LAUNCH_DAY
  private showEvent = false
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.showEvent) {
      if (k === 'back' || k === 'ok') {
        this.showEvent = false
        this.draw()
      }
      return
    }
    switch (k) {
      case 'left':
        this.sel = Math.max(1, this.sel - 1)
        break
      case 'right':
        this.sel = Math.min(DAYS, this.sel + 1)
        break
      case 'up':
        this.sel = Math.max(1, this.sel - 7)
        break
      case 'down':
        this.sel = Math.min(DAYS, this.sel + 7)
        break
      case 'ok':
        this.showEvent = true
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.showEvent) return
    const g = this.grid()
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < 7; c++) {
        const cell = { x: 8 + c * ((W - 16) / 7), y: g.top + r * g.ch, w: (W - 16) / 7, h: g.ch }
        if (x >= cell.x && x < cell.x + cell.w && y >= cell.y && y < cell.y + cell.h) {
          const day = r * 7 + c - FIRST_DOW + 1
          if (day >= 1 && day <= DAYS) {
            this.sel = day
            this.showEvent = true
            this.draw()
          }
          return
        }
      }
  }

  private grid() {
    const top = STATUS_H + 56
    const rows = Math.ceil((FIRST_DOW + DAYS) / 7)
    const ch = Math.floor((H - top - 10) / rows)
    return { top, rows, ch }
  }

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    const zh = this.ctx.lang.get() === 'zh'
    const d = new Date()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    s.textCenter(W >> 1, STATUS_H + 8, zh ? `${YEAR} 年 10 月` : 'October 2008', { size: 16, color: C.INK })
    // 星期表头
    const dows = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    const cw = (W - 16) / 7
    dows.forEach((t, i) => {
      s.text(8 + i * cw + (cw >> 1) - 4, STATUS_H + 36, t, { size: 10, color: C.GRAY })
    })
    s.fillRect(8, STATUS_H + 50, W - 16, 1, C.PALE)
    // 日期网格
    const g = this.grid()
    for (let day = 1; day <= DAYS; day++) {
      const idx = FIRST_DOW + day - 1
      const r = Math.floor(idx / 7)
      const c = idx % 7
      const x = 8 + c * cw
      const y = g.top + r * g.ch
      if (day === this.sel) {
        roundRect(s, x + 1, y + 2, cw - 2, g.ch - 4, 5, C.DGREEN, null)
        s.text(x + (cw >> 1) - 6, y + (g.ch >> 1) - 8, String(day), { size: 14, color: C.WHITE })
      } else {
        s.text(x + (cw >> 1) - 6, y + (g.ch >> 1) - 8, String(day), { size: 14, color: day === LAUNCH_DAY ? C.GREEN : C.INK })
      }
      if (day === LAUNCH_DAY && day !== this.sel) s.fillRect(x + (cw >> 1) - 2, y + g.ch - 8, 4, 4, C.GREEN)
    }
    // 底部当日提示
    const note = this.sel === LAUNCH_DAY ? `● ${str.calendarEvent}` : str.calendarNoEvent
    s.fillRect(8, H - 24, W - 16, 1, C.PALE)
    s.text(14, H - 19, this.sel === LAUNCH_DAY ? note : note, { size: 10, color: this.sel === LAUNCH_DAY ? C.GREEN : C.GRAY })
    if (this.showEvent) {
      // 日程浮层
      roundRect(s, 30, STATUS_H + 120, W - 60, 120, 10, C.WHITE, C.GRAY)
      s.text(46, STATUS_H + 136, `10-${String(this.sel).padStart(2, '0')}`, { size: 14, color: C.INK })
      if (this.sel === LAUNCH_DAY) {
        s.fillRect(46, STATUS_H + 158, W - 92, 1, C.PALE)
        s.text(46, STATUS_H + 168, `10:00  ${str.calendarEvent}`, { size: 11, color: C.GREEN })
        s.text(46, STATUS_H + 188, zh ? '纽约 · 发布会' : 'New York · launch event', { size: 10, color: C.GRAY })
      } else {
        s.text(46, STATUS_H + 168, str.calendarNoEvent, { size: 11, color: C.GRAY })
      }
    }
    s.render()
  }
}

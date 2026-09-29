import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, clipToWidth } from '../ui'
import { MetroKb } from '../kb'
import { onTrayChange } from '../ui'

interface CalEvent {
  id: number
  y: number
  m: number
  d: number
  h: number
  min: number
  title: string
}

/**
 * Windows Phone 7.5 日历（Mango 预装）：
 * 月历网格（周一起）+ 当日事项列表 + 新建事项（全拼键盘）。
 * 数据存 calendar:events；宽瓷贴背面显示下一个事项。
 */
export const calendarApp: MiniApp = {
  id: 'calendar',
  name: '日历',
  nameEn: 'Calendar',
  start(ctx: AppContext) {
    const ui = new CalUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const GRID_TOP = 170
const CELL_W = (W - 48) / 7
const CELL_H = 58
const EVENT_TOP = 540
const KB_TOP = 470

class CalUI {
  private events: CalEvent[] = []
  /** 当前显示年月 */
  private vy = 0
  private vm = 0
  /** 选中日 */
  private sd = 0
  private edit = false
  private kb!: MetroKb
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    const now = new Date()
    this.vy = now.getFullYear()
    this.vm = now.getMonth()
    this.sd = now.getDate()
    this.kb = new MetroKb(this.ctx, () => this.draw())
    this.events = (await this.ctx.store.get<CalEvent[]>('events')) ?? []
    if (!this.events.length) {
      const seed = (d: number, title: string, h = 9) =>
        ({ id: Date.now() + d, y: this.vy, m: this.vm, d, h, min: 0, title } satisfies CalEvent)
      this.events = [seed(now.getDate(), wpStrings('zh').calToday), seed(now.getDate() + 3, wpStrings('zh').calLater, 14)]
      await this.save()
    }
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.edit) return
      if (dir === 'left') this.shiftMonth(1)
      else if (dir === 'right') this.shiftMonth(-1)
    }))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private save() {
    return this.ctx.store.set('events', this.events)
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.edit) {
        this.edit = false
        this.draw()
      } else this.ctx.exit()
      return
    }
    if (this.edit) this.kb.key(k)
  }

  private onTap(x: number, y: number) {
    const str = wpStrings(this.ctx.lang.get())
    if (this.edit) {
      this.kb.tap(x, y, KB_TOP)
      return
    }
    // 月份切换箭头
    if (y >= TRAY_H + 8 && y < TRAY_H + 60) {
      if (x < 80) this.shiftMonth(-1)
      else if (x > W - 80) this.shiftMonth(1)
      return
    }
    // 网格选区
    if (y >= GRID_TOP && y < GRID_TOP + 6 * CELL_H) {
      const col = Math.floor((x - 24) / CELL_W)
      const row = Math.floor((y - GRID_TOP) / CELL_H)
      const first = new Date(this.vy, this.vm, 1)
      const lead = (first.getDay() + 6) % 7 // 周一起的前置格
      const dayNum = row * 7 + col - lead + 1
      if (dayNum >= 1 && dayNum <= new Date(this.vy, this.vm + 1, 0).getDate()) {
        this.sd = dayNum
        this.draw()
      }
      return
    }
    // 新建条
    if (y >= H - 92 && y < H - 22) {
      this.edit = true
      this.kb.text = ''
      this.kb.mode = 'zh'
      this.kb.ime.reset()
      void str
      this.draw()
      return
    }
    // 点事项行：删除（真机长按才删，这里点第二下？）—— 改为点时间可删太隐蔽，跳过
  }

  private shiftMonth(d: number) {
    const dt = new Date(this.vy, this.vm + d, 1)
    this.vy = dt.getFullYear()
    this.vm = dt.getMonth()
    this.sd = 1
    this.draw()
  }

  /** 键盘点发送 → 保存事项 */
  private commitEvent() {
    const title = (this.kb.text + this.kb.ime.buf).trim()
    if (title) {
      this.events.push({
        id: Date.now(), y: this.vy, m: this.vm, d: this.sd, h: 9, min: 0, title,
      })
      void this.save()
    }
    this.edit = false
    this.draw()
  }

  private dayEvents(): CalEvent[] {
    return this.events
      .filter((e) => e.y === this.vy && e.m === this.vm && e.d === this.sd)
      .sort((a, b) => a.h - b.h || a.min - b.min)
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    if (this.edit) this.drawEdit()
    else {
      this.drawMonth()
      this.drawAgenda()
    }
    s.render()
  }

  private drawMonth() {
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    // 月份标题 + 箭头
    const title = `${this.vy} ${str.calMonthNames[this.vm]}`
    s.textCenter(W / 2, TRAY_H + 16, title, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    s.text(24, TRAY_H + 16, '‹', { size: 40, font: F_LIGHT(40), color: C.WHITE })
    s.textCenter(W - 40, TRAY_H + 16, '›', { size: 40, font: F_LIGHT(40), color: C.WHITE })
    // 周标题
    const wk = str.calWeekDays
    for (let i = 0; i < 7; i++)
      s.textCenter(24 + i * CELL_W + CELL_W / 2, 126, wk[i]!, {
        size: 20, font: F_REG(20), color: C.GRAY,
      })
    // 日期格
    const first = new Date(this.vy, this.vm, 1)
    const lead = (first.getDay() + 6) % 7
    const dim = new Date(this.vy, this.vm + 1, 0).getDate()
    const now = new Date()
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    for (let k = 1; k <= dim; k++) {
      const idx = lead + k - 1
      const col = idx % 7
      const row = Math.floor(idx / 7)
      const x = 24 + col * CELL_W
      const y = GRID_TOP + row * CELL_H
      const selected = k === this.sd
      const isToday =
        k === now.getDate() && this.vm === now.getMonth() && this.vy === now.getFullYear()
      if (selected) s.fillRect(Math.round(x + 2), y + 2, Math.round(CELL_W - 4), CELL_H - 4, accent)
      else if (isToday)
        s.frameRect(Math.round(x + 2), y + 2, Math.round(CELL_W - 4), CELL_H - 4)
      s.textCenter(Math.round(x + CELL_W / 2), y + 6, String(k), {
        size: 24,
        font: selected ? F_SEMI(24) : F_LIGHT(24),
        color: selected ? C.WHITE : isToday ? accent : C.WHITE,
      })
    }
  }

  private drawAgenda() {
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    s.fillRect(24, EVENT_TOP - 14, W - 48, 1, C.DIM)
    const list = this.dayEvents()
    if (!list.length)
      s.text(24, EVENT_TOP + 4, str.calEmpty, { size: 22, font: F_REG(22), color: C.GRAY })
    list.forEach((e, i) => {
      const y = EVENT_TOP + i * 62
      if (y >= H - 110) return
      const time = `${String(e.h).padStart(2, '0')}:${String(e.min).padStart(2, '0')}`
      s.text(24, y + 4, time, { size: 22, font: F_REG(22), color: C.GRAY })
      s.text(96, y + 2, clipToWidth(s, e.title, W - 130, 26, F_REG(26)), {
        size: 26, font: F_REG(26), color: C.WHITE,
      })
      s.fillRect(24, y + 42, W - 48, 1, C.DIM)
    })
    // 新建条
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(24, H - 92, W - 48, 70, accent)
    // '+' 墨迹中心在 text y+27 处（Open Sans 实测）：条中心 H-57 → y=H-84
    s.textCenter(W / 2, H - 84, '+', { size: 40, font: F_SEMI(40), color: C.WHITE })
  }

  private drawEdit() {
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    s.text(24, TRAY_H + 18, str.calNew, { size: 36, font: F_LIGHT(36), color: C.WHITE })
    const shown = this.kb.text + (this.kb.mode === 'en' || !this.kb.ime.active ? '' : `〔${this.kb.ime.buf}〕`)
    const blink = Math.floor(Date.now() / 500) % 2 === 0 ? '|' : ' '
    s.text(24, 130, clipToWidth(s, shown + blink, W - 48, 32, F_REG(32)), {
      size: 32, font: F_REG(32), color: C.WHITE,
    })
    // 发送即保存（键盘发送键）
    this.kb.onSend = () => this.commitEvent()
    this.kb.draw(s, KB_TOP)
  }
}

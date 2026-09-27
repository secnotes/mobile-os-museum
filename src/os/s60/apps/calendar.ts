import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent, wrapText, clipToWidth } from '../ui'

/**
 * 日历：月视图（周日起列）→ 当日事项列表 → 查看/新建/删除。
 * 事件写入 AppStore 'events'（IDB 全键 nokia-n73:calendar:events，
 * OS 待机插件读设备键 calendar:events，同一份）。
 */
export const calendarApp: MiniApp = {
  id: 'calendar',
  name: '日历',
  nameEn: 'Calendar',
  start(ctx) {
    const ui = new CalUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type EvType = 'meeting' | 'memo' | 'anniv' | 'todo'
interface CalEv { id: number; ts: number; title: string; type: EvType }

const TYPE_LABEL: Record<EvType, [string, string]> = {
  meeting: ['会议', 'Meeting'],
  memo: ['备忘', 'Memo'],
  anniv: ['纪念日', 'Anniversary'],
  todo: ['待办事项', 'To-do'],
}

class CalUI {
  private offs: Array<() => void> = []
  private events: CalEv[] = []
  private view: 'month' | 'day' | 'view' | 'edit' = 'month'
  private cursor = new Date()
  private sel = 0
  private editing: CalEv | null = null
  private draft = ''
  private t9 = new T9()

  constructor(private ctx: AppContext) {}

  async init() {
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.events = (await this.ctx.store.get<CalEv[]>('events')) ?? this.seed()
    if (!(await this.ctx.store.get<CalEv[]>('events'))) await this.persist()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => {
      this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
      this.draw()
    }))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private seed(): CalEv[] {
    const now = new Date()
    const mk = (offDays: number, h: number, title: string, en: string, type: EvType): CalEv => {
      const d = new Date(now); d.setDate(d.getDate() + offDays); d.setHours(h, 0, 0, 0)
      return { id: d.getTime(), ts: d.getTime(), title: this.ctx.lang.get() === 'en' ? en : title, type }
    }
    return [
      mk(0, 10, '团队周会', 'Team weekly meeting', 'meeting'),
      mk(2, 19, '妈妈生日', "Mom's birthday", 'anniv'),
      mk(5, 9, '交季度报告', 'Quarterly report due', 'todo'),
    ]
  }

  private async persist() { await this.ctx.store.set('events', this.events) }

  private onKey(k: DeviceKey) {
    if (this.view === 'edit') return this.editKey(k)
    if (this.view === 'month') return this.monthKey(k)
    if (this.view === 'day') return this.dayKey(k)
    // view：查看单条
    switch (k) {
      case 'soft1': // 删除
        this.events = this.events.filter((e) => e.id !== this.editing!.id)
        void this.persist()
        this.view = 'day'
        break
      case 'ok': case 'soft2': case 'back':
        this.view = 'day'
        break
      default: return
    }
    this.draw()
  }

  private monthKey(k: DeviceKey) {
    switch (k) {
      case 'left': this.cursor.setDate(this.cursor.getDate() - 1); break
      case 'right': this.cursor.setDate(this.cursor.getDate() + 1); break
      case 'up': this.cursor.setDate(this.cursor.getDate() - 7); break
      case 'down': this.cursor.setDate(this.cursor.getDate() + 7); break
      case 'ok': this.view = 'day'; this.sel = 0; break
      case 'soft1': this.openEdit(null); return
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private dayEvents(): CalEv[] {
    return this.events.filter((e) => {
      const d = new Date(e.ts)
      return d.getFullYear() === this.cursor.getFullYear() && d.getMonth() === this.cursor.getMonth()
        && d.getDate() === this.cursor.getDate()
    }).sort((a, b) => a.ts - b.ts)
  }

  private dayKey(k: DeviceKey) {
    const list = this.dayEvents()
    switch (k) {
      case 'up': if (list.length) this.sel = (this.sel + list.length - 1) % list.length; break
      case 'down': if (list.length) this.sel = (this.sel + 1) % list.length; break
      case 'ok': if (list[this.sel]) { this.editing = list[this.sel]!; this.view = 'view' }; break
      case 'soft1': this.openEdit(null); return
      case 'soft2': case 'back': this.view = 'month'; break
      default: return
    }
    this.draw()
  }

  private openEdit(ev: CalEv | null) {
    this.view = 'edit'
    this.editing = ev
    this.draft = ev?.title ?? ''
    this.t9.reset()
    this.draw()
  }

  private editKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else switch (k) {
      case 'ok': {
        const out = this.t9.select()
        if (out) this.draft += out
        break
      }
      case 'left': this.t9.cycleCand(-1); break
      case 'right': this.t9.cycleCand(1); break
      case 'clear':
        if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
        break
      case '#': this.t9.cycleMode(); break
      case 'soft1': void this.saveEvent(); return
      case 'soft2': case 'back': this.view = this.editing ? 'view' : 'day'; break
      default: return
    }
    this.draw()
  }

  private async saveEvent() {
    const title = (this.draft + (this.t9.expire() ?? '')).trim()
    if (!title) { this.view = 'day'; this.draw(); return }
    if (this.editing) {
      const e = this.events.find((x) => x.id === this.editing!.id)!
      e.title = title
      this.editing = e
      this.view = 'view'
    } else {
      const d = new Date(this.cursor); d.setHours(9, 0, 0, 0)
      this.events.push({ id: Date.now(), ts: d.getTime(), title, type: 'meeting' })
      this.view = 'day'
    }
    this.events.sort((a, b) => a.ts - b.ts)
    await this.persist()
    this.draw()
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'month') {
      titleBar(s, en ? 'Calendar' : '日历')
      this.drawMonth()
      softBar(s, en ? 'New' : '新建', str.contactsBack)
    } else if (this.view === 'day') {
      const d = this.cursor
      titleBar(s, en
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : `${d.getMonth() + 1}月${d.getDate()}日`)
      this.drawDay()
      softBar(s, en ? 'New' : '新建', str.contactsBack)
    } else if (this.view === 'view') {
      this.drawView()
      softBar(s, en ? 'Delete' : '删除', str.contactsBack)
    } else {
      titleBar(s, en ? 'New entry' : '新建事项')
      this.drawEdit()
      softBar(s, en ? 'Save' : '保存', str.contactsBack)
    }
  }

  private drawMonth() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    const d = this.cursor
    s.textCenter(W / 2, CONTENT_TOP + 8, en
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`
      : `${d.getFullYear()}年${d.getMonth() + 1}月`, { size: 14, color: C.INK })
    const heads = en ? ['S','M','T','W','T','F','S'] : ['日','一','二','三','四','五','六']
    heads.forEach((h, i) => s.textCenter(20 + i * 30, CONTENT_TOP + 32, h, { size: 11, color: C.GRAY }))
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const lead = first.getDay()
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    for (let day = 1; day <= days; day++) {
      const idx = lead + day - 1
      const x = 20 + (idx % 7) * 30 - 11
      const y = CONTENT_TOP + 48 + Math.floor(idx / 7) * 28
      const selDay = day === d.getDate()
      if (selDay) s.fillRect(x, y, 22, 24, C.BLUE)
      s.textCenter(x + 11, y + 7, String(day), { size: 12, color: selDay ? C.WHITE : C.INK })
      // 事件点
      const hasEv = this.events.some((e) => {
        const ed = new Date(e.ts)
        return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === day
      })
      if (hasEv) s.fillRect(x + 8, y + 19, 5, 3, selDay ? C.AMBER : C.RED)
    }
  }

  private drawDay() {
    const s = this.ctx.screen
    const list = this.dayEvents()
    const en = this.ctx.lang.get() === 'en'
    if (!list.length) {
      s.textCenter(W / 2, 130, s60Strings(this.ctx.lang.get()).calNoEvents, { size: 12, color: C.GRAY })
      return
    }
    list.forEach((e, i) => {
      const y = CONTENT_TOP + 8 + i * 30
      const selRow = i === this.sel
      if (selRow) s.fillRect(6, y - 2, W - 12, 28, C.BLUE)
      const col = selRow ? C.WHITE : C.INK
      const [zh, enL] = TYPE_LABEL[e.type]!
      s.text(14, y + 8, `(${en ? enL : zh})`, { size: 10, color: selRow ? C.PALE : C.GRAY })
      const t = new Date(e.ts)
      s.text(78, y + 7, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
        { size: 11, color: col })
      s.text(130, y + 7, clipToWidth(s, e.title, W - 140, 12), { size: 12, color: col })
    })
  }

  private drawView() {
    const s = this.ctx.screen
    const e = this.editing!
    const en = this.ctx.lang.get() === 'en'
    const [zh, enL] = TYPE_LABEL[e.type]!
    s.text(16, CONTENT_TOP + 14, en ? enL : zh, { size: 13, color: C.BLUE })
    const t = new Date(e.ts)
    s.text(16, CONTENT_TOP + 40,
      `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      { size: 12, color: C.GRAY })
    const lines = wrapText(s, e.title, W - 32, 15)
    lines.forEach((ln, i) => s.text(16, CONTENT_TOP + 76 + i * 22, ln, { size: 15, color: C.INK }))
  }

  private drawEdit() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const lines = wrapText(s, this.draft + this.t9.hint(), W - 24, 14)
    lines.slice(0, 10).forEach((ln, i) => {
      const active = i === lines.length - 1
      s.text(12, CONTENT_TOP + 10 + i * 20, ln, { size: 14, color: active ? C.BLUE : C.INK })
    })
    s.text(12, CONTENT_BOTTOM - 16, `# ${str.imeEn}/${str.imePy}/${str.imeNum}`, { size: 10, color: C.GRAY })
  }
}

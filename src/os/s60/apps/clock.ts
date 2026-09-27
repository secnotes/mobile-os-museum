import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent, frameRectC } from '../ui'

/**
 * 时钟：闹钟列表（新建/开关/时间/重复/标签）+ 世界时钟。
 * 闹钟到点弹响（应用在前台时；响铃用旋律单遍）。
 */
export const clockApp: MiniApp = {
  id: 'clock',
  name: '时钟',
  nameEn: 'Clock',
  start(ctx) {
    const ui = new ClockUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Alarm {
  id: number
  h: number
  m: number
  on: boolean
  days: number[] // 0=周一 … 6=周日；空=仅一次
  label: string
}

const WORLD: Array<[string, string, number]> = [
  ['北京', 'Beijing', 0],
  ['伦敦', 'London', -8],
  ['纽约', 'New York', -13],
  ['东京', 'Tokyo', 1],
]

type View = 'list' | 'edit' | 'world' | 'ring'

class ClockUI {
  private offs: Array<() => void> = []
  private alarms: Alarm[] = []
  private view: View = 'list'
  private sel = 0
  private editing: Alarm | null = null
  private field = 0 // h / m / days / label
  private lastFiredKey = ''

  constructor(private ctx: AppContext) {}

  async init() {
    this.alarms = (await this.ctx.store.get<Alarm[]>('alarms')) ?? this.seed()
    await this.persist()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.every(5000, () => {
      this.checkAlarm()
      if (this.view !== 'edit') this.draw()
    }))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private seed(): Alarm[] {
    return [{ id: 1, h: 7, m: 30, on: true, days: [0, 1, 2, 3, 4], label: '' }]
  }

  private async persist() { await this.ctx.store.set('alarms', this.alarms) }

  private checkAlarm() {
    if (this.view === 'ring') return
    const d = new Date()
    const key = `${d.getFullYear()}/${d.getMonth()}/${d.getDate()}/${d.getHours()}/${d.getMinutes()}`
    if (key === this.lastFiredKey) return
    this.lastFiredKey = key
    const wd = (d.getDay() + 6) % 7
    const hit = this.alarms.find((a) => a.on && a.h === d.getHours() && a.m === d.getMinutes()
      && (a.days.length === 0 || a.days.includes(wd)))
    if (hit) {
      this.view = 'ring'
      this.editing = hit
      this.ctx.audio.unlock()
      this.ctx.audio.melody([[76, .4], [74, .4], [76, .4], [79, .8]], 200)
      this.draw()
    }
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'ring') {
      this.view = 'list'
      this.editing = null
      this.draw()
      return
    }
    if (this.view === 'world') {
      if (k === 'soft2' || k === 'back' || k === 'ok') { this.view = 'list'; this.draw() }
      return
    }
    if (this.view === 'edit') return this.editKey(k)
    const n = Math.max(1, this.alarms.length + 1)
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok': {
        if (this.sel < this.alarms.length) {
          const a = this.alarms[this.sel]!
          a.on = !a.on
          void this.persist()
        }
        break
      }
      case 'right':
        if (this.alarms[this.sel]) {
          this.editing = this.alarms[this.sel]!
          this.field = 0
          this.view = 'edit'
        }
        break
      case 'soft1':
        this.editing = { id: Date.now(), h: 7, m: 0, on: true, days: [], label: '' }
        this.field = 0
        this.view = 'edit'
        break
      case 'soft2': case 'back':
        this.ctx.exit()
        return
      case '#': this.view = 'world'; break
      default: return
    }
    this.draw()
  }

  private editKey(k: DeviceKey) {
    const a = this.editing!
    switch (this.field) {
      case 0: // 时
        if (k === 'up' || k === 'right') a.h = (a.h + 1) % 24
        else if (k === 'down' || k === 'left') a.h = (a.h + 23) % 24
        else return
        break
      case 1: // 分
        if (k === 'up' || k === 'right') a.m = (a.m + 1) % 60
        else if (k === 'down' || k === 'left') a.m = (a.m + 59) % 60
        else return
        break
      case 2: // 重复日：数字 1..7 直接切
        if (/^[1-7]$/.test(k)) {
          const d = Number(k) === 7 ? 6 : Number(k) - 1
          const i = a.days.indexOf(d)
          if (i >= 0) a.days.splice(i, 1); else a.days.push(d)
        } else if (k === 'left' || k === 'right') this.field = k === 'right' ? 3 : 1
        else return
        break
      case 3:
        if (k === 'left') this.field = 2
        else return
        break
      default: return
    }
    // 字段移动：ok/soft1 下一字段并保存；soft2/back 保存返回
    if (k === 'ok' || k === 'soft1') {
      if (this.field < 3) { this.field++; this.draw(); return }
      this.saveAndBack()
      return
    }
    if (k === 'soft2' || k === 'back') { this.saveAndBack(); return }
    this.draw()
  }

  private saveAndBack() {
    const a = this.editing!
    if (!this.alarms.some((x) => x.id === a.id)) this.alarms.push(a)
    this.alarms.sort((x, y) => x.h * 60 + x.m - (y.h * 60 + y.m))
    void this.persist()
    this.view = 'list'
    this.editing = null
    this.draw()
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'ring') {
      titleBar(s, en ? 'Alarm' : '闹钟')
      s.textCenter(W / 2, 110, '⏰', { size: 30, color: C.AMBER })
      s.textCenter(W / 2, 160, en ? 'Alarm ringing' : '闹钟响铃', { size: 16, color: C.INK })
      s.textCenter(W / 2, 200, en ? 'Press any key' : '按任意键停止', { size: 11, color: C.GRAY })
      softBar(s, '', '')
      return
    }
    if (this.view === 'world') {
      titleBar(s, en ? 'World clock' : '世界时钟')
      this.drawWorld(en)
      softBar(s, '', str.contactsBack)
      return
    }
    if (this.view === 'edit') {
      titleBar(s, en ? 'Edit alarm' : '编辑闹钟')
      this.drawEdit(en)
      softBar(s, en ? 'Next' : '下一步', str.contactsBack)
      return
    }
    titleBar(s, en ? 'Clock' : '时钟')
    this.drawList(en)
    softBar(s, en ? 'New' : '新建', str.contactsBack)
  }

  private drawList(en: boolean) {
    const s = this.ctx.screen
    if (!this.alarms.length) {
      s.textCenter(W / 2, 130, en ? '(No alarms)' : '（无闹钟）', { size: 12, color: C.GRAY })
      return
    }
    this.alarms.forEach((a, i) => {
      const y = CONTENT_TOP + 10 + i * 34
      const selRow = i === this.sel
      if (selRow) s.fillRect(6, y - 2, W - 12, 32, C.BLUE)
      const col = selRow ? C.WHITE : C.INK
      s.text(16, y + 9, `${String(a.h).padStart(2, '0')}:${String(a.m).padStart(2, '0')}`,
        { size: 18, color: a.on ? col : C.GRAY })
      const rep = a.days.length === 0 ? (en ? 'Once' : '一次')
        : a.days.length === 7 ? (en ? 'Daily' : '每天')
        : a.days.length ? (en ? 'Weekdays' : '工作日') : ''
      s.text(120, y + 12, rep, { size: 11, color: selRow ? C.PALE : C.GRAY })
      // 开关块
      s.fillRect(W - 34, y + 4, 20, 16, a.on ? C.GREEN : C.GRAY)
      s.textCenter(W - 24, y + 8, a.on ? 'ON' : 'OFF', { size: 8, color: C.WHITE })
    })
  }

  private drawEdit(en: boolean) {
    const s = this.ctx.screen
    const a = this.editing!
    // 时间
    const selT = this.field <= 1
    s.text(30, CONTENT_TOP + 24, String(a.h).padStart(2, '0'),
      { size: 30, color: this.field === 0 ? C.BLUE : C.INK })
    s.text(76, CONTENT_TOP + 24, ':', { size: 30, color: selT ? C.INK : C.GRAY })
    s.text(92, CONTENT_TOP + 24, String(a.m).padStart(2, '0'),
      { size: 30, color: this.field === 1 ? C.BLUE : C.INK })
    s.textCenter(W / 2, CONTENT_TOP + 70, en ? 'Time' : '时间（上下键调整）',
      { size: 10, color: C.GRAY })
    // 重复
    const labels = en ? ['M','T','W','T','F','S','S'] : ['一','二','三','四','五','六','日']
    labels.forEach((lb, i) => {
      const x = 24 + i * 28
      const on = a.days.includes(i)
      const selField = this.field === 2
      s.fillRect(x, CONTENT_TOP + 92, 24, 24, on ? C.BLUE : C.WHITE)
      frameRectC(s, x, CONTENT_TOP + 92, 24, 24, selField ? C.AMBER : C.GRAY)
      s.textCenter(x + 12, CONTENT_TOP + 99, lb, { size: 11, color: on ? C.WHITE : C.GRAY })
    })
    s.textCenter(W / 2, CONTENT_TOP + 126, en ? 'Repeat (press 1-7)' : '重复（按 1–7）',
      { size: 10, color: this.field === 2 ? C.BLUE : C.GRAY })
  }

  private drawWorld(en: boolean) {
    const s = this.ctx.screen
    WORLD.forEach(([zh, enN, off], i) => {
      // 城市偏移相对北京（北京=UTC+8）
      const d = new Date(Date.now() + (off + 8) * 3600_000)
      const y = CONTENT_TOP + 14 + i * 44
      s.fillRect(12, y, W - 24, 36, i % 2 ? C.WHITE : C.NAVY)
      const dark = i % 2 === 0
      s.text(22, y + 10, en ? enN : zh, { size: 13, color: dark ? C.WHITE : C.INK })
      s.textRight(W - 22, y + 8,
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        { size: 18, color: dark ? C.PALE : C.BLUE })
    })
  }
}

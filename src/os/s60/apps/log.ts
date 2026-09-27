import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { type CallEntry, type LogEvent } from '../../../scenario/data'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent, clipToWidth } from '../ui'

const ROW_H = 42
const TAB_H = 24
const LIST_TOP = CONTENT_TOP + TAB_H
const ROWS = Math.floor((CONTENT_BOTTOM - LIST_TOP) / ROW_H) // 5

/**
 * 通讯记录：未接 / 已接 / 已拨三 pane（左右切换），
 * 软键选项进事件日志（短信/数据）与通话计时汇总。
 */
export const logApp: MiniApp = {
  id: 'log',
  name: '记录',
  nameEn: 'Log',
  icon(s, x, y) {
    // 听筒 + 时钟
    s.fillRect(x, y, 44, 44, C.AMBER)
    s.fillRect(x + 8, y + 14, 28, 16, C.WHITE)
    s.fillRect(x + 12, y + 18, 20, 8, C.AMBER)
    s.fillRect(x + 22, y + 10, 6, 4, C.WHITE)
    s.fillRect(x + 16, y + 10, 6, 4, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new LogUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

type View = 'calls' | 'events' | 'timers'

class LogUI {
  private view: View = 'calls'
  /** 0 未接 / 1 已接 / 2 已拨 */
  private pane = 0
  private calls: CallEntry[] = []
  private events: LogEvent[] = []
  private sel = 0
  private top = 0
  private optsOpen = false
  private optsSel = 0
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  init() {
    void this.reload()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
  }

  dispose() {
    this.offs.forEach((off) => off())
  }

  private async reload() {
    const log = (await this.ctx.host.getCallLog?.()) ?? []
    this.calls = [...log].reverse()
    this.events = [...((await this.ctx.host.getEvents?.()) ?? [])].reverse()
    this.fixWindow()
    this.draw()
  }

  /** 当前 pane 的条目 */
  private paneItems(): CallEntry[] {
    if (this.pane === 0) return this.calls.filter((e) => e.missed)
    if (this.pane === 1) return this.calls.filter((e) => e.dir === 'in' && !e.missed)
    return this.calls.filter((e) => e.dir === 'out' && !e.missed)
  }

  private onKey(k: DeviceKey) {
    if (this.optsOpen) return this.optsKey(k)
    if (this.view === 'events' || this.view === 'timers') {
      if (k === 'soft2' || k === 'back' || k === 'soft1' || k === 'ok') {
        this.view = 'calls'
        this.draw()
      }
      return
    }
    const items = this.paneItems()
    const n = items.length
    switch (k) {
      case 'left':
        this.pane = (this.pane + 2) % 3
        this.sel = 0
        this.top = 0
        break
      case 'right':
        this.pane = (this.pane + 1) % 3
        this.sel = 0
        this.top = 0
        break
      case 'up':
        if (n > 1) this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        if (n > 1) this.sel = (this.sel + 1) % n
        break
      case 'ok':
        if (n) {
          const e = items[this.sel]!
          this.ctx.host.dial?.(e.tel, e.name)
          return
        }
        break
      case 'soft1':
        this.openOpts(n > 0)
        return
      case 'soft2':
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.fixWindow()
    this.draw()
  }

  // ---------- Options ----------

  private openOpts(canRedial: boolean) {
    const str = s60Strings(this.ctx.lang.get())
    this.optsLabels = canRedial
      ? [str.logCall, str.logEvents, str.logTimers]
      : [str.logEvents, str.logTimers]
    this.optsOpen = true
    this.optsSel = 0
    this.draw()
  }

  private optsLabels: string[] = []

  private optsKey(k: DeviceKey) {
    const labels = this.optsLabels
    const n = labels.length
    switch (k) {
      case 'up':
        this.optsSel = (this.optsSel + n - 1) % n
        break
      case 'down':
        this.optsSel = (this.optsSel + 1) % n
        break
      case 'ok':
      case 'soft1': {
        const pick = labels[this.optsSel]!
        this.optsOpen = false
        this.runOption(pick)
        return
      }
      case 'soft2':
      case 'back':
        this.optsOpen = false
        break
      default:
        return
    }
    this.draw()
  }

  private runOption(pick: string) {
    const str = s60Strings(this.ctx.lang.get())
    if (pick === str.logCall) {
      const e = this.paneItems()[this.sel]!
      this.ctx.host.dial?.(e.tel, e.name)
    } else if (pick === str.logEvents) {
      this.view = 'events'
      this.draw()
    } else {
      this.view = 'timers'
      this.draw()
    }
  }

  private fixWindow() {
    const n = this.paneItems().length
    this.sel = Math.min(this.sel, Math.max(0, n - 1))
    if (n <= ROWS) this.top = 0
    else this.top = Math.max(0, Math.min(this.sel - 2, n - ROWS))
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.view === 'events') return this.drawEvents()
    if (this.view === 'timers') return this.drawTimers()
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    titleBar(s, str.logTitle)
    this.drawTabs(str)
    const items = this.paneItems()
    if (!items.length) {
      s.textCenter(W / 2, LIST_TOP + 90, str.logEmpty, { size: 12, color: C.GRAY })
    }
    for (let r = 0; r < ROWS; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const e = items[i]!
      const y = LIST_TOP + r * ROW_H
      const sel = i === this.sel
      if (sel) s.fillRect(0, y, W, ROW_H, C.BLUE)
      // ✕ 未接（红）/ ◀ 已接 / ▶ 已拨
      const icon = this.pane === 0 ? '✕' : this.pane === 1 ? '◀' : '▶'
      s.text(12, y + 12, icon, { size: 16, color: this.pane === 0 ? C.RED : sel ? C.WHITE : C.INK })
      const name = clipToWidth(s, e.name || e.tel, W - 80, 14)
      s.text(34, y + 6, name, { size: 14, color: sel ? C.WHITE : C.INK })
      const t = new Date(e.ts)
      const hh = String(t.getHours()).padStart(2, '0')
      const mm = String(t.getMinutes()).padStart(2, '0')
      const dur = this.pane === 0 ? str.logMissed : `${e.dur}″`
      s.text(34, y + 24, `${hh}:${mm} ${dur}`, { size: 11, color: sel ? C.PALE : C.GRAY })
    }
    // 计数器在内容区内，不压软键栏
    if (items.length) {
      s.textRight(W - 8, LIST_TOP + 4, `${this.sel + 1}/${items.length}`,
        { size: 10, color: C.GRAY })
    }
    softBar(s, str.callOptions, str.logBack)
    if (this.optsOpen) this.drawOptsPanel()
  }

  /** 三 pane 标签条 */
  private drawTabs(str: ReturnType<typeof s60Strings>) {
    const s = this.ctx.screen
    s.fillRect(0, CONTENT_TOP, W, TAB_H, C.PALE)
    s.line(0, CONTENT_TOP + TAB_H - 1, W - 1, CONTENT_TOP + TAB_H - 1, C.GRAY)
    const tabs = [str.logMissed, str.logReceived, str.logDialled]
    const tw = W / 3
    tabs.forEach((label, i) => {
      const active = i === this.pane
      const x = i * tw
      if (active) s.fillRect(x + 2, CONTENT_TOP + 2, tw - 4, TAB_H - 5, C.BLUE)
      s.textCenter(x + tw / 2, CONTENT_TOP + 6, label, {
        size: 12,
        color: active ? C.WHITE : C.NAVY,
      })
    })
  }

  /** 事件日志（短信/数据通用事件） */
  private drawEvents() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    titleBar(s, str.logEvents)
    if (!this.events.length) {
      s.textCenter(W / 2, 150, str.logEvtEmpty, { size: 12, color: C.GRAY })
    }
    this.events.slice(0, ROWS + 1).forEach((e, i) => {
      const y = CONTENT_TOP + 8 + i * 38
      const sel = i === 0
      if (sel) s.fillRect(4, y - 3, W - 8, 34, C.BLUE)
      const ic = e.kind === 'sms' ? '✉' : '▦'
      s.text(12, y + 6, ic, { size: 15, color: sel ? C.AMBER : C.BLUE })
      const kindName = e.kind === 'sms' ? str.logEvtSMS : str.logEvtData
      const dirName = e.dir === 'in' ? str.logEvtIn : str.logEvtOut
      s.text(38, y, clipToWidth(s, `${kindName} ${dirName}`, W - 100, 13),
        { size: 13, color: sel ? C.WHITE : C.INK })
      const t = new Date(e.ts)
      s.text(38, y + 17, clipToWidth(s, e.text, W - 90, 10),
        { size: 10, color: sel ? C.PALE : C.GRAY })
      s.textRight(W - 10, y + 1, `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}`,
        { size: 10, color: sel ? C.PALE : C.GRAY })
    })
    softBar(s, '', str.logBack)
  }

  /** 通话计时汇总 */
  private drawTimers() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    titleBar(s, str.logTimers)
    const inE = this.calls.filter((e) => e.dir === 'in' && !e.missed)
    const outE = this.calls.filter((e) => e.dir === 'out' && !e.missed)
    const missedN = this.calls.filter((e) => e.missed).length
    const sum = (es: CallEntry[]) => es.reduce((a, e) => a + e.dur, 0)
    const fmt = (sec: number) => {
      const m = Math.floor(sec / 60)
      const s2 = sec % 60
      return `${m}:${String(s2).padStart(2, '0')}`
    }
    const rows: Array<[string, string]> = [
      [str.logTotalIn, `${fmt(sum(inE))}  (${inE.length})`],
      [str.logTotalOut, `${fmt(sum(outE))}  (${outE.length})`],
      [str.logMissedN, `${missedN}`],
    ]
    rows.forEach(([label, val], i) => {
      const y = CONTENT_TOP + 30 + i * 44
      s.fillRect(10, y, W - 20, 36, C.PALE)
      s.text(20, y + 4, label, { size: 13, color: C.NAVY })
      s.textRight(W - 20, y + 20, val, { size: 14, color: C.BLUE })
    })
    softBar(s, '', str.logBack)
  }

  /** Options 白色弹层 */
  private drawOptsPanel() {
    const s = this.ctx.screen
    const labels = this.optsLabels
    const pw = 172
    const ph = labels.length * 28 + 10
    const x = (W - pw) / 2
    const y = 96
    s.fillRect(x + 3, y + 3, pw, ph, C.GRAY)
    s.fillRect(x, y, pw, ph, C.WHITE)
    labels.forEach((label, i) => {
      const ry = y + 5 + i * 28
      if (i === this.optsSel) s.fillRect(x + 4, ry, pw - 8, 24, C.BLUE)
      s.text(x + 12, ry + 5, label, {
        size: 13,
        color: i === this.optsSel ? C.WHITE : C.INK,
      })
    })
  }
}

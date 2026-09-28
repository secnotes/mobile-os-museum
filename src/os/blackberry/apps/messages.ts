import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rr, rrGrad, rrStroke } from '../graphics'
import { BBApp, type MenuCommand, type MsgThread } from './common'

/**
 * Messages：统一信息列表 → 会话 → 撰写。OS 4.6 样式：
 * 白底细行列表，未读加粗；会话为时间分隔的文本流（非气泡）。
 */

type Mode = 'list' | 'thread' | 'compose'

export class MessagesApp extends BBApp {
  private mode: Mode = 'list'
  private threads: MsgThread[] = []
  private sel = 0
  private listOff = 0
  private threadOff = 0
  private draft = ''
  private openTel = ''

  protected async onStart() {
    this.threads = await this.host.getThreads()
    if (this.init) {
      this.openThread(this.init)
    }
  }

  constructor(ctx: ConstructorParameters<typeof BBApp>[0], private init?: string) {
    super(ctx)
  }

  // ---------- 绘制 ----------

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'list') this.drawList()
    else if (this.mode === 'thread') this.drawThread()
    else this.drawCompose()
    s.render()
  }

  private drawHeader(title: string, y = 0) {
    const s = this.ctx.screen
    rrGrad(s, 0, y, 480, 36, 0, [C.WP2, 3])
    s.text(12, y + 8, title, { size: 19, color: C.WHITE })
  }

  private drawList() {
    const s = this.ctx.screen
    this.drawHeader(this.str.apps.messages!)
    const ROW = 44
    this.threads.forEach((t, i) => {
      const y = 36 + i * ROW - this.listOff
      if (y < 36 - ROW || y > 320) return
      if (i === this.sel) rr(s, 2, y + 2, 476, ROW - 4, 4, C.FIELD_BG)
      if (t.unread) s.fillRect(10, y + 17, 5, 5, C.RED)
      s.text(24, y + 4, t.name, {
        size: 17, color: C.INK, maxWidth: 240,
      })
      const last = t.msgs[t.msgs.length - 1]
      s.text(24, y + 24, last ? last.text : '', {
        size: 13, color: C.G6, maxWidth: 360,
      })
      if (last) s.textRight(470, y + 4, timeShort(last.ts), {
        size: 12, color: C.G5,
      })
    })
  }

  private drawThread() {
    const s = this.ctx.screen
    const th = this.threads.find((t) => t.tel === this.openTel)
    this.drawHeader(th ? `${th.name}  ${th.tel}` : this.openTel)
    if (!th) return
    // 文本流：每条占一块，收信 INK 左对齐，发信蓝
    let y = 44 - this.threadOff
    th.msgs.forEach((m) => {
      const prefix = m.dir === 'in' ? '‹ ' : '› '
      const color = m.dir === 'in' ? C.INK : C.SELECT
      const lines = wrap(prefix + m.text, 440, (t) => s.measure(t, { size: 15 }))
      const h = lines.length * 18 + 16
      s.text(12, y + 4, timeShort(m.ts), { size: 11, color: C.G4 })
      lines.forEach((ln, li) => s.text(12, y + 16 + li * 18, ln, { size: 15, color }))
      s.fillRect(12, y + h - 4, 456, 1, C.G2)
      y += h
    })
    // 底部撰写引导
    rrStroke(s, 8, 290, 464, 24, 6, C.SELECT)
    s.text(16, 296, this.str.compose + '…', { size: 14, color: C.SELECT })
  }

  private drawCompose() {
    const th = this.threads.find((t) => t.tel === this.openTel)
    const s = this.ctx.screen
    this.drawHeader(th ? th.name : this.openTel)
    s.text(12, 48, this.str.to + ': ' + (th ? `${th.name}` : this.openTel), {
      size: 15, color: C.G6,
    })
    s.fillRect(12, 76, 456, 1, C.G3)
    // 正文编辑
    const lines = wrap(this.draft, 444, (t) => s.measure(t, { size: 17 }))
    lines.forEach((ln, i) => s.text(14, 92 + i * 22, ln, { size: 17, color: C.INK }))
    // 光标
    const lastLine = lines[lines.length - 1] ?? ''
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      const w = s.measure(lastLine, { size: 17 })
      s.fillRect(14 + w, 92 + (lines.length - 1) * 22, 2, 19, C.SELECT)
    }
    s.textRight(468, 48, String(this.draft.length), { size: 13, color: C.G5 })
    s.text(12, 292, this.str.send + ': Enter', { size: 13, color: C.SELECT })
  }

  // ---------- 输入 ----------

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'list') this.listKey(k)
    else if (this.mode === 'thread') this.threadKey(k)
    else this.composeKey(k, false)
  }

  private listKey(k: DeviceKey) {
    const n = this.threads.length
    if (!n) return
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      this.openThread(this.threads[this.sel]!.tel)
      this.draw()
      return
    }
    else return
    this.ensureVisible(this.sel, 44, 36, 284, (o) => { this.listOff = o })
  }

  /** 返回键：会话→列表；写短信→丢弃回会话；列表（根）→退出应用 */
  protected onBack(): boolean {
    if (this.mode === 'thread') { this.mode = 'list'; this.draw(); return true }
    if (this.mode === 'compose') { this.discardCompose(); this.draw(); return true }
    return false
  }

  private threadKey(k: DeviceKey) {
    if (k === 'up') this.threadOff = Math.max(0, this.threadOff - 24)
    else if (k === 'down') this.threadOff += 24
    else if (k === 'ok') { this.mode = 'compose'; this.draft = '' }
    else return
    this.draw()
  }

  private composeKey(k: DeviceKey, _rep: boolean) {
    if (k === 'clear') {
      this.draft = this.draft.slice(0, -1)
    } else if (k === 'ok') {
      this.sendDraft()
      return
    } else if (k === 'space') {
      this.draft += ' '
    } else if (isChar(k)) {
      this.draft += k
    } else return
    this.draw()
  }

  // ---------- 动作 ----------

  private openThread(tel: string) {
    this.openTel = tel
    this.mode = 'thread'
    this.threadOff = 0
    this.host.markThreadRead(tel)
    const th = this.threads.find((t) => t.tel === tel)
    if (th) th.unread = false
  }

  private discardCompose() {
    this.mode = 'thread'
    this.draft = ''
  }

  private sendDraft() {
    const text = this.draft.trim()
    if (!text) { this.mode = 'thread'; return }
    this.host.sendSms(this.openTel, text)
    const th = this.threads.find((t) => t.tel === this.openTel)
    th?.msgs.push({ dir: 'out', text, ts: Date.now() })
    this.draft = ''
    this.mode = 'thread'
  }

  protected menuItems(): MenuCommand[] {
    if (this.mode === 'compose') {
      return [
        { label: this.str.send + ' (Enter)', fn: () => this.sendDraft() },
        { label: this.str.cancel, fn: () => this.discardCompose() },
      ]
    }
    if (this.mode === 'thread') {
      return [
        { label: this.str.compose, fn: () => { this.mode = 'compose'; this.draft = ''; this.draw() } },
        { label: this.str.back, fn: () => { this.mode = 'list'; this.draw() } },
      ]
    }
    return [
      { label: this.str.compose, fn: () => this.composeNew() },
    ]
  }

  private composeNew() {
    // 对默认第一个线程撰写；真机需先选联系人，这里从列表选中项进
    const th = this.threads[this.sel]
    if (!th) return
    this.openThread(th.tel)
    this.mode = 'compose'
    this.draft = ''
    this.draw()
  }

  private ensureVisible(
    sel: number, rowH: number, top: number, viewH: number,
    setOff: (o: number) => void,
  ) {
    const y0 = top + sel * rowH
    const y1 = y0 + rowH
    if (y0 - top < this.listOff) setOff(y0 - top)
    else if (y1 - top > this.listOff + viewH) setOff(y1 - top - viewH)
  }
}

// ---------- 小工具 ----------

function isChar(k: DeviceKey): boolean {
  return /^[a-z0-9.,]$/.test(k)
}

function wrap(text: string, maxWpx: number, measure: (t: string) => number): string[] {
  return text.split('\n').flatMap((para) => {
    const out: string[] = []
    let line = ''
    for (const ch of para) {
      const test = line + ch
      if (measure(test) > maxWpx) { out.push(line.trimEnd()); line = ch === ' ' ? '' : ch }
      else line = test
    }
    out.push(line)
    return out
  })
}

function timeShort(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


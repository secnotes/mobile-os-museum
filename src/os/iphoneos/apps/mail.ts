import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconMail } from '../icons'
import { wrapLines } from '../textutil'
import { Scroller } from '../scroll'
import { drawNavBar, drawNavBarLight, navTap } from '../navbar'
import { chevron } from '../widgets'

interface MailMsg {
  id: number
  from: string
  to: string
  subject: string
  body: string
  box: 'inbox' | 'sent' | 'drafts' | 'trash'
  read: boolean
  ts: number
}

type View = 'boxes' | 'list' | 'msg' | 'compose'

/**
 * Mail：邮箱 → 邮件列表 → 邮件正文；撰写（真机 1.0 样式）。
 */
class MailApp extends IphoneApp {
  private mails: MailMsg[] = [
    { id: 1, from: '妈妈 <mom@home.cn>', to: 'me', subject: '周末回家吃饭', body: '儿子，这周末回家吃饭吧，妈妈做你爱吃的红烧排骨。', box: 'inbox', read: false, ts: Date.now() - 7200e3 },
    { id: 2, from: 'Apple', to: 'me', subject: 'Welcome to iPhone', body: 'Welcome to your new iPhone. Learn how to get started at apple.com.', box: 'inbox', read: true, ts: Date.now() - 86400e3 },
  ]
  private view: View = 'boxes'
  private box: MailMsg['box'] = 'inbox'
  private msg: MailMsg | null = null
  private scroller = new Scroller(() => this.draw())
  // 撰写字段
  private fTo = ''
  private fSubject = ''
  private fBody = ''
  private field: 'to' | 'subject' | 'body' = 'to'

  start() {
    super.start()
    void this.ctx.store.get<MailMsg[]>('mails').then((v) => {
      if (v) { this.mails = v; this.draw() }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.GRAY7)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'boxes') this.drawBoxes(s)
    if (this.view === 'list') this.drawList(s)
    if (this.view === 'msg') this.drawMsg(s)
    if (this.view === 'compose') this.drawCompose(s)
  }

  private drawBoxes(s: Screen) {
    drawNavBar(s, { title: this.str.inboxes })
    s.fillRect(0, 64, 320, 416, C.KB_BG)
    const boxes: Array<[MailMsg['box'], string]> = [
      ['inbox', this.str.inbox], ['sent', this.str.sent], ['drafts', this.str.drafts], ['trash', this.str.trash],
    ]
    rr(s, 8, 74, 304, boxes.length * 44, 10, C.WHITE)
    boxes.forEach(([b, label], i) => {
      const y = 74 + i * 44
      s.text(20, y + 12, label, { size: 18, font: F_REG(18), color: C.INK })
      if (b === 'inbox') {
        const unread = this.mails.filter((m) => m.box === 'inbox' && !m.read).length
        if (unread) s.textRight(286, y + 12, String(unread), { size: 17, font: F_BOLD(17), color: C.BLUE })
      }
      chevron(s, 294, y + 22)
      if (i < boxes.length - 1) s.fillRect(20, y + 43, 276, 1, C.GRAY6)
    })
  }

  private drawList(s: Screen) {
    const titles: Record<MailMsg['box'], string> = {
      inbox: this.str.inbox, sent: this.str.sent, drafts: this.str.drafts, trash: this.str.trash,
    }
    drawNavBar(s, { title: titles[this.box], back: this.str.inboxes, right: { title: '✎' } })
    s.fillRect(0, 64, 320, 416, C.WHITE)
    const rows = this.mails.filter((m) => m.box === this.box)
    rows.forEach((m, i) => {
      const y = 64 + i * 62
      s.text(12, y + 8, m.from.split(' <')[0]!.slice(0, 16), { size: 17, font: F_BOLD(17), color: !m.read ? C.BLUE : C.INK })
      s.textRight(308, y + 9, fmtTime(m.ts), { size: 12, font: F_REG(12), color: C.GRAY3 })
      s.text(12, y + 31, m.subject.slice(0, 18), { size: 15, font: F_BOLD(15), color: C.INK })
      s.text(12, y + 48, m.body.slice(0, 22), { size: 12, font: F_REG(12), color: C.GRAY3 })
      s.fillRect(12, y + 61, 296, 1, C.GRAY6)
    })
  }

  private drawMsg(s: Screen) {
    const m = this.msg!
    drawNavBar(s, { title: m.subject.slice(0, 12), back: titles2(this.str)[m.box] })
    s.fillRect(0, 64, 320, 416, C.WHITE)
    // 头部
    s.text(12, 74, m.from, { size: 14, font: F_BOLD(14), color: C.BLUE })
    s.textRight(308, 74, fmtTime(m.ts), { size: 12, font: F_REG(12), color: C.GRAY3 })
    s.fillRect(12, 96, 296, 1, C.GRAY6)
    const size = 16, font = F_REG(size)
    const lines = wrapLines(s, m.body, 296, size, font)
    const contentH = lines.length * 21 + 100
    this.scroller.setContent(contentH, 416)
    lines.forEach((ln, i) => {
      const y = 108 + i * 21 - this.scroller.offset
      if (y >= 64 && y < 470) s.text(12, y, ln, { size, font, color: C.INK })
    })
  }

  private drawCompose(s: Screen) {
    drawNavBarLight(s, { title: this.str.compose, right: { title: this.str.send, bold: true } })
    s.fillRect(0, 64, 320, 416, C.WHITE)
    // Cancel 在左（导航栏左下区，真机为导航栏按钮）
    s.text(12, 79, this.str.cancel, { size: 16, font: F_REG(16), color: C.BLUE })
    // To / Subject 行
    this.fieldRow(s, 80, this.str.to, this.fTo, this.field === 'to')
    this.fieldRow(s, 124, this.str.mailSubject, this.fSubject, this.field === 'subject')
    s.fillRect(0, 168, 320, 12, C.GRAY7)
    // body
    const size = 16, font = F_REG(size)
    const lines = wrapLines(s, this.fBody, 296, size, font)
    lines.forEach((ln, i) => {
      const y = 192 + i * 21
      s.text(12, y, ln, { size, font, color: C.INK })
    })
    if (this.field === 'body' && Math.floor(this.blink * 1.6) % 2 === 0) {
      const li = lines.length - 1
      const x = 12 + s.measure(lines[li]!, { size, font })
      s.fillRect(x, 192 + li * 21 - 15, 2, 19, C.INK)
    }
    this.drawKb()
  }

  private fieldRow(s: Screen, y: number, label: string, value: string, active: boolean) {
    s.text(12, y, label, { size: 16, font: F_BOLD(16), color: C.INK })
    const lx = 90
    s.text(lx, y, value, { size: 16, font: F_REG(16), color: C.INK, maxWidth: 218 })
    if (active && Math.floor(this.blink * 1.6) % 2 === 0) {
      const x = lx + s.measure(value, { size: 16, font: F_REG(16) })
      s.fillRect(x, y - 14, 2, 19, C.INK)
    }
  }

  protected statusTap(): boolean {
    if (this.view !== 'msg') return false
    this.scroller.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    const nav = navTap(x, y)
    if (nav === 'back') {
      if (this.view === 'msg') { this.view = 'list'; this.draw() }
      else if (this.view === 'list') { this.view = 'boxes'; this.draw() }
      return
    }
    if (nav === 'right') {
      if (this.view === 'list') this.openCompose()
      else if (this.view === 'compose') this.sendMail()
      return
    }
    if (this.view === 'compose') {
      // Cancel
      if (x < 80 && y < 104) { this.cancelCompose(); return }
      // 选字段
      if (y < 118) this.field = 'to'
      else if (y < 168) this.field = 'subject'
      else this.field = 'body'
      this.kbOn = true
      if (y >= 284) {
        const a = this.kb.tap(this.ctx.screen, x, y, this.ime)
        if (a) {
          this.click()
          if (a.type === 'ret') this.kbAction({ type: 'char', ch: '\n' })
          else this.kbAction(a)
        }
      }
      this.draw()
      return
    }
    if (this.view === 'boxes') {
      const i = Math.floor((y - 74) / 44)
      if (i >= 0 && i < 4) {
        const b = (['inbox', 'sent', 'drafts', 'trash'] as const)[i]!
        this.rowPress(() => {
          this.box = b
          this.view = 'list'
          this.draw()
        })
      }
      return
    }
    if (this.view === 'list') {
      const rows = this.mails.filter((m) => m.box === this.box)
      const i = Math.floor((y - 64) / 62)
      if (i >= 0 && i < rows.length) {
        const m = rows[i]!
        this.rowPress(() => {
          this.msg = m
          this.msg.read = true
          this.view = 'msg'
          this.scroller.offset = 0
          this.draw()
        })
      }
    }
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.view === 'msg' && y > 100) this.scroller.onDrag(y, sy)
  }
  protected dragEnd() {
    this.scroller.onEnd()
  }
  protected wheel(dy: number) {
    if (this.view === 'msg') this.scroller.wheel(dy)
  }
  protected frame(dt: number) {
    super.frame(dt)
    this.scroller.step(dt)
  }

  private openCompose() {
    this.view = 'compose'
    this.fTo = ''; this.fSubject = ''; this.fBody = ''
    this.field = 'to'
    this.kbOn = true
    this.kb.reset()
    this.draw()
  }
  private cancelCompose() {
    // 存草稿
    if (this.fTo || this.fBody)
      this.mails.push({ id: Date.now(), from: 'me', to: this.fTo, subject: this.fSubject, body: this.fBody, box: 'drafts', read: true, ts: Date.now() })
    this.persist()
    this.view = 'list'
    this.kbOn = false
    this.kb.reset()
    this.draw()
  }
  private sendMail() {
    if (!this.fTo) return
    this.mails.push({ id: Date.now(), from: 'me', to: this.fTo, subject: this.fSubject, body: this.fBody, box: 'sent', read: true, ts: Date.now() })
    this.persist()
    this.view = 'list'
    this.kbOn = false
    this.kb.reset()
    this.draw()
  }
  private persist() {
    this.ctx.store.set('mails', this.mails)
  }

  protected insertText(t: string) {
    if (this.field === 'to') this.fTo += t
    else if (this.field === 'subject') this.fSubject += t
    else this.fBody += t
  }
  protected backspaceText() {
    if (this.field === 'to') this.fTo = this.fTo.slice(0, -1)
    else if (this.field === 'subject') this.fSubject = this.fSubject.slice(0, -1)
    else this.fBody = this.fBody.slice(0, -1)
  }
}

function titles2(str: { inbox: string; sent: string; drafts: string; trash: string }) {
  return str
}
function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const mailFactory = miniApp('mail', '邮件', iconMail, (ctx, b) => new MailApp(ctx, b))

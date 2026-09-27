import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import type { SmsThread } from './common'
import { iconText } from '../icons'
import { wrapLines } from '../textutil'
import { Scroller } from '../scroll'
import { drawNavBar, navTap } from '../navbar'

/**
 * Text（短信）：会话列表 → 气泡对话 + 软键盘（真机 1.0 样式）。
 */
class MessagesApp extends IphoneApp {
  private view: 'list' | 'thread' = 'list'
  private thread: SmsThread | null = null
  private draft = ''
  private scroller = new Scroller(() => this.draw())

  start() {
    super.start()
    // 来自 Phone 详情的跨应用跳转
    const tel = this.bridge.pendingThreadTel ?? null
    if (tel) {
      this.bridge.pendingThreadTel = null
      const t = this.bridge.getThreads().find((x) => x.tel === tel)
      if (t) {
        this.thread = t
        this.bridge.markThreadRead(tel)
        this.view = 'thread'
      }
    }
    this.draw()
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.GRAY7)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'list') this.drawList(s)
    else this.drawThread(s)
  }

  private drawList(s: Screen) {
    drawNavBar(s, { title: this.str.apps.text, right: { title: '✎' } })
    s.fillRect(0, 64, 320, 416, C.WHITE)
    const threads = this.bridge.getThreads()
    threads.forEach((t, i) => {
      const y = 64 + i * 60
      const last = t.msgs[t.msgs.length - 1]
      s.fillRect(0, y, 320, 60, C.WHITE)
      s.text(12, y + 8, t.name, { size: 18, font: F_BOLD(18), color: C.INK })
      if (last)
        s.text(12, y + 34, last.text.slice(0, 20), { size: 14, font: F_REG(14), color: C.GRAY3 })
      s.fillRect(12, y + 59, 296, 1, C.GRAY6)
    })
  }

  private drawThread(s: Screen) {
    drawNavBar(s, { title: this.thread!.name, back: this.str.apps.text })
    // 内容区底
    s.fillRect(0, 64, 320, 480 - 64, C.GRAY7)
    const layout = this.layoutBubbles(s)
    const viewTop = 64
    const viewH = (this.kbOn ? 224 : 436) - viewTop
    this.scroller.setContent(layout.h, viewH)
    const off = this.scroller.offset
    layout.items.forEach((it) => {
      const y = it.y - off
      if (y < viewTop - 30 || y > viewTop + viewH) return
      if (it.kind === 'stamp') {
        s.textCenter(160, y, it.text!, { size: 12, font: F_REG(12), color: C.GRAY3 })
      } else {
        const isOut = it.dir === 'out'
        const bw = it.w!, bh = it.h!
        const bx = isOut ? 312 - bw : 8
        // 气泡
        rr(s, bx, y, bw, bh, 12, isOut ? C.GREEN : C.GRAY6)
        it.lines!.forEach((ln, li) =>
          s.text(bx + 12, y + 8 + li * 20, ln, { size: 15, font: F_REG(15), color: isOut ? C.WHITE : C.INK }))
      }
    })
    // 输入区
    if (this.kbOn) this.drawComposer(s, 224, true)
    else this.drawComposer(s, 436, false)
    this.drawKb()
  }

  private drawComposer(s: Screen, y: number, send: boolean) {
    s.fillRect(0, y, 320, this.kbOn ? 40 : 44, C.GRAY7)
    s.fillRect(0, y, 320, 1, C.GRAY5)
    if (send) {
      // 文本框（随内容增长宽度，上限给 Send 让位）
      const sendW = 58
      const fieldX = 8
      const fieldW = 320 - sendW - fieldX - 10
      rr(s, fieldX, y + 6, fieldW, 28, 6, C.WHITE)
      s.fillRect(fieldX, y + 6, fieldW, 1, C.GRAY4)
      s.text(fieldX + 10, y + 13, this.draft, { size: 16, font: F_REG(16), color: C.INK, maxWidth: fieldW - 16 })
      // Send 蓝按钮
      if (this.draft) rrGrad(s, 320 - sendW - 8, y + 5, sendW, 30, 6, R.BLUE_BTN)
      else rr(s, 320 - sendW - 8, y + 5, sendW, 30, 6, C.GRAY5)
      s.textCenter(320 - sendW - 8 + (sendW >> 1), y + 13, this.str.sendButton, {
        size: 16, font: F_BOLD(16), color: this.draft ? C.WHITE : C.GRAY3,
      })
    } else {
      rr(s, 8, y + 6, 304, 32, 16, C.WHITE)
      s.fillRect(8, y + 6, 304, 1, C.GRAY4)
      s.textCenter(160, y + 14, this.str.textPlaceholder, { size: 16, font: F_REG(16), color: C.GRAY3 })
    }
  }

  /** 计算气泡布局（含时间戳），返回绝对 y 的条目 */
  private layoutBubbles(s: Screen) {
    interface Item {
      kind: 'bubble' | 'stamp'
      y: number
      w?: number; h?: number; lines?: string[]; dir?: 'in' | 'out'; text?: string
    }
    const items: Item[] = []
    let y = 72
    let lastDay = -1
    for (const m of this.thread!.msgs) {
      const d = new Date(m.ts)
      if (d.getDate() !== lastDay) {
        lastDay = d.getDate()
        items.push({ kind: 'stamp', y, text: `${d.getMonth() + 1}/${d.getDate()}` })
        y += 20
      }
      const lines = wrapLines(s, m.text, 200, 15, F_REG(15))
      const h = lines.length * 20 + 14
      const maxLine = Math.max(...lines.map((l) => s.measure(l, { size: 15, font: F_REG(15) })))
      items.push({ kind: 'bubble', y, w: Math.min(224, maxLine + 24), h, lines, dir: m.dir })
      y += h + 4
    }
    return { items, h: y }
  }

  protected statusTap(): boolean {
    if (this.view !== 'thread') return false
    this.scroller.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    const nav = navTap(x, y)
    if (nav === 'back') {
      this.backToList()
      return
    }
    if (this.view === 'list') {
      const i = Math.floor((y - 64) / 60)
      const threads = this.bridge.getThreads()
      if (i >= 0 && i < threads.length) {
        const t = threads[i]!
        this.rowPress(() => {
          this.thread = t
          this.bridge.markThreadRead(t.tel)
          this.view = 'thread'
          this.scroller.offset = 0
          this.draw()
        })
      }
      return
    }
    // thread
    const compY = this.kbOn ? 224 : 436
    if (y >= compY) {
      if (!this.kbOn) {
        this.kbOn = true
        this.scroller.offset = 0
        this.draw()
        return
      }
      // Send？
      if (x > 254 && this.draft) {
        this.send()
        return
      }
      // 键盘区
      const a = this.kb.tap(this.ctx.screen, x, y, this.ime)
      if (a) {
        this.click()
        this.kbAction(a)
      }
      this.draw()
      return
    }
  }

  private send() {
    this.bridge.sendSms(this.thread!.tel, this.draft)
    this.draft = ''
    this.thread = this.bridge.getThreads().find((t) => t.tel === this.thread!.tel)!
    // 滚到底
    const s = this.ctx.screen
    const layout = this.layoutBubbles(s)
    const viewH = 224 - 64
    this.scroller.setContent(layout.h, viewH)
    this.scroller.offset = Math.max(0, layout.h - viewH)
    this.draw()
  }

  private backToList() {
    this.view = 'list'
    this.thread = null
    this.draft = ''
    this.kbOn = false
    this.kb.reset()
    this.draw()
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.view !== 'thread') return
    const limit = this.kbOn ? 224 : 436
    if (y < limit) this.scroller.onDrag(y, sy)
  }
  protected dragEnd() {
    this.scroller.onEnd()
  }
  protected frame(dt: number) {
    super.frame(dt)
    this.scroller.step(dt)
  }

  protected insertText(t: string) {
    this.draft += t
  }
  protected backspaceText() {
    this.draft = this.draft.slice(0, -1)
  }
}

export const messagesFactory = miniApp('sms', '短信', iconText, (ctx, b) => new MessagesApp(ctx, b))

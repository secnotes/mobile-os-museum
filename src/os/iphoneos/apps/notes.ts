import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrStroke } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconNotes } from '../icons'
import { wrapLines } from '../textutil'
import { Scroller } from '../scroll'
import { drawNavBarLight, navTap } from '../navbar'

interface Note {
  id: number
  text: string
  ts: number
}

const PAD = 14
const TEXT_TOP = 64

/**
 * Notes：黄色备忘录列表 → 编辑页（黄色横线纸，真机 1.0 样式）。
 */
class NotesApp extends IphoneApp {
  private notes: Note[] = [
    { id: 1, text: '买牛奶\n给妈妈回电话', ts: Date.now() - 3600e3 },
  ]
  private view: 'list' | 'edit' = 'list'
  private cur: Note | null = null
  private cursor = 0
  private scroller = new Scroller(() => this.draw())

  start() {
    super.start()
    void this.ctx.store.get<Note[]>('list').then((v) => {
      if (v) { this.notes = v; this.draw() }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, this.view === 'list' ? C.NOTES_BG : C.NOTES_BG)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'list') this.drawList(s)
    else this.drawEdit(s)
  }

  private drawList(s: Screen) {
    drawNavBarLight(s, { title: this.str.notesTitle, right: { title: '+', bold: true } })
    if (!this.notes.length) {
      s.textCenter(160, 200, this.str.notesPlaceholder, { size: 15, font: F_REG(15), color: C.GRAY3 })
      return
    }
    this.notes.forEach((n, i) => {
      const y = 64 + i * 50
      rr(s, 8, y, 304, 46, 8, C.NOTES_BG)
      rrStroke(s, 8, y, 304, 46, 8, C.MAP_HWY)
      const preview = n.text.split('\n')[0] || this.str.notesPlaceholder
      s.text(20, y + 8, preview.slice(0, 18), { size: 17, font: F_BOLD(17), color: C.INK })
      // 横线 + 日期
      s.fillRect(20, y + 30, 280, 1, C.MAP_HWY)
      const d = new Date(n.ts)
      s.text(20, y + 32, `${d.getMonth() + 1}/${d.getDate()}`, { size: 11, font: F_REG(11), color: C.GRAY3 })
    })
  }

  private drawEdit(s: Screen) {
    // Done 导航栏（白底）
    drawNavBarLight(s, { title: this.str.notesTitle, right: { title: this.str.done, bold: true } })
    // 黄纸正文
    s.fillRect(0, 64, 320, 416, C.NOTES_BG)
    const size = 17
    const font = F_REG(size)
    const maxW = 320 - PAD * 2
    const lines = wrapLines(s, this.cur!.text + ' ', maxW, size, font)
    const lineH = 23
    const contentH = Math.max(260, lines.length * lineH + 40)
    const viewH = this.kbOn ? 264 - TEXT_TOP : 480 - TEXT_TOP
    this.scroller.setContent(contentH, viewH)
    const off = this.scroller.offset
    // 横线 + 文字
    lines.forEach((line, i) => {
      const y = TEXT_TOP + i * lineH + 16 - off
      if (y < TEXT_TOP - 20 || y > TEXT_TOP + viewH) return
      s.fillRect(PAD, y + 4, maxW, 1, C.MAP_HWY)
      s.text(PAD, y - 4, line, { size, font, color: C.INK })
    })
    // 光标
    if (Math.floor(this.blink * 1.6) % 2 === 0) this.drawCursor(s, lines, lineH, size, font, off)
    this.drawKb()
  }

  private drawCursor(s: Screen, lines: string[], lineH: number, size: number, font: string, off: number) {
    // 光标所在行/列
    let pos = 0
    for (let li = 0; li < lines.length; li++) {
      const lineLen = lines[li]!.replace(/ $/, '').length
      if (this.cursor <= pos + lineLen) {
        const colText = lines[li]!.slice(0, Math.max(0, this.cursor - pos))
        const x = PAD + s.measure(colText, { size, font })
        const y = TEXT_TOP + li * lineH + 16 - off
        s.fillRect(x, y - size, 2, size + 3, C.INK)
        return
      }
      pos += lineLen
    }
  }

  protected statusTap(): boolean {
    if (this.view !== 'edit') return false
    this.scroller.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    const nav = navTap(x, y)
    if (nav) {
      if (this.view === 'list' && nav === 'right') {
        const n: Note = { id: Date.now(), text: '', ts: Date.now() }
        this.notes.unshift(n)
        this.openEdit(n)
      } else if (this.view === 'edit' && nav === 'right') {
        this.save()
        this.view = 'list'
        this.kbOn = false
        this.kb.reset()
        this.draw()
      }
      return
    }
    if (this.view === 'list') {
      const i = Math.floor((y - 64) / 50)
      if (i >= 0 && i < this.notes.length && x >= 8 && x <= 312) {
        const n = this.notes[i]!
        this.rowPress(() => this.openEdit(n))
      }
      return
    }
    // 编辑页：点文本区放光标 + 弹键盘
    if (!this.kbOn && y >= TEXT_TOP) {
      this.kbOn = true
    }
    if (this.kbOn && y >= 264) {
      const a = this.kb.tap(this.ctx.screen, x, y, this.ime)
      if (a) {
        this.click()
        if (a.type === 'ret') {
          this.kbAction({ type: 'char', ch: '\n' })
        } else this.kbAction(a)
      }
      this.draw()
      return
    }
    if (y >= TEXT_TOP) this.placeCursor(x, y)
    this.draw()
  }

  private openEdit(n: Note) {
    this.cur = n
    this.view = 'edit'
    this.cursor = n.text.length
    this.kbOn = true
    this.scroller.offset = 0
    this.draw()
  }

  private placeCursor(x: number, y: number) {
    const s = this.ctx.screen
    const size = 17, font = F_REG(size)
    const lines = wrapLines(s, this.cur!.text + ' ', 320 - PAD * 2, size, font)
    const lineH = 23
    const li = Math.max(0, Math.min(lines.length - 1, Math.round((y - TEXT_TOP - 16 + this.scroller.offset) / lineH)))
    let col = 0
    const line = lines[li]!
    while (col < line.length && s.measure(line.slice(0, col + 1), { size, font }) < x - PAD) col++
    let pos = 0
    for (let k = 0; k < li; k++) pos += lines[k]!.replace(/ $/, '').length
    this.cursor = Math.min(this.cur!.text.length, pos + col)
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.view !== 'edit') return
    if (this.kbOn && y < 264) this.scroller.onDrag(y, sy)
    else if (!this.kbOn) this.scroller.onDrag(y, sy)
  }
  protected dragEnd() {
    this.scroller.onEnd()
  }
  protected wheel(dy: number) {
    if (this.view === 'edit') this.scroller.wheel(dy)
  }
  protected frame(dt: number) {
    super.frame(dt)
    if (this.scroller.step(dt)) return
  }

  protected insertText(t: string) {
    const c = this.cur!
    c.text = c.text.slice(0, this.cursor) + t + c.text.slice(this.cursor)
    this.cursor += t.length
    this.ensureCursorVisible()
  }
  protected backspaceText() {
    const c = this.cur!
    if (!this.cursor) return
    c.text = c.text.slice(0, this.cursor - 1) + c.text.slice(this.cursor)
    this.cursor--
  }

  private ensureCursorVisible() {
    // 简单跟随：光标超出底部时下推
    const s = this.ctx.screen
    const lines = wrapLines(s, this.cur!.text + ' ', 320 - PAD * 2, 17, F_REG(17))
    let pos = 0
    for (let li = 0; li < lines.length; li++) {
      const len = lines[li]!.replace(/ $/, '').length
      if (this.cursor <= pos + len) {
        const y = TEXT_TOP + li * 23 - this.scroller.offset
        const bottom = this.kbOn ? 264 : 480
        if (y > bottom - 30) this.scroller.offset += y - (bottom - 30)
        return
      }
      pos += len
    }
  }

  private save() {
    // 空备忘录删除
    this.notes = this.notes.filter((n) => n.text.trim() || n !== this.cur)
    this.ctx.store.set('list', this.notes)
  }
}

export const notesFactory = miniApp('notes', '备忘录', iconNotes, (ctx, b) => new NotesApp(ctx, b))

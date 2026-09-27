import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent, wrapText, clipToWidth } from '../ui'

/**
 * 记事本：列表 + 编辑。列表左软键新建、中键打开；
 * 编辑器 T9 输入，退出/完成时自动保存。
 */
export const notesApp: MiniApp = {
  id: 'notes',
  name: '记事本',
  nameEn: 'Notes',
  start(ctx) {
    const ui = new NotesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Note { id: number; body: string; ts: number }

class NotesUI {
  private offs: Array<() => void> = []
  private notes: Note[] = []
  private editing: Note | null = null
  private sel = 0
  private draft = ''
  private t9 = new T9()

  constructor(private ctx: AppContext) {}

  async init() {
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.notes = (await this.ctx.store.get<Note[]>('notes')) ?? []
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => {
      this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
      this.draw()
    }))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (this.editing) return this.editKey(k)
    const n = Math.max(1, this.notes.length)
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok': if (this.notes[this.sel]) this.openEdit(this.notes[this.sel]!); return
      case 'soft1': this.openEdit(null); return
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private openEdit(note: Note | null) {
    this.editing = note ?? { id: Date.now(), body: '', ts: Date.now() }
    this.draft = this.editing.body
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
        this.draft += out ?? '\n'
        break
      }
      case 'left': this.t9.cycleCand(-1); break
      case 'right': this.t9.cycleCand(1); break
      case 'clear':
        if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
        break
      case '#': this.t9.cycleMode(); break
      case 'soft1': case 'soft2': case 'back':
        void this.saveAndClose()
        return
      default: return
    }
    this.draw()
  }

  private async saveAndClose() {
    const body = (this.draft + (this.t9.expire() ?? '')).trim()
    this.notes = this.notes.filter((n) => n.id !== this.editing!.id)
    if (body) {
      this.notes.unshift({ id: this.editing!.id, body, ts: Date.now() })
      this.notes.sort((a, b) => b.ts - a.ts)
    }
    await this.ctx.store.set('notes', this.notes)
    this.editing = null
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    if (this.editing) {
      clearContent(s)
      titleBar(s, this.ctx.lang.get() === 'en' ? 'Note' : '记事本')
      const modeName = { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode]
      const lines = wrapText(s, this.draft + this.t9.hint(), W - 20, 13)
      const top = CONTENT_TOP + 6
      lines.slice(0, 12).forEach((ln, i) => {
        const active = i === lines.length - 1
        s.text(10, top + i * 18, ln, { size: 13, color: active ? C.BLUE : C.INK })
      })
      s.text(10, CONTENT_BOTTOM - 14, modeName, { size: 11, color: C.GRAY })
      softBar(s, this.ctx.lang.get() === 'en' ? 'Done' : '完成', str.contactsBack)
      return
    }
    clearContent(s)
    titleBar(s, this.ctx.lang.get() === 'en' ? 'Notes' : '记事本')
    if (!this.notes.length) {
      s.textCenter(W / 2, 130, this.ctx.lang.get() === 'en' ? '(Empty)' : '（无笔记）', { size: 12, color: C.GRAY })
    } else {
      this.notes.slice(0, 8).forEach((n, i) => {
        const y = CONTENT_TOP + 8 + i * 28
        if (i === this.sel) s.fillRect(6, y - 2, W - 12, 26, C.BLUE)
        const first = n.body.split('\n')[0]!
        const col = i === this.sel ? C.WHITE : C.INK
        s.text(14, y + 6, clipToWidth(s, first, W - 90, 13), { size: 13, color: col })
        s.textRight(W - 12, y + 7, `${String(new Date(n.ts).getMonth() + 1)}/${new Date(n.ts).getDate()}`,
          { size: 10, color: i === this.sel ? C.PALE : C.GRAY })
      })
    }
    softBar(s, this.ctx.lang.get() === 'en' ? 'New' : '新建', str.contactsBack)
  }
}

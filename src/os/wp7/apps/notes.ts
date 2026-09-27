import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, wrapText, clipToWidth } from '../ui'
import { MetroKb } from '../kb'
import { onTrayChange } from '../ui'

interface Note {
  id: number
  text: string
  ts: number
}

/**
 * Windows Phone 7.5 便签（Mango 的 Office 中心里的 OneNote 简化独立应用）：
 * 列表（预览行，按修改时间倒序）+ 编辑（自动保存，中英文混排）。
 */
export const notesApp: MiniApp = {
  id: 'notes',
  name: '便签',
  nameEn: 'Notes',
  start(ctx: AppContext) {
    const ui = new NotesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const LIST_TOP = 110
const ROW_H = 104
const KB_TOP = 470

class NotesUI {
  private notes: Note[] = []
  private view: 'list' | 'edit' = 'list'
  private cur: Note | null = null
  private kb!: MetroKb
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    this.kb = new MetroKb(this.ctx, () => this.onKbChange())
    this.notes = (await this.ctx.store.get<Note[]>('list')) ?? []
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.view === 'list' && (dir === 'up' || dir === 'down')) {
        this.scroll += dir === 'up' ? 240 : -240
        this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.listH() - H)))
        this.draw()
      }
    }))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private scroll = 0

  private listH(): number {
    return Math.min(H, LIST_TOP + this.notes.length * ROW_H + 110)
  }

  private async save() {
    this.notes.sort((a, b) => b.ts - a.ts)
    await this.ctx.store.set('list', this.notes)
  }

  private onKbChange() {
    if (this.view !== 'edit' || !this.cur) return
    this.cur.text = this.kb.text
    this.cur.ts = Date.now()
    void this.save()
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.view === 'edit') {
        void this.save().then(() => this.toList())
      } else this.ctx.exit()
      return
    }
    if (this.view === 'edit') this.kb.key(k)
  }

  private toList() {
    this.view = 'list'
    this.cur = null
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.view === 'list') {
      // 新建条（底部）
      if (y >= H - 100 && y < H - 30) {
        const note: Note = { id: Date.now(), text: '', ts: Date.now() }
        this.notes.push(note)
        this.openEdit(note)
        return
      }
      const r = Math.floor((y - LIST_TOP + this.scroll) / ROW_H)
      if (r >= 0 && r < this.notes.length && y >= LIST_TOP - this.scroll) {
        const note = this.notes[r]!
        this.openEdit(note)
      }
      return
    }
    // edit：点键盘区外无效（键盘占下方）；点上方也可（不动）
    this.kb.tap(x, y, KB_TOP)
  }

  private openEdit(note: Note) {
    this.view = 'edit'
    this.cur = note
    this.kb.text = note.text
    this.kb.mode = 'zh'
    this.kb.ime.reset()
    this.draw()
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
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
    if (this.view === 'list') this.drawList(str.notesTitle)
    else this.drawEdit(str.notesTitle)
    s.render()
  }

  private drawList(title: string) {
    const s = this.ctx.screen
    s.text(24, TRAY_H + 18, title, { size: 40, font: F_LIGHT(40), color: C.WHITE })
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    this.notes.forEach((note, i) => {
      const y = LIST_TOP + i * ROW_H - this.scroll
      if (y < TRAY_H || y >= H - 110) return
      const preview = note.text.trim() || wpStrings(this.ctx.lang.get()).noteEmpty
      const lines = wrapText(s, preview, W - 48, 24, F_REG(24))
      s.text(24, y + 4, clipToWidth(s, lines[0]!, W - 48, 24, F_REG(24)), {
        size: 24, font: F_REG(24), color: C.WHITE,
      })
      if (lines[1])
        s.text(24, y + 40, clipToWidth(s, lines[1], W - 48, 22, F_REG(22)), {
          size: 22, font: F_REG(22), color: C.GRAY,
        })
      s.fillRect(24, y + ROW_H - 8, W - 48, 1, C.DIM)
    })
    // 新建条（强调色）
    s.fillRect(24, H - 100, W - 48, 70, accent)
    s.textCenter(W / 2, H - 75, '+', { size: 40, font: F_SEMI(40), color: C.WHITE })
  }

  private drawEdit(title: string) {
    const s = this.ctx.screen
    s.text(24, TRAY_H + 18, title, { size: 40, font: F_LIGHT(40), color: C.WHITE })
    // 正文区（键盘上方）：从 y=110 起多行
    const text = this.kb.text
    if (text) {
      const lines = wrapText(s, text, W - 48, 24, F_REG(24))
      lines.forEach((l, i) => {
        if (110 + i * 30 < KB_TOP - 80)
          s.text(24, 110 + i * 30, l, { size: 24, font: F_REG(24), color: C.WHITE })
      })
    } else {
      s.text(24, 110, wpStrings(this.ctx.lang.get()).noteEmpty, {
        size: 24, font: F_REG(24), color: C.GRAY,
      })
    }
    this.kb.draw(s, KB_TOP)
  }
}

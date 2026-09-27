import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../t9'
import { osStrings } from '../strings'

interface Reminder {
  id: number
  text: string
}

/**
 * 备忘事项（1100 顶级 08 三模式；3310 顶级 10）：
 * 列表（含 Add new）→ T9 编辑 → 查看/Erase。AppStore 'list'。
 */
export const remindersApp: MiniApp = {
  id: 'reminders',
  name: '备忘事项',
  nameEn: 'Reminders',
  start(ctx: AppContext) {
    new RemindersUI(ctx)
  },
}

class RemindersUI {
  private view: 'list' | 'edit' | 'view' = 'list'
  private list: Reminder[] = []
  private sel = 0
  private top = 0
  private draft = ''
  private t9 = new T9()
  private readonly rows: number

  constructor(private ctx: AppContext) {
    this.rows = Math.floor((ctx.screen.h - 11) / 11)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.every(100, () => {
      const out = this.t9.expire()
      if (out) this.draft += out
      if (this.view === 'edit') this.draw()
    })
    void this.init()
  }

  private async init() {
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.list = (await this.ctx.store.get<Reminder[]>('list')) ?? []
    this.draw()
  }

  /** 列表项：所有备忘 + Add new */
  private get items(): Array<Reminder | { id: -1; add: true }> {
    return [...this.list, { id: -1, add: true }]
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'list') this.listKey(k)
    else if (this.view === 'edit') this.editKey(k)
    else this.viewKey(k)
  }

  private listKey(k: DeviceKey) {
    const items = this.items
    const n = items.length
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        this.clamp(); this.draw(); break
      case 'down':
        this.sel = (this.sel + 1) % n
        this.clamp(); this.draw(); break
      case 'ok':
      case 'soft1': {
        const it = items[this.sel]!
        if ('add' in it) {
          this.view = 'edit'
          this.draft = ''
        } else {
          this.view = 'view'
        }
        this.draw(); break
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit()
    }
  }

  private editKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else if (k === 'ok') {
      const out = this.t9.select()
      if (out) this.draft += out
    } else if (k === 'back' || k === 'soft2' || k === 'clear') {
      // 真机 Options→Save：返回键取消；这里 clear 在有文本时也取消（不存）
      this.view = 'list'
      this.sel = 0
    } else if (k === 'soft1') {
      if (this.draft.trim()) {
        this.list.push({ id: Date.now(), text: this.draft.trim() })
        void this.ctx.store.set('list', this.list)
        this.view = 'list'
        this.sel = this.list.length - 1
      }
    }
    this.draw()
  }

  private viewKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'soft1': {
        // Erase
        const r = this.list[this.sel]
        if (r) {
          this.list = this.list.filter((x) => x.id !== r.id)
          void this.ctx.store.set('list', this.list)
        }
        this.view = 'list'
        this.sel = 0
        break
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'list'
    }
    this.draw()
  }

  private clamp() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.view === 'edit') {
      s.text(2, 2, str.rmSubject, { size: 9 })
      // 文本区
      const text = this.draft || '_'
      s.text(2, 18, text, { size: 12 })
      s.text(1, H - 10, str.rmSave, { size: 9 })
      s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
      return
    }
    if (this.view === 'view') {
      const r = this.list[this.sel]
      s.text(2, 8, r?.text ?? '', { size: 12 })
      s.text(1, H - 10, str.rmErase, { size: 9 })
      s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
      return
    }
    const items = this.items
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const it = items[i]!
      const label = 'add' in it ? str.rmAdd : (it as Reminder).text
      const y = r * 11
      s.text(2, y + 1, label, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (items.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / items.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / items.length) * (H - 11))))
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, rrStroke } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * MemoPad / Tasks：条目列表 + 全文编辑；任务带完成勾选。
 */

interface Item {
  id: number
  text: string
  done?: boolean
}

abstract class NoteBase extends BBApp {
  protected list: Item[] = []
  private mode: 'list' | 'edit' = 'list'
  private sel = 0
  private editing = ''
  private editId = -1
  protected abstract storeKey: string

  protected async onStart() {
    this.list = (await this.ctx.store.get<Item[]>(this.storeKey)) ?? this.seedItems()
  }

  protected seedItems(): Item[] { return [] }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, this.title(), { size: 18, color: C.WHITE })
    if (this.mode === 'list') this.drawList()
    else this.drawEdit()
    s.render()
  }

  protected abstract title(): string

  private drawList() {
    const s = this.ctx.screen
    if (!this.list.length) {
      s.textCenter(240, 150, this.str.empty, { size: 16, color: C.G5 })
      return
    }
    this.list.forEach((it, i) => {
      const y = 42 + i * 34
      if (i === this.sel) rr(s, 4, y, 472, 30, 4, C.FIELD_BG)
      if (this.isTasks()) {
        rrStroke(s, 16, y + 7, 18, 18, 3, it.done ? C.GREEN_D : C.G6)
        if (it.done) s.text(19, y + 7, '✓', { size: 13, color: C.GREEN_D })
      }
      s.text(this.isTasks() ? 44 : 18, y + 8,
        (it.done ? '~' : '') + it.text.split('\n')[0]!, {
          size: 15,
          color: it.done ? C.G5 : C.INK,
          maxWidth: 410,
        })
    })
  }

  private drawEdit() {
    const s = this.ctx.screen
    const lines = this.editing.split('\n')
    lines.forEach((ln, i) => s.text(16, 50 + i * 22, ln || ' ', {
      size: 16, color: C.INK, maxWidth: 448,
    }))
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      const li = lines.length - 1
      const w = s.measure(lines[li]!, { size: 16 })
      s.fillRect(16 + w, 50 + li * 22, 2, 19, C.SELECT)
    }
    s.text(12, 292, this.str.save + ': Enter · \\n: #', { size: 13, color: C.SELECT })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'list') this.listKey(k)
    else this.editKey(k)
  }

  private listKey(k: DeviceKey) {
    const n = this.list.length
    if (k === 'up' && n) this.sel = (this.sel + n - 1) % n
    else if (k === 'down' && n) this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      if (this.isTasks() && n) {
        // 任务：ok 切换完成
        this.list[this.sel]!.done = !this.list[this.sel]!.done
        void this.persist()
      } else if (n) {
        this.editId = this.list[this.sel]!.id
        this.editing = this.list[this.sel]!.text
        this.mode = 'edit'
      }
    } else if (k === 'clear' && n) {
      this.list.splice(this.sel, 1)
      this.sel = Math.min(this.sel, this.list.length - 1)
      void this.persist()
    } else if (k === 'space' && !n) {
      this.beginNew()
    } else return
    this.draw()
  }

  /** 返回键：编辑→列表；列表（根）→退出应用 */
  protected onBack(): boolean {
    if (this.mode === 'list') return false
    this.mode = 'list'
    this.draw()
    return true
  }

  private editKey(k: DeviceKey) {
    if (k === 'clear') this.editing = this.editing.slice(0, -1)
    else if (k === 'ok') { this.save() ; return }
    else if (k === '#') this.editing += '\n'
    else if (k === 'space') this.editing += ' '
    else if (/^[a-z0-9.,']$/.test(k)) this.editing += k
    else return
    this.draw()
  }

  private beginNew() {
    this.editId = -1
    this.editing = ''
    this.mode = 'edit'
  }

  private save() {
    const text = this.editing.trim()
    if (text) {
      if (this.editId < 0) {
        this.list.push({ id: Date.now(), text, done: false })
      } else {
        const it = this.list.find((x) => x.id === this.editId)
        if (it) it.text = text
      }
      void this.persist()
    }
    this.mode = 'list'
    this.draw()
  }

  private persist() {
    return this.ctx.store.set(this.storeKey, this.list)
  }

  protected isTasks(): boolean { return false }

  protected menuItems(): MenuCommand[] {
    if (this.mode === 'edit') {
      return [{ label: this.str.save, fn: () => this.save() }]
    }
    return [{ label: '+', fn: () => this.beginNew() }]
  }
}

export class MemoApp extends NoteBase {
  protected storeKey = 'memos'
  protected title(): string { return this.str.apps.memopad! }
}

export class TasksApp extends NoteBase {
  protected storeKey = 'tasks'
  protected title(): string { return this.str.apps.tasks! }
  protected override isTasks(): boolean { return true }

  protected override seedItems(): Item[] {
    const zh = this.ctx.lang.get() === 'zh'
    return [
      { id: 1, text: zh ? '给妈妈回电话' : 'Call Mom back', done: false },
      { id: 2, text: zh ? '周末买猫粮' : 'Buy cat food', done: true },
    ]
  }
}

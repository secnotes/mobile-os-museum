import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { loadContacts, type Contact } from '../../../scenario/data'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, H, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent, clipToWidth, disc } from '../ui'

const ROW_H = 48
const VISIBLE_ROWS = Math.floor((CONTENT_BOTTOM - CONTENT_TOP) / ROW_H) // 5

type View = 'list' | 'detail' | 'edit'
type FieldKey = 'name' | 'tel' | 'home' | 'email' | 'company' | 'group'

/** 编辑表单字段（group 用左右循环，其余进 T9 编辑） */
const FIELDS: Array<{ key: FieldKey; kind: 'text' | 'num' | 'group' }> = [
  { key: 'name', kind: 'text' },
  { key: 'tel', kind: 'num' },
  { key: 'home', kind: 'num' },
  { key: 'email', kind: 'text' },
  { key: 'company', kind: 'text' },
  { key: 'group', kind: 'group' },
]

export const contactsApp: MiniApp = {
  id: 'contacts',
  name: '名片夹',
  nameEn: 'Contacts',
  icon(s, x, y) {
    // 绿底白人像
    s.fillRect(x, y, 44, 44, C.GREEN)
    disc(s, x + 22, y + 15, 8, C.WHITE)
    for (let dy = 0; dy < 14; dy++) {
      const half = Math.min(18, 4 + dy)
      s.fillRect(x + 22 - half, y + 26 + dy, half * 2, 1, C.WHITE)
    }
  },
  start(ctx: AppContext) {
    const ui = new ContactsUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

class ContactsUI {
  private view: View = 'list'
  private list: Contact[] = []
  private sel = 0
  private top = 0
  /** Options 弹层 */
  private optsOpen = false
  private optsSel = 0
  /** 居中提示框（任意键关闭） */
  private note = ''
  // 编辑态
  private editingNew = false
  private editOrig: Contact | null = null
  private draft: Contact = { name: '', tel: '' }
  private fieldSel = 0
  /** -1 = 未激活任何字段（表单导航态） */
  private active = -1
  private t9 = new T9()
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  init() {
    void this.reload()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    // 设置页编辑通讯录时即时刷新
    this.offs.push(
      this.ctx.store.onChange((key) => {
        if (key === 'contacts') void this.reload()
      }),
    )
  }

  dispose() {
    this.offs.forEach((off) => off())
  }

  private async reload(select?: Contact) {
    // 通讯录存设备级 'contacts' 键，经 host 桥读取（桥在首次读取时写回种子）
    this.list =
      (await this.ctx.host.getContacts?.()) ??
      (await loadContacts(this.ctx.store.get.bind(this.ctx.store)))
    if (select) {
      const idx = this.list.findIndex((c) => c.name === select.name && c.tel === select.tel)
      if (idx >= 0) this.sel = idx
    }
    this.sel = Math.min(this.sel, Math.max(0, this.list.length - 1))
    this.fixTop()
    this.draw()
  }

  // ---------- 输入分派 ----------

  private onKey(k: DeviceKey) {
    if (this.note) {
      this.note = ''
      this.draw()
      return
    }
    if (this.view === 'edit') return this.editKey(k)
    if (this.optsOpen) return this.optsKey(k)
    if (this.view === 'detail') return this.detailKey(k)
    this.listKey(k)
  }

  // ---------- 列表 ----------

  private listKey(k: DeviceKey) {
    const n = this.list.length
    switch (k) {
      case 'up':
        if (n > 1) this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        if (n > 1) this.sel = (this.sel + 1) % n
        break
      case 'ok':
        if (n) {
          this.fixTop()
          this.view = 'detail'
        }
        break
      case 'soft1':
        this.openOpts()
        return
      case 'soft2':
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.fixTop()
    this.draw()
  }

  private detailKey(k: DeviceKey) {
    const c = this.list[this.sel]
    if (!c) {
      this.view = 'list'
      this.draw()
      return
    }
    switch (k) {
      case 'ok':
        this.ctx.host.dial?.(c.tel || c.home || '', c.name)
        return
      case 'soft1':
        this.openOpts()
        return
      case 'soft2':
      case 'back':
        this.view = 'list'
        break
      default:
        return
    }
    this.draw()
  }

  // ---------- Options 弹层 ----------

  private openOpts() {
    this.optsOpen = true
    this.optsSel = 0
    this.draw()
  }

  /** 当前视图的选项条目 */
  private optLabels(): string[] {
    const str = s60Strings(this.ctx.lang.get())
    if (this.view === 'detail') {
      return [str.contactsCall, str.cEdit, str.cDelete, str.cNew]
    }
    return this.list.length ? [str.cOpen, str.cNew, str.cDelete] : [str.cNew]
  }

  private optsKey(k: DeviceKey) {
    const labels = this.optLabels()
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
    if (pick === str.cOpen) {
      this.view = 'detail'
      this.draw()
    } else if (pick === str.contactsCall) {
      const c = this.list[this.sel]!
      this.ctx.host.dial?.(c.tel || c.home || '', c.name)
    } else if (pick === str.cEdit) {
      this.startEdit(this.list[this.sel] ?? null)
    } else if (pick === str.cNew) {
      this.startEdit(null)
    } else if (pick === str.cDelete) {
      void this.deleteSelected()
    }
  }

  private async deleteSelected() {
    const c = this.list[this.sel]
    if (!c) return
    const next = this.list.filter((x) => x !== c)
    await this.ctx.host.saveContacts?.(next)
    this.sel = Math.max(0, this.sel - 1)
    if (this.view === 'detail') this.view = 'list'
    this.note = s60Strings(this.ctx.lang.get()).camDeleted
    await this.reload()
  }

  // ---------- 编辑 ----------

  private startEdit(c: Contact | null) {
    this.view = 'edit'
    this.editingNew = !c
    this.editOrig = c
    this.draft = c ? { ...c } : { name: '', tel: '' }
    this.fieldSel = 0
    this.active = -1
    this.t9.reset()
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.draw()
  }

  private fieldVal(key: FieldKey): string {
    return (this.draft[key] as string | undefined) ?? ''
  }

  private editKey(k: DeviceKey) {
    const field = FIELDS[this.fieldSel]!
    // 字段导航态
    if (this.active === -1) {
      switch (k) {
        case 'up':
          this.fieldSel = (this.fieldSel + FIELDS.length - 1) % FIELDS.length
          break
        case 'down':
          this.fieldSel = (this.fieldSel + 1) % FIELDS.length
          break
        case 'left':
        case 'right':
          if (field.kind === 'group') this.cycleGroup(k === 'right' ? 1 : -1)
          break
        case 'ok':
          if (field.kind !== 'group') this.activateField(field)
          break
        case 'soft1':
          void this.saveEdit()
          return
        case 'soft2':
        case 'back':
          this.view = this.editingNew ? 'list' : 'detail'
          break
        default:
          return
      }
      this.draw()
      return
    }
    // 字段编辑态
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft[field.key] = this.fieldVal(field.key) + out
    } else switch (k) {
      case 'ok':
      case 'soft1':
      case 'soft2':
      case 'back':
        this.commitField(field)
        this.active = -1
        break
      case 'clear':
        if (this.t9.backspace() === 'char') {
          const v = this.fieldVal(field.key)
          this.draft[field.key] = v.slice(0, -1)
        }
        break
      case '#':
        this.t9.cycleMode()
        break
      case 'left':
        this.t9.cycleCand(-1)
        break
      case 'right':
        this.t9.cycleCand(1)
        break
      default:
        return
    }
    this.draw()
  }

  private activateField(field: (typeof FIELDS)[number]) {
    this.active = this.fieldSel
    if (field.kind === 'num') this.t9.setMode('num')
    else this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
  }

  private commitField(field: (typeof FIELDS)[number]) {
    if (field.kind === 'group') return
    const out = this.t9.expire() ?? this.t9.select() ?? ''
    if (out) this.draft[field.key] = this.fieldVal(field.key) + out
  }

  private cycleGroup(dir: 1 | -1) {
    const str = s60Strings(this.ctx.lang.get())
    const groups = str.cGroups
    const cur = groups.indexOf(this.fieldVal('group'))
    const next = (cur + dir + groups.length + 1) % (groups.length + 1) - 1
    this.draft.group = next < 0 ? '' : groups[next]
  }

  private async saveEdit() {
    const str = s60Strings(this.ctx.lang.get())
    // 正在编辑的字段先提交
    if (this.active >= 0) {
      this.commitField(FIELDS[this.active]!)
      this.active = -1
    }
    const name = this.fieldVal('name').trim()
    if (!name) {
      this.note = str.cNeedName
      this.draw()
      return
    }
    const entry: Contact = {
      name,
      tel: this.fieldVal('tel').trim(),
      home: this.fieldVal('home').trim() || undefined,
      email: this.fieldVal('email').trim() || undefined,
      company: this.fieldVal('company').trim() || undefined,
      group: this.fieldVal('group') || undefined,
    }
    let next: Contact[]
    if (this.editingNew || !this.editOrig) {
      next = [...this.list, entry]
    } else {
      const idx = this.list.indexOf(this.editOrig)
      next = [...this.list]
      if (idx >= 0) next[idx] = entry
    }
    await this.ctx.host.saveContacts?.(next)
    this.note = str.cSaved
    this.sel = Math.max(0, next.indexOf(entry))
    this.view = 'detail'
    await this.reload(entry)
  }

  private fixTop() {
    const n = this.list.length
    if (n <= VISIBLE_ROWS) this.top = 0
    else this.top = Math.max(0, Math.min(this.sel - 2, n - VISIBLE_ROWS))
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.view === 'edit') return this.drawEdit()
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    if (this.view === 'detail') return this.drawDetail()
    clearContent(s)
    titleBar(s, str.contactsTitle)
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      const i = this.top + r
      if (i >= this.list.length) break
      const c = this.list[i]!
      const y = CONTENT_TOP + r * ROW_H
      const selRow = i === this.sel
      if (selRow) s.fillRect(0, y, W, ROW_H, C.BLUE)
      s.text(14, y + 7, clipToWidth(s, c.name, W - 40, 15), {
        size: 15,
        color: selRow ? C.WHITE : C.INK,
      })
      s.text(14, y + 28, c.tel || c.home || '', { size: 11, color: selRow ? C.PALE : C.GRAY })
    }
    if (!this.list.length) {
      s.textCenter(W / 2, 140, str.cEmpty, { size: 12, color: C.GRAY })
    }
    softBar(s, str.cOpen, str.contactsBack)
    if (this.optsOpen) this.drawOptsPanel(this.optLabels())
    if (this.note) this.drawNote(this.note)
  }

  /** 详情卡 */
  private drawDetail() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const c = this.list[this.sel]
    if (!c) {
      this.view = 'list'
      this.draw()
      return
    }
    clearContent(s)
    titleBar(s, clipToWidth(s, c.name, W - 20, 15))
    // 头像 disc + 首字
    disc(s, 52, CONTENT_TOP + 36, 30, c.group ? C.GREEN : C.SKY)
    s.textCenter(52, CONTENT_TOP + 25, c.name[0] ?? '?', { size: 22, color: C.WHITE })
    const rows: Array<[string, string]> = [
      [str.cMobile, c.tel],
      [str.cHomeTel, c.home ?? ''],
      [str.cEmail, c.email ?? ''],
      [str.cCompany, c.company ?? ''],
      [str.cGroup, c.group ?? ''],
    ]
    rows.forEach(([label, val], i) => {
      const y = CONTENT_TOP + 80 + i * 30
      s.text(16, y, label, { size: 12, color: C.GRAY })
      s.text(86, y, clipToWidth(s, val || '—', W - 100, 14), {
        size: 14,
        color: val ? C.INK : C.GRAY,
      })
    })
    s.text(16, CONTENT_BOTTOM - 16, str.contactsCall, { size: 10, color: C.GRAY })
    softBar(s, str.cOpen, str.contactsBack)
    if (this.optsOpen) this.drawOptsPanel(this.optLabels())
    if (this.note) this.drawNote(this.note)
  }

  /** Options 白色弹层（列表/详情共用） */
  private drawOptsPanel(labels: string[]) {
    const s = this.ctx.screen
    const pw = 168
    const ph = labels.length * 28 + 10
    const x = (W - pw) / 2
    const y = 92
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

  /** 编辑表单 */
  private drawEdit() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    titleBar(s, this.editingNew ? str.cNew : str.cEdit)
    const labels: Record<FieldKey, string> = {
      name: str.cName,
      tel: str.cMobile,
      home: str.cHomeTel,
      email: str.cEmail,
      company: str.cCompany,
      group: str.cGroup,
    }
    const FH = 32
    FIELDS.forEach((field, i) => {
      const y = CONTENT_TOP + 4 + i * FH
      const selRow = i === this.fieldSel
      if (selRow) s.fillRect(4, y - 2, W - 8, FH - 2, C.BLUE)
      s.text(14, y + 5, labels[field.key], {
        size: 13,
        color: selRow ? C.WHITE : C.INK,
      })
      let val = this.fieldVal(field.key)
      let hint = ''
      if (i === this.active) {
        hint = this.t9.hint()
        // 拼音候选条由底部专用面板绘制
      }
      const shown = val + hint
      const col = selRow ? (shown ? C.AMBER : C.PALE) : shown ? C.BLUE : C.GRAY
      s.text(82, y + 5, clipToWidth(s, shown || (field.kind === 'group' ? '—' : ''), W - 96, 13),
        { size: 13, color: col })
    })
    // 编辑态：输入法模式 + 候选条
    if (this.active >= 0) {
      const modeName = { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode]
      s.text(10, CONTENT_BOTTOM - 44, modeName, { size: 10, color: C.GRAY })
      const cands = this.t9.cands.slice(0, 5)
      cands.forEach((cand, i) => {
        const x = 60 + i * 36
        if (i === this.t9.candIdx) {
          s.fillRect(x - 3, CONTENT_BOTTOM - 48, 32, 22, C.BLUE)
          s.text(x, CONTENT_BOTTOM - 44, cand, { size: 13, color: C.WHITE })
        } else {
          s.text(x, CONTENT_BOTTOM - 44, cand, { size: 13, color: C.INK })
        }
      })
    }
    const left = this.active >= 0 ? (en ? 'Done' : '完成') : (en ? 'Save' : '保存')
    softBar(s, left, str.contactsBack)
    if (this.note) this.drawNote(this.note)
  }

  /** 居中提示框 */
  private drawNote(text: string) {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    s.fillRect(0, 0, W, H, C.DARK)
    const w = 200
    const x = (W - w) / 2
    const y = 130
    s.fillRect(x, y, w, 64, C.WHITE)
    s.textCenter(W / 2, y + 24, text, { size: 14, color: C.INK })
    s.textCenter(W / 2, y + 46, str.aboutAnyKey, { size: 10, color: C.GRAY })
  }
}

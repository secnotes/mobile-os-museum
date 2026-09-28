import type { DeviceKey } from '../../../hal/input'
import type { Contact } from '../../../scenario/data'
import { C } from '../palette'
import { rrGrad, rr, disc } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Contacts（地址簿）：列表 → 名片 → 编辑。
 */

type Mode = 'list' | 'view' | 'edit'

export class ContactsApp extends BBApp {
  private mode: Mode = 'list'
  private list: Contact[] = []
  private sel = 0
  private listOff = 0
  // 编辑缓冲
  private editing = { name: '', tel: '', email: '' }
  private field = 0

  protected async onStart() {
    this.list = (await this.host.getContacts()) ?? []
    this.sort()
  }

  private sort() {
    this.list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'list') this.drawList()
    else if (this.mode === 'view') this.drawView()
    else this.drawEdit()
    s.render()
  }

  private header(title: string) {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 36, 0, [C.WP2, 3])
    s.text(12, 8, title, { size: 19, color: C.WHITE })
  }

  private drawList() {
    const s = this.ctx.screen
    this.header(this.str.apps.contacts!)
    const ROW = 34
    this.list.forEach((c, i) => {
      const y = 36 + i * ROW - this.listOff
      if (y < 36 - ROW || y > 320) return
      if (i === this.sel) rr(s, 2, y + 2, 476, ROW - 4, 4, C.FIELD_BG)
      s.text(16, y + 8, c.name, { size: 16, color: C.INK })
      s.textRight(468, y + 9, c.tel, { size: 14, color: C.G6 })
    })
    if (!this.list.length) s.textCenter(240, 160, this.str.empty, { size: 16, color: C.G5 })
  }

  private drawView() {
    const s = this.ctx.screen
    const c = this.list[this.sel]
    if (!c) { this.mode = 'list'; return }
    this.header(c.name)
    // 头像圆
    disc(s, 80, 110, 38, C.FIELD_BG)
    s.textCenter(80, 90, c.name.slice(0, 1), { size: 40, color: C.SELECT })
    const rows: Array<[string, string]> = [
      ['📞', c.tel],
      ...(c.email ? [['✉', c.email] as [string, string]] : []),
      ...(c.company ? [['🏢', c.company] as [string, string]] : []),
    ]
    rows.forEach((r, i) => {
      const y = 90 + i * 44
      s.text(180, y, r[0], { size: 18, color: C.G6 })
      s.text(214, y + 2, r[1], { size: 17, color: C.INK })
      s.fillRect(180, y + 28, 280, 1, C.G2)
    })
  }

  private drawEdit() {
    const s = this.ctx.screen
    this.header(this.str.apps.contacts!)
    const fields: Array<[string, string]> = [
      [this.str.contacts, this.editing.name],
      ['Tel', this.editing.tel],
      ['Email', this.editing.email],
    ]
    fields.forEach((f, i) => {
      const y = 56 + i * 64
      if (i === this.field) rr(s, 10, y - 4, 460, 52, 6, C.FIELD_BG)
      s.text(18, y, f[0], { size: 13, color: C.G6 })
      s.text(18, y + 18, f[1] || '_', { size: 18, color: C.INK })
      if (i === this.field && Math.floor(Date.now() / 500) % 2 === 0) {
        const w = s.measure(f[1], { size: 18 })
        s.fillRect(18 + w, y + 18, 2, 20, C.SELECT)
      }
    })
    s.textCenter(240, 284, this.str.save + ': Enter', { size: 14, color: C.SELECT })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'list') this.listKey(k)
    else if (this.mode === 'view') this.viewKey(k)
    else this.editKey(k)
  }

  private listKey(k: DeviceKey) {
    const n = this.list.length
    if (!n) return
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') this.mode = 'view'
    else return
    this.clampSel()
    this.draw()
  }

  /** 返回键：详情/编辑→列表；列表（根）→退出应用 */
  protected onBack(): boolean {
    if (this.mode === 'list') return false
    this.mode = 'list'
    this.draw()
    return true
  }

  private viewKey(k: DeviceKey) {
    if (k === 'call') {
      const c = this.list[this.sel]
      if (c) this.host.dial?.(c.tel, c.name)
      return
    } else if (k === 'ok') {
      const c = this.list[this.sel]
      if (c) this.host.dialMsg?.(c.tel, c.name)
      return
    } else return
    this.draw()
  }

  private editKey(k: DeviceKey) {
    if (k === 'clear') {
      const cur = this.fieldKey()
      this.setField(cur.slice(0, -1))
    } else if (k === 'up' || k === 'down') {
      this.field = (this.field + (k === 'down' ? 1 : 2)) % 3
    } else if (k === 'ok') {
      this.save()
      return
    } else if (k === 'space') {
      this.setField(this.fieldKey() + ' ')
    } else if (/^[a-z0-9.,@-]$/.test(k)) {
      // email 字段无 @ 键：长按不可用，'#' 当 @
      const ch = this.field === 2 && k === '#' ? '@' : k
      this.setField(this.fieldKey() + ch)
    } else return
    this.draw()
  }

  private fieldKey(): 'name' | 'tel' | 'email' {
    return (['name', 'tel', 'email'] as const)[this.field]!
  }

  private setField(v: string) {
    this.editing[this.fieldKey()] = v
  }

  private clampSel() {
    const y0 = this.sel * 34
    if (y0 < this.listOff) this.listOff = y0
    else if (y0 + 34 > this.listOff + 284) this.listOff = y0 + 34 - 284
  }

  private save() {
    const { name, tel } = this.editing
    if (!name || !tel) { this.mode = 'list'; this.draw(); return }
    this.list[this.sel] = { ...this.editing }
    this.sort()
    this.sel = Math.max(0, this.list.findIndex((c) => c.name === name))
    void this.host.saveContacts(this.list)
    this.mode = 'list'
    this.draw()
  }

  private newContact() {
    this.editing = { name: '', tel: '', email: '' }
    this.field = 0
    this.mode = 'edit'
    this.draw()
  }

  private deleteContact() {
    const c = this.list[this.sel]
    if (!c) return
    this.list.splice(this.sel, 1)
    this.sel = Math.min(this.sel, this.list.length - 1)
    void this.host.saveContacts(this.list)
    this.mode = 'list'
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    if (this.mode === 'list') {
      return [
        { label: this.str.apps.contacts + ' +', fn: () => this.newContact() },
      ]
    }
    if (this.mode === 'view') {
      const c = this.list[this.sel]
      return [
        { label: '📞 ' + (this.ctx.lang.get() === 'en' ? 'Call' : '呼叫'), fn: () => c && this.host.dial?.(c.tel, c.name) },
        { label: '✉ ' + (this.ctx.lang.get() === 'en' ? 'SMS' : '发短信'), fn: () => c && this.host.dialMsg?.(c.tel, c.name) },
        { label: this.str.delete, fn: () => this.deleteContact() },
      ]
    }
    return [{ label: this.str.save, fn: () => this.save() }]
  }
}


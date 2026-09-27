import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../t9'
import { loadContacts, type Contact } from '../../../scenario/data'
import { osStrings } from '../strings'

/**
 * 通讯录（多模式叶子，共享 id 'contacts'）：
 *   search  查找：姓名过滤 → 命中列表 → 名片（呼叫/编辑/删除/发送名片）
 *   add     新增：姓名 → 号码 → 保存
 *   speed   速拨：2–9 槽位指定号码/联系人
 *   options 设置：存储状态
 * 列表统一写设备裸键 contacts（经 host.saveContacts）。
 */
export type ContactMode = 'search' | 'add' | 'speed' | 'options'

export const contactsApp = (mode: ContactMode): MiniApp => ({
  id: 'contacts',
  name: '通讯录',
  nameEn: 'Contacts',
  icon(s, x, y) {
    // 人像 + 电话听筒
    s.bitmap(x, y, [
      '..####..',
      '.######.',
      '.##..##.',
      '..####..',
      '........',
      '.######.',
      '#.#..#.#',
      '.#....#.',
    ])
  },
  start(ctx: AppContext) {
    const ui = new ContactsUI(ctx, mode)
    void ui.init()
    return () => ui.dispose()
  },
})

// ---------- 编辑器接口（主 UI 委托按键，避免双订阅串键） ----------

interface Editor {
  key(k: DeviceKey): void
  draw(): void
  /** 100ms 节拍（T9 多击到期提交），返回 true 表示已重绘 */
  tick(): boolean
}

// ---------- 主 UI ----------

type View =
  | 'list' | 'card' | 'copts' | 'confirmErase'
  | 'addName' | 'addNum'
  | 'speedList' | 'speedMenu' | 'speedNum' | 'speedPick'
  | 'memory' | 'toast'

class ContactsUI {
  private list: Contact[] = []
  private view: View
  private sel = 0
  private top = 0
  private editor: Editor | null = null
  private dead = false
  private offs: Array<() => void> = []
  private toastText = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  // speed 模式状态
  private speed: Record<string, string> = {}
  private slot = '2'
  private pickSel = 0
  // search 模式的隐形姓名过滤（真机：列表内打字即过滤）
  private filterT9: T9 | null = null
  private filterText = ''
  // add/edit 暂存
  private newContact: Contact = { name: '', tel: '' }
  private editContact: Contact = { name: '', tel: '' }
  private editIndex = 0

  private get rows(): number {
    return Math.floor((this.ctx.screen.h - 11) / 11)
  }

  constructor(private ctx: AppContext, private mode: ContactMode) {
    this.view =
      mode === 'add' ? 'addName'
      : mode === 'speed' ? 'speedList'
      : mode === 'options' ? 'memory'
      : 'list'
  }

  async init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.every(100, () => {
      if (this.editor) { if (this.editor.tick()) return }
      if (this.filterT9) {
        const out = this.filterT9.expire()
        if (out) {
          this.filterText += out
          this.sel = 0
          this.top = 0
        }
      }
      this.draw()
    }))
    this.list =
      (await this.ctx.host.getContacts?.()) ??
      (await loadContacts(this.ctx.store.get.bind(this.ctx.store)))
    if (this.view === 'speedList') {
      this.speed = (await this.ctx.store.get<Record<string, string>>('speed')) ?? {}
    }
    if (this.mode === 'search') {
      this.filterT9 = new T9()
      this.filterT9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    }
    this.openInitialEditor()
    this.draw()
  }

  dispose() {
    this.dead = true
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.offs.forEach((off) => off())
  }

  // ---------- 初始编辑器（filter / add 的姓名页） ----------

  private openInitialEditor() {
    const str = osStrings(this.ctx.lang.get())
    if (this.view === 'addName') {
      this.editor = new NameEditor(this.ctx, str.ctName, '',
        (text, ed) => {
          if (!text) { ed.setError(str.ctNoName); return }
          this.editor = null
          this.newContact = { name: text, tel: '' }
          this.view = 'addNum'
          this.openAddNumber()
        },
        () => { this.editor = null; this.ctx.exit() })
    }
  }

  private openAddNumber() {
    const str = osStrings(this.ctx.lang.get())
    this.editor = new PhoneEditor(this.ctx, str.ctNumber, '', null,
      (num) => {
        this.newContact.tel = num
        this.list.push({ ...this.newContact })
        this.editor = null
        void this.persist().then(() => this.showToast(str.ctSaved, () => this.ctx.exit()))
      },
      () => { this.editor = null; this.ctx.exit() })
  }

  // ---------- 查找过滤 ----------

  /** 隐形过滤后的展示列表（filterText 为空即全部） */
  private filtered(): Contact[] {
    const q = this.filterText.trim()
    return q ? this.list.filter((c) => c.name.includes(q)) : this.list
  }

  /** 名片页返回列表：把 this.list 下标映回过滤集位置 */
  private backToList() {
    this.view = 'list'
    const idx = this.filtered().indexOf(this.list[this.sel]!)
    this.sel = idx < 0 ? 0 : idx
    this.fixTop()
  }

  // ---------- 按键分发 ----------

  private onKey(k: DeviceKey) {
    if (this.editor) { this.editor.key(k); return }
    switch (this.view) {
      case 'list': this.keyList(k); break
      case 'card': this.keyCard(k); break
      case 'copts': this.keyCardOptions(k); break
      case 'confirmErase': this.keyConfirmErase(k); break
      case 'speedList': this.keySpeedList(k); break
      case 'speedMenu': this.keySpeedMenu(k); break
      case 'speedPick': this.keySpeedPick(k); break
      case 'memory':
        if (k !== 'power') this.ctx.exit()
        break
      case 'toast': break
      default: break
    }
  }

  private keyList(k: DeviceKey) {
    // 打字过滤（search 模式；真机列表内数字键即过滤）
    if (this.filterT9) {
      if (/^[0-9]$/.test(k)) {
        const out = this.filterT9.press(k)
        if (out) this.filterText += out
        this.sel = 0
        this.top = 0
        this.draw()
        return
      }
      if (k === '#') { this.filterT9.cycleMode(); this.draw(); return }
      if (k === 'clear') {
        if (this.filterText || this.filterT9.cands.length) {
          if (this.filterT9.backspace() === 'char')
            this.filterText = this.filterText.slice(0, -1)
          this.sel = 0
          this.top = 0
          this.draw()
          return
        }
        this.ctx.exit()
        return
      }
    } else if (k === 'clear') {
      this.ctx.exit()
      return
    }
    // 有拼音候选时 ok 先确认候选（再按一次才打开名片）
    if (k === 'ok' && this.filterT9?.cands.length) {
      const out = this.filterT9!.select()
      if (out) this.filterText += out
      this.sel = 0
      this.top = 0
      this.draw()
      return
    }
    if (k === 'back' || k === 'soft2') { this.ctx.exit(); return }
    const hits = this.filtered()
    const n = hits.length
    if (!n) return
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(); break
      case 'ok':
      case 'soft1':
        // 进名片前映到 this.list 全量下标（名片浏览可遍历全部）
        this.sel = this.list.indexOf(hits[this.sel]!)
        this.view = 'card'
        break
      default: return
    }
    this.draw()
  }

  private keyCard(k: DeviceKey) {
    const n = this.list.length
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok':
      case 'soft1': {
        const c = this.list[this.sel]!
        this.ctx.host.dial?.(c.tel, c.name)
        return
      }
      case 'soft2':
        this.view = 'copts'
        this.sel = 0
        break
      case 'back':
      case 'clear':
        this.backToList()
        break
      default: return
    }
    this.draw()
  }

  /** 名片选项：呼叫 / 编辑 / 删除 / 发送名片 */
  private keyCardOptions(k: DeviceKey) {
    const n = 4
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok':
      case 'soft1':
        this.runCardOption(this.sel)
        return
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'card'
        break
      default: return
    }
    this.draw()
  }

  private runCardOption(i: number) {
    const c = this.list[this.sel]!
    if (i === 0) { this.ctx.host.dial?.(c.tel, c.name); return }
    if (i === 1) this.startEdit(c)
    else if (i === 2) {
      this.view = 'confirmErase'
      this.draw()
    } else {
      // 发送名片：OS 带预填文本切到写信息
      this.ctx.host.sendCard?.(c.name, c.tel)
    }
  }

  // ---------- 编辑 ----------

  private startEdit(c: Contact) {
    const str = osStrings(this.ctx.lang.get())
    this.editContact = { ...c }
    this.editIndex = this.sel
    this.editor = new NameEditor(this.ctx, str.ctName, c.name,
      (text, ed) => {
        if (!text) { ed.setError(str.ctNoName); return }
        this.editContact.name = text
        this.editor = new PhoneEditor(this.ctx, str.ctNumber, this.editContact.tel, null,
          (num) => {
            this.editContact.tel = num
            this.list[this.editIndex] = { ...this.editContact }
            this.editor = null
            void this.persist().then(() =>
              this.showToast(str.ctSaved, () => { this.view = 'card'; this.draw() }))
          },
          () => { this.editor = null; this.view = 'card'; this.draw() })
      },
      () => { this.editor = null; this.view = 'card'; this.draw() })
  }

  // ---------- 删除确认 ----------

  private keyConfirmErase(k: DeviceKey) {
    const str = osStrings(this.ctx.lang.get())
    if (k === 'ok' || k === 'soft1') {
      this.list.splice(this.sel, 1)
      void this.persist().then(() =>
        this.showToast(str.ctErased, () => { this.backToList(); this.draw() }))
      return
    }
    if (k === 'back' || k === 'soft2' || k === 'clear') {
      this.backToList()
      this.draw()
    }
  }

  // ---------- 速拨 ----------

  private keySpeedList(k: DeviceKey) {
    const slots = ['2', '3', '4', '5', '6', '7', '8', '9']
    switch (k) {
      case 'up': this.sel = (this.sel + 7) % 8; this.fixTop(); break
      case 'down': this.sel = (this.sel + 1) % 8; this.fixTop(); break
      case 'ok':
      case 'soft1':
        this.slot = slots[this.sel]!
        this.view = 'speedMenu'
        this.sel = 0
        break
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  /** 槽位菜单：设定 / 删除（已分配时） */
  private keySpeedMenu(k: DeviceKey) {
    const n = this.speed[this.slot] ? 2 : 1
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok':
      case 'soft1':
        if (this.sel === 1) {
          delete this.speed[this.slot]
          const str = osStrings(this.ctx.lang.get())
          void this.saveSpeed().then(() =>
            this.showToast(str.ctErased, () => { this.view = 'speedList'; this.draw() }))
          return
        }
        this.openSlotNumber()
        return
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'speedList'
        break
      default: return
    }
    this.draw()
  }

  private openSlotNumber() {
    const str = osStrings(this.ctx.lang.get())
    this.view = 'speedNum'
    this.editor = new PhoneEditor(
      this.ctx, str.ctNumber, this.speed[this.slot] ?? '',
      // Find：进联系人选择
      () => {
        this.editor = null
        this.pickSel = 0
        this.top = 0
        this.view = 'speedPick'
        this.draw()
      },
      (num) => {
        this.speed[this.slot] = num
        this.editor = null
        void this.saveSpeed().then(() =>
          this.showToast(str.ctSaved, () => { this.view = 'speedList'; this.draw() }))
      },
      () => { this.editor = null; this.view = 'speedMenu'; this.draw() })
  }

  private keySpeedPick(k: DeviceKey) {
    const n = this.list.length
    switch (k) {
      case 'up': this.pickSel = (this.pickSel + n - 1) % n; break
      case 'down': this.pickSel = (this.pickSel + 1) % n; break
      case 'ok':
      case 'soft1': {
        const c = this.list[this.pickSel]!
        this.speed[this.slot] = c.tel
        const str = osStrings(this.ctx.lang.get())
        void this.saveSpeed().then(() =>
          this.showToast(str.ctSaved, () => { this.view = 'speedList'; this.draw() }))
        break
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'speedMenu'
        break
      default: return
    }
    this.draw()
  }

  private async saveSpeed() {
    await this.ctx.store.set('speed', this.speed)
    this.view = 'speedList'
  }

  // ---------- 通用 ----------

  private async persist() {
    await this.ctx.host.saveContacts?.(this.list)
  }

  /** 短提示：1.1s 后执行 after（回指定视图/退出） */
  private showToast(text: string, after: () => void) {
    this.view = 'toast'
    this.toastText = text
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(after, 1100)
    this.draw()
  }

  private fixTop() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    if (this.editor) { this.editor.draw(); return }
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    switch (this.view) {
      case 'list': this.drawNameList(W, H, str.menuSelect, str.menuBack); break
      case 'card': this.drawCard(W, H, str); break
      case 'copts': this.drawCardOptionsList(W, H, str); break
      case 'confirmErase': this.drawConfirm(W, H, str); break
      case 'speedList': this.drawSpeedList(W, H, str); break
      case 'speedMenu': this.drawSpeedMenu(W, H, str); break
      case 'speedPick': this.drawNameList(W, H, str.menuSelect, str.menuBack); break
      case 'memory': this.drawMemory(W, H, str); break
      case 'toast': this.drawToast(W, H); break
      default: break
    }
  }

  private drawNameList(W: number, H: number, left: string, right: string) {
    const s = this.ctx.screen
    const items = this.view === 'list' ? this.filtered() : this.list
    const listSel = this.view === 'speedPick' ? this.pickSel : this.sel
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const y = r * 11
      s.text(2, y + 1, items[i]!.name, { size: 9 })
      if (i === listSel) s.invertRect(0, y, W, 11)
    }
    if (items.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / items.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / items.length) * (H - 11))))
    }
    s.text(1, H - 10, left, { size: 9 })
    s.textRight(W - 1, H - 10, right, { size: 9 })
  }

  private drawCard(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const c = this.list[this.sel]
    if (!c) return
    const cy = Math.max(13, (H >> 1) - 7)
    s.textCenter(W >> 1, cy, c.name, { size: 12 })
    s.textCenter(W >> 1, cy + 13, c.tel, { size: 9 })
    s.textRight(W - 2, 2, `${this.sel + 1}/${this.list.length}`, { size: 9 })
    s.text(1, H - 10, str.contactsCall, { size: 9 })
    s.textRight(W - 1, H - 10, str.ctOptions, { size: 9 })
  }

  private drawCardOptionsList(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const labels = [str.contactsCall, str.ctEdit, str.ctDelete, str.ctSendCard]
    for (let r = 0; r < this.rows && r < labels.length; r++) {
      const y = r * 11
      s.text(2, y + 1, labels[r]!, { size: 9 })
      if (r === this.sel) s.invertRect(0, y, W, 11)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawConfirm(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 8, str.ctEraseQ, { size: 9 })
    const c = this.list[this.sel]
    if (c) {
      s.textCenter(W >> 1, 24, c.name, { size: 12 })
      s.textCenter(W >> 1, 38, c.tel, { size: 9 })
    }
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.settingsConfirmNo, { size: 9 })
  }

  private drawSpeedList(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const slots = ['2', '3', '4', '5', '6', '7', '8', '9']
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= 8) break
      const d = slots[i]!
      const tel = this.speed[d]
      const y = r * 11
      s.text(2, y + 1, `${d}:`, { size: 9 })
      s.text(12, y + 1, tel ? this.nameOf(tel) : str.ctUnassigned, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (8 > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / 8) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / 8) * (H - 11))))
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawSpeedMenu(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const labels = [str.ctAssign, str.ctDelete]
    const n = this.speed[this.slot] ? 2 : 1
    for (let r = 0; r < n; r++) {
      const y = r * 11
      s.text(2, y + 1, labels[r]!, { size: 9 })
      if (r === this.sel) s.invertRect(0, y, W, 11)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawMemory(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 8, str.ctMemory, { size: 9 })
    s.textCenter(W >> 1, 24, `${this.list.length}/250`, { size: 14 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawToast(W: number, _H: number) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, (s.h >> 1) - 5, this.toastText, { size: 9 })
  }

  private nameOf(tel: string): string {
    const c = this.list.find((x) => x.tel === tel)
    return c ? c.name : tel
  }
}

// ---------- T9 姓名编辑器 ----------

class NameEditor implements Editor {
  private draft: string
  private t9 = new T9()
  /** 内联错误（如未输入姓名），1.4s 后自动消失 */
  private err = ''
  private errAt = 0

  constructor(
    private ctx: AppContext,
    private title: string,
    initial: string,
    private onDone: (text: string, self: NameEditor) => void,
    private onCancel: () => void,
  ) {
    this.draft = initial
    this.t9.setMode(ctx.lang.get() === 'en' ? 'en' : 'py')
    this.draw()
  }

  setError(t: string) {
    this.err = t
    this.errAt = Date.now()
    this.draw()
  }

  key(k: DeviceKey) {
    this.err = ''
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else if (k === 'ok') {
      const out = this.t9.select()
      if (out) this.draft += out
    } else if (k === 'up') {
      this.t9.cycleCand(-1)
    } else if (k === 'down') {
      this.t9.cycleCand(1)
    } else if (k === 'clear') {
      if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'soft1') {
      this.onDone(this.draft.trim(), this)
      return
    } else if (k === 'back' || k === 'soft2') {
      this.onCancel()
      return
    } else {
      return
    }
    this.draw()
  }

  tick(): boolean {
    let redraw = false
    const out = this.t9.expire()
    if (out) { this.draft += out; redraw = true }
    if (this.err && Date.now() - this.errAt > 1400) { this.err = ''; redraw = true }
    if (redraw) this.draw()
    return redraw
  }

  draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    // 模式 + 标题行
    s.text(1, 1, { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode])
    s.textRight(W - 1, 1, this.title, { size: 9 })
    s.fillRect(0, 11, W, 1)
    // 候选行（拼音态）
    const cands = this.t9.cands.slice(0, 4)
    cands.forEach((c, i) => {
      const x = 2 + i * 14
      s.text(x, 13, c)
      if (i === this.t9.candIdx) s.invertRect(x - 1, 12, 13, 11)
    })
    if (cands.length) s.fillRect(0, 23, W, 1)
    // 内联错误（标题下一行；空姓名时不会有候选）
    if (this.err) s.text(2, 13, this.err, { size: 9 })
    // 正文
    const y = this.err ? 23 : cands.length ? 25 : 14
    const visChars = Math.max(6, Math.floor((W - 4) / 11))
    const vis = this.draft.length > visChars ? this.draft.slice(-visChars) : this.draft
    const x = s.text(2, y, vis || '_', { size: 9 })
    if (Math.floor(Date.now() / 400) % 2 === 0 && this.draft)
      s.fillRect(Math.min(x, W - 4), y + 1, 2, 8)
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- 号码编辑器 ----------

class PhoneEditor implements Editor {
  private buf: string

  constructor(
    private ctx: AppContext,
    private title: string,
    initial: string,
    private onFind: (() => void) | null,
    private onDone: (num: string) => void,
    private onCancel: () => void,
  ) {
    this.buf = initial
    this.draw()
  }

  key(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      if (this.buf.length < 20) this.buf += k
    } else if (k === '*') {
      if (this.buf.length < 20) this.buf += '+'
    } else if (k === 'clear') {
      if (this.buf) this.buf = this.buf.slice(0, -1)
      else this.onCancel()
    } else if (k === 'back') {
      this.onCancel()
      return
    } else if (k === 'soft2') {
      if (this.onFind) { this.onFind(); return }
      this.onCancel()
      return
    } else if (k === 'ok' || k === 'soft1') {
      if (this.buf.length) { this.onDone(this.buf); return }
    } else {
      return
    }
    this.draw()
  }

  tick(): boolean { return false }

  draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.text(1, 4, this.title, { size: 9 })
    s.fillRect(0, 13, W, 1)
    const maxChars = Math.max(6, Math.floor(W / 7))
    const vis = this.buf.length > maxChars ? this.buf.slice(-maxChars) : this.buf
    s.text(2, 17, vis || '_', { size: 12 })
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, this.onFind ? str.msFind : str.menuBack, { size: 9 })
  }
}

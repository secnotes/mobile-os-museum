import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../t9'
import { osStrings } from '../strings'
import type { Contact } from '../../../scenario/data'

/**
 * 短信（多模式叶子，共享 id 'messages'）：
 *   write     写信息（T9 + 字符计数 → 收件号码/联系人 → 发送）
 *   inbox     收件箱（阅读：回复/转发/删除）
 *   drafts    草稿（撰写退出自动存；可续写）
 *   sent      已发信息（mine 消息）
 *   picture   图片信息（3 张内置位图）
 *   templates 常用短语
 *   smileys   表情符号
 *   delete    删除信息（全部/已读）
 *   settings  信息设置（中心号码/送达报告）
 * 统一存储：messages:inbox（收件与 mine 同表）、messages:drafts、messages:settings、messages:prefill。
 */

export interface Msg {
  id: number
  from: string
  text: string
  ts: number
  read: boolean
  mine: boolean
  /** 内置图片信息索引（0–2） */
  pic?: number
}

export interface Draft {
  id: number
  to: string
  text: string
  ts: number
}

export interface MsgSettings {
  center: string
  reports: boolean
}

export interface Prefill {
  to?: string
  text: string
}

export type MsgMode =
  | 'write' | 'inbox' | 'drafts' | 'sent' | 'picture'
  | 'templates' | 'smileys' | 'delete' | 'settings'

export const messagesApp = (mode: MsgMode): MiniApp => ({
  id: 'messages',
  name: '短信',
  nameEn: 'Messages',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '########',
      '#......#',
      '##....##',
      '#.#..#.#',
      '#..##..#',
      '#......#',
      '########',
    ])
  },
  start(ctx: AppContext) {
    const ui = new MessagesUI(ctx, mode)
    void ui.init()
    return () => ui.dispose()
  },
})

// ---------- 内置图片（像素图，居中绘制） ----------

export const PICTURES: string[][] = [
  // 心
  [
    '.##..##.',
    '########',
    '########',
    '.######.',
    '..####..',
    '...##...',
  ],
  // 房子
  [
    '...##...',
    '..####..',
    '.######.',
    '########',
    '#..##..#',
    '#..##..#',
    '#......#',
  ],
  // 太阳
  [
    '.#......#.',
    '..#....#..',
    '...####...',
    '..######..',
    '.##....##.',
    '..######..',
    '...####...',
    '..#....#..',
    '.#......#.',
  ],
]

type View =
  | 'inbox' | 'read' | 'compose' | 'recipient' | 'contacts'
  | 'sending' | 'sent'
  | 'drafts' | 'sentFolder'
  | 'picPick' | 'picPreview'
  | 'templateList' | 'smileyList'
  | 'deleteMenu' | 'deleteConfirm'
  | 'settingsList' | 'centerEdit'
  | 'toast'

const PART_LEN = 160
const MAX_LEN = PART_LEN * 3

class MessagesUI {
  private view: View
  private inbox: Msg[] = []
  private drafts: Draft[] = []
  private settings: MsgSettings = { center: '+8613800100500', reports: false }
  private contacts: Contact[] = []
  private sel = 0
  private top = 0
  private readTop = 0
  private confirmDelete = false
  private t9 = new T9()
  private text = ''
  /** 阅读回复时的预定收件人（跳过收件人页） */
  private presetTo = ''
  private presetName = ''
  private resumeDraftId = 0
  private picIdx = -1
  private sendingDots = 0
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private sendTickOff: (() => void) | null = null
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private toastText = ''
  private deleteKind: 'all' | 'read' = 'all'
  private dead = false
  private offs: Array<() => void> = []

  private get rows(): number {
    return Math.floor((this.ctx.screen.h - 11) / 11)
  }

  constructor(private ctx: AppContext, mode: MsgMode) {
    this.view =
      mode === 'write' ? 'compose'
      : mode === 'inbox' ? 'inbox'
      : mode === 'drafts' ? 'drafts'
      : mode === 'sent' ? 'sentFolder'
      : mode === 'picture' ? 'picPick'
      : mode === 'templates' ? 'templateList'
      : mode === 'smileys' ? 'smileyList'
      : mode === 'delete' ? 'deleteMenu'
      : 'settingsList'
  }

  async init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.offs.push(this.ctx.onLang(() => {
      this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
      this.draw()
    }))
    this.offs.push(this.ctx.every(100, () => {
      const out = this.t9.expire()
      if (out) this.appendText(out)
      this.draw()
    }))
    this.offs.push(this.ctx.store.onChange((key) => { void this.reloadKey(key) }))
    this.inbox = (await this.ctx.store.get<Msg[]>('inbox')) ?? []
    this.drafts = (await this.ctx.store.get<Draft[]>('drafts')) ?? []
    const savedSet = await this.ctx.store.get<MsgSettings>('settings')
    if (savedSet) this.settings = savedSet
    this.contacts = (await this.ctx.host.getContacts?.()) ?? []
    if (this.view === 'compose') await this.applyPrefill()
    this.draw()
  }

  dispose() {
    this.dead = true
    if (this.sendTimer) clearTimeout(this.sendTimer)
    if (this.toastTimer) clearTimeout(this.toastTimer)
    if (this.sendTickOff) this.sendTickOff()
    this.offs.forEach((off) => off())
  }

  private async reloadKey(key: string) {
    if (key === 'inbox') {
      this.inbox = (await this.ctx.store.get<Msg[]>('inbox')) ?? []
      this.draw()
    } else if (key === 'drafts') {
      this.drafts = (await this.ctx.store.get<Draft[]>('drafts')) ?? []
    }
  }

  /** send-card 预填（读后即删） */
  private async applyPrefill() {
    const p = await this.ctx.store.get<Prefill>('prefill')
    if (!p) return
    if (p.to) { this.presetTo = p.to; this.presetName = p.to }
    this.text = p.text
    await this.ctx.store.remove('prefill')
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    switch (this.view) {
      case 'inbox': this.inboxKey(k); break
      case 'read': this.readKey(k); break
      case 'compose': this.composeKey(k); break
      case 'recipient': this.recipientKey(k); break
      case 'contacts': this.contactsKey(k); break
      case 'drafts': this.draftsKey(k); break
      case 'sentFolder': this.sentFolderKey(k); break
      case 'picPick': this.picPickKey(k); break
      case 'picPreview': this.picPreviewKey(k); break
      case 'templateList': this.genericSeedList(k, this.templateTexts()); break
      case 'smileyList': this.genericSeedList(k, this.smileyTexts()); break
      case 'deleteMenu': this.deleteMenuKey(k); break
      case 'deleteConfirm': this.deleteConfirmKey(k); break
      case 'settingsList': this.settingsListKey(k); break
      case 'centerEdit': this.centerEditKey(k); break
      case 'sent': break
      case 'toast': break
      default: break
    }
  }

  private get incoming(): Msg[] {
    return this.inbox.filter((m) => !m.mine)
  }

  private get mineSent(): Msg[] {
    return this.inbox.filter((m) => m.mine)
  }

  // ----- 收件箱 -----

  private inboxKey(k: DeviceKey) {
    const items = this.incoming
    const n = items.length
    if (!n) {
      if (k === 'back' || k === 'soft2' || k === 'clear') this.ctx.exit()
      else if (k === 'ok' || k === 'soft1') this.openCompose()
      return
    }
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(n); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(n); break
      case 'ok': {
        const m = items[this.sel]
        if (m) { m.read = true; void this.ctx.store.set('inbox', this.inbox); this.readTop = 0; this.view = 'read' }
        break
      }
      case 'soft1': this.openCompose(); return
      case 'soft2':
      case 'back':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private readKey(k: DeviceKey) {
    const m = this.findReadMsg()
    const lines = wrapHan(m?.text ?? '', this.charsPerLine())
    const visRows = Math.max(1, Math.floor((this.ctx.screen.h - 27) / 11))
    switch (k) {
      case 'up': this.readTop = Math.max(0, this.readTop - 1); break
      case 'down': this.readTop = Math.min(Math.max(0, lines.length - visRows), this.readTop + 1); break
      case 'soft1':
      case 'ok':
        if (m && !m.mine) this.startReply(m)
        else this.toInbox()
        return
      case 'soft2':
        if (m) this.forward(m)
        return
      case 'clear':
        if (!this.confirmDelete) { this.confirmDelete = true }
        else { this.deleteCurrent(); return }
        break
      case 'back':
        this.toInbox()
        return
      default: this.confirmDelete = false; break
    }
    this.draw()
  }

  private findReadMsg(): Msg | undefined {
    const items = this.incoming
    return items[this.sel] ?? this.inbox[this.sel]
  }

  private startReply(m: Msg) {
    this.presetTo = /^\d+$/.test(m.from) ? m.from : ''
    this.presetName = m.from
    this.text = ''
    this.t9.reset()
    this.view = 'compose'
    this.readTop = 0
    this.draw()
  }

  private forward(m: Msg) {
    this.presetTo = ''
    this.presetName = ''
    this.text = m.text
    this.t9.reset()
    this.view = 'compose'
    this.draw()
  }

  private deleteCurrent() {
    const m = this.findReadMsg()
    if (!m) { this.toInbox(); return }
    this.inbox = this.inbox.filter((x) => x.id !== m.id)
    void this.ctx.store.set('inbox', this.inbox).then(() => this.toInbox())
  }

  // ----- 撰写 -----

  private openCompose() {
    this.text = ''
    this.picIdx = -1
    this.presetTo = ''
    this.presetName = ''
    this.resumeDraftId = 0
    this.t9.reset()
    this.view = 'compose'
    this.draw()
  }

  private composeKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.appendText(out)
    } else if (k === 'ok') {
      const out =this.t9.select()
      if (out) this.appendText(out)
    } else if (k === 'up') {
      this.t9.cycleCand(-1)
    } else if (k === 'down') {
      this.t9.cycleCand(1)
    } else if (k === 'clear') {
      if (this.t9.backspace() === 'char') this.text = this.text.slice(0, -1)
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'soft1') {
      if (this.text.trim().length || this.picIdx >= 0) { void this.beginSend(); return }
    } else if (k === 'soft2' || k === 'back') {
      void this.saveDraftAndExit()
      return
    } else {
      return
    }
    this.draw()
  }

  private appendText(s: string) {
    if (this.text.length + s.length <= MAX_LEN) this.text += s
  }

  /** 退出撰写：有文本自动存草稿；无文本直接回收件箱 */
  private async saveDraftAndExit() {
    const t = this.text.trim()
    if (t) {
      if (this.resumeDraftId) {
        const d = this.drafts.find((x) => x.id === this.resumeDraftId)
        if (d) { d.text = this.text; d.ts = Date.now() }
      } else {
        this.drafts.push({ id: Date.now(), to: '', text: this.text, ts: Date.now() })
      }
      await this.ctx.store.set('drafts', this.drafts)
      const str = osStrings(this.ctx.lang.get())
      this.toast(str.msDraftSaved, () => { this.view = 'drafts'; this.sel = 0; this.top = 0; this.draw() })
      return
    }
    this.toInbox()
  }

  // ----- 发送：收件人 -----

  private async beginSend() {
    if (this.presetTo) { void this.doSend(this.presetTo, this.presetName); return }
    // 收件人页：预填默认联系人号码（可改）
    const mom = this.contacts[0]
    this.presetTo = mom?.tel ?? ''
    this.presetName = mom?.name ?? ''
    this.view = 'recipient'
    this.draw()
  }

  private recipientKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'soft1':
        if (this.presetTo.length) { void this.doSend(this.presetTo, this.presetName) }
        return
      case 'soft2':
        this.view = 'contacts'
        this.sel = 0
        this.top = 0
        break
      case 'clear':
        if (this.presetTo.length) {
          this.presetTo = this.presetTo.slice(0, -1)
          this.presetName = this.nameFor(this.presetTo)
        } else this.view = 'compose'
        break
      case 'back':
        this.view = 'compose'
        return
      default:
        if (/^[0-9]$/.test(k)) {
          this.presetTo += k
          this.presetName = this.nameFor(this.presetTo)
        } else if (k === '*') this.presetTo += '+'
    }
    this.draw()
  }

  private contactsKey(k: DeviceKey) {
    const n = this.contacts.length
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(n); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(n); break
      case 'ok':
      case 'soft1': {
        const c = this.contacts[this.sel]
        if (c) { this.presetTo = c.tel; this.presetName = c.name; void this.doSend(c.tel, c.name) }
        return
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'recipient'
        break
      default: return
    }
    this.draw()
  }

  private async doSend(to: string, name: string) {
    this.view = 'sending'
    this.sendingDots = 0
    this.draw()
    this.sendTickOff = this.ctx.every(500, () => {
      this.sendingDots = (this.sendingDots + 1) % 4
      this.draw()
    })
    this.sendTimer = setTimeout(() => void this.delivered(to, name), 1600)
  }

  private async delivered(to: string, name: string) {
    if (this.dead || this.view !== 'sending') return
    if (this.sendTickOff) { this.sendTickOff(); this.sendTickOff = null }
    const label = name || this.nameFor(to) || to
    this.inbox.push({
      id: Date.now(),
      from: label,
      text: this.text,
      ts: Date.now(),
      read: true,
      mine: true,
      ...(this.picIdx >= 0 ? { pic: this.picIdx } : {}),
    })
    await this.ctx.store.set('inbox', this.inbox)
    // 续发的草稿已发送 → 删除
    if (this.resumeDraftId) {
      this.drafts = this.drafts.filter((d) => d.id !== this.resumeDraftId)
      await this.ctx.store.set('drafts', this.drafts)
    }
    this.text = ''
    this.picIdx = -1
    this.presetTo = ''
    this.presetName = ''
    this.t9.reset()
    this.ctx.host.messageSent?.(to)
    this.view = 'sent'
    this.draw()
    this.sendTimer = setTimeout(() => { if (!this.dead) this.toInbox() }, 1100)
  }

  // ----- 草稿 -----

  private draftsKey(k: DeviceKey) {
    const n = this.drafts.length
    if (!n) {
      if (k === 'back' || k === 'soft2' || k === 'clear') this.ctx.exit()
      return
    }
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(n); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(n); break
      case 'ok': {
        const d = this.drafts[this.sel]
        if (d) {
          this.resumeDraftId = d.id
          this.text = d.text
          this.presetTo = d.to
          this.view = 'compose'
        }
        break
      }
      case 'clear':
        this.drafts.splice(this.sel, 1)
        this.sel = Math.min(this.sel, this.drafts.length - 1)
        void this.ctx.store.set('drafts', this.drafts)
        break
      case 'back':
      case 'soft2': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  // ----- 已发 -----

  private sentFolderKey(k: DeviceKey) {
    const items = this.mineSent
    const n = items.length
    if (!n) {
      if (k === 'back' || k === 'soft2' || k === 'clear') this.ctx.exit()
      return
    }
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(n); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(n); break
      case 'ok': {
        // 已发消息阅读：映射回 inbox 下标
        const m = items[this.sel]
        this.sel = this.inbox.indexOf(m!)
        this.readTop = 0
        this.view = 'read'
        break
      }
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  // ----- 图片信息 -----

  private picPickKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.sel = (this.sel + 2) % 3; break
      case 'down': this.sel = (this.sel + 1) % 3; break
      case 'ok':
      case 'soft1':
        this.picIdx = this.sel
        this.view = 'picPreview'
        break
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private picPreviewKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'soft1':
        this.text = ''
        this.presetTo = ''
        this.presetName = ''
        this.t9.reset()
        this.view = 'compose'
        break
      case 'back':
      case 'soft2':
      case 'clear':
        this.view = 'picPick'
        break
      default: return
    }
    this.draw()
  }

  // ----- 模板 / 表情（列表 → 撰写预填） -----

  private templateTexts(): string[] {
    return osStrings(this.ctx.lang.get()).msTemplatesList
  }

  private smileyTexts(): string[] {
    return osStrings(this.ctx.lang.get()).msSmileysList
  }

  private genericSeedList(k: DeviceKey, items: string[]) {
    const n = items.length
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; this.fixTop(n); break
      case 'down': this.sel = (this.sel + 1) % n; this.fixTop(n); break
      case 'ok':
      case 'soft1': {
        const t = items[this.sel]!
        this.openCompose()
        this.text = t
        break
      }
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  // ----- 删除信息 -----

  private deleteMenuKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.sel = (this.sel + 1) % 2; break
      case 'down': this.sel = (this.sel + 1) % 2; break
      case 'ok':
      case 'soft1':
        this.deleteKind = this.sel === 0 ? 'all' : 'read'
        this.view = 'deleteConfirm'
        break
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private deleteConfirmKey(k: DeviceKey) {
    const str = osStrings(this.ctx.lang.get())
    if (k === 'ok' || k === 'soft1') {
      if (this.deleteKind === 'all') this.inbox = []
      else this.inbox = this.inbox.filter((m) => m.mine || !m.read)
      this.sel = 0
      void this.ctx.store.set('inbox', this.inbox)
      this.toast(str.clDeleted, () => { this.view = 'inbox'; this.draw() })
      return
    }
    if (k === 'back' || k === 'soft2' || k === 'clear') {
      this.view = 'deleteMenu'
      this.draw()
    }
  }

  // ----- 信息设置 -----

  private settingsListKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.sel = (this.sel + 1) % 2; break
      case 'down': this.sel = (this.sel + 1) % 2; break
      case 'ok':
      case 'soft1':
        if (this.sel === 0) this.view = 'centerEdit'
        else {
          this.settings.reports = !this.settings.reports
          void this.persistSettings()
        }
        break
      case 'back':
      case 'soft2':
      case 'clear': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private centerEditKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'soft1':
        void this.persistSettings()
        this.view = 'settingsList'
        break
      case 'clear':
        if (this.settings.center.length) this.settings.center = this.settings.center.slice(0, -1)
        else this.view = 'settingsList'
        break
      case 'back':
      case 'soft2':
        this.view = 'settingsList'
        break
      default:
        if (/^[0-9]$/.test(k)) this.settings.center += k
        else if (k === '*') this.settings.center += '+'
        else return
    }
    this.draw()
  }

  private async persistSettings() {
    await this.ctx.store.set('settings', this.settings)
  }

  // ---------- 流转 ----------

  private toInbox() {
    this.view = 'inbox'
    this.confirmDelete = false
    this.sel = Math.min(this.sel, Math.max(0, this.incoming.length - 1))
    this.fixTop(this.incoming.length)
    this.draw()
  }

  private toast(text: string, after: () => void) {
    this.view = 'toast'
    this.toastText = text
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(after, 1100)
    this.draw()
  }

  private fixTop(n: number) {
    if (n <= 0) { this.top = 0; return }
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
    if (this.top > Math.max(0, n - this.rows)) this.top = Math.max(0, n - this.rows)
  }

  private nameFor(tel: string): string {
    return this.contacts.find((c) => c.tel === tel)?.name ?? ''
  }

  private charsPerLine(): number {
    return Math.floor(this.ctx.screen.w / 11) - 1
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    switch (this.view) {
      case 'inbox': this.drawFolder(W, H, str, this.incoming); break
      case 'drafts': this.drawDraftFolder(W, H, str); break
      case 'sentFolder': this.drawFolder(W, H, str, this.mineSent); break
      case 'read': this.drawRead(W, H, str); break
      case 'compose': this.drawCompose(W, H, str); break
      case 'recipient': this.drawRecipient(W, H, str); break
      case 'contacts': this.drawContactPick(W, H, str); break
      case 'picPick': this.drawPicPick(W, H, str); break
      case 'picPreview': this.drawPicPreview(W, H, str); break
      case 'templateList': this.drawStringList(W, H, str, this.templateTexts()); break
      case 'smileyList': this.drawStringList(W, H, str, this.smileyTexts()); break
      case 'deleteMenu': this.drawDeleteMenu(W, H, str); break
      case 'deleteConfirm': this.drawDeleteConfirm(W, H, str); break
      case 'settingsList': this.drawSettingsList(W, H, str); break
      case 'centerEdit': this.drawCenterEdit(W, H, str); break
      case 'sending':
        s.textCenter(W >> 1, 16, str.msgsSending)
        s.textCenter(W >> 1, 30, '.'.repeat(this.sendingDots + 1))
        break
      case 'sent':
        s.textCenter(W >> 1, 14, str.msgsSent, { size: 14 })
        s.bitmap((W >> 1) - 4, 30, [
          '......##',
          '.....##.',
          '#...##..',
          '##.##...',
          '.###....',
          '..#.....',
        ])
        break
      case 'toast':
        s.textCenter(W >> 1, (H >> 1) - 5, this.toastText, { size: 9 })
        break
    }
  }

  private drawFolder(W: number, H: number, str: ReturnType<typeof osStrings>, items: Msg[]) {
    const s = this.ctx.screen
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const m = items[i]!
      const y = r * 11
      let x = 2
      if (m.pic != null) { this.drawMiniPic(s, x, y); x += 8 }
      s.text(x, y + 1, m.from, { size: 9 })
      if (!m.read && !m.mine) s.fillRect(W - 6, y + 4, 3, 3)
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (items.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / items.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / items.length) * (H - 11))))
    }
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawDraftFolder(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    if (!this.drafts.length) s.textCenter(W >> 1, 8, str.msNoDrafts, { size: 9 })
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= this.drafts.length) break
      const d = this.drafts[i]!
      const y = r * 11
      const t = new Date(d.ts)
      const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      s.text(2, y + 1, hm, { size: 9 })
      s.text(30, y + 1, d.text.slice(0, 8), { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (this.drafts.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / this.drafts.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / this.drafts.length) * (H - 11))))
    }
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawRead(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const m = this.findReadMsg()
    if (!m) return
    const t = new Date(m.ts)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    // 标题栏：反白
    s.text(1, 1, `${m.from} ${hh}:${mm}`.slice(0, 16))
    s.invertRect(0, 0, W, 11)
    let y = 12
    if (m.pic != null) {
      const rows = PICTURES[m.pic]!
      const pw = rows[0]!.length
      s.bitmap((W - pw) >> 1, y, rows)
      y += rows.length + 2
    }
    const lines = wrapHan(m.text, this.charsPerLine())
    const bottom = H - 10
    const visRows = Math.max(1, Math.floor((bottom - y) / 11))
    lines.slice(this.readTop, this.readTop + visRows).forEach((ln, i) =>
      s.text(2, y + i * 11, ln, { size: 9 }))
    if (lines.length > visRows)
      s.textRight(W - 1, H - 10, `${Math.min(this.readTop + visRows, lines.length)}/${lines.length}`, { size: 9 })
    if (this.confirmDelete) {
      s.text(1, H - 10, str.readConfirmDel, { size: 9 })
    } else {
      s.text(1, H - 10, m.mine ? str.menuBack : str.readReply, { size: 9 })
      s.textRight(W - 1, H - 10, this.ctx.lang.get() === 'en' ? 'Fwd' : '转发', { size: 9 })
    }
  }

  private drawCompose(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    // 顶行：模式 + 计数
    s.text(1, 1, { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode])
    const used = this.text.length
    const parts = Math.max(1, Math.ceil((used + 1) / PART_LEN))
    const counter = parts > 1
      ? `${parts}×${PART_LEN - (used % PART_LEN)}`
      : String(PART_LEN - used)
    s.textRight(W - 1, 1, counter, { size: 9 })
    s.fillRect(0, 11, W, 1)
    // 候选区
    const cands = this.t9.cands.slice(0, 4)
    cands.forEach((c, i) => {
      const x = 2 + i * 14
      s.text(x, 13, c)
      if (i === this.t9.candIdx) s.invertRect(x - 1, 12, 13, 11)
    })
    if (cands.length) s.fillRect(0, 23, W, 1)
    let y = cands.length ? 25 : 14
    if (this.picIdx >= 0) {
      const rows = PICTURES[this.picIdx]!
      s.bitmap(2, y, rows)
      y += rows.length + 1
    }
    // 正文（超出左滚）
    const visChars = Math.max(6, Math.floor((W - 6) / 11))
    const vis = this.text.length > visChars ? this.text.slice(-visChars) : this.text
    const wPx = s.text(2, y, vis || '_', { size: 9 })
    if (Math.floor(Date.now() / 400) % 2 === 0 && this.text)
      s.fillRect(Math.min(2 + wPx + 1, W - 3), y + 1, 2, 8)
    s.text(1, H - 10, str.composeSend, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawRecipient(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.text(1, 4, str.msTo, { size: 9 })
    s.fillRect(0, 13, W, 1)
    s.text(2, 17, this.presetTo || '_', { size: 12 })
    if (this.presetName) s.text(2, 31, this.presetName, { size: 9 })
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.msFind, { size: 9 })
  }

  private drawContactPick(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= this.contacts.length) break
      const y = r * 11
      s.text(2, y + 1, this.contacts[i]!.name, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (this.contacts.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / this.contacts.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / this.contacts.length) * (H - 11))))
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawPicPick(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const names = str.msPicNames
    for (let r = 0; r < 3; r++) {
      const y = r * 11
      s.text(2, y + 1, names[r]!, { size: 9 })
      if (r === this.sel) s.invertRect(0, y, W, 11)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawPicPreview(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const rows = PICTURES[this.picIdx]!
    const pw = rows[0]!.length
    s.bitmap((W - pw) >> 1, 8, rows)
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawStringList(W: number, H: number, str: ReturnType<typeof osStrings>, items: string[]) {
    const s = this.ctx.screen
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const y = r * 11
      s.text(2, y + 1, items[i]!, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (items.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / items.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / items.length) * (H - 11))))
    }
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawDeleteMenu(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    const labels = [str.msDelAll, str.msDelRead]
    for (let r = 0; r < 2; r++) {
      const y = r * 11
      s.text(2, y + 1, labels[r]!, { size: 9 })
      if (r === this.sel) s.invertRect(0, y, W, 11)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawDeleteConfirm(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 8, str.settingsConfirmTitle, { size: 9 })
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.settingsConfirmNo, { size: 9 })
  }

  private drawSettingsList(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.text(2, 1, str.msCenter, { size: 9 })
    s.textRight(W - 2, 1, this.settings.center, { size: 9 })
    s.text(2, 12, str.msReports, { size: 9 })
    s.textRight(W - 2, 12, this.settings.reports ? str.settingsOn : str.settingsOff, { size: 9 })
    s.invertRect(0, this.sel === 0 ? 0 : 11, W, 11)
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  private drawCenterEdit(W: number, H: number, str: ReturnType<typeof osStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 8, str.msCenter, { size: 9 })
    s.text(2, 20, this.settings.center || '_', { size: 12 })
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }

  /** 文件夹列表左侧的图片小标记（信封缩略） */
  private drawMiniPic(s: AppContext['screen'], x: number, y: number) {
    s.bitmap(x, y + 2, [
      '######',
      '#....#',
      '#.##.#',
      '#....#',
      '######',
    ])
  }
}

/** 按字宽换行 */
function wrapHan(s: string, per: number): string[] {
  const lines: string[] = []
  for (let i = 0; i < s.length; i += per) lines.push(s.slice(i, i + per))
  return lines.length ? lines : ['']
}

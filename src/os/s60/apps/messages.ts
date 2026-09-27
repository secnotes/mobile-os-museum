import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent, wrapText, clipToWidth } from '../ui'

export interface Msg {
  id: number
  from: string
  text: string
  ts: number
  read: boolean
  mine: boolean
}

type View = 'loading' | 'root' | 'inbox' | 'myfolders' | 'empty'
  | 'read' | 'compose' | 'sending' | 'sent'
type ListFilter = 'in' | 'sent' | 'all'

const ROW_H = 44
const VISIBLE_ROWS = Math.floor((CONTENT_BOTTOM - CONTENT_TOP) / ROW_H) // 6

export const messagesApp: MiniApp = {
  id: 'messages',
  name: '信息',
  nameEn: 'Messages',
  icon(s, x, y) {
    // 蓝底白信封
    s.fillRect(x, y, 44, 44, C.BLUE)
    s.fillRect(x + 4, y + 12, 36, 22, C.WHITE)
    s.fillRect(x + 6, y + 14, 32, 2, C.BLUE)
    for (let i = 0; i < 14; i++) {
      s.fillRect(x + 6 + i, y + 16 + i, 2, 2, C.BLUE)
      s.fillRect(x + 36 - i, y + 16 + i, 2, 2, C.BLUE)
    }
  },
  start(ctx: AppContext) {
    const ui = new MessagesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class MessagesUI {
  private view: View = 'loading'
  private inbox: Msg[] = []
  private sel = 0
  private top = 0
  private rootSel = 0
  private listFilter: ListFilter = 'in'
  private emptyTitle = ''
  private readTop = 0
  private confirmDelete = false
  private t9 = new T9()
  private draft = ''
  private sendingDots = 0
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private dotsOff: (() => void) | null = null
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.dotsOff?.()
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.ctx.onLang(() => {
      this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
      this.draw()
    })
    this.ctx.every(100, () => {
      const out = this.t9.expire()
      if (out) this.appendDraft(out)
      if (this.view === 'compose' || this.view === 'inbox') this.draw()
    })
    this.ctx.store.onChange(async (key) => {
      if (key !== 'inbox') return
      this.inbox = (await this.ctx.store.get<Msg[]>('inbox')) ?? []
      if (this.view === 'inbox' || this.view === 'read') this.draw()
    })
    this.inbox = (await this.ctx.store.get<Msg[]>('inbox')) ?? []
    this.view = 'root'
    this.draw()
  }

  /** 当前文件夹过滤后的列表 */
  private list(): Msg[] {
    if (this.listFilter === 'sent') return this.inbox.filter((m) => m.mine)
    if (this.listFilter === 'in') return this.inbox.filter((m) => !m.mine)
    return this.inbox
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    switch (this.view) {
      case 'root':
        this.rootKey(k)
        break
      case 'inbox':
        this.inboxKey(k)
        break
      case 'myfolders':
      case 'empty':
        if (k) this.view = 'root'
        break
      case 'read':
        this.readKey(k)
        break
      case 'compose':
        this.composeKey(k)
        break
      case 'sent':
        this.toInbox()
        break
      default:
        break
    }
  }

  /** 文件夹根视图按键 */
  private rootKey(k: DeviceKey) {
    const str = s60Strings(this.ctx.lang.get())
    const n = 6
    switch (k) {
      case 'up': this.rootSel = (this.rootSel + n - 1) % n; break
      case 'down': this.rootSel = (this.rootSel + 1) % n; break
      case 'ok': case 'soft1':
        switch (this.rootSel) {
          case 0: this.toCompose(); return
          case 1: this.openList('in'); return
          case 2: this.view = 'myfolders'; break
          case 3: this.openEmpty(str.fmDrafts); break
          case 4: this.openList('sent'); return
          case 5: this.openEmpty(str.fmOutbox); break
        }
        break
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private openList(f: ListFilter) {
    this.listFilter = f
    this.sel = 0
    this.top = 0
    this.view = 'inbox'
  }

  private openEmpty(title: string) {
    this.emptyTitle = title
    this.view = 'empty'
  }

  private inboxKey(k: DeviceKey) {
    const items = this.list()
    const n = items.length
    if (!n) {
      if (k === 'soft1' || k === 'ok') this.toCompose()
      else if (k === 'back' || k === 'soft2') this.toRoot()
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        this.fixTop()
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        this.fixTop()
        break
      case 'ok': {
        const m = items[this.sel]!
        m.read = true
        void this.ctx.store.set('inbox', this.inbox)
        this.readTop = 0
        this.view = 'read'
        break
      }
      case 'soft1':
        this.toCompose()
        return
      case 'soft2':
      case 'back':
        this.toRoot()
        return
      default:
        return
    }
    this.draw()
  }

  private toRoot() {
    this.view = 'root'
    this.confirmDelete = false
    this.draw()
  }

  private readKey(k: DeviceKey) {
    const m = this.list()[this.sel]
    const lines = wrapText(this.ctx.screen, m?.text ?? '', W - 32, 14)
    const maxTop = Math.max(0, lines.length - 12)
    switch (k) {
      case 'up':
        this.readTop = Math.max(0, this.readTop - 1)
        break
      case 'down':
        this.readTop = Math.min(maxTop, this.readTop + 1)
        break
      case 'soft1':
      case 'ok':
        if (m && !m.mine) this.toCompose()
        else this.toInbox()
        return
      case 'clear':
        if (this.confirmDelete) {
          if (m) {
            const idx = this.inbox.findIndex((x) => x.id === m.id)
            if (idx >= 0) this.inbox.splice(idx, 1)
          }
          void this.ctx.store.set('inbox', this.inbox)
          this.sel = Math.min(this.sel, Math.max(0, this.list().length - 1))
          this.toInbox()
          return
        }
        this.confirmDelete = true
        break
      case 'soft2':
      case 'back':
        this.toInbox()
        return
      default:
        this.confirmDelete = false
        break
    }
    this.draw()
  }

  private composeKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.appendDraft(out)
    } else if (k === 'ok') {
      const out = this.t9.select()
      if (out) this.appendDraft(out)
    } else if (k === 'up') {
      this.t9.cycleCand(-1)
    } else if (k === 'down') {
      this.t9.cycleCand(1)
    } else if (k === 'clear') {
      if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'soft1') {
      if (this.draft.trim().length) {
        this.view = 'sending'
        this.sendingDots = 0
        this.dotsOff = this.ctx.every(500, () => {
          this.sendingDots = (this.sendingDots + 1) % 4
          this.draw()
        })
        this.sendTimer = setTimeout(() => void this.delivered(), 1600)
        this.draw()
        return
      }
    } else if (k === 'soft2') {
      this.toInbox()
      return
    } else if (k === 'back') {
      this.ctx.exit()
      return
    } else {
      return
    }
    this.draw()
  }

  // ---------- 流转 ----------

  private toInbox() {
    this.view = 'inbox'
    this.confirmDelete = false
    this.fixTop()
    this.draw()
  }

  private toCompose() {
    this.view = 'compose'
    this.draft = ''
    this.t9.reset()
    this.draw()
  }

  private async delivered() {
    if (this.dead || this.view !== 'sending') return
    this.view = 'sent'
    this.dotsOff?.()
    this.dotsOff = null
    this.draw()
    const inbox = (await this.ctx.store.get<Msg[]>('inbox')) ?? this.inbox
    inbox.push({
      id: Date.now(),
      from: s60Strings(this.ctx.lang.get()).recipient,
      text: this.draft,
      ts: Date.now(),
      read: true,
      mine: true,
    })
    await this.ctx.store.set('inbox', inbox)
    this.inbox = inbox
    this.draft = ''
    this.t9.reset()
    this.ctx.host.messageSent?.(s60Strings(this.ctx.lang.get()).recipient)
    this.sendTimer = setTimeout(() => {
      if (!this.dead) this.toInbox()
    }, 1100)
  }

  private appendDraft(s: string) {
    if (this.draft.length + s.length <= 60) this.draft += s
  }

  private fixTop() {
    const n = this.list().length
    if (n <= VISIBLE_ROWS) {
      this.top = 0
    } else {
      this.top = Math.max(0, Math.min(this.sel - 2, n - VISIBLE_ROWS))
    }
    this.sel = Math.min(this.sel, Math.max(0, n - 1))
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    switch (this.view) {
      case 'loading':
        clearContent(s)
        titleBar(s, str.msgsTitle)
        s.textCenter(W / 2, 160, '…', { size: 14, color: C.GRAY })
        softBar(s, '', '')
        break
      case 'root':
        this.drawRoot()
        break
      case 'inbox':
        this.drawInbox()
        break
      case 'myfolders':
        this.drawSimpleList(str.fmMyFolders, str.msgsEmpty)
        break
      case 'empty':
        this.drawSimpleList(this.emptyTitle, str.msgsEmpty)
        break
      case 'read':
        this.drawRead()
        break
      case 'compose':
        this.drawCompose()
        break
      case 'sending':
        clearContent(s)
        titleBar(s, str.msgsTitle)
        s.textCenter(W / 2, 140, str.msgsSending, { size: 14, color: C.INK })
        s.textCenter(W / 2, 170, '.'.repeat(this.sendingDots + 1), { size: 12, color: C.GRAY })
        softBar(s, '', '')
        break
      case 'sent':
        clearContent(s)
        titleBar(s, str.msgsTitle)
        s.textCenter(W / 2, 130, str.msgsSent, { size: 18, color: C.GREEN })
        // 对勾
        s.fillRect(W / 2 - 14, 160, 4, 4, C.GREEN)
        s.fillRect(W / 2 - 10, 164, 4, 4, C.GREEN)
        s.fillRect(W / 2 - 6, 168, 4, 4, C.GREEN)
        s.fillRect(W / 2 - 2, 164, 4, 4, C.GREEN)
        s.fillRect(W / 2 + 2, 156, 4, 4, C.GREEN)
        s.fillRect(W / 2 + 6, 148, 4, 4, C.GREEN)
        softBar(s, '', '')
        break
    }
  }

  private drawInbox() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const items = this.list()
    const title = this.listFilter === 'sent' ? str.fmSentItems : str.fmInbox
    clearContent(s)
    titleBar(s, `${title} (${items.length})`)
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const m = items[i]!
      const y = CONTENT_TOP + r * ROW_H
      const selRow = i === this.sel
      if (selRow) s.fillRect(0, y, W, ROW_H, C.BLUE)
      const label = m.mine ? `${str.toPrefix}${m.from}` : m.from
      s.text(12, y + 5, clipToWidth(s, label, W - 60, 15), {
        size: 15,
        color: selRow ? C.WHITE : C.INK,
      })
      s.text(12, y + 26, clipToWidth(s, m.text, W - 48, 10), {
        size: 10,
        color: selRow ? C.PALE : C.GRAY,
      })
      if (!m.read && !m.mine) s.fillRect(W - 18, y + 8, 8, 8, selRow ? C.AMBER : C.BLUE)
    }
    if (!items.length) {
      s.textCenter(W / 2, 150, str.msgsEmpty, { size: 12, color: C.GRAY })
    }
    softBar(s, str.msgsNew, str.contactsBack)
  }

  /** 文件夹根视图（真机：写信息/收件箱/我的文件夹/草稿/已发送/未发送） */
  private drawRoot() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    titleBar(s, str.msgsTitle)
    const inbox = this.inbox.filter((m) => !m.mine)
    const sent = this.inbox.filter((m) => m.mine)
    const unreadN = inbox.filter((m) => !m.read).length
    const rows: Array<[string, string]> = [
      [str.msgsNew, ''],
      [str.fmInbox, en
        ? `${unreadN}/${inbox.length}`
        : `${unreadN} 未读/${inbox.length}`],
      [str.fmMyFolders, ''],
      [str.fmDrafts, '0'],
      [str.fmSentItems, `${sent.length}`],
      [str.fmOutbox, '0'],
    ]
    const RH = 36
    rows.forEach(([label, val], i) => {
      const y = CONTENT_TOP + 10 + i * RH
      const selRow = i === this.rootSel
      if (selRow) s.fillRect(6, y - 3, W - 12, RH - 4, C.BLUE)
      s.text(18, y + 4, label, { size: 14, color: selRow ? C.WHITE : C.INK })
      if (val) s.textRight(W - 18, y + 5, val,
        { size: 11, color: selRow ? C.AMBER : C.GRAY })
    })
    softBar(s, str.fmSelect, str.msgsExit)
  }

  /** 简单空列表页（我的文件夹 / 草稿 / 未发送） */
  private drawSimpleList(title: string, empty: string) {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    titleBar(s, title)
    s.textCenter(W / 2, 150, empty, { size: 12, color: C.GRAY })
    softBar(s, '', str.contactsBack)
  }

  private drawRead() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const m = this.list()[this.sel]
    if (!m) return
    const t = new Date(m.ts)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    clearContent(s)
    titleBar(s, `${m.mine ? str.mePrefix : ''}${clipToWidth(s, m.from, 140, 13)} ${hh}:${mm}`)
    const lines = wrapText(s, m.text, W - 32, 14)
    lines.slice(this.readTop, this.readTop + 12).forEach((ln, i) => {
      s.text(16, CONTENT_TOP + 6 + i * 22, ln, { size: 14, color: C.INK })
    })
    if (lines.length > 12) {
      s.textRight(
        W - 12,
        CONTENT_BOTTOM - 16,
        `${Math.min(this.readTop + 12, lines.length)}/${lines.length}`,
        { size: 10, color: C.GRAY },
      )
    }
    const del = this.confirmDelete ? `${str.camDelete}?` : ''
    softBar(s, this.confirmDelete ? del : str.msgsReply, str.msgsBack)
  }

  private drawCompose() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    // 输入法状态条
    s.fillRect(0, CONTENT_TOP, W, 22, C.PALE)
    const modeName = { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode]
    s.text(10, CONTENT_TOP + 4, modeName, { size: 11, color: C.NAVY })
    const hint = this.t9.hint()
    if (hint) s.textRight(W - 10, CONTENT_TOP + 5, hint, { size: 10, color: C.NAVY })
    // 候选区
    const cands = this.t9.cands.slice(0, 5)
    cands.forEach((cand, i) => {
      const x = 10 + i * 44
      if (i === this.t9.candIdx) {
        s.fillRect(x - 4, CONTENT_TOP + 28, 40, 26, C.BLUE)
        s.text(x, CONTENT_TOP + 32, cand, { size: 16, color: C.WHITE })
      } else {
        s.text(x, CONTENT_TOP + 32, cand, { size: 16, color: C.INK })
      }
    })
    s.fillRect(0, CONTENT_TOP + 58, W, 2, C.GRAY)
    // 正文：按宽度换行，只显示最后 3 行
    const lines = wrapText(s, this.draft, W - 40, 14)
    const vis = lines.slice(-3)
    vis.forEach((ln, i) => {
      s.text(16, CONTENT_TOP + 70 + i * 24, ln, { size: 14, color: C.INK })
    })
    // 行尾光标
    if (Math.floor(Date.now() / 400) % 2 === 0) {
      const last = vis[vis.length - 1] ?? ''
      const cx = Math.min(16 + s.measure(last, { size: 14 }) + 2, W - 20)
      const cy = CONTENT_TOP + 70 + (vis.length - 1) * 24 + 3
      s.fillRect(cx, cy, 3, 16, C.BLUE)
    }
    softBar(s, str.msgsSend, str.msgsBack)
  }
}

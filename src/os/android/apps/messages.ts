import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Screen } from '../../../hal/screen'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, roundRect, statusBar, wrapText, clipToWidth, iconTile } from '../ui'

export interface AMsg {
  id: number
  from: string
  text: string
  ts: number
  read: boolean
  mine: boolean
}

type View = 'threads' | 'thread'

const TITLE_H = 26
const AREA_TOP = STATUS_H + TITLE_H
const COMPOSE_H = 52
const SUBJECT_H = 30
const DATE_BAND_H = 20

const MAX_DRAFT = 480 // 长短信：3 条 160 字分段

/**
 * Android 1.0 信息：会话列表 → 全宽行对话（真机 1.0 无气泡：
 * 收件行 #ECFBFF 浅蓝、发件行白底、时间戳细蓝灰）。
 * MENU：添加主题（MMS）/ 删除会话；会话按联系人分组，发送走 host.messageSent。
 */
export const messagesApp: MiniApp = {
  id: 'messages',
  name: '信息',
  nameEn: 'Messaging',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 白色对话气泡 + 尾巴 + 三点（真机 Messaging 图标）
    roundRect(s, x + 4, y + 6, 20, 14, 5, C.WHITE, C.GRAY)
    s.fillRect(x + 7, y + 19, 4, 4, C.WHITE)
    s.fillRect(x + 10, y + 22, 2, 2, C.WHITE)
    s.pset(x + 9, y + 13, C.GRAY)
    s.pset(x + 14, y + 13, C.GRAY)
    s.pset(x + 19, y + 13, C.GRAY)
  },
  start(ctx: AppContext) {
    const ui = new MessagesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

/** 会话内一块内容：日期分隔带或一条消息行 */
interface Block {
  date?: string
  msg?: AMsg
  h: number
}

class MessagesUI {
  private view: View = 'threads'
  private inbox: AMsg[] = []
  private contacts: string[] = []
  private sel = 0
  /** 距底部的像素偏移（0 = 最新） */
  private scroll = 0
  private draft = ''
  private subject = ''
  private subjFocus = false
  // MENU 底部工作表
  private menuOpen = false
  private menuSel = 0
  // 确认删除
  private confirmText = ''
  private confirmRun: (() => void) | null = null
  // Toast
  private toastText = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private ctx: AppContext) {}

  dispose() {
    if (this.toastTimer) clearTimeout(this.toastTimer)
  }

  async init() {
    this.ctx.onKey((k, repeat) => this.onKey(k, repeat))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.ctx.store.onChange(async (key) => {
      if (key !== 'inbox') return
      this.inbox = (await this.ctx.store.get<AMsg[]>('inbox')) ?? []
      this.rebuildContacts()
      // 处于最新位置时新消息到达自动跟底
      if (this.scroll > 40) this.scroll = 0
      this.draw()
    })
    this.inbox = (await this.ctx.store.get<AMsg[]>('inbox')) ?? []
    this.rebuildContacts()
    this.view = 'threads'
    this.draw()
  }

  /** 会话 = 去重的联系人顺序（最近优先） */
  private rebuildContacts() {
    const seen = new Set<string>()
    const list: string[] = []
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      const who = this.inbox[i]!.from
      if (!seen.has(who)) {
        seen.add(who)
        list.push(who)
      }
    }
    this.contacts = list
  }

  private thread(who: string): AMsg[] {
    return this.inbox.filter((m) => m.from === who)
  }

  private currentWho(): string {
    return this.contacts[this.sel] ?? androidStrings(this.ctx.lang.get()).recipient
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.confirmText) {
      // 确认表：取消（左）/ 确定（右），几何同 drawConfirm
      const y0 = (H >> 1) - 70
      if (y >= y0 + 94 && y <= y0 + 138) {
        if (x > 20 && x < 150) this.confirmText = ''
        else if (x > 170 && x < 300) {
          const run = this.confirmRun
          this.confirmText = ''
          this.confirmRun = null
          run?.()
        }
      }
      return
    }
    if (this.menuOpen) {
      const items = this.menuItems()
      const y0 = H - 8 - items.length * 42
      if (y < y0) {
        this.menuOpen = false
        return
      }
      const r = Math.floor((y - y0) / 42)
      if (r >= 0 && r < items.length) {
        this.menuSel = r
        items[r]!.run()
      }
      return
    }
    if (this.view === 'threads') this.threadsTap(y)
    else this.threadTap(x, y)
  }

  private threadsTap(y: number) {
    if (!this.contacts.length) return
    const rows = Math.floor((H - AREA_TOP) / 56)
    const top = Math.max(0, Math.min(this.sel - 1, this.contacts.length - rows))
    for (let r = 0; r < rows; r++) {
      const i = top + r
      if (i >= this.contacts.length) break
      const y0 = AREA_TOP + r * 56
      if (y >= y0 && y < y0 + 52) {
        this.openThread(i)
        return
      }
    }
  }

  private threadTap(x: number, y: number) {
    const compH = this.compH()
    // 主题行点按 → 焦点切到主题
    if (this.subject !== '' || this.menuUsedSubject()) {
      if (y >= H - compH && y < H - COMPOSE_H) {
        this.subjFocus = true
        this.draw()
        return
      }
    }
    // 输入框区域 → 焦点回正文
    if (y >= H - COMPOSE_H) {
      this.subjFocus = false
      // Send 按钮：W-76..W-8
      if (x >= W - 76 && x <= W - 8 && this.draft.trim().length) this.send()
      this.draw()
    }
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey, repeat: boolean) {
    if (repeat) return
    if (this.confirmText) {
      if (k === 'ok') {
        const run = this.confirmRun
        this.confirmText = ''
        this.confirmRun = null
        run?.()
      } else if (k === 'back') this.confirmText = ''
      return
    }
    if (k === 'menu') {
      this.menuOpen = !this.menuOpen
      this.menuSel = 0
      this.draw()
      return
    }
    if (this.menuOpen) {
      const items = this.menuItems()
      if (k === 'up') this.menuSel = (this.menuSel + items.length - 1) % items.length
      else if (k === 'down') this.menuSel = (this.menuSel + 1) % items.length
      else if (k === 'ok') items[this.menuSel]!.run()
      else if (k === 'back') this.menuOpen = false
      else return
      this.draw()
      return
    }
    if (this.view === 'threads') this.threadsKey(k)
    else this.threadKey(k)
  }

  private threadsKey(k: DeviceKey) {
    if (!this.contacts.length) {
      if (k === 'back') this.ctx.exit()
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + this.contacts.length - 1) % this.contacts.length
        break
      case 'down':
        this.sel = (this.sel + 1) % this.contacts.length
        break
      case 'ok':
        this.openThread(this.sel)
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private threadKey(k: DeviceKey) {
    if (/^[a-z0-9]$/.test(k) || k === 'space' || k === '.' || k === ',') {
      const target = this.subjFocus ? 'subject' : 'draft'
      const cur = target === 'draft' ? this.draft : this.subject
      const limit = target === 'draft' ? MAX_DRAFT : 40
      if (cur.length < limit) {
        if (target === 'draft') this.draft += k === 'space' ? ' ' : k
        else this.subject += k === 'space' ? ' ' : k
        this.draw()
      }
      return
    }
    switch (k) {
      case 'clear':
        if (this.subjFocus) this.subject = this.subject.slice(0, -1)
        else this.draft = this.draft.slice(0, -1)
        break
      case 'up':
        this.scroll = Math.min(this.maxScroll(), this.scroll + 28)
        break
      case 'down':
        this.scroll = Math.max(0, this.scroll - 28)
        break
      case 'call':
      case 'ok':
        if (this.draft.trim().length) this.send()
        return
      case 'back':
        this.view = 'threads'
        break
      default:
        return
    }
    this.draw()
  }

  private openThread(i: number) {
    this.sel = i
    this.view = 'thread'
    this.draft = ''
    this.subject = ''
    this.subjFocus = false
    this.scroll = 0
    // 真机：进入会话即把对方未读消息标记已读
    const who = this.currentWho()
    let changed = false
    for (const m of this.inbox)
      if (m.from === who && !m.mine && !m.read) {
        m.read = true
        changed = true
      }
    if (changed) void this.ctx.store.set('inbox', this.inbox)
    this.draw()
  }

  private send() {
    const who = this.currentWho()
    // MMS：主题非空时正文前带主题占位（数据层仍只存文本，主题仅本机观感）
    this.inbox.push({
      id: Date.now(),
      from: who,
      text: this.subject ? `〖${this.subject}〗${this.draft}` : this.draft,
      ts: Date.now(),
      read: true,
      mine: true,
    })
    void this.ctx.store.set('inbox', this.inbox)
    this.draft = ''
    this.subject = ''
    this.scroll = 0
    this.ctx.host.messageSent?.(who)
    this.draw()
  }

  // ---------- MENU 行为 ----------

  private menuUsedSubject(): boolean {
    // 主题行在点过「添加主题」后存在（subject 行占位保留）
    return this.keepSubject
  }
  private keepSubject = false

  private menuItems(): Array<{ label: string; run: () => void }> {
    const str = androidStrings(this.ctx.lang.get())
    if (this.view === 'threads') {
      return [
        { label: str.mMarkAllRead, run: () => this.markAllRead() },
        { label: str.mDeleteAll, run: () => this.askDelete(str.mConfirmDeleteAll, () => this.deleteAll()) },
      ]
    }
    return [
      {
        label: str.mAddSubject,
        run: () => {
          this.keepSubject = true
          this.subjFocus = true
          this.menuOpen = false
          this.draw()
        },
      },
      {
        label: str.mDeleteThread,
        run: () => {
          const who = this.currentWho()
          this.menuOpen = false
          this.askDelete(str.mConfirmDelete, () => this.deleteThread(who))
        },
      },
    ]
  }

  private markAllRead() {
    let changed = false
    for (const m of this.inbox)
      if (!m.mine && !m.read) {
        m.read = true
        changed = true
      }
    this.menuOpen = false
    if (changed) void this.ctx.store.set('inbox', this.inbox)
    this.draw()
  }

  private deleteThread(who: string) {
    this.inbox = this.inbox.filter((m) => m.from !== who)
    void this.ctx.store.set('inbox', this.inbox)
    this.rebuildContacts()
    this.view = 'threads'
    this.toast(androidStrings(this.ctx.lang.get()).mThreadDeleted)
  }

  private deleteAll() {
    this.inbox = []
    void this.ctx.store.set('inbox', this.inbox)
    this.rebuildContacts()
    this.toast(androidStrings(this.ctx.lang.get()).mAllDeleted)
  }

  private askDelete(text: string, run: () => void) {
    this.confirmText = text
    this.confirmRun = run
    this.draw()
  }

  private toast(text: string) {
    this.toastText = text
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastText = ''
      this.draw()
    }, 1500)
    this.draw()
  }

  // ---------- 滚动几何 ----------

  private compH(): number {
    return COMPOSE_H + (this.keepSubject ? SUBJECT_H : 0)
  }

  /** 预排会话块（含日期分隔带），返回块列表与总高 */
  private layoutThread(msgs: AMsg[]): { blocks: Block[]; total: number } {
    const s = this.ctx.screen
    const blocks: Block[] = []
    let total = 0
    let lastDay = ''
    for (const m of msgs) {
      const day = dayKey(m.ts)
      if (day !== lastDay) {
        blocks.push({ date: dateBand(m.ts, this.ctx.lang.get()), h: DATE_BAND_H })
        total += DATE_BAND_H
        lastDay = day
      }
      const lines = wrapText(s, m.text, W - 24, 12)
      const h = 16 + lines.length * 15 + 6
      blocks.push({ msg: m, h })
      total += h
    }
    return { blocks, total }
  }

  private maxScroll(): number {
    const who = this.currentWho()
    const areaH = H - AREA_TOP - this.compH()
    const { total } = this.layoutThread(this.thread(who))
    return Math.max(0, total - areaH)
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    s.clear()
    this.drawBar(str)
    if (this.view === 'threads') this.drawThreads(str)
    else this.drawThread(str)
    if (this.menuOpen) this.drawMenu()
    if (this.confirmText) this.drawConfirm()
    if (this.toastText) {
      const w = Math.max(150, s.measure(this.toastText, { size: 13 }) + 40)
      roundRect(s, (W - w) >> 1, (H >> 1) - 24, w, 48, 10, C.INK, null)
      s.textCenter(W >> 1, (H >> 1) - 6, this.toastText, { size: 13, color: C.WHITE })
    }
    s.render()
  }

  private drawBar(str: ReturnType<typeof androidStrings>) {
    const d = new Date()
    statusBar(this.ctx.screen, {
      unread: this.inbox.some((m) => !m.read && !m.mine),
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
    })
    s_title(this.ctx.screen, str.msgsTitle)
  }

  private drawThreads(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, AREA_TOP, W, H - AREA_TOP, C.WHITE)
    if (!this.contacts.length) {
      s.textCenter(W >> 1, H >> 1, str.msgsEmpty, { color: C.GRAY })
      return
    }
    const rows = Math.floor((H - AREA_TOP) / 56)
    const top = Math.max(0, Math.min(this.sel - 1, this.contacts.length - rows))
    for (let r = 0; r < rows; r++) {
      const i = top + r
      if (i >= this.contacts.length) break
      const who = this.contacts[i]!
      const msgs = this.thread(who)
      const last = msgs[msgs.length - 1]!
      const unread = msgs.some((m) => !m.read && !m.mine)
      const y = AREA_TOP + r * 56
      if (i === this.sel) roundRect(s, 4, y, W - 8, 52, 8, C.PALE, null)
      s.text(16, y + 14, who, { size: 14, color: C.INK })
      // 真机 1.0：未读会话时间戳为琥珀色，已读为灰（不另放圆点——会压住时间）
      s.textRight(W - 14, y + 6, hhmm(last.ts), { size: 10, color: unread ? C.AMBER : C.GRAY })
      s.text(16, y + 34, clipToWidth(s, last.text, W - 32, 11), { size: 11, color: C.GRAY })
    }
  }

  private drawThread(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const who = this.currentWho()
    const msgs = this.thread(who)
    const compH = this.compH()
    s.fillRect(0, AREA_TOP, W, H - AREA_TOP, C.WHITE)
    const { blocks, total } = this.layoutThread(msgs)
    const areaH = H - AREA_TOP - compH
    const scroll = Math.min(this.scroll, Math.max(0, total - areaH))
    let y = AREA_TOP + areaH - total + scroll
    for (const b of blocks) {
      if (y + b.h > AREA_TOP && y < AREA_TOP + areaH) {
        if (b.date) {
          s.fillRect(0, y, W, b.h, C.PALE)
          s.textCenter(W >> 1, y + 5, b.date!, { size: 10, color: C.GRAY })
        } else if (b.msg) {
          const m = b.msg
          const bg = m.mine ? C.WHITE : C.MSGIN
          s.fillRect(0, y, W, b.h, bg)
          // 半透明感时间戳（真机蓝灰）
          s.text(10, y + 3, hhmm(m.ts), { size: 9, color: C.TSTAMP })
          const lines = wrapText(s, m.text, W - 24, 12)
          lines.forEach((ln, i) => s.text(12, y + 16 + i * 15, ln, { size: 12, color: C.INK }))
        }
      }
      y += b.h
    }
    this.drawCompose(str, compH)
  }

  private drawCompose(str: ReturnType<typeof androidStrings>, compH: number) {
    const s = this.ctx.screen
    s.fillRect(0, H - compH, W, compH, C.WHITE)
    s.fillRect(0, H - compH, W, 1, C.GRAY)
    let top = H - compH
    if (this.keepSubject) {
      // 主题行（MMS）：浅灰底 + 标签 + 文本，焦点时橙色边框
      s.fillRect(0, top, W, SUBJECT_H, C.PALE)
      s.fillRect(0, top + SUBJECT_H - 1, W, 1, C.GRAY)
      s.text(10, top + 9, str.mSubjectLabel, { size: 12, color: C.AMBER })
      s.text(10 + s.measure(str.mSubjectLabel, { size: 12 }) + 8, top + 9, this.subject, { size: 12, color: C.INK })
      if (this.subjFocus) colorFrame(s, 4, top + 4, W - 8, SUBJECT_H - 8, C.ORANGE)

      top += SUBJECT_H
    }
    // 输入框：8..W-84
    const fieldW = W - 8 - 76 - 8
    roundRect(s, 8, top + 8, fieldW, 36, 6, C.WHITE, C.GRAY)
    const shown = this.draft.length > 30 ? this.draft.slice(-30) : this.draft
    if (shown) {
      s.text(18, top + 20, shown, { size: 12, color: C.INK })
      if (!this.subjFocus && Math.floor(Date.now() / 500) % 2 === 0) {
        const cx = Math.min(18 + s.measure(shown, { size: 12 }), 8 + fieldW - 4)
        s.fillRect(cx, top + 12, 2, 16, C.GREEN)
      }
    } else {
      s.text(18, top + 20, str.msgsInputHint, { size: 11, color: C.GRAY })
    }
    // 分段计数器（真机：接近 160 字时出现，格式「剩余/段数」）
    const len = this.draft.length
    const seg = Math.max(1, Math.ceil(len / 160))
    const rem = seg * 160 - len
    if (len > 130 || seg > 1) {
      // 计数器放输入框上方右对齐，避免与文字末端的光标重叠
      s.textRight(8 + fieldW, top - 12, `${rem}/${seg}`, { size: 9, color: C.AMBER })
    }
    // Send 按钮
    const canSend = this.draft.trim().length > 0
    roundRect(s, W - 76, top + 8, 68, 36, 6, canSend ? C.GREEN : C.PALE, null)
    s.textCenter(W - 42, top + 21, str.msgsSend, { size: 13, color: canSend ? C.WHITE : C.GRAY })
  }

  /** MENU 底部工作表（与通话控件同风格） */
  private drawMenu() {
    const s = this.ctx.screen
    const items = this.menuItems()
    const sheetH = items.length * 42
    const y0 = H - 8 - sheetH
    roundRect(s, 6, y0, W - 12, sheetH, 8, C.WHITE, C.GRAY)
    items.forEach((it, i) => {
      const ry = y0 + i * 42
      if (i === this.menuSel) s.fillRect(10, ry + 1, W - 20, 40, C.ORANGE)
      else if (i > 0) s.fillRect(16, ry, W - 32, 1, C.PALE)
      s.text(20, ry + 14, it.label, {
        size: 14,
        color: i === this.menuSel ? C.WHITE : C.INK,
      })
    })
  }

  /** 删除确认：深色遮罩 + 中央白卡 + 双按钮（几何须与 onTap 一致） */
  private drawConfirm() {
    const s = this.ctx.screen
    s.fillRect(0, 0, W, H, C.BAR)
    const y0 = (H >> 1) - 70
    roundRect(s, 20, y0, 280, 138, 10, C.WHITE, C.GRAY)
    const lines = wrapText(s, this.confirmText, 250, 13)
    lines.forEach((ln, i) => s.textCenter(W >> 1, y0 + 34 + i * 18, ln, { size: 13, color: C.INK }))
    roundRect(s, 30, y0 + 98, 120, 38, 8, C.PALE, null)
    s.textCenter(90, y0 + 110, androidStrings(this.ctx.lang.get()).btnCancel, { size: 13, color: C.INK })
    roundRect(s, 170, y0 + 98, 120, 38, 8, C.DARKRED, null)
    s.textCenter(230, y0 + 110, androidStrings(this.ctx.lang.get()).btnOk, { size: 13, color: C.WHITE })
  }
}

/** 应用内容标题（状态栏下方灰色小标题条） */
function s_title(s: Screen, title: string) {
  s.fillRect(0, STATUS_H, W, TITLE_H, C.PALE)
  s.text(10, STATUS_H + 7, title, { size: 12, color: C.GRAY })
}

function hhmm(ts: number): string {
  const t = new Date(ts)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

function dayKey(ts: number): string {
  const t = new Date(ts)
  return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`
}

/** 日期分隔带文案：zh「2008/10/22 周三」· en「Wed 10/22/2008」 */
function dateBand(ts: number, lang: string): string {
  const t = new Date(ts)
  const wd = '日一二三四五六'[t.getDay()]
  if (lang === 'zh') {
    return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')} 周${wd}`
  }
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getDay()]} ${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`
}

/** 1px 彩色描边框（Screen.frameRect 固定 INK 色，需要其他色时用 4 条） */
function colorFrame(s: Screen, x: number, y: number, w: number, h: number, color: number) {
  s.fillRect(x, y, w, 1, color)
  s.fillRect(x, y + h - 1, w, 1, color)
  s.fillRect(x, y, 1, h, color)
  s.fillRect(x + w - 1, y, 1, h, color)
}

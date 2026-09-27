import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, roundRect, F_LIGHT, F_REG, F_SEMI, clipToWidth, wrapText } from '../ui'
import { MetroKb } from '../kb'
import { onTrayChange } from '../ui'

export interface WMsg {
  id: number
  from: string
  text: string
  ts: number
  read: boolean
  mine: boolean
}

/** 对话：同发件人的消息聚合 */
interface Thread {
  from: string
  msgs: WMsg[]
}

/** 人脉"发信息"预选的对话号码（一次性） */
let pendingThread: string | null = null
export function setPendingThread(tel: string) {
  pendingThread = tel
}

type View = 'list' | 'chat' | 'input'

const HEADER_Y = TRAY_H + 18
const LIST_TOP = 110
const LIST_ROW_H = 88
/** 消息区顶（对话视图） */
const CHAT_TOP = 110
/** 虚拟键盘字母行起始 y */
const KB_TOP = 470

/**
 * Windows Phone 7.5 信息：深底对话气泡 + 虚拟 QWERTY 键盘 +
 * Mango 全拼输入法（打字母出候选字）—— Mango 中文输入的招牌体验。
 */
export const messagingApp: MiniApp = {
  id: 'messages',
  name: '信息',
  nameEn: 'Messaging',
  start(ctx: AppContext) {
    const ui = new MessagingUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class MessagingUI {
  private view: View = 'list'
  private inbox: WMsg[] = []
  private thread: Thread | null = null
  /** tel → 联系人名（人脉数据） */
  private names = new Map<string, string>()
  /** 虚拟键盘（含正文与输入法状态），init 中创建 */
  private kb!: MetroKb
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    this.kb = new MetroKb(this.ctx, () => this.draw())
    this.kb.onSend = () => void this.send()
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(
      this.ctx.store.onChange((key) => {
        if (key === 'inbox') void this.reload().then(() => this.draw())
      }),
    )
    await this.reload()
    for (const c of (await this.ctx.host.getContacts?.()) ?? []) this.names.set(c.tel, c.name)
    // 人脉跳入：直接开该联系人的输入视图
    // （线程按发件人聚合：可能是号码，也可能是名字——如种子消息的「妈妈」）
    if (pendingThread) {
      const name = this.names.get(pendingThread)
      const t = this.threads().find((th) => th.from === pendingThread || (name && th.from === name))
      // 真机行为：无历史也直接开一条新对话
      this.thread = t ?? { from: pendingThread, msgs: [] }
      this.view = 'input'
      void this.markRead()
      pendingThread = null
    }
    this.draw()
  }

  private async reload() {
    this.inbox = (await this.ctx.store.get<WMsg[]>('inbox')) ?? []
  }

  private accent(): number {
    return this.ctx.host.getAccent ? this.ctx.host.getAccent() : C.BLUE
  }

  private threads(): Thread[] {
    const map = new Map<string, WMsg[]>()
    for (const m of this.inbox) {
      const key = m.mine ? `to:${m.from}` : m.from
      const arr = map.get(key) ?? []
      arr.push(m)
      map.set(key, arr)
    }
    return [...map.entries()]
      .map(([from, msgs]) => ({ from: from.replace(/^to:/, ''), msgs: msgs.sort((a, b) => a.ts - b.ts) }))
      .sort((a, b) => b.msgs[b.msgs.length - 1]!.ts - a.msgs[a.msgs.length - 1]!.ts)
  }

  private nameOf(tel: string): string {
    const str = wpStrings(this.ctx.lang.get())
    return this.names.get(tel) ?? (tel === str.recipient ? str.recipient : tel)
  }

  // ---------- 输入 ----------

  private onKey(k: DeviceKey) {
    if (this.view === 'list') {
      if (k === 'back' || k === 'ok') this.ctx.exit()
      return
    }
    if (this.view === 'chat') {
      if (k === 'back') {
        this.view = 'list'
        this.draw()
      } else if (k === 'ok') {
        this.view = 'input'
        this.draw()
      }
      return
    }
    // input 视图：键盘处理字母/空格/退格；Back 返回对话；OK 发送
    if (k === 'back') {
      this.view = 'chat'
      this.draw()
      return
    }
    if (k === 'ok') {
      void this.send()
      return
    }
    this.kb.key(k)
  }

  private async send() {
    const str = wpStrings(this.ctx.lang.get())
    const text = (this.kb.text + this.kb.ime.buf).trim()
    if (!text) return
    const to = this.thread?.from ?? str.recipient
    const inbox = (await this.ctx.store.get<WMsg[]>('inbox')) ?? []
    inbox.push({ id: Date.now(), from: to, text, ts: Date.now(), read: true, mine: true })
    await this.ctx.store.set('inbox', inbox)
    this.kb.text = ''
    this.kb.ime.reset()
    this.view = 'chat'
    this.ctx.host.messageSent?.(to)
    await this.reload()
    this.draw()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.view === 'list') {
      const r = Math.floor((y - LIST_TOP) / LIST_ROW_H)
      const threads = this.threads()
      if (r >= 0 && r < threads.length) {
        this.thread = threads[r]!
        this.view = 'chat'
        void this.markRead()
        this.draw()
      }
      return
    }
    if (this.view === 'chat') {
      // 点输入条/发送键 → 呼出键盘
      if (y > H - 96) {
        this.view = 'input'
        this.draw()
      } else if (y < HEADER_Y + 60) {
        this.view = 'list'
        this.draw()
      }
      return
    }
    // input 视图：标题区回对话；其余交给键盘
    if (y < HEADER_Y + 60) {
      this.view = 'chat'
      this.draw()
      return
    }
    this.kb.tap(x, y, KB_TOP)
  }

  private async markRead() {
    if (!this.thread) return
    const inbox = (await this.ctx.store.get<WMsg[]>('inbox')) ?? []
    let dirty = false
    for (const m of inbox) {
      if (!m.mine && !m.read && m.from === this.thread.from) {
        m.read = true
        dirty = true
      }
    }
    if (dirty) {
      await this.ctx.store.set('inbox', inbox)
      await this.reload()
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    s.fillRect(0, TRAY_H, W, H - TRAY_H, C.BLACK)
    const accent = this.accent()
    if (this.view === 'list') this.drawList(s, str, accent)
    else this.drawChat(s, str, accent)
    s.render()
  }

  private drawList(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>, accent: number) {
    s.text(24, HEADER_Y, str.msgTitle, { size: 44, font: F_LIGHT(44), color: C.WHITE })
    const threads = this.threads()
    if (!threads.length) {
      s.text(24, 170, str.msgEmpty, { size: 26, font: F_REG(26), color: C.GRAY })
      return
    }
    for (let r = 0; LIST_TOP + r * LIST_ROW_H < H - 20; r++) {
      const t = threads[r]
      if (!t) break
      const y = LIST_TOP + r * LIST_ROW_H
      const last = t.msgs[t.msgs.length - 1]!
      const unread = t.msgs.some((m) => !m.read && !m.mine)
      s.text(24, y, clipToWidth(s, this.nameOf(t.from), W - 60, 30, F_LIGHT(30)), { size: 30, font: F_LIGHT(30), color: C.WHITE })
      s.text(24, y + 44, clipToWidth(s, last.mine ? `我: ${last.text}` : last.text, W - 60, 22, F_REG(22)), { size: 22, font: F_REG(22), color: C.GRAY })
      if (unread) s.fillRect(W - 32, y + 12, 12, 12, accent)
      s.fillRect(24, y + LIST_ROW_H - 6, W - 48, 1, C.DIM)
    }
  }

  private drawChat(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>, accent: number) {
    const title = this.thread ? this.nameOf(this.thread.from) : str.msgTitle
    s.text(24, HEADER_Y, clipToWidth(s, title, W - 60, 44, F_LIGHT(44)), { size: 44, font: F_LIGHT(44), color: C.WHITE })
    // 消息气泡：我方右对齐强调色，对方左对齐暗灰；自底向上排布
    const msgs = this.thread?.msgs ?? []
    const bottomLimit = this.view === 'input' ? KB_TOP - 76 : H - 110
    let used = 0
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!
      const lines = wrapText(s, m.text, W - 220, 24, F_REG(24))
      const bh = Math.max(52, 20 + lines.length * 30)
      if (used + bh > bottomLimit - CHAT_TOP) break
      const bubbleY = bottomLimit - used - bh
      const bw = Math.min(W - 120, Math.max(90, Math.max(...lines.map((l) => s.measure(l, { size: 24, font: F_REG(24) }))) + 40))
      if (m.mine) {
        roundRect(s, W - 24 - bw, bubbleY, bw, bh, 4, accent, null)
        lines.forEach((l, li) =>
          s.text(W - 24 - bw + 20, bubbleY + 14 + li * 30, l, { size: 24, font: F_REG(24), color: C.WHITE }))
      } else {
        roundRect(s, 24, bubbleY, bw, bh, 4, C.DIM, null)
        lines.forEach((l, li) =>
          s.text(44, bubbleY + 14 + li * 30, l, { size: 24, font: F_REG(24), color: C.WHITE }))
      }
      used += bh + 12
    }
    if (this.view === 'chat') {
      // 底部输入条
      s.fillRect(0, H - 96, W, 2, C.DIM)
      roundRect(s, 24, H - 76, W - 190, 56, 4, C.DIM, null)
      s.text(44, H - 58, clipToWidth(s, this.kb.text || str.msgType, W - 260, 24, F_REG(24)), { size: 24, font: F_REG(24), color: this.kb.text ? C.WHITE : C.GRAY })
      roundRect(s, W - 150, H - 76, 126, 56, 4, accent, null)
      s.textCenter(W - 87, H - 58, str.msgSend, { size: 24, font: F_SEMI(24), color: C.WHITE })
    } else {
      // 输入视图：正文行 + 键盘
      const shown = this.kb.text + (this.kb.mode === 'en' || !this.kb.ime.active ? '' : `〔${this.kb.ime.buf}〕`)
      const blink = Math.floor(Date.now() / 500) % 2 === 0 ? '|' : ' '
      s.text(24, 110, clipToWidth(s, shown + blink, W - 60, 34, F_REG(34)), { size: 34, font: F_REG(34), color: C.WHITE })
      s.fillRect(24, 160, W - 48, 1, C.DIM)
      this.kb.draw(s, KB_TOP)
    }
  }
}

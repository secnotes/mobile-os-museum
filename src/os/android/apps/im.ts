import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth, wrapText } from '../ui'

/**
 * IM（G1 预装，Google Talk / AIM 等账户）：好友列表（状态点）→ 气泡聊天。
 * QWERTY 字母输入，回车发送，在线好友 2 秒后回复。
 */
export const imApp: MiniApp = {
  id: 'im',
  name: 'IM',
  nameEn: 'IM',
  icon(s, x, y) {
    iconTile(s, x, y, C.GREEN, C.LGREEN)
    // 白色人像 + 说话气泡
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++)
        if (dx * dx + dy * dy <= 25) s.pset(x + 10 + dx, y + 11 + dy, C.WHITE)
    s.fillRect(x + 4, y + 16, 12, 6, C.WHITE)
    roundRect(s, x + 16, y + 5, 10, 9, 3, C.WHITE, null)
    s.fillRect(x + 18, y + 13, 3, 3, C.WHITE)
    s.pset(x + 19, y + 8, C.GREEN)
    s.pset(x + 22, y + 8, C.GREEN)
  },
  start(ctx: AppContext) {
    const ui = new ImUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface ImMsg { mine: boolean; text: string }

class ImUI {
  private sel = 0
  private view: 'list' | 'chat' = 'list'
  private msgs: ImMsg[] = []
  private draft = ''
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.view === 'chat') {
      // QWERTY 输入（与「信息」一致：字母/数字/空格/./，clear 退格，ok 发送）
      if (/^[a-z0-9]$/.test(k) || k === 'space' || k === '.' || k === ',') {
        if (this.draft.length < 60) {
          this.draft += k === 'space' ? ' ' : k
          this.draw()
        }
        return
      }
      switch (k) {
        case 'clear':
          this.draft = this.draft.slice(0, -1)
          break
        case 'ok':
          if (this.draft.trim().length) {
            this.send()
            return
          }
          return
        case 'back':
          this.view = 'list'
          this.msgs = []
          this.draft = ''
          break
        default:
          return
      }
      this.draw()
      return
    }
    const n = str.imBuddies.length
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'ok':
        this.openChat()
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  /** 触屏：好友行（聊天中触屏不参与，全键盘输入） */
  private onTap(_x: number, y: number) {
    if (this.view === 'chat') return
    const str = androidStrings(this.ctx.lang.get())
    str.imBuddies.forEach((_, i) => {
      const y0 = STATUS_H + 44 + i * 56
      if (y >= y0 && y < y0 + 48) {
        this.sel = i
        this.openChat()
      }
    })
  }

  private openChat() {
    this.view = 'chat'
    this.msgs = []
    this.draft = ''
    this.draw()
  }

  private send() {
    if (!this.draft) return
    this.msgs.push({ mine: true, text: this.draft })
    this.draft = ''
    const str = androidStrings(this.ctx.lang.get())
    const buddy = str.imBuddies[this.sel]!
    this.draw()
    // 一次性定时回复（应用退出自动清理）
    const off = this.ctx.every(buddy.status === 'off' ? 1200 : 2000, () => {
      off()
      if (this.dead || this.view !== 'chat') return
      const reply = buddy.status === 'off' || buddy.status === 'away'
        ? str.imOfflineNote
        : str.imReplies[Math.floor(Math.random() * str.imReplies.length)]!
      this.msgs.push({ mine: false, text: reply })
      this.draw()
    })
  }

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    s.fillRect(0, STATUS_H, W, 30, C.PALE)
    if (this.view === 'chat') {
      const buddy = str.imBuddies[this.sel]!
      s.text(12, STATUS_H + 7, `${str.imTitle} · ${buddy.name}`, { size: 14, color: C.INK })
      this.drawChat(str)
    } else {
      s.text(12, STATUS_H + 7, str.imTitle, { size: 15, color: C.INK })
      this.drawList(str)
    }
    s.render()
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    str.imBuddies.forEach((b, i) => {
      const y = STATUS_H + 44 + i * 56
      if (i === this.sel) roundRect(s, 6, y - 2, W - 12, 48, 8, C.PALE, null)
      const dot = b.status === 'on' ? C.GREEN : b.status === 'away' ? C.AMBER : C.GRAY
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++)
          if (dx * dx + dy * dy <= 16) s.pset(24 + dx, y + 22 + dy, dot)
      s.text(40, y + 8, b.name, { size: 13, color: C.INK })
      s.text(40, y + 28, b.status === 'on' ? str.imOnline : b.status === 'away' ? str.imAway : str.imOffline, { size: 9, color: C.GRAY })
    })
  }

  private drawChat(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    // 从输入框向上堆叠；长消息按 200px 自动换行，气泡高度随行数变化
    const maxBW = W - 110
    const laid = this.msgs.map((m) => {
      const lines = wrapText(s, m.text, maxBW - 20, 11)
      const bh = lines.length * 14 + 14
      return { m, lines, bh }
    })
    let y = H - 54
    for (let i = laid.length - 1; i >= 0; i--) {
      const { m, lines, bh } = laid[i]!
      y -= bh + 4
      if (y < STATUS_H + 38) break // 顶部放不下的旧消息不绘制
      if (m.mine) {
        roundRect(s, 100, y, maxBW, bh, 8, C.DGREEN, null)
        lines.forEach((ln, li) => s.text(110, y + 8 + li * 14, ln, { size: 11, color: C.WHITE }))
      } else {
        roundRect(s, 10, y, maxBW, bh, 8, C.PALE, null)
        lines.forEach((ln, li) => s.text(20, y + 8 + li * 14, ln, { size: 11, color: C.INK }))
      }
    }
    // 输入行
    s.fillRect(0, H - 50, W, 1, C.PALE)
    s.text(14, H - 40, clipToWidth(s, this.draft || str.imInputHint, W - 40, 11), {
      size: 11,
      color: this.draft ? C.INK : C.GRAY,
    })
    if (this.draft && this.draft.length < 60) s.fillRect(16 + s.measure(this.draft, { size: 11 }), H - 40, 2, 12, C.GREEN)
  }
}

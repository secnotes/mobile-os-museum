import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings, type AndroidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, wrapText, clipToWidth, time12 } from '../ui'

type Email = { from: string; subj: string; body: string; date: string }

/** 收件箱种子（POP/IMAP 同步的非 Gmail 账户） */
function mails(str: AndroidStrings): Email[] {
  return str.emailSeeds.map((e, i) => ({
    from: e.from,
    subj: e.subj,
    body: e.body,
    date: ['10:21 AM', 'Yesterday', 'Mon'][i]!,
  }))
}

type View = 'setup' | 'checking' | 'list' | 'read'

/**
 * Android 1.0 Email：独立于 Gmail 的 POP/IMAP 邮件客户端——
 * 账户设置假流程（地址/密码 → 检查服务器设置）→ 收件箱 → 阅读。
 */
export const emailApp: MiniApp = {
  id: 'email',
  name: '电子邮件',
  nameEn: 'Email',
  icon(s, x, y) {
    // 真机 1.0 Email 图标：白色信封 + 红色 @ 角标
    roundRect(s, x + 3, y + 6, 22, 16, 2, C.WHITE, C.GRAY)
    // 信封封口 V
    for (let i = 0; i < 11; i++) s.pset(x + 4 + i, y + 7 + (i < 11 ? (i <= 5 ? i : 10 - i) : 0), C.GRAY)
    s.fillRect(x + 18, y + 2, 10, 9, C.RED)
    s.text(x + 18, y + 1, '@', { size: 9, color: C.WHITE })
  },
  start(ctx: AppContext) {
    const ui = new EmailUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class EmailUI {
  private view: View = 'setup'
  private sel = 0
  private stage = 0
  private dead = false
  private timers: Array<ReturnType<typeof setTimeout>> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const t of this.timers.splice(0)) clearTimeout(t)
  }

  async init() {
    const setupDone = await this.ctx.store.get<boolean>('setup')
    this.view = setupDone ? 'list' : 'setup'
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'setup') {
      if (k === 'ok') this.nextSetup()
      return
    }
    if (this.view === 'checking') return
    if (this.view === 'read') {
      if (k === 'back' || k === 'ok') {
        this.view = 'list'
        this.draw()
      }
      return
    }
    const n = 3
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'ok':
        this.view = 'read'
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.view === 'setup') {
      if (y > H - 60 && x > W - 130) this.nextSetup()
      return
    }
    if (this.view === 'read') {
      if (y > H - 34) {
        this.view = 'list'
        this.draw()
      }
      return
    }
    if (this.view !== 'list') return
    for (let i = 0; i < 3; i++) {
      const y0 = STATUS_H + 40 + i * 72
      if (y >= y0 && y < y0 + 68) {
        this.sel = i
        this.view = 'read'
        this.draw()
        return
      }
    }
  }

  private nextSetup() {
    this.stage++
    if (this.stage < 2) {
      this.draw()
      return
    }
    // 进入"检查服务器设置…"假进度，随后进收件箱
    this.view = 'checking'
    this.draw()
    this.timers.push(
      setTimeout(() => {
        if (this.dead) return
        void this.ctx.store.set('setup', true)
        this.view = 'list'
        this.draw()
      }, 1600),
    )
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
      clock: time12(d),
      signalBars: 4,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    if (this.view === 'setup') return this.drawSetup(str)
    if (this.view === 'checking') return this.drawChecking(str)
    if (this.view === 'read') return this.drawRead(mails(str)[this.sel]!)
    this.drawList(mails(str))
  }

  private drawSetup(str: AndroidStrings) {
    const s = this.ctx.screen
    s.fillRect(0, STATUS_H, W, 36, C.PALE)
    s.text(12, STATUS_H + 9, str.emailSetup, { size: 15, color: C.INK })
    const fields = [
      { label: str.emailAddr, val: 'android_user@example.net' },
      { label: str.emailPass, val: '••••••••' },
    ]
    fields.slice(0, this.stage + 1).forEach((f, i) => {
      const y = STATUS_H + 70 + i * 70
      s.text(16, y, f.label, { size: 12, color: C.GRAY })
      roundRect(s, 12, y + 14, W - 24, 34, 4, C.WHITE, C.PALE)
      s.text(22, y + 23, f.val, { size: 13, color: C.INK })
    })
    // Next 按钮
    roundRect(s, W - 120, H - 54, 108, 38, 8, C.GREEN, null)
    s.textCenter(W - 66, H - 43, str.emailNext, { size: 14, color: C.WHITE })
    s.render()
  }

  private drawChecking(str: AndroidStrings) {
    const s = this.ctx.screen
    const cx = W >> 1
    s.textCenter(cx, STATUS_H + 130, str.emailChecking, { size: 14, color: C.INK })
    // 旋转等待圈（四段弧像素块）
    const phase = Math.floor(Date.now() / 180) % 4
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2
      const rr = 22
      if (((a + phase) % 4) !== 0) continue
      s.pset(cx + Math.cos(ang) * rr, STATUS_H + 180 + Math.sin(ang) * rr, C.BLUE)
    }
    s.render()
  }

  private drawList(list: Email[]) {
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    s.fillRect(0, STATUS_H, W, 34, C.PALE)
    s.text(12, STATUS_H + 8, `${str.emailTitle} · ${str.emailInbox}`, { size: 14, color: C.INK })
    list.forEach((m, i) => {
      const y = STATUS_H + 40 + i * 72
      if (i === this.sel) roundRect(s, 6, y - 2, W - 12, 68, 8, C.PALE, null)
      s.text(14, y + 4, clipToWidth(s, m.from, W - 90, 13), { size: 13, color: C.INK })
      s.textRight(W - 12, y + 5, m.date, { size: 9, color: C.GRAY })
      s.text(14, y + 26, clipToWidth(s, m.subj, W - 28, 12), { size: 12, color: C.BLUE })
      s.text(14, y + 46, clipToWidth(s, m.body, W - 28, 10), { size: 9, color: C.GRAY })
    })
    s.render()
  }

  private drawRead(m: Email) {
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    s.text(16, STATUS_H + 40, m.from, { size: 14, color: C.INK })
    s.textRight(W - 14, STATUS_H + 41, m.date, { size: 9, color: C.GRAY })
    s.text(16, STATUS_H + 64, m.subj, { size: 13, color: C.BLUE })
    s.fillRect(16, STATUS_H + 84, W - 32, 1, C.PALE)
    wrapText(s, m.body, W - 32, 12).forEach((ln, i) =>
      s.text(16, STATUS_H + 100 + i * 18, ln, { size: 12, color: C.INK }))
    s.textCenter(W >> 1, H - 22, str.browserDone, { size: 10, color: C.GRAY })
    s.render()
  }
}

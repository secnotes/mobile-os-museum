import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings, type AndroidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, wrapText, clipToWidth } from '../ui'

/** 邮件（Google 账户推送）；ids 0/1 收件箱，2 已发送 */
function mails(str: AndroidStrings) {
  return [
    { from: str.gmailFrom1, subj: str.gmailSubj1, body: str.gmailBody1, unread: true },
    { from: str.gmailFrom2, subj: str.gmailSubj2, body: str.gmailBody2, unread: true },
  ]
}

/**
 * Android 1.0 Gmail：标签（收件箱/已加星标/已发送）→ 邮件列表 →
 * 阅读；星标持久化；刷新假进度条（MENU 或右上 ↻）。
 */
export const gmailApp: MiniApp = {
  id: 'gmail',
  name: 'Gmail',
  nameEn: 'Gmail',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 白信封 + 红色 M（真机 Gmail 图标）
    s.fillRect(x + 5, y + 8, 18, 13, C.WHITE)
    s.fillRect(x + 5, y + 8, 18, 1, C.GRAY)
    s.fillRect(x + 5, y + 20, 18, 1, C.GRAY)
    s.text(x + 8, y + 11, 'M', { size: 12, color: C.RED })
  },
  start(ctx: AppContext) {
    const ui = new GmailUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type Label = 'inbox' | 'starred' | 'sent'
type View = 'labels' | 'list' | 'read'

class GmailUI {
  private view: View = 'labels'
  private label: Label = 'inbox'
  private sel = 0
  private stars: number[] = []
  private refreshing = false
  private refreshP = 0
  private toastText = ''
  private toastUntil = 0
  private dead = false
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.stars = (await this.ctx.store.get<number[]>('stars')) ?? []
    this.offs.push(this.ctx.onFrame((dt) => {
      if (!this.refreshing) return
      this.refreshP += dt / 1.2
      if (this.refreshP >= 1) {
        this.refreshing = false
        const str = androidStrings(this.ctx.lang.get())
        const d = new Date()
        this.showToast(`${str.gmailSynced} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
      }
      this.draw()
    }))
    this.draw()
  }

  private labelIndices(): number[] {
    if (this.label === 'starred') return this.stars
    if (this.label === 'sent') return []
    return [0, 1]
  }

  private onKey(k: DeviceKey) {
    if (this.refreshing && k !== 'back') return
    if (this.view === 'labels') {
      const n = 3
      switch (k) {
        case 'up':
          this.sel = (this.sel + n - 1) % n
          break
        case 'down':
          this.sel = (this.sel + 1) % n
          break
        case 'ok':
          this.openLabel((['inbox', 'starred', 'sent'] as const)[this.sel]!)
          return
        case 'menu':
          this.startRefresh()
          return
        case 'back':
          this.ctx.exit()
          return
        default:
          return
      }
      this.draw()
      return
    }
    if (this.view === 'list') {
      const n = this.labelIndices().length
      switch (k) {
        case 'up':
          if (n) this.sel = (this.sel + n - 1) % n
          break
        case 'down':
          if (n) this.sel = (this.sel + 1) % n
          break
        case 'ok':
          if (n) { this.view = 'read' }
          break
        case 'menu':
          this.startRefresh()
          return
        case 'back':
          this.view = 'labels'
          break
        default:
          return
      }
      this.draw()
      return
    }
    // read
    switch (k) {
      case 'ok':
        void this.toggleStar()
        return
      case 'back':
        this.view = 'list'
        break
      default:
        return
    }
    this.draw()
  }

  private openLabel(l: Label) {
    this.label = l
    this.view = 'list'
    this.sel = 0
    this.draw()
  }

  private onTap(x: number, y: number) {
    // 刷新按钮（右上）
    if (y >= STATUS_H + 4 && y <= STATUS_H + 28 && x >= W - 32) {
      this.startRefresh()
      return
    }
    if (this.view === 'labels') {
      for (let i = 0; i < 3; i++) {
        const y0 = STATUS_H + 40 + i * 54
        if (y >= y0 && y < y0 + 50) {
          this.openLabel((['inbox', 'starred', 'sent'] as const)[i]!)
          return
        }
      }
      return
    }
    if (this.view === 'list') {
      const idx = this.labelIndices()
      const y0 = STATUS_H + 38
      for (let i = 0; i < idx.length; i++) {
        if (y >= y0 + i * 72 && y < y0 + (i + 1) * 72) {
          this.sel = i
          this.view = 'read'
          this.draw()
          return
        }
      }
      return
    }
    // read：星标（右上）
    if (y >= STATUS_H + 38 && y <= STATUS_H + 64 && x >= W - 40 && x <= W - 14)
      void this.toggleStar()
  }

  private async toggleStar() {
    const id = this.labelIndices()[this.sel]!
    this.stars = this.stars.includes(id) ? this.stars.filter((x) => x !== id) : [...this.stars, id]
    await this.ctx.store.set('stars', this.stars)
    this.draw()
  }

  private startRefresh() {
    if (this.refreshing) return
    this.refreshing = true
    this.refreshP = 0
    this.draw()
  }

  private showToast(t: string) {
    this.toastText = t
    this.toastUntil = Date.now() + 2000
  }

  // ---------- 绘制 ----------

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
    s.fillRect(0, STATUS_H, W, 32, C.PALE)
    if (this.view === 'labels') {
      s.text(12, STATUS_H + 9, str.gmailTitle, { size: 14, color: C.INK })
      this.drawLabels(str)
    } else if (this.view === 'list') {
      const title = this.label === 'inbox' ? str.gmailInbox : this.label === 'starred' ? str.gmailStarred : str.gmailSent
      s.text(12, STATUS_H + 9, clipToWidth(s, title, W - 50, 14), { size: 14, color: C.INK })
      this.drawList(str)
    } else {
      s.text(12, STATUS_H + 9, str.gmailTitle, { size: 14, color: C.INK })
      this.drawRead(str)
    }
    s.textRight(W - 10, STATUS_H + 8, '↻', { size: 16, color: this.refreshing ? C.GRAY : C.BLUE })
    if (this.refreshing)
      s.fillRect(0, STATUS_H + 32, Math.round(W * this.refreshP), 3, C.GREEN)
    if (Date.now() < this.toastUntil) {
      roundRect(s, 24, H - 100, W - 48, 32, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 90, this.toastText, { size: 11, color: C.WHITE })
    }
    s.render()
  }

  private labelName(str: ReturnType<typeof androidStrings>, l: Label): string {
    return l === 'inbox' ? str.gmailInbox : l === 'starred' ? str.gmailStarred : str.gmailSent
  }

  private drawLabels(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const labels: Label[] = ['inbox', 'starred', 'sent']
    const counts: Record<Label, number> = { inbox: 2, starred: this.stars.length, sent: 0 }
    labels.forEach((l, i) => {
      const y = STATUS_H + 40 + i * 54
      if (i === this.sel) s.fillRect(8, y, W - 16, 50, C.ORANGE)
      const tc = i === this.sel ? C.INK : C.INK
      const gc = i === this.sel ? C.INK : C.GRAY
      s.text(22, y + 16, this.labelName(str, l), { size: 13, color: tc })
      s.textRight(W - 22, y + 16, String(counts[l]), { size: 11, color: gc })
    })
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const list = mails(str)
    const idx = this.labelIndices()
    if (!idx.length) {
      s.textCenter(W >> 1, 150, str.gmailEmpty, { size: 12, color: C.GRAY })
      return
    }
    const y0 = STATUS_H + 38
    idx.forEach((mi, i) => {
      const y = y0 + i * 72
      const m = list[mi]!
      const starred = this.stars.includes(mi)
      if (i === this.sel) s.fillRect(0, y, W, 70, C.MSGIN)
      this.drawStar(16, y + 8, starred)
      s.text(34, y + 6, clipToWidth(s, m.from, W - 50, 13), {
        size: 13,
        color: C.INK,
      })
      s.text(16, y + 28, clipToWidth(s, m.subj, W - 32, 12), { size: 12, color: C.BLUE })
      s.text(16, y + 48, clipToWidth(s, m.body, W - 32, 9), { size: 9, color: C.GRAY })
    })
  }

  private drawRead(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const m = mails(str)[this.labelIndices()[this.sel]!]!
    const starred = this.stars.includes(this.labelIndices()[this.sel]!)
    s.text(16, STATUS_H + 44, clipToWidth(s, m.from, W - 70, 14), { size: 14, color: C.INK })
    this.drawStar(W - 34, STATUS_H + 40, starred)
    s.text(16, STATUS_H + 70, clipToWidth(s, m.subj, W - 32, 12), { size: 12, color: C.BLUE })
    s.fillRect(16, STATUS_H + 88, W - 32, 1, C.PALE)
    wrapText(s, m.body, W - 32, 12).forEach((ln, i) =>
      s.text(16, STATUS_H + 102 + i * 17, ln, { size: 12, color: C.INK }))
  }

  private drawStar(x: number, y: number, on: boolean) {
    if (on) starShape(this.ctx.screen, x, y, C.AMBER)
    else starOutline(this.ctx.screen, x, y, C.GRAY)
  }
}

function starShape(s: AppContext['screen'], x: number, y: number, color: number) {
  s.fillRect(x + 3, y, 2, 2, color)
  s.fillRect(x + 1, y + 2, 6, 2, color)
  s.fillRect(x, y + 4, 8, 2, color)
  s.fillRect(x + 1, y + 6, 2, 2, color)
  s.fillRect(x + 5, y + 6, 2, 2, color)
}

function starOutline(s: AppContext['screen'], x: number, y: number, color: number) {
  s.fillRect(x + 3, y, 2, 1, color)
  s.fillRect(x + 1, y + 2, 1, 1, color)
  s.fillRect(x + 6, y + 2, 1, 1, color)
  s.fillRect(x, y + 4, 1, 1, color)
  s.fillRect(x + 7, y + 4, 1, 1, color)
  s.fillRect(x + 1, y + 6, 1, 1, color)
  s.fillRect(x + 6, y + 6, 1, 1, color)
}

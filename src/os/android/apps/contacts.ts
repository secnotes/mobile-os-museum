import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { loadContacts, type Contact } from '../../../scenario/data'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth } from '../ui'

const ROW_H = 64
const LIST_TOP = STATUS_H + 44

/**
 * Android 1.0 名片夹：联系人列表 → 详情（头像 + 号码 + 呼叫按钮）。
 * 数据经设备级 store 持久化（设置页可编辑），呼叫经 host.dial 转入拨号。
 */
export const contactsApp: MiniApp = {
  id: 'contacts',
  name: '名片夹',
  nameEn: 'Contacts',
  icon(s, x, y) {
    iconTile(s, x, y, C.GRAY, C.PALE)
    // 人形剪影
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dy * dy <= 16) s.pset(x + 14 + dx, y + 10 + dy, C.WHITE)
    roundRect(s, x + 8, y + 16, 12, 8, 3, C.WHITE, null)
  },
  start(ctx: AppContext) {
    const ui = new ContactsUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class ContactsUI {
  private list: Contact[] = []
  private sel = 0
  private top = 0
  private detail = false
  private dead = false
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    await this.reload()
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    // 设置页编辑通讯录时即时刷新
    this.offs.push(
      this.ctx.store.onChange((key) => {
        if (key === 'contacts') void this.reload()
      }),
    )
  }

  private async reload() {
    // 通讯录存设备级 'contacts' 键（设置页编辑），经 host 桥读取
    this.list =
      (await this.ctx.host.getContacts?.()) ??
      (await loadContacts(this.ctx.store.get.bind(this.ctx.store)))
    this.sel = Math.min(this.sel, Math.max(0, this.list.length - 1))
    this.fixTop()
    this.draw()
  }

  private get visibleRows() {
    return Math.floor((H - LIST_TOP) / ROW_H)
  }

  private fixTop() {
    const n = this.list.length
    const vis = this.visibleRows
    if (n <= vis) this.top = 0
    else this.top = Math.max(0, Math.min(this.sel - 1, n - vis))
  }

  private onKey(k: DeviceKey) {
    const list = this.list
    if (this.detail) {
      if (k === 'back') {
        this.detail = false
        this.draw()
      } else if (k === 'ok' || k === 'call') {
        const c = list[this.sel]!
        this.ctx.host.dial?.(c.tel, c.name)
      }
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + list.length - 1) % list.length
        break
      case 'down':
        this.sel = (this.sel + 1) % list.length
        break
      case 'ok':
        this.detail = true
        break
      case 'call':
        this.ctx.host.dial?.(list[this.sel]!.tel, list[this.sel]!.name)
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.fixTop()
    this.draw()
  }

  private onTap(x: number, y: number) {
    const list = this.list
    if (this.detail) {
      // 呼叫按钮
      if (y > H - 90 && y < H - 46 && Math.abs(x - (W >> 1)) < 60) {
        const c = list[this.sel]!
        this.ctx.host.dial?.(c.tel, c.name)
      } else if (y > H - 30) {
        this.detail = false
        this.draw()
      }
      return
    }
    for (let r = 0; r < this.visibleRows; r++) {
      const i = this.top + r
      if (i >= list.length) break
      const y0 = LIST_TOP + r * ROW_H
      if (y >= y0 && y < y0 + 56) {
        this.sel = i
        this.detail = true
        this.draw()
        return
      }
    }
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
    s.text(12, STATUS_H + 7, str.contactsTitle, { size: 15, color: C.INK })
    const list = this.list
    if (!this.detail) {
      for (let r = 0; r < this.visibleRows; r++) {
        const i = this.top + r
        if (i >= list.length) break
        const c = list[i]!
        const y = LIST_TOP + r * ROW_H
        if (i === this.sel) roundRect(s, 6, y - 2, W - 12, 56, 8, C.PALE, null)
        // 头像
        roundRect(s, 16, y + 6, 40, 40, 8, C.PALE, null)
        for (let dy = -7; dy <= 7; dy++)
          for (let dx = -7; dx <= 7; dx++)
            if (dx * dx + dy * dy <= 49) s.pset(36 + dx, y + 19 + dy, C.GRAY)
        roundRect(s, 27, y + 30, 18, 12, 4, C.GRAY, null)
        s.text(72, y + 10, clipToWidth(s, c.name, W - 90, 14), { size: 14, color: C.INK })
        s.text(72, y + 32, c.tel, { size: 11, color: C.GRAY })
      }
    } else {
      const c = list[this.sel]!
      roundRect(s, (W - 110) >> 1, STATUS_H + 50, 110, 110, 12, C.PALE, null)
      for (let dy = -22; dy <= 22; dy++)
        for (let dx = -22; dx <= 22; dx++)
          if (dx * dx + dy * dy <= 484) s.pset((W >> 1) + dx, STATUS_H + 92 + dy, C.GRAY)
      roundRect(s, (W >> 1) - 30, STATUS_H + 124, 60, 34, 10, C.GRAY, null)
      s.textCenter(W >> 1, STATUS_H + 180, clipToWidth(s, c.name, W - 40, 18), { size: 18, color: C.INK })
      s.textCenter(W >> 1, STATUS_H + 208, c.tel, { size: 13, color: C.GRAY })
      // 呼叫按钮
      roundRect(s, (W >> 1) - 60, H - 90, 120, 44, 10, C.DGREEN, null)
      s.textCenter(W >> 1, H - 76, str.contactsCall, { size: 15, color: C.WHITE })
    }
    s.render()
  }
}

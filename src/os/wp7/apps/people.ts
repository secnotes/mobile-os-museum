import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Contact } from '../../../scenario/data'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, roundRect, F_LIGHT, F_REG, F_SEMI, clipToWidth, glyphPerson, onTrayChange } from '../ui'

const HEADER_Y = TRAY_H + 18
const LIST_TOP = 110
const ROW_H = 88

/**
 * Windows Phone 7.5 人脉：黑底白细体联系人列表（Metro 标志性的大间距行），
 * 点开看详情 → 呼叫/发信息。数据经 host.getContacts 读设备级通讯录（设置页可编辑）。
 */
export const peopleApp: MiniApp = {
  id: 'contacts',
  name: '人脉',
  nameEn: 'People',
  start(ctx: AppContext) {
    const ui = new PeopleUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class PeopleUI {
  private list: Contact[] = []
  private sel = -1
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
    this.offs.push(onTrayChange(() => this.draw()))
    this.ctx.onLang(() => this.draw())
  }

  private async reload() {
    // 设备级通讯录（host 桥接；回落种子在 loadContacts 内处理）
    this.list = (await this.ctx.host.getContacts?.()) ?? []
    this.sel = Math.min(this.sel, this.list.length - 1)
    this.draw()
  }

  private accent(): number {
    return this.ctx.host.getAccent ? this.ctx.host.getAccent() : C.BLUE
  }

  private onKey(k: DeviceKey) {
    if (this.sel >= 0) {
      if (k === 'back') {
        this.sel = -1
        this.draw()
      } else if (k === 'ok' || k === 'call') {
        this.call()
      }
      return
    }
    if (k === 'back') this.ctx.exit()
  }

  private onTap(x: number, y: number) {
    if (this.sel >= 0) {
      const c = this.list[this.sel]
      if (!c) return
      // 呼叫 / 发信息 两个动作条
      if (y > H - 190 && y < H - 120) {
        if (x < W / 2) this.call()
        else this.ctx.host.dialMsg?.(c.tel, c.name)
      }
      return
    }
    if (y < HEADER_Y + 60) return
    const r = Math.floor((y - LIST_TOP) / ROW_H)
    if (r >= 0 && r < this.list.length) {
      this.sel = r
      this.draw()
    }
  }

  private call() {
    const c = this.list[this.sel]
    if (c) this.ctx.host.dial?.(c.tel, c.name)
  }

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
    s.text(24, HEADER_Y, str.peopleTitle, { size: 44, font: F_LIGHT(44), color: C.WHITE })
    if (!this.list.length) {
      s.text(24, 170, str.peopleEmpty, { size: 26, font: F_REG(26), color: C.GRAY })
      s.render()
      return
    }
    if (this.sel >= 0) {
      this.drawDetail(s, str, accent)
    } else {
      for (let r = 0; LIST_TOP + r * ROW_H < H - 20; r++) {
        const c = this.list[r]
        if (!c) break
        const y = LIST_TOP + r * ROW_H
        // 头像方块（强调色底 + 人形剪影）
        roundRect(s, 24, y + 4, 64, 64, 4, accent, null)
        glyphPerson(s, 56, y + 36, 44, C.WHITE)
        s.text(116, y + 18, clipToWidth(s, c.name, W - 160, 32, F_LIGHT(32)), { size: 32, font: F_LIGHT(32), color: C.WHITE })
        s.text(116, y + 56, clipToWidth(s, c.tel, W - 160, 22, F_REG(22)), { size: 22, font: F_REG(22), color: C.GRAY })
        s.fillRect(24, y + ROW_H - 6, W - 48, 1, C.DIM)
      }
    }
    s.render()
  }

  private drawDetail(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>, accent: number) {
    const c = this.list[this.sel]!
    roundRect(s, 24, 120, 96, 96, 4, accent, null)
    glyphPerson(s, 72, 168, 64, C.WHITE)
    s.text(150, 148, clipToWidth(s, c.name, W - 190, 44, F_LIGHT(44)), { size: 44, font: F_LIGHT(44), color: C.WHITE })
    s.text(150, 196, clipToWidth(s, c.tel, W - 190, 26, F_REG(26)), { size: 26, font: F_REG(26), color: C.GRAY })
    // 动作条：呼叫 / 发信息
    roundRect(s, 24, H - 190, W / 2 - 44, 70, 6, accent, null)
    s.textCenter(W / 4 - 10, H - 165, str.peopleCall, { size: 30, font: F_SEMI(30), color: C.WHITE })
    roundRect(s, W / 2 + 20, H - 190, W / 2 - 44, 70, 6, C.DIM, null)
    s.textCenter(W * 3 / 4 + 10, H - 165, str.peopleSendMsg, { size: 30, font: F_SEMI(30), color: C.WHITE })
  }
}

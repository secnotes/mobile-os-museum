import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { CallEntry } from '../../../scenario/data'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, roundRect, F_LIGHT, F_REG, F_SEMI, clipToWidth, onTrayChange } from '../ui'

type Sub = 'dial' | 'calling' | 'call' | 'callend'
type Tab = 'dial' | 'log'

const HEADER_Y = TRAY_H + 18
const KEYS: Array<{ d: string; sub: string }> = [
  { d: '1', sub: '' },
  { d: '2', sub: 'ABC' },
  { d: '3', sub: 'DEF' },
  { d: '4', sub: 'GHI' },
  { d: '5', sub: 'JKL' },
  { d: '6', sub: 'MNO' },
  { d: '7', sub: 'PQRS' },
  { d: '8', sub: 'TUV' },
  { d: '9', sub: 'WXYZ' },
  { d: '*', sub: '' },
  { d: '0', sub: '+' },
  { d: '#', sub: '' },
]
/** 九宫格几何：3 列，行高 76 */
const PAD_TOP = 330
const KEY_W = 144
const KEY_H = 76
const GAP = 12

const LOG_ROW_H = 76

/** 人脉请求拨号时预填的号码（一次性） */
let pendingNumber: string | null = null
export function setPendingDial(number: string) {
  pendingNumber = number
}

/**
 * Windows Phone 7.5 电话：Pivot 头部切换（拨号/通话记录），
 * 大号数字 + 九宫格键盘 + 强调色呼叫键 —— Mango 电话的标志版式。
 */
export const phoneApp: MiniApp = {
  id: 'phone',
  name: '电话',
  nameEn: 'Phone',
  start(ctx: AppContext) {
    const ui = new PhoneUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class PhoneUI {
  private num = pendingNumber ?? ''
  private sub: Sub = 'dial'
  private tab: Tab = 'dial'
  private t = 0
  private log: CallEntry[] = []
  private top = 0
  private offs: Array<() => void> = []
  private ringInt: ReturnType<typeof setInterval> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private endTimer: ReturnType<typeof setTimeout> | null = null
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    if (this.ringInt) clearInterval(this.ringInt)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    if (this.endTimer) clearTimeout(this.endTimer)
    this.offs.forEach((off) => off())
  }

  async init() {
    pendingNumber = null
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.offs.push(onTrayChange(() => this.draw()))
    this.ctx.onLang(() => this.draw())
    this.offs.push(
      this.ctx.onFrame((dt) => {
        this.t += dt
        if (this.sub === 'dial' || this.sub === 'call' || this.sub === 'calling') this.draw()
      }),
    )
    this.draw()
  }

  private accent(): number {
    return this.ctx.host.getAccent ? this.ctx.host.getAccent() : C.BLUE
  }

  private onKey(k: DeviceKey) {
    switch (this.sub) {
      case 'dial':
        if (/^[0-9*#]$/.test(k)) {
          if (this.tab === 'log') {
            this.tab = 'dial'
            this.num = ''
          }
          if (this.num.length < 14) {
            this.num += k
            this.ctx.audio.dtmf(k)
          }
        } else if (k === 'clear' || k === 'back') {
          if (this.tab === 'log') {
            this.tab = 'dial'
            this.draw()
            return
          }
          this.num = this.num.slice(0, -1)
          if (k === 'back' && !this.num) {
            this.ctx.exit()
            return
          }
        } else if (k === 'left' || k === 'right') {
          void this.switchTab(this.tab === 'dial' ? 'log' : 'dial')
          return
        } else if (k === 'call' || k === 'ok') {
          if (this.tab === 'log') return
          if (this.num.length) this.startCall()
          return
        } else if (this.tab === 'log') {
          if (k === 'up') this.moveSel(-1)
          else if (k === 'down') this.moveSel(1)
        } else return
        this.draw()
        return
      case 'calling':
      case 'call':
        if (k === 'end' || k === 'back') this.hangUp()
        return
      case 'callend':
        if (k === 'ok' || k === 'back' || k === 'end') this.ctx.exit()
        return
      default:
        return
    }
  }

  private onTap(x: number, y: number) {
    if (this.sub === 'callend') {
      this.ctx.exit()
      return
    }
    if (this.sub !== 'dial') {
      // 通话中：点挂断条
      if (y > H - 130 && y < H - 60) this.hangUp()
      return
    }
    // Pivot 头部
    if (y > HEADER_Y - 14 && y < HEADER_Y + 52) {
      void this.switchTab(x < W / 2 ? 'dial' : 'log')
      return
    }
    if (this.tab === 'log') {
      const r = Math.floor((y - 120) / LOG_ROW_H)
      const i = this.top + r
      if (r >= 0 && i < this.log.length) this.redial(this.log[i]!)
      return
    }
    // 删除键
    if (y > 200 && y < 260 && x > W - 130 && this.num) {
      this.num = this.num.slice(0, -1)
      this.draw()
      return
    }
    // 九宫格
    for (let i = 0; i < KEYS.length; i++) {
      const kx = 14 + (i % 3) * (KEY_W + GAP)
      const ky = PAD_TOP + Math.floor(i / 3) * (KEY_H + GAP)
      if (x >= kx && x < kx + KEY_W && y >= ky && y < ky + KEY_H) {
        this.num = (this.num + KEYS[i]!.d).slice(0, 14)
        this.ctx.audio.dtmf(KEYS[i]!.d)
        this.draw()
        return
      }
    }
    // 呼叫键
    if (y > H - 92 && y < H - 28 && Math.abs(x - W / 2) < 140 && this.num.length) this.startCall()
  }

  private async switchTab(tab: Tab) {
    this.tab = tab
    if (tab === 'log') await this.reloadLog()
    this.draw()
  }

  private async reloadLog() {
    this.log = [...((await this.ctx.host.getCallLog?.()) ?? [])].reverse()
    this.fixTop()
  }

  private moveSel(d: number) {
    const n = this.log.length
    if (!n) return
    // 列表滚动（点选为主，键盘为辅）
    this.top = Math.max(0, Math.min(this.top + d, Math.max(0, n - this.visibleRows)))
    this.draw()
  }

  private get visibleRows() {
    return Math.floor((H - 120) / LOG_ROW_H)
  }

  private fixTop() {
    this.top = Math.max(0, Math.min(this.top, Math.max(0, this.log.length - this.visibleRows)))
  }

  private redial(e: CallEntry) {
    this.num = e.tel
    this.tab = 'dial'
    this.startCall()
  }

  private startCall() {
    this.sub = 'calling'
    this.t = 0
    this.ctx.audio.ringbackTone(0.4)
    this.ringInt = setInterval(() => this.ctx.audio.ringbackTone(0.4), 1200)
    this.connectTimer = setTimeout(() => {
      if (this.dead || this.sub !== 'calling') return
      if (this.ringInt) {
        clearInterval(this.ringInt)
        this.ringInt = null
      }
      this.sub = 'call'
      this.t = 0
      this.draw()
    }, 2600)
    this.draw()
  }

  private hangUp() {
    if (this.sub === 'call') {
      this.ctx.host.recordCall?.({
        tel: this.num,
        name: '',
        dir: 'out',
        dur: Math.floor(this.t),
        missed: false,
      })
    }
    if (this.ringInt) {
      clearInterval(this.ringInt)
      this.ringInt = null
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.sub = 'callend'
    this.t = 0
    this.endTimer = setTimeout(() => {
      if (!this.dead && this.sub === 'callend') this.ctx.exit()
    }, 1400)
    this.draw()
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
    if (this.sub === 'dial') {
      // Pivot 头部（当前白、另一个灰，Metro pivot 版式）
      s.text(24, HEADER_Y, str.phoneDial, { size: 44, font: F_LIGHT(44), color: this.tab === 'dial' ? C.WHITE : C.GRAY })
      s.text(150, HEADER_Y, str.phoneLog, { size: 44, font: F_LIGHT(44), color: this.tab === 'log' ? C.WHITE : C.GRAY })
      if (this.tab === 'log') {
        this.drawLog(s, str)
      } else {
        this.drawPad(s, str, accent)
      }
    } else if (this.sub === 'calling') {
      s.textCenter(W / 2, 220, this.num, { size: 44, font: F_LIGHT(44), color: C.WHITE })
      s.textCenter(W / 2, 290, str.phoneCalling + '.'.repeat(Math.floor(this.t * 2) % 4), { size: 24, font: F_REG(24), color: C.GRAY })
      this.drawEndBar(s, str)
    } else if (this.sub === 'call') {
      const sec = Math.floor(this.t)
      s.textCenter(W / 2, 220, this.num, { size: 44, font: F_LIGHT(44), color: C.WHITE })
      s.textCenter(W / 2, 290, `${str.phoneInCall} ${two(Math.floor(sec / 60))}:${two(sec % 60)}`, { size: 26, font: F_REG(26), color: accent })
      this.drawEndBar(s, str)
    } else {
      s.textCenter(W / 2, 340, str.phoneEnded, { size: 40, font: F_LIGHT(40), color: C.WHITE })
    }
    s.render()
  }

  private drawLog(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>) {
    if (!this.log.length) {
      s.text(24, 160, str.phoneLogEmpty, { size: 28, font: F_REG(28), color: C.GRAY })
      return
    }
    for (let r = 0; r < this.visibleRows; r++) {
      const i = this.top + r
      if (i >= this.log.length) break
      const e = this.log[i]!
      const y = 120 + r * LOG_ROW_H
      const label = e.missed ? str.logMissed : e.dir === 'in' ? str.logIncoming : str.logOutgoing
      const main = e.name || e.tel
      s.text(24, y, clipToWidth(s, main, W - 200, 32, F_LIGHT(32)), { size: 32, font: F_LIGHT(32), color: e.missed ? C.RED : C.WHITE })
      const t = new Date(e.ts)
      const two = (x: number) => String(x).padStart(2, '0')
      const dur = e.missed ? '' : ` · ${e.dur}″`
      s.text(24, y + 44, `${label} ${two(t.getMonth() + 1)}/${two(t.getDate())} ${two(t.getHours())}:${two(t.getMinutes())}${dur}`, { size: 20, font: F_REG(20), color: C.GRAY })
      // 方向箭头（右缘灰）
      s.fillRect(W - 46, y + 18, 18, 3, C.GRAY)
      if (e.dir === 'out') {
        s.fillRect(W - 46, y + 12, 3, 15, C.GRAY)
      } else {
        s.fillRect(W - 31, y + 12, 3, 15, C.GRAY)
      }
    }
  }

  private drawPad(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>, accent: number) {
    // 号码行 + 删除键
    const shown = this.num || (Math.floor(Date.now() / 500) % 2 === 0 ? '|' : '')
    s.text(24, 200, clipToWidth(s, shown, W - 160, 56, F_LIGHT(56)), { size: 56, font: F_LIGHT(56), color: C.WHITE })
    if (this.num) {
      // ⌫
      s.fillRect(W - 104, 216, 52, 10, C.WHITE)
      s.fillRect(W - 104, 206, 10, 30, C.WHITE)
      for (let i = 0; i < 8; i++) s.fillRect(W - 96 + i, 214 + i * 3, 2, 8, C.WHITE)
      s.fillRect(W - 88, 220, 24, 6, C.GRAY)
    }
    // 九宫格（Metro 无边框按键：数字白字 + 字母灰字）
    KEYS.forEach((k, i) => {
      const kx = 14 + (i % 3) * (KEY_W + GAP)
      const ky = PAD_TOP + Math.floor(i / 3) * (KEY_H + GAP)
      s.textCenter(kx + KEY_W / 2, ky + (k.sub ? 10 : 22), k.d, { size: 38, font: F_LIGHT(38), color: C.WHITE })
      if (k.sub) s.textCenter(kx + KEY_W / 2, ky + 54, k.sub, { size: 15, font: F_REG(15), color: C.GRAY })
    })
    // 呼叫键：强调色胶囊
    roundRect(s, W / 2 - 140, H - 92, 280, 64, 6, accent, null)
    s.textCenter(W / 2, H - 68, str.phoneCall, { size: 30, font: F_SEMI(30), color: C.WHITE })
  }

  private drawEndBar(s: import('../../../hal/screen').Screen, str: ReturnType<typeof wpStrings>) {
    roundRect(s, W / 2 - 140, H - 130, 280, 70, 6, C.RED, null)
    s.textCenter(W / 2, H - 105, str.phoneEndCall, { size: 30, font: F_SEMI(30), color: C.WHITE })
  }
}

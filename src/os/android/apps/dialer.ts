import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { CallEntry } from '../../../scenario/data'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile } from '../ui'
import { InCallControls } from '../incall'

type Sub = 'dial' | 'calling' | 'call' | 'callend'
type Tab = 'dial' | 'log'

const TAB_H = 30
const LOG_ROW_H = 44
/** 触屏拨号盘：3×4，贴 tab 条下方，呼叫钮位置不变（H-90） */
const PAD_Y0 = STATUS_H + TAB_H + 58
const PAD_KEY_W = 93
const PAD_KEY_H = 46
const PAD_GAP = 8
const PAD_X0 = 12
/** 数字 + 字母副标（真机 1.0 布局；0 带 + 表示长按加号） */
const PAD_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
]

/** 名片夹等应用请求拨号时预填的号码（一次性） */
let pendingNumber: string | null = null
export function setPendingDial(number: string) {
  pendingNumber = number
}

/**
 * Android 1.0 拨号：QWERTY 数字行输入号码，绿色呼叫键拨出。
 * 呼叫中回铃音 → 接通计时 → 红色挂断键结束。
 */
export const dialerApp: MiniApp = {
  id: 'dialer',
  name: '电话',
  nameEn: 'Dialer',
  icon(s, x, y) {
    iconTile(s, x, y, C.GREEN, C.LGREEN)
    // 白色听筒
    roundRect(s, x + 6, y + 10, 8, 12, 3, C.WHITE, null)
    roundRect(s, x + 14, y + 10, 8, 12, 3, C.WHITE, null)
    roundRect(s, x + 8, y + 8, 12, 4, 2, C.WHITE, null)
    roundRect(s, x + 8, y + 20, 12, 4, 2, C.WHITE, null)
  },
  start(ctx: AppContext) {
    const ui = new DialerUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class DialerUI {
  private num = pendingNumber ?? ''
  private sub: Sub = 'dial'
  private tab: Tab = 'dial'
  private t = 0
  private log: CallEntry[] = []
  private sel = 0
  private top = 0
  private offs: Array<() => void> = []
  private ringInt: ReturnType<typeof setInterval> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private endTimer: ReturnType<typeof setTimeout> | null = null
  private ic!: InCallControls
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    if (this.ringInt) clearInterval(this.ringInt)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    if (this.endTimer) clearTimeout(this.endTimer)
    this.ic?.dispose()
    this.offs.forEach((off) => off())
  }

  async init() {
    pendingNumber = null
    this.ic = new InCallControls(this.ctx.audio)
    this.ctx.onKey((k, repeat) => this.onKey(k, repeat))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.offs.push(this.ctx.onFrame((dt) => {
      this.t += dt
      if (this.sub === 'dial' || this.sub === 'call') this.draw()
    }))
    this.draw()
  }

  private onKey(k: DeviceKey, repeat: boolean) {
    switch (this.sub) {
      case 'dial':
        if (/^[0-9*#]$/.test(k)) {
          if (this.tab === 'log') {
            this.tab = 'dial'
            this.num = ''
          }
          if (this.num.length < 12) {
            this.num += k
            this.ctx.audio.dtmf(k)
          }
        } else if (k === 'left' || k === 'right') {
          this.switchTab(this.tab === 'dial' ? 'log' : 'dial')
          return
        } else if (k === 'clear' || k === 'back') {
          if (this.tab === 'log') {
            this.switchTab('dial')
            return
          }
          this.num = this.num.slice(0, -1)
          if (k === 'back' && !this.num) {
            this.ctx.exit()
            return
          }
        } else if (k === 'call') {
          if (this.tab === 'log') {
            this.redial()
            return
          }
          this.startCall()
          return
        } else if (k === 'ok') {
          if (this.tab === 'log') {
            this.redial()
            return
          }
          if (this.num.length) this.startCall()
          return
        } else if (this.tab === 'log') {
          if (k === 'up') this.moveSel(-1)
          else if (k === 'down') this.moveSel(1)
        } else return
        this.draw()
        return
      case 'calling':
        // 覆盖层（键盘/菜单）打开时 BACK 先用于关闭覆盖层，不能直接挂断；
        // END 是硬件挂断键，任何状态下都生效
        if (this.ic.open) {
          if (k === 'end') this.hangUp('callend')
          else if (this.ic.key(k, repeat)) this.draw()
          return
        }
        if (k === 'end' || k === 'back') this.hangUp('callend')
        else if (this.ic.key(k, repeat)) this.draw()
        return
      case 'call':
        if (this.ic.open) {
          if (k === 'end') this.hangUp('callend')
          else if (this.ic.key(k, repeat)) this.draw()
          return
        }
        if (k === 'end' || k === 'back') this.hangUp('callend')
        else if (this.ic.key(k, repeat)) this.draw()
        return
      case 'callend':
        if (k === 'ok' || k === 'back' || k === 'end') this.ctx.exit()
        return
    }
  }

  /** 触屏：tab 切换 / 记录列表点选 / 绿色呼叫 / 红色挂断 / 通话结束确认 */
  private onTap(x: number, y: number) {
    if (this.sub === 'callend') {
      this.ctx.exit()
      return
    }
    if (this.sub !== 'dial') {
      if (this.ic.tap(x, y)) return
      if (Math.abs(x - (W >> 1)) > 60) return
      if (y > H - 90 && y < H - 46) this.hangUp('callend')
      return
    }
    // 顶部 tab 条
    if (y > STATUS_H && y < STATUS_H + TAB_H) {
      this.switchTab(x < W / 2 ? 'dial' : 'log')
      return
    }
    if (this.tab === 'log') {
      if (y >= STATUS_H + TAB_H) {
        const r = Math.floor((y - STATUS_H - TAB_H) / LOG_ROW_H)
        const i = this.top + r
        if (i < this.log.length) {
          this.sel = i
          this.redial()
        }
      }
      return
    }
    // 触屏拨号盘：3×4 键
    if (y >= PAD_Y0 - 6 && y < PAD_Y0 + 4 * (PAD_KEY_H + PAD_GAP)) {
      const col = Math.floor((x - PAD_X0) / (PAD_KEY_W + PAD_GAP))
      const row = Math.floor((y - PAD_Y0) / (PAD_KEY_H + PAD_GAP))
      if (col >= 0 && col < 3 && row >= 0 && row < 4) {
        const k = PAD_KEYS[row * 3 + col]
        if (k && this.num.length < 12) {
          this.num += k[0]
          this.ctx.audio.dtmf(k[0])
          this.draw()
        }
      }
      return
    }
    if (Math.abs(x - (W >> 1)) > 60) return
    if (y > H - 90 && y < H - 46 && this.num.length) this.startCall()
  }

  private async switchTab(tab: Tab) {
    this.tab = tab
    if (tab === 'log') await this.reloadLog()
    else this.sel = 0
    this.draw()
  }

  private async reloadLog() {
    this.log = [...((await this.ctx.host.getCallLog?.()) ?? [])].reverse()
    this.sel = Math.min(this.sel, Math.max(0, this.log.length - 1))
    this.fixTop()
  }

  private moveSel(d: number) {
    const n = this.log.length
    if (!n) return
    this.sel = (this.sel + d + n) % n
    this.fixTop()
    this.draw()
  }

  private fixTop() {
    const vis = Math.floor((H - STATUS_H - TAB_H) / LOG_ROW_H)
    const n = this.log.length
    if (n <= vis) this.top = 0
    else this.top = Math.max(0, Math.min(this.sel - 2, n - vis))
  }

  /** 重拨：回拨号 tab 并预填号码 */
  private redial() {
    const e = this.log[this.sel]
    if (!e) return
    this.num = e.tel
    this.tab = 'dial'
    this.startCall()
  }

  private startCall() {
    this.sub = 'calling'
    this.t = 0
    this.ic.reset()
    // 回铃音：440+480Hz 正弦
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

  private hangUp(next: Sub) {
    // 已接通的去电挂断后写入设备级通话记录
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
    this.sub = next
    this.t = 0
    this.ic.reset()
    if (next === 'callend') {
      // 真机 1.0 挂断只短暂停留「通话结束」过渡（约 0.7s），无需用户确认
      this.endTimer = setTimeout(() => {
        if (!this.dead && this.sub === 'callend') this.ctx.exit()
      }, 700)
    }
    this.draw()
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
    const cy = STATUS_H + ((H - STATUS_H) >> 1)
    if (this.sub === 'dial') {
      // 顶部 tab 条：拨号 / 通话记录（仿真机 Dialer 的 tab）
      s.fillRect(0, STATUS_H, W, TAB_H, C.PALE)
      s.fillRect(this.tab === 'dial' ? 0 : W / 2, STATUS_H + TAB_H - 3, W / 2, 3, C.GREEN)
      s.textCenter(W / 4, STATUS_H + 20, str.tabDial, {
        size: 13,
        color: this.tab === 'dial' ? C.INK : C.GRAY,
      })
      s.textCenter((W * 3) / 4, STATUS_H + 20, str.tabCallLog, {
        size: 13,
        color: this.tab === 'log' ? C.INK : C.GRAY,
      })
    }
    if (this.sub === 'dial' && this.tab === 'log') {
      // 通话记录列表：方向图标 + 姓名/号码 + 时间与时长
      if (!this.log.length) {
        s.textCenter(W >> 1, cy, str.callLogEmpty, { size: 13, color: C.GRAY })
      } else {
        const vis = Math.floor((H - STATUS_H - TAB_H) / LOG_ROW_H)
        for (let r = 0; r < vis; r++) {
          const i = this.top + r
          if (i >= this.log.length) break
          const e = this.log[i]!
          const y = STATUS_H + TAB_H + r * LOG_ROW_H
          const sel = i === this.sel
          if (sel) s.fillRect(0, y, W, LOG_ROW_H, C.PALE)
          const label = e.missed ? str.callLogMissed : e.dir === 'in' ? str.callLogIncoming : str.callLogOutgoing
          const icon = e.missed ? '✕' : e.dir === 'in' ? '◀' : '▶'
          s.text(10, y + 14, icon, { size: 15, color: e.missed ? C.RED : e.dir === 'in' ? C.GREEN : C.INK })
          s.text(34, y + 8, e.name || e.tel, { size: 13, color: C.INK })
          const t = new Date(e.ts)
          const hh = String(t.getHours()).padStart(2, '0')
          const mm = String(t.getMinutes()).padStart(2, '0')
          const dur = e.missed ? '' : ` ${e.dur}″`
          s.text(34, y + 26, `${label} · ${hh}:${mm}${dur}`, { size: 10, color: C.GRAY })
        }
        s.textRight(W - 8, H - 8, `${this.sel + 1}/${this.log.length}`, { size: 10, color: C.GRAY })
      }
    } else if (this.sub === 'dial') {
      // 顶部号码显示 + 触屏拨号盘 + 底部绿色呼叫键（真机 1.0 布局）
      const shown = this.num || (Math.floor(Date.now() / 500) % 2 === 0 ? '|' : '')
      s.textCenter(W >> 1, STATUS_H + TAB_H + 14, shown, { size: 26, color: C.INK })
      if (this.num) {
        s.textCenter(W >> 1, STATUS_H + TAB_H + 40, str.dialerClear, { size: 9, color: C.GRAY })
      } else {
        s.textCenter(W >> 1, STATUS_H + TAB_H + 40, str.dialerHint, { size: 9, color: C.GRAY })
      }
      // 3×4 拨号盘
      for (let i = 0; i < PAD_KEYS.length; i++) {
        const col = i % 3
        const row = Math.floor(i / 3)
        const kx = PAD_X0 + col * (PAD_KEY_W + PAD_GAP)
        const ky = PAD_Y0 + row * (PAD_KEY_H + PAD_GAP)
        roundRect(s, kx, ky, PAD_KEY_W, PAD_KEY_H, 8, C.PALE, C.GRAY)
        const [d, sub] = PAD_KEYS[i]!
        s.textCenter(kx + (PAD_KEY_W >> 1), ky + 12, d, { size: 18, color: C.INK })
        if (sub) s.textCenter(kx + (PAD_KEY_W >> 1), ky + 32, sub, { size: 8, color: C.GRAY })
      }
      // 呼叫按钮（绿色圆角胶囊，位置不变以兼容 e2e）
      roundRect(s, (W >> 1) - 60, H - 90, 120, 44, 10, C.DGREEN, null)
      s.textCenter(W >> 1, H - 76, str.dialerCall, { size: 15, color: C.WHITE })
    } else if (this.sub === 'calling') {
      // 头像（灰底人形剪影）+ 号码 + 动画点
      this.drawAvatar(s, cy - 90)
      s.textCenter(W >> 1, cy - 10, this.num, { size: 18, color: C.INK })
      s.textCenter(W >> 1, cy + 16, str.calling + '.'.repeat(Math.floor(this.t * 2) % 4), { size: 12, color: C.GRAY })
      this.ic.drawStateChips(s, str, W >> 1, cy + 42)
      // 红色挂断
      roundRect(s, (W >> 1) - 60, H - 90, 120, 44, 10, C.RED, null)
      s.textCenter(W >> 1, H - 76, str.endCall, { size: 13, color: C.WHITE })
      this.ic.draw(s, str)
    } else if (this.sub === 'call') {
      this.drawAvatar(s, cy - 90)
      const sec = Math.floor(this.t)
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      s.textCenter(W >> 1, cy - 10, this.num, { size: 18, color: C.INK })
      s.textCenter(W >> 1, cy + 16, `${str.inCall} ${mm}:${ss}`, { size: 12, color: C.GREEN })
      this.ic.drawStateChips(s, str, W >> 1, cy + 42)
      roundRect(s, (W >> 1) - 60, H - 90, 120, 44, 10, C.RED, null)
      s.textCenter(W >> 1, H - 76, str.endCall, { size: 13, color: C.WHITE })
      this.ic.draw(s, str)
    } else {
      s.textCenter(W >> 1, cy - 10, str.callEnded, { size: 16, color: C.INK })
    }
    s.render()
  }

  /** 联系人头像：浅灰底 + 灰色人形剪影（头 + 肩） */
  private drawAvatar(s: import('../../../hal/screen').Screen, y: number) {
    const cx = W >> 1
    roundRect(s, cx - 32, y, 64, 64, 10, C.PALE, null)
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++)
        if (dx * dx + dy * dy <= 81) s.pset(cx + dx, y + 20 + dy, C.GRAY)
    roundRect(s, cx - 18, y + 34, 36, 22, 8, C.GRAY, null)
  }
}

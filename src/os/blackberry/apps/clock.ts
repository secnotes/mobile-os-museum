import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, disc } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Clock：模拟钟 / 闹钟设置 / 秒表。
 */

type Mode = 'clock' | 'alarm' | 'stop'

export class ClockApp extends BBApp {
  private mode: Mode = 'clock'
  private tSec = 0
  private alarm = { on: false, h: 7, m: 30 }
  private alarmField = 0
  // 秒表
  private swRun = false
  private swAccum = 0
  private swAt = 0

  protected async onStart() {
    this.alarm = await this.host.getAlarm()
    this.ctx.onFrame((dt) => {
      this.tSec += dt
      if (this.mode !== 'alarm') this.draw()
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    const en = this.ctx.lang.get() === 'en'
    const tabs: Array<[Mode, string]> = [
      ['clock', en ? 'Clock' : '时钟'],
      ['alarm', this.str.alarm],
      ['stop', this.str.stopwatch],
    ]
    tabs.forEach(([id, label], i) => {
      const x = 150 + i * 70
      if (id === this.mode) s.fillRect(x, 31, 60, 3, C.WHITE)
      s.text(x, 9, label, {
        size: 14, color: id === this.mode ? C.WHITE : C.G3,
      })
    })

    if (this.mode === 'clock') this.drawClock()
    else if (this.mode === 'alarm') this.drawAlarm()
    else this.drawStop()
    s.render()
  }

  private drawClock() {
    const s = this.ctx.screen
    const now = new Date()
    const cx = 240, cy = 175, r = 105
    disc(s, cx, cy, r + 2, C.INK)
    disc(s, cx, cy, r, C.WHITE)
    // 刻度
    for (let a = 0; a < 60; a++) {
      const ang = a / 60 * Math.PI * 2 - Math.PI / 2
      const isHour = a % 5 === 0
      const r1 = isHour ? r - 12 : r - 6
      const x1 = cx + Math.round(Math.cos(ang) * r1)
      const y1 = cy + Math.round(Math.sin(ang) * r1)
      s.pset(x1, y1, isHour ? C.INK : C.G4)
      if (isHour) { s.pset(x1 + 1, y1, C.INK); s.pset(x1, y1 + 1, C.INK) }
    }
    // 指针
    const hand = (frac: number, len: number, thick: number, col: number) => {
      const ang = frac * Math.PI * 2 - Math.PI / 2
      for (let t = 0; t < len; t++) {
        const x = cx + Math.round(Math.cos(ang) * t)
        const y = cy + Math.round(Math.sin(ang) * t)
        s.fillRect(x - thick, y - thick, thick * 2 + 1, thick * 2 + 1, col)
      }
    }
    const sec = now.getSeconds() + now.getMilliseconds() / 1000
    hand((now.getHours() % 12 + now.getMinutes() / 60) / 12, 60, 3, C.INK)
    hand((now.getMinutes() + sec / 60) / 60, 85, 2, C.INK)
    hand(sec / 60, 92, 1, C.RED)
    disc(s, cx, cy, 4, C.SELECT)
  }

  private drawAlarm() {
    const s = this.ctx.screen
    s.textCenter(240, 70,
      this.alarm.on ? this.str.on : this.str.off,
      { size: 20, color: this.alarm.on ? C.GREEN_D : C.G6 })
    const txt =
      `${String(this.alarm.h).padStart(2, '0')}:${String(this.alarm.m).padStart(2, '0')}`
    s.textCenter(240, 120, txt, { size: 64, color: C.INK })
    // 选中字段下划线
    const w = s.measure(txt.slice(0, 2), { size: 64 })
    const totalW = s.measure(txt, { size: 64 })
    const ux = this.alarmField === 0 ? 240 - totalW / 2 : 240 - totalW / 2 + w + 14
    s.fillRect(ux, 196, w, 3, C.SELECT)
    s.textCenter(240, 230,
      this.ctx.lang.get() === 'en' ? 'Up/Down: set · OK: toggle' : '上下调整 · 确定开关 · 左右切字段',
      { size: 14, color: C.G6 })
  }

  private drawStop() {
    const s = this.ctx.screen
    const val = this.swRun ? this.swAccum + (this.tSec - this.swAt) : this.swAccum
    const m = Math.floor(val / 60)
    const sec = Math.floor(val % 60)
    const cs = Math.floor((val % 1) * 100)
    const txt = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
    s.textCenter(240, 130, txt, { size: 52, color: C.INK })
    rr(s, 150, 220, 180, 40, 8, this.swRun ? C.FIELD_BG : C.G2)
    s.textCenter(240, 230,
      (this.ctx.lang.get() === 'en' ? 'OK: ' : '确定：') + (this.swRun ? 'Stop' : 'Start'),
      { size: 17, color: C.SELECT })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (k === 'left') this.mode = shift(this.mode, -1)
    else if (k === 'right') this.mode = shift(this.mode, 1)
    else if (this.mode === 'alarm') this.alarmKey(k)
    else if (this.mode === 'stop') this.stopKey(k)
    else return
    this.draw()
  }

  private alarmKey(k: DeviceKey) {
    if (k === 'up' || k === 'down') {
      const d = k === 'up' ? 1 : -1
      if (this.alarmField === 0) {
        this.alarm.h = (this.alarm.h + d + 24) % 24
      } else {
        this.alarm.m = (this.alarm.m + d + 60) % 60
      }
      void this.host.saveAlarm(this.alarm)
    } else if (k === 'ok') {
      this.alarm.on = !this.alarm.on
      void this.host.saveAlarm(this.alarm)
    } else if (k === 'call') {
      this.alarmField = (this.alarmField + 1) % 2
    }
  }

  private stopKey(k: DeviceKey) {
    if (k === 'ok') {
      if (this.swRun) {
        this.swAccum += this.tSec - this.swAt
        this.swRun = false
      } else {
        this.swAt = this.tSec
        this.swRun = true
      }
    } else if (k === 'clear') {
      this.swRun = false
      this.swAccum = 0
    }
  }

  /** 返回键：闹钟页切字段、秒表页归零（沿用真机 Back 语义）；时钟页退出应用 */
  protected onBack(): boolean {
    if (this.mode === 'alarm') {
      this.alarmField = (this.alarmField + 1) % 2
    } else if (this.mode === 'stop') {
      this.swRun = false
      this.swAccum = 0
    } else {
      return false
    }
    this.draw()
    return true
  }

  protected menuItems(): MenuCommand[] {
    return []
  }
}

const MODES: Mode[] = ['clock', 'alarm', 'stop']
function shift(m: Mode, d: number): Mode {
  return MODES[(MODES.indexOf(m) + d + 3) % 3]!
}

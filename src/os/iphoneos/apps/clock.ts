import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, disc } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconClock } from '../icons'
import { drawNavBar } from '../navbar'
import { drawTabBar, tabHit, type TabItem } from '../tabbar'
import { drawSwitch } from '../widgets'

interface WorldCity {
  name: string
  off: number // 相对 UTC
}

type Tab = 0 | 1 | 2 | 3

/**
 * Clock：世界时钟/闹钟/秒表/计时器四标签。
 */
class ClockApp extends IphoneApp {
  private tab: Tab = 0

  // 世界时钟
  private worlds: WorldCity[] = [
    { name: 'Cupertino', off: -7 },
    { name: 'New York', off: -4 },
    { name: 'London', off: 1 },
    { name: 'Beijing', off: 8 },
  ]

  // 闹钟（持久化到 'alarm'，OS 到点触发响铃弹窗）
  private alarmOn = false
  private ah = 7
  private am = 0

  start() {
    super.start()
    void this.ctx.store.get<{ on: boolean; h: number; m: number }>('alarm').then((v) => {
      if (v) {
        this.alarmOn = !!v.on
        if (typeof v.h === 'number') this.ah = v.h
        if (typeof v.m === 'number') this.am = v.m
        this.draw()
      }
    })
  }

  private saveAlarm() {
    this.ctx.store.set('alarm', { on: this.alarmOn, h: this.ah, m: this.am })
  }

  // 秒表
  private swT = 0
  private swRun = false
  private laps: number[] = []

  // 计时器
  private tSet = 5 * 60
  private tLeft = 5 * 60
  private tRun = false

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.BLACK)
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    drawNavBar(s, { title: [this.str.worldClock, this.str.alarms, this.str.stopwatch, this.str.timer][this.tab] })
    s.fillRect(0, 64, 320, 367, C.BLACK)
    if (this.tab === 0) this.drawWorld(s)
    if (this.tab === 1) this.drawAlarm(s)
    if (this.tab === 2) this.drawStopwatch(s)
    if (this.tab === 3) this.drawTimer(s)
    drawTabBar(s, this.tabItems(), this.tab)
  }

  // ---------- 世界时钟 ----------

  private drawWorld(s: Screen) {
    const now = this.bridge.now()
    const utc = now.getTime() / 1000 + now.getTimezoneOffset() * 60
    this.worlds.forEach((c, i) => {
      const y = 74 + i * 60
      const local = new Date((utc + c.off * 3600) * 1000)
      if (i % 2) s.fillRect(0, y, 320, 60, C.CAM_GRAY)
      this.miniClock(s, 44, y + 30, 22, local)
      s.text(84, y + 14, c.name, { size: 19, font: F_BOLD(19), color: C.WHITE })
      s.text(84, y + 38, clockString(local), { size: 15, font: F_REG(15), color: C.GRAY4 })
      s.textRight(300, y + 14, c.off >= 0 ? `UTC+${c.off}` : `UTC${c.off}`, { size: 13, font: F_REG(13), color: C.GRAY4 })
    })
  }

  private miniClock(s: Screen, cx: number, cy: number, r: number, d: Date) {
    disc(s, cx, cy, r, C.BLACK)
    disc(s, cx, cy, r - 2, C.WHITE)
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2
      const x1 = cx + Math.round((r - 5) * Math.sin(a)), y1 = cy - Math.round((r - 5) * Math.cos(a))
      s.pset(x1, y1, C.BLACK)
    }
    const ms = d.getMinutes() + d.getSeconds() / 60
    this.hand(s, cx, cy, r - 9, (d.getHours() % 12 + ms / 60) / 12)
    this.hand(s, cx, cy, r - 5, ms / 60)
    s.pset(cx, cy, C.RED)
  }

  private hand(s: Screen, cx: number, cy: number, len: number, frac: number) {
    const a = frac * Math.PI * 2
    s.line(cx, cy, cx + Math.round(len * Math.sin(a)), cy - Math.round(len * Math.cos(a)), C.BLACK)
  }

  // ---------- 闹钟 ----------

  private drawAlarm(s: Screen) {
    rr(s, 8, 84, 304, 64, 10, C.CAM_GRAY)
    s.text(20, 102, this.str.alarms, { size: 20, font: F_BOLD(20), color: C.WHITE })
    s.text(20, 126, `${this.fmt12(this.ah, this.am)}`, { size: 16, font: F_REG(16), color: C.GRAY4 })
    drawSwitch(s, 252, 102, this.alarmOn)
    // 时间调整按钮
    rr(s, 40, 200, 100, 60, 10, C.GRAY3)
    rr(s, 180, 200, 100, 60, 10, C.GRAY3)
    s.textCenter(90, 218, this.str.hour, { size: 13, font: F_BOLD(13), color: C.GRAY4 })
    s.textCenter(230, 218, this.str.minute, { size: 13, font: F_BOLD(13), color: C.GRAY4 })
    s.text(56, 242, '−', { size: 28, font: F_BOLD(28), color: C.INK })
    s.text(116, 242, '+', { size: 28, font: F_BOLD(28), color: C.INK })
    s.text(196, 242, '−', { size: 28, font: F_BOLD(28), color: C.INK })
    s.text(256, 242, '+', { size: 28, font: F_BOLD(28), color: C.INK })
  }

  private fmt12(h: number, m: number): string {
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 || 12
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`
  }

  // ---------- 秒表 ----------

  private drawStopwatch(s: Screen) {
    s.textCenter(160, 170, this.fmtSw(this.swT), { size: 64, font: F_REG(64), color: this.swT ? C.WHITE : C.GRAY4 })
    // 按钮：左 Lap/Reset，右 Start/Stop
    disc(s, 80, 280, 34, C.GRAY3)
    disc(s, 240, 280, 34, this.swRun ? C.RED_D : C.GREEN_D)
    s.textCenter(80, 273, this.swRun ? this.str.lap : this.str.reset, { size: 16, font: F_REG(16), color: C.WHITE })
    s.textCenter(240, 273, this.swRun ? this.str.stop : this.str.start, { size: 15, font: F_REG(15), color: C.WHITE })
    // 计次
    this.laps.forEach((l, i) => {
      const y = 350 + i * 30
      s.text(40, y, `Lap ${this.laps.length - i}`, { size: 15, font: F_REG(15), color: C.GRAY4 })
      s.textRight(280, y, this.fmtSw(l), { size: 15, font: F_REG(15), color: C.WHITE })
    })
  }

  private fmtSw(t: number): string {
    const m = Math.floor(t / 60)
    const sec = Math.floor(t % 60)
    const cs = Math.floor((t % 1) * 100)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  // ---------- 计时器 ----------

  private drawTimer(s: Screen) {
    if (!this.tRun && this.tLeft === this.tSet) {
      // 预设按钮
      ;[1, 5, 10, 30].forEach((mm, i) => {
        const x = 20 + (i % 2) * 150, y = 140 + Math.floor(i / 2) * 90
        rr(s, x, y, 140, 70, 12, C.GRAY3)
        s.textCenter(x + 70, y + 24, mm + ' min', { size: 22, font: F_BOLD(22), color: C.WHITE })
      })
    } else {
      s.textCenter(160, 200, this.fmtT(this.tLeft), { size: 72, font: F_REG(72), color: this.tLeft < 60 ? C.RED : C.WHITE })
      disc(s, 160, 320, 34, this.tRun ? C.RED_D : C.GREEN_D)
      s.textCenter(160, 313, this.tRun ? this.str.stop : this.str.start, { size: 15, font: F_REG(15), color: C.WHITE })
    }
  }

  private fmtT(t: number): string {
    const m = Math.floor(t / 60)
    const sec = Math.floor(t % 60)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ---------- 输入 ----------

  protected tap(x: number, y: number) {
    const ti = tabHit(x, y, 4)
    if (ti !== null) { this.tab = ti as Tab; this.draw(); return }
    if (this.tab === 1) {
      if (y >= 84 && y < 148 && x > 240) { this.alarmOn = !this.alarmOn; this.saveAlarm(); this.draw(); return }
      if (y >= 200 && y < 260) {
        if (x < 100) this.ah = (this.ah + 23) % 24
        else if (x < 150) this.ah = (this.ah + 1) % 24
        else if (x < 210) this.am = (this.am + 59) % 60
        else this.am = (this.am + 1) % 60
        this.saveAlarm()
        this.draw()
      }
      return
    }
    if (this.tab === 2) {
      if (Math.abs(x - 240) < 40 && Math.abs(y - 280) < 40) {
        this.swRun = !this.swRun
        this.draw()
        return
      }
      if (Math.abs(x - 80) < 40 && Math.abs(y - 280) < 40) {
        if (this.swRun) {
          this.laps.unshift(this.swT)
          if (this.laps.length > 3) this.laps.pop()
        } else {
          this.swT = 0; this.laps = []
        }
        this.draw()
      }
      return
    }
    if (this.tab === 3) {
      if (!this.tRun && this.tLeft === this.tSet) {
        const i = [1, 5, 10, 30].findIndex((_, k) => {
          const bx = 20 + (k % 2) * 150, by = 140 + Math.floor(k / 2) * 90
          return x >= bx && x < bx + 140 && y >= by && y < by + 70
        })
        if (i >= 0) {
          this.tSet = ([1, 5, 10, 30][i] as number) * 60
          this.tLeft = this.tSet
          this.tRun = true
          this.draw()
        }
        return
      }
      if (Math.abs(x - 160) < 40 && Math.abs(y - 320) < 40) {
        this.tRun = !this.tRun
        if (!this.tRun && this.tLeft === 0) { this.tLeft = this.tSet }
        this.draw()
      }
    }
  }

  protected frame(dt: number) {
    super.frame(dt)
    if (this.swRun) {
      this.swT += dt
      if (Math.floor(this.blink * 20) !== Math.floor((this.blink - dt) * 20)) this.draw()
    }
    if (this.tRun) {
      this.tLeft -= dt
      if (this.tLeft <= 0) {
        this.tLeft = 0
        this.tRun = false
        this.ctx.audio.tone(880, 0.4, { type: 'sine', gain: 0.12 })
      }
      if (Math.floor(this.blink * 4) !== Math.floor((this.blink - dt) * 4)) this.draw()
    }
  }

  private tabItems(): TabItem[] {
    return [
      { label: this.str.worldClock, icon: (s, x, y, v) => glyphClock(s, x, y, v, 0) },
      { label: this.str.alarms, icon: (s, x, y, v) => glyphClock(s, x, y, v, 1) },
      { label: this.str.stopwatch, icon: (s, x, y, v) => glyphClock(s, x, y, v, 2) },
      { label: this.str.timer, icon: (s, x, y, v) => glyphClock(s, x, y, v, 3) },
    ]
  }
}

/** 标签栏程序化时钟类 glyph（kind 0 世界/1 闹钟/2 秒表/3 计时器） */
function glyphClock(s: Screen, cx: number, cy: number, v: number, kind: number) {
  const r = kind === 0 ? 10 : 9
  if (kind === 2 || kind === 1) {
    // 秒表顶杆 / 闹钟铃
    s.fillRect(cx - 2, cy - r - 5, 4, 4, v)
    s.pset(cx - 6, cy - r - 1, v); s.pset(cx + 6, cy - r - 1, v)
  }
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy))
    s.pset(cx - w, cy + dy, v)
    s.pset(cx + w, cy + dy, v)
  }
  if (kind === 0) {
    // 地球：经线与赤道
    s.line(cx - 5, cy - r + 3, cx - 5, cy + r - 3, v)
    s.line(cx + 5, cy - r + 3, cx + 5, cy + r - 3, v)
    s.line(cx - r + 1, cy, cx + r - 1, cy, v)
  } else if (kind === 1) {
    s.line(cx, cy, cx - 5, cy - 5, v)
    s.line(cx, cy, cx + 6, cy - 2, v)
  } else {
    s.line(cx, cy, cx + 6, cy - 5, v)
    s.pset(cx, cy, v)
  }
}

export const clockFactory = miniApp('clock', 'Clock', iconClock, (ctx, b) => new ClockApp(ctx, b))

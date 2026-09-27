import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, onTrayChange } from '../ui'
import { ALARM_SOUNDS, playSound } from '../ringtones'

type AlarmItem = {
  id: number
  on: boolean
  h: number
  m: number
  /** 重复日（0=周一 …6=周日）；空 = 仅一次 */
  days: number[]
}

/**
 * Alarms（Mango 闹钟中心）：四页 Pivot ——
 * 多闹钟（编辑时间/重复日，同步最近一个到 OS 的 clock:alarm 响铃源）、
 * 世界时钟、秒表（分圈）、倒计时（到点响铃，需停留在应用内）。
 */
export const alarmApp: MiniApp = {
  id: 'clock',
  name: '闹钟',
  nameEn: 'Alarms',
  start(ctx: AppContext) {
    const ui = new AlarmUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const TOP = TRAY_H + 70
const two = (x: number) => String(x).padStart(2, '0')

class AlarmUI {
  private tab = 0
  private alarms: AlarmItem[] = []
  private edit: AlarmItem | null = null
  private selH = true // 编辑页选中小时/分钟

  // 秒表
  private swRun = false
  private swMs = 0
  private swLast = 0
  private laps: number[] = []

  // 倒计时
  private tSetMin = 5
  private tLeft = 0
  private tRun = false
  private tLast = 0
  private tRingStop: (() => void) | null = null

  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.tRingStop?.()
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    this.alarms = (await this.ctx.store.get<AlarmItem[]>('alarms')) ?? []
    // 兼容旧版单闹钟
    if (!this.alarms.length) {
      const old = await this.ctx.store.get<{ on?: boolean; h?: number; m?: number }>('alarm')
      if (old)
        this.alarms = [{ id: 1, on: !!old.on, h: old.h ?? 7, m: old.m ?? 30, days: [] }]
    }
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.edit || this.tRingStop) return
      if (dir === 'left') this.setTab(Math.min(3, this.tab + 1))
      else if (dir === 'right') this.setTab(Math.max(0, this.tab - 1))
    }))
    this.offs.push(this.ctx.onFrame(() => this.frame()))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private frame() {
    if (this.swRun) this.swMs += Date.now() - this.swLast
    if (this.tRun) {
      this.tLeft -= (Date.now() - this.tLast) / 1000
      if (this.tLeft <= 0) {
        this.tLeft = 0
        this.tRun = false
        this.tRingStop = playSound(this.ctx.audio, ALARM_SOUNDS[0]!, { loop: true })
      }
    }
    this.swLast = Date.now()
    this.tLast = Date.now()
    this.draw()
  }

  // ---------- 闹钟数据 ----------

  private saveAlarms() {
    void this.ctx.store.set('alarms', this.alarms)
    // 把「最近一个启用的闹钟」同步给 OS 响铃源（clock:alarm）
    const next = this.alarms
      .filter((a) => a.on)
      .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))[0]
    void this.ctx.store.set('alarm', next ? { on: true, h: next.h, m: next.m } : { on: false, h: 7, m: 30 })
  }

  private openEdit(a: AlarmItem) {
    this.edit = a
    this.selH = true
    this.draw()
  }

  private adjust(dh: number, dm: number) {
    if (!this.edit) return
    if (this.selH) this.edit.h = (this.edit.h + dh + 24) % 24
    else this.edit.m = (this.edit.m + dm + 60) % 60
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.tRingStop) {
      if (k === 'back' || k === 'ok') {
        this.tRingStop?.()
        this.tRingStop = null
        this.draw()
      }
      return
    }
    if (this.edit) {
      if (k === 'back') {
        this.edit = null
        this.draw()
        return
      }
      if (k === 'left') this.adjust(-1, 0)
      else if (k === 'right') this.adjust(1, 0)
      else if (k === 'up') this.adjust(0, 1)
      else if (k === 'down') this.adjust(0, -1)
      return
    }
    if (k === 'back') this.ctx.exit()
  }

  private setTab(t: number) {
    this.tab = t
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.tRingStop) return
    const str = wpStrings(this.ctx.lang.get())
    if (this.edit) {
      this.tapEdit(x, y, str)
      return
    }
    // Pivot 标题
    if (y >= TRAY_H && y < TRAY_H + 56) {
      const titles = [str.alarmAlarms, str.alarmWorld, str.alarmStopwatch, str.alarmTimer]
      let xx = 24
      for (let i = 0; i < titles.length; i++) {
        const w = this.ctx.screen.measure(titles[i]!, { size: i === this.tab ? 30 : 24 }) + 28
        if (x >= xx && x < xx + w) {
          this.setTab(i)
          return
        }
        xx += w
      }
    }
    if (this.tab === 0) this.tapAlarms(x, y)
    else if (this.tab === 2) this.tapStopwatch(x, y, str)
    else if (this.tab === 3) this.tapTimer(x, y, str)
  }

  // ---------- 闹钟列表 / 编辑 ----------

  private tapAlarms(x: number, y: number) {
    // 新建条
    if (y >= H - 100 && y < H - 30) {
      const a: AlarmItem = { id: Date.now(), on: true, h: 7, m: 30, days: [] }
      this.alarms.push(a)
      this.saveAlarms()
      this.openEdit(a)
      return
    }
    const r = Math.floor((y - TOP) / 96)
    if (r >= 0 && r < this.alarms.length) this.openEdit(this.alarms[r]!)
    void x
  }

  private tapEdit(x: number, y: number, str: ReturnType<typeof wpStrings>) {
    const a = this.edit!
    // 时间区（y 180–400）
    if (y >= 180 && y < 400) {
      this.selH = x < W / 2
      // ▲▼：上半部 −1，下半部 +1
      const delta = y < 290 ? -1 : 1
      if (this.selH) {
        a.h = (a.h + delta + 24) % 24
      } else {
        a.m = (a.m + delta + 60) % 60
      }
      this.saveAlarms()
      this.draw()
      return
    }
    // 开关行
    if (y >= 420 && y < 480) {
      a.on = !a.on
      this.saveAlarms()
      this.draw()
      return
    }
    // 重复日 chips
    if (y >= 500 && y < 580) {
      const cw = (W - 48) / 7
      const d = Math.floor((x - 24) / cw)
      if (d >= 0 && d < 7) {
        if (a.days.includes(d)) a.days = a.days.filter((x2) => x2 !== d)
        else a.days.push(d)
        this.saveAlarms()
        this.draw()
      }
      return
    }
    // 删除行
    if (y >= 600 && y < 660) {
      this.alarms = this.alarms.filter((x2) => x2.id !== a.id)
      this.edit = null
      this.saveAlarms()
      this.draw()
    }
    void str
  }

  // ---------- 秒表 ----------

  private fmtSw(ms: number): string {
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const cs = Math.floor((ms % 1000) / 10)
    return `${two(m)}:${two(s)}.${two(cs)}`
  }

  private tapStopwatch(x: number, y: number, str: ReturnType<typeof wpStrings>) {
    // 底部两按钮：左 lap/reset，右 start/stop
    if (y >= H - 110 && y < H - 30) {
      if (x < W / 2) {
        if (this.swRun) this.laps.unshift(this.swMs)
        else {
          this.swMs = 0
          this.laps = []
        }
      } else {
        this.swRun = !this.swRun
        this.swLast = Date.now()
      }
      this.draw()
    }
    void str
  }

  // ---------- 倒计时 ----------

  private tapTimer(x: number, y: number, str: ReturnType<typeof wpStrings>) {
    if (!this.tRun && this.tLeft === 0) {
      // 设置区：± 与快捷分钟
      if (y >= 200 && y < 320) {
        if (x < W / 2) this.tSetMin = Math.max(1, this.tSetMin - 1)
        else this.tSetMin = Math.min(99, this.tSetMin + 1)
        this.draw()
        return
      }
      if (y >= 360 && y < 430) {
        const chips = [1, 5, 10, 30]
        const cw = (W - 48) / 4
        const c = Math.floor((x - 24) / cw)
        if (c >= 0 && c < 4) this.tSetMin = chips[c]!
        this.draw()
        return
      }
      // 开始条
      if (y >= H - 110 && y < H - 30) {
        this.tLeft = this.tSetMin * 60
        this.tRun = true
        this.tLast = Date.now()
        this.draw()
      }
      return
    }
    // 运行中：停止条
    if (y >= H - 110 && y < H - 30) {
      this.tRun = false
      this.tLeft = 0
      this.draw()
    }
    void str
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const d = new Date()
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    if (this.edit) this.drawEdit(str)
    else {
      const titles = [str.alarmAlarms, str.alarmWorld, str.alarmStopwatch, str.alarmTimer]
      let xx = 24
      titles.forEach((t, i) => {
        const active = i === this.tab
        s.text(xx, TRAY_H + 12, t, {
          size: active ? 30 : 24, font: F_LIGHT(active ? 30 : 24),
          color: active ? C.WHITE : C.GRAY,
        })
        xx += s.measure(t, { size: active ? 30 : 24 }) + 28
      })
      if (this.tab === 0) this.drawAlarms(str)
      else if (this.tab === 1) this.drawWorld(str, d)
      else if (this.tab === 2) this.drawStopwatch(str)
      else this.drawTimer(str)
    }
    if (this.tRingStop) this.drawTimerRing(str)
    s.render()
  }

  private drawAlarms(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    if (!this.alarms.length)
      s.text(24, TOP + 30, str.alarmEmpty, { size: 24, font: F_REG(24), color: C.GRAY })
    this.alarms.forEach((a, i) => {
      const y = TOP + i * 96
      const t = `${two(a.h)}:${two(a.m)}`
      s.text(24, y, t, { size: 44, font: F_LIGHT(44), color: a.on ? C.WHITE : C.GRAY })
      const rep = a.days.length
        ? a.days.map((d) => str.alarmWeekdays[d]).join(' ')
        : (a.on ? str.alarmOn : str.alarmOff)
      s.text(24, y + 52, rep, { size: 20, font: F_REG(20), color: C.GRAY })
      s.fillRect(24, y + 82, W - 48, 1, C.DIM)
    })
    // 新建条
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(24, H - 100, W - 48, 70, accent)
    s.textCenter(W / 2, H - 75, '+', { size: 40, font: F_SEMI(40), color: C.WHITE })
  }

  private drawEdit(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const a = this.edit!
    s.text(24, TRAY_H + 16, str.alarmNew, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    // 大号时间（选中的一栏白色，另一个灰）
    s.textCenter(W / 4, 320, two(a.h), {
      size: 120, font: F_LIGHT(120), color: this.selH ? C.WHITE : C.GRAY,
    })
    s.textCenter((W * 3) / 4, 320, two(a.m), {
      size: 120, font: F_LIGHT(120), color: !this.selH ? C.WHITE : C.GRAY,
    })
    s.textCenter(W / 2, 320, ':', { size: 100, font: F_LIGHT(100), color: C.GRAY })
    // 小三角提示（▲▼）
    s.textCenter(W / 4, 200, '▲', { size: 24, font: F_REG(24), color: C.GRAY })
    s.textCenter((W * 3) / 4, 200, '▲', { size: 24, font: F_REG(24), color: C.GRAY })
    s.textCenter(W / 4, 392, '▼', { size: 24, font: F_REG(24), color: C.GRAY })
    s.textCenter((W * 3) / 4, 392, '▼', { size: 24, font: F_REG(24), color: C.GRAY })
    // 开关行
    s.text(24, 456, a.on ? str.alarmOn : str.alarmOff, { size: 26, font: F_REG(26), color: C.WHITE })
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(W - 90, 428, 56, 26, a.on ? accent : C.DIM)
    s.fillRect(a.on ? W - 46 : W - 82, 432, 18, 18, C.WHITE)
    // 重复日
    const cw = (W - 48) / 7
    str.alarmWeekdays.forEach((w2, i) => {
      const on = a.days.includes(i)
      s.textCenter(24 + i * cw + cw / 2, 556, w2, {
        size: 24, font: on ? F_SEMI(24) : F_REG(24), color: on ? accent : C.GRAY,
      })
    })
    // 删除行
    s.text(24, 636, str.picDelete, { size: 24, font: F_REG(24), color: C.RED })
  }

  private drawWorld(str: ReturnType<typeof wpStrings>, d: Date) {
    const s = this.ctx.screen
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000
    str.alarmWorldCities.forEach(([name, off], i) => {
      const t = new Date(utcMs + off * 3600000)
      const y = TOP + i * 108
      s.text(24, y, name, { size: 30, font: F_REG(30), color: C.WHITE })
      s.textRight(W - 24, y, `${two(t.getHours())}:${two(t.getMinutes())}`, {
        size: 40, font: F_LIGHT(40), color: C.WHITE,
      })
      s.fillRect(24, y + 70, W - 48, 1, C.DIM)
    })
  }

  private drawStopwatch(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    s.textCenter(W / 2, 300, this.fmtSw(this.swMs), {
      size: 90, font: F_LIGHT(90), color: C.WHITE,
    })
    // 分圈列表
    this.laps.forEach((lap, i) => {
      const y = 380 + i * 46
      if (y > H - 130) return
      const n = this.laps.length - i
      s.text(24, y, `#${n}`, { size: 22, font: F_REG(22), color: C.GRAY })
      s.textRight(W - 24, y, this.fmtSw(lap), { size: 24, font: F_REG(24), color: C.WHITE })
    })
    // 按钮
    const left = this.swRun ? str.swLap : str.swReset
    s.fillRect(24, H - 110, W / 2 - 32, 80, C.DIM)
    s.textCenter(W / 4 - 8, H - 68, left, { size: 28, font: F_REG(28), color: C.WHITE })
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(W / 2 + 8, H - 110, W / 2 - 32, 80, accent)
    s.textCenter((W * 3) / 4 + 8, H - 68, this.swRun ? str.swStop : str.swStart, {
      size: 28, font: F_SEMI(28), color: C.WHITE,
    })
  }

  private drawTimer(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const running = this.tRun || this.tLeft > 0
    if (!running) {
      // 设置：大数字 + ±
      s.textCenter(W / 2, 280, String(this.tSetMin), {
        size: 120, font: F_LIGHT(120), color: C.WHITE,
      })
      s.text(40, 260, '−', { size: 60, font: F_LIGHT(60), color: C.WHITE })
      s.textRight(W - 40, 260, '+', { size: 50, font: F_LIGHT(50), color: C.WHITE })
      s.textCenter(W / 2, 330, 'min', { size: 26, font: F_REG(26), color: C.GRAY })
      // 快捷分钟
      const chips = [1, 5, 10, 30]
      const cw = (W - 48) / 4
      chips.forEach((m, i) => {
        const on = m === this.tSetMin
        s.textCenter(24 + i * cw + cw / 2, 400, String(m), {
          size: 28, font: on ? F_SEMI(28) : F_REG(28), color: on ? (this.ctx.host.getAccent?.() ?? C.BLUE) : C.GRAY,
        })
      })
    } else {
      const mm = Math.floor(this.tLeft / 60)
      const ss = Math.ceil(this.tLeft % 60)
      s.textCenter(W / 2, 300, `${two(mm)}:${two(ss)}`, {
        size: 130, font: F_LIGHT(130), color: C.WHITE,
      })
    }
    // 底部按钮
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(24, H - 110, W - 48, 80, running ? C.RED : accent)
    s.textCenter(W / 2, H - 68, running ? str.swStop : str.timerStart, {
      size: 30, font: F_SEMI(30), color: C.WHITE,
    })
  }

  /** 倒计时到点：全屏提示 */
  private drawTimerRing(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, 0, W, H, C.BLACK)
    s.textCenter(W / 2, 360, str.timerDone, { size: 60, font: F_LIGHT(60), color: C.WHITE })
    s.textCenter(W / 2, 440, str.resetCancel, { size: 24, font: F_REG(24), color: C.GRAY })
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Screen } from '../../../hal/screen'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { ALARM_NAMES } from '../assets'
import { W, H, STATUS_H, statusBar, roundRect, iconTile } from '../ui'

/** 闹钟数据（OS 层读取同一份数据到点响铃）。days：周一 bit0 … 周日 bit6；0 = 仅一次 */
export type AAlarm = {
  id: number
  on: boolean
  h: number
  m: number
  days: number
  label: string
  snd: number
}

const D_MON = 1 << 0
const D_ALL = 0x7f
const D_WEEKDAYS = 0x1f // 周一..周五
const D_WEEKENDS = 0x60 // 周六周日

const two = (x: number) => String(x).padStart(2, '0')

/** JS getDay()（0=周日）→ 周一起算的 bit */
export function dayBit(dow: number): number {
  return 1 << ((dow + 6) % 7)
}

/**
 * Android 1.0 Alarm Clock：深色真机样式——闹钟列表 → 编辑（时间/重复/铃声/标签），
 * 多闹钟持久化到 store（OS 层到点全屏 AlarmAlert）。
 */
export const clockApp: MiniApp = {
  id: 'clock',
  name: '闹钟',
  nameEn: 'Alarm Clock',
  icon(s, x, y) {
    iconTile(s, x, y, C.AMBER, C.LAMBER)
    // 白表盘 + 指针 + 双铃
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++)
        if (dx * dx + dy * dy <= 81) s.pset(x + 14 + dx, y + 14 + dy, C.WHITE)
    s.fillRect(x + 13, y + 8, 2, 6, C.INK)
    s.fillRect(x + 15, y + 13, 6, 2, C.INK)
    s.fillRect(x + 6, y + 5, 4, 4, C.WHITE)
    s.fillRect(x + 18, y + 5, 4, 4, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new ClockUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type View = 'list' | 'edit' | 'sound'

const ROW_H = 64
const LIST_TOP = STATUS_H + 34

class ClockUI {
  private offs: Array<() => void> = []
  private alarms: AAlarm[] = []
  private view: View = 'list'
  private sel = 0
  // 编辑态
  private editIdx = -1
  private section = 0
  private fieldHM = 0 // 0 时 / 1 分
  private daySel = 0
  // MENU（添加闹钟）
  private menuOpen = false
  // 铃声选择
  private soundSel = 0
  private previewStop: (() => void) | null = null

  constructor(private ctx: AppContext) {}

  dispose() {
    this.offs.forEach((off) => off())
    this.previewStop?.()
  }

  async init() {
    this.ctx.onKey((k, repeat) => this.onKey(k, repeat))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.ctx.store.onChange(async (key) => {
      if (key !== 'alarms') return
      const saved = await this.ctx.store.get<AAlarm[]>('alarms')
      if (saved) {
        this.alarms = saved.map((a) => ({
          id: a.id, on: !!a.on, h: a.h % 24, m: a.m % 60,
          days: a.days & D_ALL, label: a.label, snd: a.snd % ALARM_NAMES.length,
        }))
        this.draw()
      }
    })
    this.alarms = await this.load()
    this.offs.push(this.ctx.onFrame(() => this.draw()))
    this.draw()
  }

  private async load(): Promise<AAlarm[]> {
    const saved = await this.ctx.store.get<AAlarm[]>('alarms')
    if (saved && saved.length) {
      return saved.map((a) => ({
        id: a.id, on: !!a.on, h: a.h % 24, m: a.m % 60,
        days: a.days & D_ALL, label: a.label, snd: a.snd % ALARM_NAMES.length,
      }))
    }
    // 旧版单闹钟迁移
    const old = await this.ctx.store.get<{ on: boolean; h: number; m: number }>('alarm')
    if (old) {
      const a: AAlarm = {
        id: 1, on: !!old.on, h: old.h % 24, m: old.m % 60,
        days: D_WEEKDAYS, label: '', snd: 4,
      }
      void this.ctx.store.set('alarms', [a])
      return [a]
    }
    // 出厂：一个工作日 7:30 闹钟（真机首次开机需自建，这里给个可见样本）
    return [{ id: Date.now(), on: true, h: 7, m: 30, days: D_WEEKDAYS, label: '', snd: 4 }]
  }

  private save() {
    void this.ctx.store.set('alarms', this.alarms)
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey, repeat: boolean) {
    if (this.view === 'list') this.listKey(k)
    else if (this.view === 'edit') this.editKey(k, repeat)
    else this.soundKey(k)
  }

  private listKey(k: DeviceKey) {
    if (k === 'menu') {
      this.menuOpen = !this.menuOpen
      this.draw()
      return
    }
    if (this.menuOpen) {
      if (k === 'ok') {
        this.menuOpen = false
        this.addAlarm()
      } else if (k === 'back') this.menuOpen = false
      else return
      this.draw()
      return
    }
    if (!this.alarms.length) {
      if (k === 'back') this.ctx.exit()
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + this.alarms.length - 1) % this.alarms.length
        break
      case 'down':
        this.sel = (this.sel + 1) % this.alarms.length
        break
      case 'ok':
        this.openEdit(this.sel)
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private editKey(k: DeviceKey, repeat: boolean) {
    const a = this.alarms[this.editIdx]
    if (!a) { this.backToList(); return }
    if (this.section === 3 && (/^[a-z0-9]$/.test(k) || k === 'space' || k === '.' || k === ',')) {
      if (a.label.length < 24) {
        a.label += k === 'space' ? ' ' : k
        this.save()
        this.draw()
      }
      return
    }
    switch (k) {
      case 'up':
        this.section = (this.section + 4) % 5
        break
      case 'down':
        this.section = (this.section + 1) % 5
        break
      case 'left':
        if (this.section === 0) {
          if (this.fieldHM === 0) a.h = (a.h + 23) % 24
          else a.m = (a.m + 59) % 60
          this.save()
        } else if (this.section === 1) this.daySel = (this.daySel + 6) % 7
        break
      case 'right':
        if (this.section === 0) {
          if (this.fieldHM === 0) a.h = (a.h + 1) % 24
          else a.m = (a.m + 1) % 60
          this.save()
        } else if (this.section === 1) this.daySel = (this.daySel + 1) % 7
        break
      case 'ok':
        if (this.section === 0) this.fieldHM = (this.fieldHM + 1) % 2
        else if (this.section === 1) a.days ^= 1 << this.daySel
        else if (this.section === 2) this.openSound(a)
        else if (this.section === 4) {
          this.removeAlarm()
          return
        }
        this.save()
        break
      case 'clear':
        if (this.section === 3 && a.label.length) {
          a.label = a.label.slice(0, -1)
          this.save()
        }
        break
      case 'back':
        this.backToList()
        return
      default:
        return
    }
    void repeat
    this.draw()
  }

  private soundKey(k: DeviceKey) {
    const a = this.alarms[this.editIdx]
    switch (k) {
      case 'up':
        this.soundSel = (this.soundSel + ALARM_NAMES.length - 1) % ALARM_NAMES.length
        this.preview()
        break
      case 'down':
        this.soundSel = (this.soundSel + 1) % ALARM_NAMES.length
        this.preview()
        break
      case 'ok':
        if (a) {
          a.snd = this.soundSel
          this.save()
        }
        this.view = 'edit'
        break
      case 'back':
        this.view = 'edit'
        break
      default:
        return
    }
    this.draw()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.view === 'list') this.listTap(x, y)
    else if (this.view === 'edit') this.editTap(x, y)
    else this.soundTap(y)
  }

  private listTap(x: number, y: number) {
    if (this.menuOpen) {
      // 工作表：y0=H-50
      if (y >= H - 50) this.addAlarm()
      else this.menuOpen = false
      this.draw()
      return
    }
    const rows = Math.floor((H - LIST_TOP) / ROW_H)
    for (let r = 0; r < rows; r++) {
      const i = this.selTop() + r
      if (i >= this.alarms.length) break
      if (y >= LIST_TOP + r * ROW_H && y < LIST_TOP + (r + 1) * ROW_H) {
        // 右侧复选框区：x>W-52
        if (x > W - 52) {
          this.alarms[i]!.on = !this.alarms[i]!.on
          this.save()
          this.draw()
        } else this.openEdit(i)
        return
      }
    }
  }

  private editTap(x: number, y: number) {
    const rows = this.editRows()
    for (let r = 0; r < rows.length; r++) {
      if (y >= rows[r] && y < rows[r] + 44) {
        this.section = r
        // 时间行：左半 = 时字段，右半 = 分字段；最右复选框 = 开关
        if (r === 0) {
          if (x > W - 44) this.alarms[this.editIdx]!.on = !this.alarms[this.editIdx]!.on
          else this.fieldHM = x < W - 100 ? 0 : 1
        }
      }
    }
    this.save()
    this.draw()
  }

  private soundTap(y: number) {
    const top = STATUS_H + 40
    const r = Math.floor((y - top) / 42)
    if (r >= 0 && r < ALARM_NAMES.length) {
      this.soundSel = r
      this.preview()
      const a = this.alarms[this.editIdx]
      if (a) {
        a.snd = r
        this.save()
      }
      this.view = 'edit'
      this.draw()
    }
  }

  // ---------- 行为 ----------

  private addAlarm() {
    const d = new Date()
    const a: AAlarm = {
      id: Date.now(),
      on: true,
      h: (d.getHours() + 1) % 24,
      m: 0,
      days: 0,
      label: '',
      snd: 4,
    }
    this.alarms.push(a)
    this.save()
    this.openEdit(this.alarms.length - 1)
  }

  private openEdit(i: number) {
    this.editIdx = i
    this.section = 0
    this.fieldHM = 0
    this.daySel = 0
    this.soundSel = this.alarms[i]?.snd ?? 0
    this.view = 'edit'
    this.draw()
  }

  private openSound(a: AAlarm) {
    this.soundSel = a.snd
    this.view = 'sound'
    this.draw()
  }

  private removeAlarm() {
    this.alarms.splice(this.editIdx, 1)
    this.save()
    this.backToList()
  }

  private backToList() {
    this.previewStop?.()
    this.view = 'list'
    this.sel = Math.min(this.sel, Math.max(0, this.alarms.length - 1))
    this.draw()
  }

  private preview() {
    this.previewStop?.()
    const file = ALARM_NAMES[this.soundSel]?.file
    this.ctx.audio.unlock()
    if (file && this.ctx.audio.hasFile(file)) {
      this.previewStop = this.ctx.audio.playFile(file, { volume: 0.5 })
    }
  }

  /** 列表滚动：以 sel 为基准 */
  private selTop(): number {
    const rows = Math.floor((H - LIST_TOP) / ROW_H)
    return Math.max(0, Math.min(this.sel - 1, this.alarms.length - rows))
  }

  private editRows(): number[] {
    return [STATUS_H + 12, STATUS_H + 64, STATUS_H + 116, STATUS_H + 168, STATUS_H + 220]
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    const d = new Date()
    s.clear()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
      signalBars: 4,
    })
    if (this.view === 'list') this.drawList(str)
    else if (this.view === 'edit') this.drawEdit(str)
    else this.drawSound(str)
    s.render()
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    s.text(12, STATUS_H + 10, str.clockTitle, { size: 13, color: C.GRAY })
    if (!this.alarms.length) {
      s.textCenter(W >> 1, H >> 1, str.aNoAlarms, { color: C.GRAY })
      return
    }
    const rows = Math.floor((H - LIST_TOP) / ROW_H)
    const top = this.selTop()
    for (let r = 0; r < rows; r++) {
      const i = top + r
      if (i >= this.alarms.length) break
      const a = this.alarms[i]!
      const y = LIST_TOP + r * ROW_H
      if (i === this.sel) roundRect(s, 4, y, W - 8, ROW_H - 8, 8, C.PANEL, C.METAL)
      s.text(18, y + 10, `${two(a.h)}:${two(a.m)}`, {
        size: 22,
        color: a.on ? C.WHITE : C.GRAY,
      })
      // 复选框
      checkBox(s, W - 36, y + 14, a.on)
      // 重复 + 标签
      const sub = [this.repeatText(a.days, str), a.label].filter(Boolean).join(' · ')
      s.text(18, y + 42, sub, { size: 10, color: a.on ? C.PALE : C.METAL })
    }
    if (this.menuOpen) {
      roundRect(s, 6, H - 50, W - 12, 44, 8, C.WHITE, C.GRAY)
      s.textCenter(W >> 1, H - 35, str.aAdd, { size: 14, color: C.INK })
    }
  }

  private drawEdit(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const a = this.alarms[this.editIdx]
    if (!a) return
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    const rows = this.editRows()

    // 时间
    const ty = rows[0]!
    s.text(12, ty + 2, str.aTime, { size: 13, color: C.GRAY })
    const hCol = this.fieldHM === 0 && this.section === 0 ? C.ORANGE : C.WHITE
    const mCol = this.fieldHM === 1 && this.section === 0 ? C.ORANGE : C.WHITE
    s.textRight(W - 100, ty, two(a.h), { size: 26, color: a.on ? hCol : C.GRAY })
    s.textRight(W - 72, ty, ':', { size: 26, color: C.WHITE })
    s.textRight(W - 40, ty, two(a.m), { size: 26, color: a.on ? mCol : C.GRAY })
    checkBox(s, W - 28, ty + 4, a.on)

    // 重复：7 个日 chip
    const ry = rows[1]!
    s.text(12, ry + 2, str.aRepeat, { size: 13, color: C.GRAY })
    const rep = this.repeatText(a.days, str)
    s.text(70, ry + 4, rep, { size: 10, color: C.PALE })
    for (let i = 0; i < 7; i++) {
      const cx = 88 + i * 26
      const on = (a.days & (1 << i)) !== 0
      if (this.section === 1 && i === this.daySel) colorFrame(s, cx - 11, ry + 20, 24, 20, C.ORANGE)
      roundRect(s, cx - 9, ry + 22, 20, 16, 4, on ? C.GREEN : C.PANEL, on ? null : C.METAL)
      s.textCenter(cx, ry + 25, str.aDaysShort[i]!, { size: 10, color: on ? C.WHITE : C.PALE })
    }

    // 铃声
    const sy = rows[2]!
    s.text(12, sy + 2, str.aSound, { size: 13, color: C.GRAY })
    const sndName = this.ctx.lang.get() === 'en'
      ? ALARM_NAMES[a.snd]?.en
      : ALARM_NAMES[a.snd]?.zh
    s.textRight(W - 14, sy + 4, sndName ?? '', { size: 12, color: C.AMBER })
    if (this.section === 2) s.fillRect(12, sy + 24, W - 24, 2, C.ORANGE)

    // 标签
    const ly = rows[3]!
    s.text(12, ly + 2, str.aLabel, { size: 13, color: C.GRAY })
    s.text(70, ly + 2, a.label || str.aLabelDefault, {
      size: 13,
      color: a.label ? C.WHITE : C.METAL,
    })
    if (this.section === 3) s.fillRect(12, ly + 24, W - 24, 2, C.ORANGE)

    // 删除
    const dy2 = rows[4]!
    s.text(12, dy2 + 6, str.aRemove, { size: 13, color: C.RED })
  }

  private drawSound(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    s.text(12, STATUS_H + 10, str.aSound, { size: 13, color: C.GRAY })
    const top = STATUS_H + 40
    ALARM_NAMES.forEach((n, i) => {
      const y = top + i * 42
      if (i === this.soundSel) s.fillRect(6, y, W - 12, 40, C.ORANGE)
      else if (i > 0) s.fillRect(20, y, W - 40, 1, C.PANEL)
      s.text(20, y + 14, this.ctx.lang.get() === 'en' ? n.en : n.zh, {
        size: 14,
        color: i === this.soundSel ? C.WHITE : C.PALE,
      })
      if (i === this.soundSel) s.textRight(W - 20, y + 15, '●', { size: 12, color: C.WHITE })
    })
  }

  /** 重复规则文案：bitmask → 仅一次/每天/工作日/周末/指定日 */
  private repeatText(days: number, str: ReturnType<typeof androidStrings>): string {
    if (days === 0) return str.aOnce
    if (days === D_ALL) return str.aEveryday
    if (days === D_WEEKDAYS) return str.aWeekdays
    if (days === D_WEEKENDS) return str.aWeekends
    let out = ''
    for (let i = 0; i < 7; i++)
      if (days & (1 << i)) out += str.aDaysShort[i]
    return out
  }
}

/** 复选框：绿色满块（开）/ 灰边空块（关） */
function checkBox(s: Screen, x: number, y: number, on: boolean) {
  const w = 20
  if (on) roundRect(s, x, y, w, w, 5, C.GREEN, null)
  else roundRect(s, x, y, w, w, 5, C.PANEL, C.METAL)
}

/** 1px 彩色描边框（需要非 INK 色时用 4 条 fillRect） */
function colorFrame(s: Screen, x: number, y: number, w: number, h: number, color: number) {
  s.fillRect(x, y, w, 1, color)
  s.fillRect(x, y + h - 1, w, 1, color)
  s.fillRect(x, y, 1, h, color)
  s.fillRect(x + w - 1, y, 1, h, color)
}

// 供 OS 层复用
export { D_MON }

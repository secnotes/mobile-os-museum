import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

/** 闹钟配置（OS 读裸键 alarm:conf 监视响铃） */
export interface AlarmConf {
  on: boolean
  h: number
  m: number
}

const DEFAULT_ALARM: AlarmConf = { on: false, h: 7, m: 0 }

/** 单闹钟（1100 顶级 07；3310 在 Clock 列表内） */
export const alarmApp: MiniApp = {
  id: 'alarm',
  name: '闹钟',
  nameEn: 'Alarm clock',
  start(ctx: AppContext) {
    new AlarmUI(ctx)
  },
}

class AlarmUI {
  private conf: AlarmConf = { ...DEFAULT_ALARM }
  private sel = 0
  /** 时间录入缓冲（4 位 HHMM） */
  private buf = ''
  private editing = false
  private invalid = false

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<AlarmConf>('conf')
    if (saved) this.conf = saved
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.editing) { this.editKey(k); return }
    switch (k) {
      case 'up':
        this.sel = (this.sel + 1) % 2
        break
      case 'down':
        this.sel = (this.sel + 1) % 2
        break
      case 'ok':
      case 'soft1':
        if (this.sel === 0) {
          this.conf.on = !this.conf.on
          void this.store()
          // 真机：打开闹钟即进入时间设定
          if (this.conf.on) { this.editing = true; this.buf = '' }
        } else {
          this.editing = true
          this.buf = ''
        }
        break
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit(); return
      default:
        return
    }
    this.draw()
  }

  private editKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k) && this.buf.length < 4) {
      this.buf += k
      this.invalid = false
    } else if (k === 'clear') {
      if (this.buf) this.buf = this.buf.slice(0, -1)
      else { this.editing = false }
    } else if (k === 'back' || k === 'soft2') {
      this.editing = false
    } else if (k === 'ok' || k === 'soft1') {
      if (this.buf.length === 4) {
        const h = +this.buf.slice(0, 2)
        const m = +this.buf.slice(2)
        if (h <= 23 && m <= 59) {
          this.conf.h = h
          this.conf.m = m
          this.editing = false
          void this.store()
        } else {
          this.invalid = true
        }
      }
    }
    this.draw()
  }

  private async store() {
    await this.ctx.store.set('conf', this.conf)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.editing) {
      s.textCenter(W >> 1, 8, str.alSet, { size: 9 })
      const hh = (this.buf[0] ?? '_') + (this.buf[1] ?? '')
      const mm = (this.buf[2] ?? '_') + (this.buf[3] ?? '')
      s.textCenter(W >> 1, 22, `${hh}:${mm}`, { size: 14 })
      if (this.invalid) s.textCenter(W >> 1, 38, str.alInvalid, { size: 9 })
      s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
      return
    }
    const rows = [str.alSwitch, str.alSet]
    const val = [
      this.conf.on ? str.settingsOn : str.settingsOff,
      `${String(this.conf.h).padStart(2, '0')}:${String(this.conf.m).padStart(2, '0')}`,
    ]
    rows.forEach((label, i) => {
      const y = i * 11
      s.text(2, y + 1, label, { size: 9 })
      s.textRight(W - 2, y + 1, val[i], { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

export interface CountdownConf {
  mm: number
  ss: number
  run: boolean
  /** 到 0 的绝对时刻（run=true 时有意义） */
  endAt: number
}

const DEFAULT_CONF: CountdownConf = { mm: 5, ss: 0, run: false, endAt: 0 }

/** 倒计时（1100 Extras-3；3310 Clock-4）：到点 OS 急哔+闪烁，任意键停止 */
export const countdownApp: MiniApp = {
  id: 'countdown',
  name: '倒计时',
  nameEn: 'Countdown timer',
  start(ctx: AppContext) {
    new CountdownUI(ctx)
  },
}

class CountdownUI {
  private conf: CountdownConf = { ...DEFAULT_CONF }
  private buf = ''

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.onFrame(() => {
      if (this.conf.run) this.draw()
    })
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<CountdownConf>('conf')
    if (saved) this.conf = saved
    if (!this.conf.run) this.buf = ''
    this.draw()
  }

  private remainMs(): number {
    return Math.max(0, this.conf.endAt - Date.now())
  }

  private onKey(k: DeviceKey) {
    if (this.conf.run) {
      switch (k) {
        case 'ok':
        case 'soft1': {
          // 暂停：剩余折算回 MM:SS
          const ms = this.remainMs()
          this.conf.mm = Math.floor(ms / 60000)
          this.conf.ss = Math.floor((ms % 60000) / 1000)
          this.conf.run = false
          this.buf = ''
          break
        }
        case 'back':
        case 'soft2':
          this.ctx.exit(); return
        default:
          return
      }
      void this.save()
      this.draw()
      return
    }
    if (/^[0-9]$/.test(k) && this.buf.length < 4) {
      this.buf += k
    } else if (k === 'clear') {
      if (this.buf) this.buf = this.buf.slice(0, -1)
      else this.conf = { ...DEFAULT_CONF }
    } else if (k === 'back' || k === 'soft2') {
      this.ctx.exit(); return
    } else if (k === 'ok' || k === 'soft1') {
      if (this.buf.length === 4) {
        const mm = +this.buf.slice(0, 2)
        const ss = +this.buf.slice(2)
        if (ss <= 59 && (mm > 0 || ss > 0)) {
          this.conf.mm = mm
          this.conf.ss = ss
          this.conf.run = true
          this.conf.endAt = Date.now() + (mm * 60 + ss) * 1000
        }
      }
    }
    void this.save()
    this.draw()
  }

  private async save() {
    await this.ctx.store.set('conf', this.conf)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.textCenter(W >> 1, 8, str.cdTitle, { size: 9 })
    if (this.conf.run) {
      const ms = this.remainMs()
      const mm = String(Math.floor(ms / 60000)).padStart(2, '0')
      const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
      s.textCenter(W >> 1, 22, `${mm}:${ss}`, { size: 14 })
      s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
      return
    }
    const hh = (this.buf[0] ?? '_') + (this.buf[1] ?? '')
    const mm = (this.buf[2] ?? '_') + (this.buf[3] ?? '')
    s.textCenter(W >> 1, 22, `${hh}:${mm}`, { size: 14 })
    s.text(1, H - 10, str.cdStart, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

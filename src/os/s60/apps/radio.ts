import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent } from '../ui'

/**
 * 可视收音机：87.5–108 MHz 调谐（fmStatic 噪流 + 调谐提示音），
 * 1–3 预设台，假电台名。
 */
export const radioApp: MiniApp = {
  id: 'radio',
  name: '可视收音机',
  nameEn: 'Visual radio',
  start(ctx) {
    const ui = new RadioUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

interface Station { freq: number; zh: string; en: string }

const STATIONS: Station[] = [
  { freq: 90.0, zh: '音乐之声', en: 'Music Radio' },
  { freq: 97.4, zh: '交通广播', en: 'Traffic Radio' },
  { freq: 103.9, zh: '文艺广播', en: 'Arts Radio' },
]

class RadioUI {
  private offs: Array<() => void> = []
  private on = false
  private freq = 90.0
  private presets: number[] = [90.0, 97.4, 103.9]
  private fm: { stop: () => void } | null = null
  private tuneT = 0

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.tuneT > 0) {
        this.tuneT -= dt
        this.draw()
      }
    }))
    this.draw()
  }

  dispose() {
    this.offs.forEach((off) => off())
    this.turnOff()
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'soft1': this.on ? this.turnOff() : this.turnOn(); break
      case 'left': this.tune(-0.1); break
      case 'right': this.tune(0.1); break
      case 'ok': this.tune(1); break
      case '1': case '2': case '3':
        this.freq = this.presets[Number(k) - 1]!
        this.afterTune()
        break
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private turnOn() {
    this.on = true
    this.fm = this.ctx.audio.fmStatic(0.25)
  }

  private turnOff() {
    this.on = false
    this.fm?.stop()
    this.fm = null
  }

  private tune(d: number) {
    this.freq = Math.round((this.freq + d) * 10) / 10
    if (this.freq < 87.5) this.freq = 108
    if (this.freq > 108) this.freq = 87.5
    this.afterTune()
  }

  private afterTune() {
    // 对准电台：噪流变“节目”（用一串旋律假播放）；否则继续噪流
    const hit = STATIONS.find((s) => s.freq === this.freq)
    if (hit) {
      this.turnOff()
      this.on = true
      this.ctx.audio.melody([[72,.3],[76,.3],[79,.6]], 160)
    }
    this.tuneT = 0.8
  }

  private currentStation(): Station | undefined {
    return STATIONS.find((s) => Math.abs(s.freq - this.freq) < 0.05)
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    titleBar(s, en ? 'Visual radio' : '可视收音机')
    // 频率大字
    s.textCenter(W / 2, CONTENT_TOP + 30, this.freq.toFixed(1), { size: 44, color: this.on ? C.BLUE : C.GRAY })
    s.textCenter(W / 2, CONTENT_TOP + 84, 'MHz', { size: 12, color: C.GRAY })
    // 电台名 / 调谐状态
    const st = this.currentStation()
    if (st) {
      s.textCenter(W / 2, CONTENT_TOP + 110, en ? st.en : st.zh, { size: 15, color: C.GREEN })
    } else if (this.tuneT > 0) {
      s.textCenter(W / 2, CONTENT_TOP + 110, en ? 'Tuning…' : '正在调谐…', { size: 13, color: C.AMBER })
    } else {
      s.textCenter(W / 2, CONTENT_TOP + 110, this.on ? '沙沙…' : '—', { size: 13, color: C.GRAY })
    }
    // 信号强度条（对准电台=满格）
    const bars = st ? 5 : this.on ? 2 : 0
    for (let i = 0; i < 5; i++)
      s.fillRect(70 + i * 20, 200, 14, this.on ? 4 + i * 4 : 2,
        i < bars ? C.BLUE : C.PALE)
    // 预设台
    this.presets.forEach((f, i) => {
      const sel = Math.abs(f - this.freq) < 0.05
      s.text(20 + i * 72, 232, `${i + 1}:${f.toFixed(1)}`,
        { size: 12, color: sel ? C.RED : C.INK })
    })
    s.textCenter(W / 2, 268, en ? '◀ tune ▶ · 1-3 presets' : '◀ 调谐 ▶ · 1–3 预设',
      { size: 10, color: C.GRAY })
    softBar(s, this.on ? (en ? 'Off' : '关闭') : (en ? 'On' : '开启'), str.contactsBack)
  }
}

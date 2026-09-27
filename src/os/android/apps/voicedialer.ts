import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, roundRect } from '../ui'
import type { Contact } from '../../../scenario/data'

type View = 'listening' | 'results' | 'nomatch'

/**
 * Android 1.0 Voice Dialer：语音说出联系人名 → 识别候选 → 拨号。
 * 真机样式：深灰「Listening…」面板 + 白色麦克风 + 动态电平条。
 */
export const voiceDialerApp: MiniApp = {
  id: 'voicedialer',
  name: '语音拨号',
  nameEn: 'Voice Dialer',
  icon(s, x, y) {
    // 真机图标：黑色圆角底 + 白麦克风
    roundRect(s, x + 3, y + 3, 22, 22, 5, C.BAR, C.GRAY)
    s.fillRect(x + 12, y + 7, 4, 10, C.WHITE)
    roundRect(s, x + 9, y + 13, 10, 7, 3, C.WHITE, null)
    s.fillRect(x + 13, y + 19, 2, 3, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new VdUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class VdUI {
  private view: View = 'listening'
  private sel = 0
  private candidates: Contact[] = []
  private dead = false
  private timers: Array<ReturnType<typeof setTimeout>> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const t of this.timers.splice(0)) clearTimeout(t)
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.draw()
    // ~2s 聆听后识别（取前 3 位联系人作为候选）
    this.timers.push(
      setTimeout(async () => {
        if (this.dead) return
        const all = (await this.ctx.host.getContacts?.()) ?? []
        this.candidates = all.slice(0, 3)
        this.view = this.candidates.length ? 'results' : 'nomatch'
        this.sel = 0
        this.draw()
      }, 2000),
    )
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'listening') return
    const n = this.candidates.length
    if (this.view === 'results') {
      if (k === 'up') this.sel = (this.sel + n - 1) % n
      else if (k === 'down') this.sel = (this.sel + 1) % n
      else if (k === 'ok') {
        this.dialCandidate()
        return
      } else if (k === 'back') this.ctx.exit()
      else return
      this.draw()
      return
    }
    // nomatch：任意键退出
    if (k === 'back' || k === 'ok') this.ctx.exit()
  }

  private onTap(x: number, y: number) {
    if (this.view !== 'results') {
      if (this.view === 'nomatch') this.ctx.exit()
      return
    }
    for (let i = 0; i < this.candidates.length; i++) {
      const ry = 232 + i * 56
      if (y >= ry && y < ry + 48 && x >= 12 && x <= W - 12) {
        this.sel = i
        this.dialCandidate()
        return
      }
    }
  }

  private dialCandidate() {
    const c = this.candidates[this.sel]
    if (c) this.ctx.host.dial?.(c.tel)
  }

  private draw() {
    const s = this.ctx.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.INK)
    const str = androidStrings(this.ctx.lang.get())
    const cx = W >> 1
    if (this.view === 'listening') {
      const cy = (H >> 1) - 40
      // 白色麦克风
      s.fillRect(cx - 5, cy - 26, 10, 28, C.WHITE)
      roundRect(s, cx - 13, cy - 4, 26, 20, 8, C.WHITE, null)
      s.fillRect(cx - 2, cy + 14, 4, 12, C.WHITE)
      s.fillRect(cx - 9, cy + 24, 18, 4, C.WHITE)
      s.textCenter(cx, cy + 60, str.vdListening, { size: 16, color: C.WHITE })
      s.textCenter(cx, cy + 86, str.vdHint, { size: 11, color: C.GRAY })
      // 电平条（随时间跳动）
      const t = Date.now() / 130
      for (let i = -6; i <= 6; i++) {
        const h = 6 + Math.abs(Math.sin(t + i * 0.9)) * 22
        s.fillRect(cx + i * 8 - 2, cy + 118 - h, 4, h, C.GREEN)
      }
    } else if (this.view === 'results') {
      s.textCenter(cx, 150, str.vdRecognized, { size: 14, color: C.GRAY })
      this.candidates.forEach((c, i) => {
        const ry = 232 + i * 56
        if (i === this.sel) roundRect(s, 10, ry - 4, W - 20, 52, 8, C.PANEL, C.ORANGE)
        s.text(22, ry + 8, c.name, { size: 15, color: C.WHITE })
        s.text(22, ry + 28, c.tel, { size: 10, color: C.GRAY })
      })
    } else {
      s.textCenter(cx, 200, str.vdNoMatch, { size: 16, color: C.WHITE })
      s.textCenter(cx, 232, str.vdTapBack, { size: 11, color: C.GRAY })
    }
    s.render()
  }
}

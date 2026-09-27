import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

/**
 * 键盘锁设置（1100 专属；id 'keyguard'，conf 存 <dev>:keyguard:conf）：
 * 自动键盘锁 On/Off——待机 12s 无操作自动上锁（OS 帧监视）。
 */
export const keyguardApp: MiniApp = {
  id: 'keyguard',
  name: '键盘锁设置',
  nameEn: 'Keyguard settings',
  start(ctx: AppContext) {
    new KeyguardUI(ctx)
  },
}

class KeyguardUI {
  private conf = { auto: false }

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<{ auto: boolean }>('conf')
    if (saved) this.conf = saved
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'ok' || k === 'soft1') {
      this.conf.auto = !this.conf.auto
      void this.ctx.store.set('conf', this.conf)
      this.draw()
    } else if (k === 'back' || k === 'soft2' || k === 'clear') {
      this.ctx.exit()
    }
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.textCenter(W >> 1, (H >> 1) - 12, str.kgAutoTitle, { size: 12 })
    s.textCenter(W >> 1, (H >> 1) + 2, this.conf.auto ? str.settingsOn : str.settingsOff, { size: 14 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

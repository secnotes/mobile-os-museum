import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

interface DivertItem {
  num: string
  on: boolean
}

/**
 * 呼叫转移（3310 顶级 7；id 'divert'）：
 * 条件列表 + Cancel all；每项设号码后 Activate/Cancel，活动项打勾。
 * AppStore 'conf'。
 */
export const divertApp: MiniApp = {
  id: 'divert',
  name: '呼叫转移',
  nameEn: 'Call divert',
  start(ctx: AppContext) {
    new DivertUI(ctx)
  },
}

type Conf = Record<number, DivertItem | undefined>

class DivertUI {
  private view: 'list' | 'edit' = 'list'
  private conf: Conf = {}
  private sel = 0
  private top = 0
  private buf = ''
  /** 条件数（6：5 条件 + Cancel all） */
  private static readonly N = 6
  private readonly rows: number

  constructor(private ctx: AppContext) {
    this.rows = Math.floor((ctx.screen.h - 11) / 11)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<Conf>('conf')
    if (saved) this.conf = saved
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'list') this.listKey(k)
    else this.editKey(k)
  }

  private listKey(k: DeviceKey) {
    switch (k) {
      case 'up':
        this.sel = (this.sel + DivertUI.N - 1) % DivertUI.N
        this.clamp(); this.draw(); break
      case 'down':
        this.sel = (this.sel + 1) % DivertUI.N
        this.clamp(); this.draw(); break
      case 'ok':
      case 'soft1':
        if (this.sel === 5) {
          // Cancel all：全部置 off
          for (const k2 of Object.keys(this.conf))
            if (this.conf[+k2]) this.conf[+k2] = { ...this.conf[+k2]!, on: false }
          void this.save()
        } else {
          this.view = 'edit'
          this.buf = this.conf[this.sel]?.num ?? ''
        }
        this.draw(); break
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit()
    }
  }

  private editKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k) && this.buf.length < 15) {
      this.buf += k
    } else if (k === 'clear') {
      if (this.buf) this.buf = this.buf.slice(0, -1)
      else { this.view = 'list' }
    } else if (k === 'back' || k === 'soft2') {
      this.view = 'list'
    } else if (k === 'ok' || k === 'soft1') {
      const cur = this.conf[this.sel]
      if (cur?.on) {
        // 已激活 → Cancel
        this.conf[this.sel] = { ...cur, on: false }
      } else if (this.buf.length >= 3) {
        // Activate
        this.conf[this.sel] = { num: this.buf, on: true }
      }
      this.view = 'list'
      void this.save()
    }
    this.draw()
  }

  private async save() {
    await this.ctx.store.set('conf', this.conf)
  }

  private clamp() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.view === 'edit') {
      s.text(2, 4, str.dvNumber, { size: 9 })
      s.text(2, 18, this.buf || '_', { size: 12 })
      s.text(1, H - 10, str.dvActivate, { size: 9 })
      s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
      return
    }
    const labels = [
      str.dvAll, str.dvBusy, str.dvNoAnswer, str.dvReach, str.dvAvail, str.dvCancel,
    ]
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= DivertUI.N) break
      const y = r * 11
      s.text(2, y + 1, labels[i], { size: 9 })
      if (i !== 5 && this.conf[i]?.on) s.textRight(W - 2, y + 1, '√', { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (DivertUI.N > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / DivertUI.N) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / DivertUI.N) * (H - 11))))
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

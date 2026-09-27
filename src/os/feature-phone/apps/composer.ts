import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { midiFreq } from '../../../hal/audio'
import { osStrings } from '../strings'

/**
 * 单音铃声作曲家：16 个音符（0=休止，1~15 = C5 起两个八度），
 * 保存后可在「设置 → 铃声」里选为来信铃声。
 */
const NOTES = 16
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const composerApp: MiniApp = {
  id: 'composer',
  name: '作曲家',
  nameEn: 'Composer',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '.....##..',
      '.....#.#.',
      '.....#..#',
      '.....#...',
      '.....#...',
      '..####...',
      '.#####...',
      '..###....',
    ])
  },
  start(ctx: AppContext) {
    const c = new Composer(ctx)
    return () => c.dispose()
  },
}

class Composer {
  private tune = [5, 5, 7, 5, 8, 7, 5, 3, 5, 5, 7, 5, 10, 8, 7, 5]
  private sel = 0
  private playPos = -1
  private playOff: (() => void) | null = null
  private toast: string | null = null
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private dead = false

  constructor(private ctx: AppContext) {
    void ctx.store.get<number[]>('tune').then((t) => {
      if (t?.length === NOTES) this.tune = t
      this.draw()
    })
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    this.draw()
  }

  dispose() {
    this.dead = true
    this.playOff?.()
    if (this.toastTimer) clearTimeout(this.toastTimer)
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up':
        this.tune[this.sel] = (this.tune[this.sel] + 1) % 16
        break
      case 'down':
        this.tune[this.sel] = (this.tune[this.sel] + 15) % 16
        break
      case 'left':
        this.sel = (this.sel + NOTES - 1) % NOTES
        break
      case 'right':
        this.sel = (this.sel + 1) % NOTES
        break
      case 'ok':
        this.playFrom(0)
        return
      case 'clear':
        this.tune[this.sel] = 0
        break
      case 'soft1':
        this.playFrom(this.sel)
        return
      case 'soft2':
        this.save()
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.audioTick()
    this.draw()
  }

  private audioTick() {
    const n = this.tune[this.sel]
    if (n > 0) this.ctx.audio.tone(midiFreq(71 + n), 0.1, { gain: 0.05 })
  }

  private playFrom(pos: number) {
    this.playOff?.()
    this.playPos = pos
    this.playOff = this.ctx.every(160, () => {
      if (this.playPos >= 0 && this.playPos < NOTES) {
        const n = this.tune[this.playPos]
        if (n > 0) this.ctx.audio.tone(midiFreq(71 + n), 0.14, { gain: 0.05 })
        this.playPos++
        this.draw()
      } else {
        this.playOff?.()
        this.playOff = null
        this.playPos = -1
        this.draw()
      }
    })
  }

  private save() {
    void this.ctx.store.set('tune', this.tune)
    this.showToast(osStrings(this.ctx.lang.get()).composerSaved)
  }

  private showToast(msg: string) {
    this.toast = msg
    this.draw()
    this.toastTimer = setTimeout(() => {
      if (this.dead) return
      this.toast = null
      this.draw()
    }, 1200)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    s.textCenter(s.w >> 1, 1, str.composerTitle)
    s.invertRect(0, 0, s.w, 12)
    // 音高层：0..15 → 高度 0..30（底部锚定）
    const baseY = s.h - 8
    for (let i = 0; i < NOTES; i++) {
      const x = 2 + i * 5
      const n = this.tune[i]
      if (n > 0) s.fillRect(x, baseY - n * 2, 3, n * 2)
      else s.fillRect(x, baseY - 1, 3, 1)
      if (this.playPos === i) s.invertRect(x - 1, 13, 5, baseY - 13 + 2)
    }
    // 光标
    s.fillRect(2 + this.sel * 5, baseY + 1, 3, 2)
    // 当前音符名
    const n = this.tune[this.sel]
    const name = n === 0 ? str.composerRest : `${NOTE_NAMES[(n - 1) % 12]}${5 + Math.floor((n - 1) / 12)}`
    s.text(1, s.h - 11, name, { size: 9 })
    s.textRight(s.w - 1, s.h - 10, this.toast ?? str.composerSave)
  }
}

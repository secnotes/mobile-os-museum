import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { midiFreq } from '../../../hal/audio'
import { osStrings } from '../strings'

type Conf = { keyBeep: boolean; ringtone: 'default' | 'user' }

export const settingsApp: MiniApp = {
  id: 'settings',
  name: '设置',
  nameEn: 'Settings',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '..#..#..',
      '.######.',
      '#..##..#',
      '#.#..#.#',
      '#.#..#.#',
      '#..##..#',
      '.######.',
      '..#..#..',
    ])
  },
  start(ctx: AppContext) {
    new Settings(ctx)
  },
}

class Settings {
  private conf: Conf = { keyBeep: true, ringtone: 'default' }
  private sel = 0
  private view: 'list' | 'confirm' | 'done' = 'list'
  private hasUserTune = false
  private doneTimer: ReturnType<typeof setTimeout> | null = null
  private dead = false

  constructor(private ctx: AppContext) {
    void this.reload()
    ctx.onKey((k, r) => this.onKey(k, r))
    ctx.onLang(() => this.draw())
  }

  dispose() {
    this.dead = true
    if (this.doneTimer) clearTimeout(this.doneTimer)
  }

  private async reload() {
    const c = await this.ctx.store.get<Conf>('conf')
    if (c) this.conf = { keyBeep: c.keyBeep ?? true, ringtone: c.ringtone === 'user' ? 'user' : 'default' }
    this.hasUserTune = !!(await this.ctx.host.getUserTune?.())
    this.draw()
  }

  private onKey(k: DeviceKey, repeat: boolean) {
    if (this.view === 'confirm') {
      if (k === 'ok' || k === 'soft1') this.factoryReset()
      else if (k === 'clear' || k === 'back' || k === 'soft2') {
        this.view = 'list'
        this.draw()
      }
      return
    }
    if (this.view === 'done') return
    switch (k) {
      case 'up':
        if (!repeat) this.sel = (this.sel + 2) % 3
        break
      case 'down':
        if (!repeat) this.sel = (this.sel + 1) % 3
        break
      case 'left':
        if (!repeat) this.sel = (this.sel + 2) % 3
        break
      case 'right':
        if (!repeat) this.sel = (this.sel + 1) % 3
        break
      case 'ok':
      case 'soft1':
        this.activate()
        return // activate() 内部已 draw
      case 'back':
      case 'soft2':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private activate() {
    if (this.sel === 0) {
      this.conf.keyBeep = !this.conf.keyBeep
      this.save()
    } else if (this.sel === 1) {
      if (this.hasUserTune) {
        this.conf.ringtone = this.conf.ringtone === 'user' ? 'default' : 'user'
        this.save()
        // 试听
        if (this.conf.ringtone === 'user') {
          void this.ctx.host.getUserTune?.().then((tune) => {
            tune?.forEach((n, i) => {
              if (n > 0) this.ctx.audio.tone(midiFreq(71 + n), 0.14, { gain: 0.05, when: i * 0.18 })
            })
          })
        }
      }
    } else {
      this.view = 'confirm'
    }
    this.draw()
  }

  private async save() {
    await this.ctx.store.set('conf', this.conf)
  }

  private async factoryReset() {
    await this.ctx.store.clearAll()
    this.conf = { keyBeep: true, ringtone: 'default' }
    this.view = 'done'
    this.draw()
    this.doneTimer = setTimeout(() => {
      if (!this.dead) this.ctx.exit()
    }, 1300)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    if (this.view === 'confirm') {
      s.textCenter(s.w >> 1, 4, str.settingsConfirmTitle)
      s.text(6, 20, str.settingsConfirmL1, { size: 9 })
      s.text(6, 33, str.settingsConfirmL2, { size: 9 })
      s.text(1, s.h - 11, str.settingsConfirmYes, { size: 9 })
      s.textRight(s.w - 1, s.h - 11, str.settingsConfirmNo, { size: 9 })
      return
    }
    if (this.view === 'done') {
      s.textCenter(s.w >> 1, 18, str.settingsDoneL1)
      s.textCenter(s.w >> 1, 32, str.settingsDoneL2)
      return
    }
    s.textCenter(s.w >> 1, 1, str.settingsTitle)
    s.invertRect(0, 0, s.w, 12)
    const rows = [str.settingsKeyBeep, str.settingsRingtone, str.settingsFactory]
    const vals = [
      this.conf.keyBeep ? str.settingsOn : str.settingsOff,
      this.hasUserTune ? (this.conf.ringtone === 'user' ? str.settingsCustom : str.settingsDefault) : str.settingsDefault,
      '',
    ]
    // 行高 12、字号 9：选中高亮条（高 12）完全覆盖文字（高 ~10），不溢出标题栏
    const rowH = 12
    const top = 13
    rows.forEach((label, i) => {
      const y = top + i * rowH
      s.text(3, y, label, { size: 9 })
      if (vals[i]) s.textRight(s.w - 4, y, vals[i], { size: 9 })
      // 先绘文字再反色：文字像素被翻转为暗，呈「亮条暗字」
      if (i === this.sel) s.invertRect(0, y - 1, s.w, rowH)
    })
  }
}

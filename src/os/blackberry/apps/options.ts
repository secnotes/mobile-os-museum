import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, rrStroke } from '../graphics'
import { RINGTONES } from '../ringtones'
import { BBApp, type MenuCommand } from './common'

/**
 * Options：铃声 / 振动 / 语言 / 关于 / 恢复出厂。
 */

type Mode = 'main' | 'ring' | 'about' | 'confirm'

export class OptionsApp extends BBApp {
  private mode: Mode = 'main'
  private sel = 0
  private ringSel = 0
  private vibe = true

  protected async onStart() {
    this.ringSel = (await this.host.getRingtoneIndex()) ?? 0
    this.vibe = await this.host.getVibe()
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'main') this.drawMain()
    else if (this.mode === 'ring') this.drawRing()
    else if (this.mode === 'about') this.drawAbout()
    else this.drawConfirm()
    s.render()
  }

  private header(title: string) {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, title, { size: 18, color: C.WHITE })
  }

  private rows(): Array<[string, string]> {
    const en = this.ctx.lang.get() === 'en'
    return [
      [this.str.ringTone, RINGTONES[this.ringSel]![en ? 'en' : 'zh']],
      [en ? 'Vibration' : '振动', this.vibe ? this.str.on : this.str.off],
      [this.str.language, en ? 'English' : '中文'],
      [this.str.about, 'BlackBerry OS 4.6'],
      [en ? 'Factory reset' : '恢复出厂', ''],
    ]
  }

  private drawMain() {
    this.header(this.str.apps.options!)
    const s = this.ctx.screen
    this.rows().forEach((r, i) => {
      const y = 42 + i * 48
      if (i === this.sel) rr(s, 4, y, 472, 44, 6, C.FIELD_BG)
      s.text(18, y + 12, r[0], { size: 17, color: C.INK })
      if (r[1]) s.textRight(462, y + 13, r[1], { size: 15, color: C.G6 })
      s.fillRect(18, y + 38, 444, 1, C.G2)
    })
  }

  private drawRing() {
    this.header(this.str.ringTone)
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    RINGTONES.forEach((r, i) => {
      const y = 42 + i * 26
      if (i === this.sel) rr(s, 4, y, 472, 24, 4, C.FIELD_BG)
      if (i === this.ringSel) s.text(16, y + 6, '●', { size: 14, color: C.SELECT })
      s.text(40, y + 6, r[en ? 'en' : 'zh'], { size: 15, color: C.INK })
    })
  }

  private drawAbout() {
    this.header(this.str.about)
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    const lines: string[] = en
      ? [
        'BlackBerry Bold 9000',
        'BlackBerry OS 4.6.0',
        'Platform 4.0.0',
        '480x320 half-VGA',
        'PIN: 20B41D90',
        'IMEI: 352---',
      ]
      : [
        'BlackBerry Bold 9000',
        'BlackBerry OS 4.6.0',
        '固件平台 4.0.0',
        '480×320 半 VGA',
        'PIN: 20B41D90',
        'IMEI: 352---',
      ]
    lines.forEach((l, i) => {
      s.text(30, 60 + i * 34, l, { size: 17, color: i === 0 ? C.INK : C.G6 })
    })
  }

  private drawConfirm() {
    this.header(this.ctx.lang.get() === 'en' ? 'Factory reset' : '恢复出厂')
    const s = this.ctx.screen
    s.textCenter(240, 120,
      this.ctx.lang.get() === 'en'
        ? 'Erase all data?'
        : '将清空全部数据，确定？',
      { size: 20, color: C.INK })
    rrStroke(s, 130, 180, 220, 44, 8, C.SELECT)
    s.textCenter(240, 193, this.str.yes + ': OK', { size: 18, color: C.SELECT })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'main') this.mainKey(k)
    else if (this.mode === 'ring') this.ringKey(k)
    else if (this.mode === 'about') return
    else if (this.mode === 'confirm') {
      if (k === 'ok') { void this.doReset(); this.draw() }
    }
  }

  /** 返回键：铃声/关于/恢复出厂确认→主列表；主列表（根）→退出应用 */
  protected onBack(): boolean {
    if (this.mode === 'main') return false
    this.mode = 'main'
    this.sel = 0
    this.draw()
    return true
  }

  private mainKey(k: DeviceKey) {
    const n = 5
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') this.activate()
    else return
    this.draw()
  }

  private activate() {
    if (this.sel === 0) {
      this.mode = 'ring'
      this.sel = this.ringSel
    } else if (this.sel === 1) {
      this.vibe = !this.vibe
      void this.host.setVibe(this.vibe)
    } else if (this.sel === 2) {
      const cur = this.ctx.lang.get()
      this.host.setLang(cur === 'en' ? 'zh' : 'en')
    } else if (this.sel === 3) {
      this.mode = 'about'
    } else {
      this.mode = 'confirm'
    }
  }

  private ringKey(k: DeviceKey) {
    const n = RINGTONES.length
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      this.ringSel = this.sel
      void this.host.setRingtone(this.sel)
      this.preview()
    } else return
    this.draw()
  }

  private preview() {
    this.ctx.audio.melody(RINGTONES[this.sel]!.notes, 168)
  }

  private async doReset() {
    await this.host.factoryReset()
    this.ringSel = 0
    this.vibe = true
    this.mode = 'main'
    this.sel = 0
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    if (this.mode !== 'main') {
      return [{
        label: this.str.back,
        fn: () => { this.mode = 'main'; this.sel = 0; this.draw() },
      }]
    }
    return []
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import {
  RINGTONES, MSG_ALERTS, DEFAULT_TONES,
  type TonesConf, type Note,
} from './tones-data'
import { osStrings } from '../strings'

export type TonesMode = 'ring' | 'volume' | 'alert' | 'msg' | 'key' | 'warn' | 'vibrate'

/**
 * 铃声设置（多模式共享 id 'tones'）：conf 存设备裸键 tones:conf
 * （AppStore 的 'conf' 键 → <dev>:tones:conf，OS 直接监听）。
 */
export function tonesApp(mode: TonesMode): MiniApp {
  return {
    id: 'tones',
    name: '铃声设置',
    nameEn: 'Tones',
    start(ctx: AppContext) {
      switch (mode) {
        case 'ring': new PickListUI(ctx, 'ring'); break
        case 'msg': new PickListUI(ctx, 'msg'); break
        case 'volume': new VolumeUI(ctx); break
        case 'alert': new AlertUI(ctx); break
        case 'key': new ToggleUI(ctx, 'key'); break
        case 'warn': new ToggleUI(ctx, 'warn'); break
        case 'vibrate': new ToggleUI(ctx, 'vibrate'); break
      }
    },
  }
}

const RH = 11

// ---------- 曲目列表（ring / msg）：移动即试听 ----------

class PickListUI {
  private readonly rows: number
  private sel = 0
  private top = 0
  private preview: (() => void) | null = null
  /** 用户自编曲调（动态追加在列表末尾） */
  private userTune: ReadonlyArray<Note> | null = null

  constructor(private ctx: AppContext, private kind: 'ring' | 'msg') {
    this.rows = Math.floor((ctx.screen.h - 11) / RH)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.initList()
  }

  private _conf: TonesConf = { ...DEFAULT_TONES }

  private async initList() {
    const saved = await this.ctx.store.get<TonesConf>('conf')
    if (saved) this._conf = saved
    if (this.kind === 'ring') {
      const raw = await this.ctx.host.getUserTune?.()
      if (raw?.length) this.userTune = raw.map((n) => [n > 0 ? 71 + n : 0, 1] as Note)
    }
    this.sel = Math.min(this.sel, this.items.length - 1)
    this.clamp()
    this.draw()
    this.playPreview()
  }

  private get items(): ReadonlyArray<{ zh: string; en: string; notes?: ReadonlyArray<Note>; bpm?: number }> {
    if (this.kind === 'msg') return MSG_ALERTS
    return this.userTune
      ? [...RINGTONES, { zh: osStrings(this.ctx.lang.get()).tnMyTune, en: 'My tune', notes: this.userTune }]
      : RINGTONES
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.move(-1); break
      case 'down': this.move(1); break
      case 'ok':
      case 'soft1':
        this.playPreview(); break
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit(); break
    }
  }

  private move(d: number) {
    const n = this.items.length
    this.sel = (this.sel + d + n) % n
    this.clamp()
    this.save()
    this.draw()
    this.playPreview()
  }

  private clamp() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  private playPreview() {
    this.preview?.()
    const it = this.items[this.sel]!
    if (!it.notes?.length) return
    this.preview = this.ctx.audio.playMelody(it.notes, it.bpm ?? 200, { volume: 0.5 })
  }

  private save() {
    if (this.kind === 'ring') this._conf.ringIdx = this.sel
    else this._conf.msgIdx = this.sel
    void this.ctx.store.set('conf', this._conf)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const zh = this.ctx.lang.get() === 'zh'
    const W = s.w
    const H = s.h
    s.clear()
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      const it = this.items[i]
      if (!it) break
      const y = r * RH
      s.text(2, y + 1, zh ? it.zh : it.en, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    }
    if (this.items.length > this.rows) {
      const trackH = H - 11
      s.fillRect(W - 1, Math.floor((this.top / this.items.length) * trackH), 1,
        Math.max(2, Math.floor((this.rows / this.items.length) * trackH)))
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- 铃声音量 1–4 ----------

class VolumeUI {
  private conf: TonesConf = { ...DEFAULT_TONES }

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<TonesConf>('conf')
    if (saved) this.conf = saved
    if (this.conf.ringLevel < 1) this.conf.ringLevel = 1
    this.draw()
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up':
      case 'right':
        this.conf.ringLevel = Math.min(4, this.conf.ringLevel + 1)
        break
      case 'down':
      case 'left':
        this.conf.ringLevel = Math.max(1, this.conf.ringLevel - 1)
        break
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit(); return
      default:
        return
    }
    void this.ctx.store.set('conf', this.conf)
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.textCenter(W >> 1, 8, str.tnVolume, { size: 9 })
    // 4 个音量块（点亮数 = 级别）
    const bw = 14
    const gap = 4
    const totalW = 4 * bw + 3 * gap
    const x0 = (W - totalW) >> 1
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (bw + gap)
      if (i < this.conf.ringLevel) s.fillRect(x, 20, bw, 10)
      else s.frameRect(x, 20, bw, 10)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- 来电提醒：连续 / 渐强 / 哔一声 ----------

class AlertUI {
  private conf: TonesConf = { ...DEFAULT_TONES }
  private sel = 0

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<TonesConf>('conf')
    if (saved) this.conf = saved
    this.sel = this.conf.alert === 'ascending' ? 1 : this.conf.alert === 'once' ? 2 : 0
    this.draw()
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.sel = (this.sel + 2) % 3; break
      case 'down': this.sel = (this.sel + 1) % 3; break
      case 'ok':
      case 'soft1':
        this.conf.alert = this.sel === 1 ? 'ascending' : this.sel === 2 ? 'once' : 'ring'
        void this.ctx.store.set('conf', this.conf)
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

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    const labels = [str.tnAlertRing, str.tnAlertAscending, str.tnAlertOnce]
    labels.forEach((label, i) => {
      const y = i * RH
      s.text(2, y + 1, label, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- 开关项（按键音 / 警告音 / 振动） ----------

class ToggleUI {
  private conf: TonesConf = { ...DEFAULT_TONES }

  constructor(private ctx: AppContext, private mode: 'key' | 'warn' | 'vibrate') {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<TonesConf>('conf')
    if (saved) this.conf = saved
    this.draw()
  }

  private get value(): boolean {
    return this.mode === 'key' ? this.conf.keyBeep : this.mode === 'warn' ? this.conf.warnTone : this.conf.vibrate
  }

  private onKey(k: DeviceKey) {
    if (k === 'ok' || k === 'soft1') {
      if (this.mode === 'key') this.conf.keyBeep = !this.conf.keyBeep
      else if (this.mode === 'warn') this.conf.warnTone = !this.conf.warnTone
      else this.conf.vibrate = !this.conf.vibrate
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
    const title =
      this.mode === 'key' ? str.tnKeyTones : this.mode === 'warn' ? str.tnWarnTones : str.tnVibrate
    s.textCenter(W >> 1, (H >> 1) - 12, title, { size: 12 })
    const v = this.value ? str.settingsOn : str.settingsOff
    s.textCenter(W >> 1, (H >> 1) + 2, v, { size: 14 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

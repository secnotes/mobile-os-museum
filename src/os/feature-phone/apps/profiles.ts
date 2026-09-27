import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import {
  PROFILES, DEFAULT_PROFILES, effectiveSettings,
  type ProfilesConf, type ProfileSettings,
} from './profiles-data'
import { osStrings } from '../strings'

export type ProfilesMode = 'list' | 'pers'

/**
 * 情景模式（id 'profiles'，conf 存设备裸键 profiles:conf）：
 * list：5 模式，ok/软1 激活，软2 个性化，clear 退出；
 * pers：编辑某模式的音量/提醒/按键音/振动/短信声，活动模式改完立即生效。
 */
export function profilesApp(mode: ProfilesMode, persIdx = 0): MiniApp {
  return {
    id: 'profiles',
    name: '情景模式',
    nameEn: 'Profiles',
    start(ctx: AppContext) {
      if (mode === 'list') new ProfileListUI(ctx)
      else new PersListUI(ctx, persIdx)
    },
  }
}

const RH = 11

// ---------- 模式列表 ----------

class ProfileListUI {
  private conf: ProfilesConf = { active: DEFAULT_PROFILES.active, pers: [...DEFAULT_PROFILES.pers] }
  private sel = 0
  private top = 0
  private toast = 0
  private readonly rows: number

  constructor(private ctx: AppContext) {
    this.rows = Math.floor((ctx.screen.h - 11) / RH)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.onFrame((dt) => {
      if (this.toast > 0) { this.toast -= dt; if (this.toast <= 0) this.draw() }
    })
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.host.getProfiles?.() as ProfilesConf | undefined
    if (saved) { this.conf = saved; this.sel = saved.active }
    this.clamp()
    this.draw()
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up':
        this.sel = (this.sel + PROFILES.length - 1) % PROFILES.length
        this.clamp(); this.draw(); break
      case 'down':
        this.sel = (this.sel + 1) % PROFILES.length
        this.clamp(); this.draw(); break
      case 'ok':
      case 'soft1':
        this.conf.active = this.sel
        void this.ctx.host.saveProfiles?.(this.conf, true)
        this.toast = 1.2
        this.draw(); break
      case 'soft2':
        this.ctx.host.relaunch?.(profilesApp('pers', this.sel)); break
      case 'back':
      case 'clear':
        this.ctx.exit(); break
    }
  }

  private clamp() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  private draw() {
    const s = this.ctx.screen
    const zh = this.ctx.lang.get() === 'zh'
    const W = s.w
    const H = s.h
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= PROFILES.length) break
      const p = PROFILES[i]!
      const y = r * RH
      s.text(2, y + 1, zh ? p.zh : p.en, { size: 9 })
      if (i === this.conf.active) s.textRight(W - 2, y + 1, '√', { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    }
    if (PROFILES.length > this.rows) {
      const trackH = H - 11
      s.fillRect(W - 1, Math.floor((this.top / PROFILES.length) * trackH), 1,
        Math.max(2, Math.floor((this.rows / PROFILES.length) * trackH)))
    }
    if (this.toast > 0) {
      const name = zh ? PROFILES[this.sel]!.zh : PROFILES[this.sel]!.en
      s.frameRect(4, (H >> 1) - 8, W - 8, 16)
      s.textCenter(W >> 1, (H >> 1) - 4, `${str.pfSelected} ${name}`, { size: 9 })
    }
    // 底部三键：选择 / 个性化 / 退出
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textCenter(W >> 1, H - 10, str.pfPersonalise, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- 个性化编辑 ----------

class PersListUI {
  private readonly rows: number
  private conf: ProfilesConf = { ...DEFAULT_PROFILES }
  private idx: number
  private sel = 0
  private top = 0
  /** 5 个设置行 */
  private static readonly N = 5

  constructor(private ctx: AppContext, persIdx: number) {
    this.idx = persIdx
    this.rows = Math.floor((ctx.screen.h - 11) / RH)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.host.getProfiles?.() as ProfilesConf | undefined
    if (saved) this.conf = saved
    if (!this.conf.pers[this.idx])
      this.conf.pers[this.idx] = { ...effectiveSettings(this.conf, this.idx) }
    this.draw()
  }

  private get st(): ProfileSettings {
    return this.conf.pers[this.idx]!
  }

  private onKey(k: DeviceKey) {
    const cycleAlert = (d: number) => {
      const opts: ProfileSettings['alert'][] = ['ring', 'ascending', 'once']
      const i = opts.indexOf(this.st.alert)
      this.st.alert = opts[(i + d + 3) % 3]!
    }
    let changed = false
    switch (k) {
      case 'up':
        this.sel = (this.sel + PersListUI.N - 1) % PersListUI.N; this.clamp(); this.draw(); return
      case 'down':
        this.sel = (this.sel + 1) % PersListUI.N; this.clamp(); this.draw(); return
      case 'left': changed = true
        if (this.sel === 0) this.st.ringLevel = (this.st.ringLevel + 3) % 5
        else if (this.sel === 1) cycleAlert(-1)
        else if (this.sel === 2) this.st.keyBeep = !this.st.keyBeep
        else if (this.sel === 3) this.st.vibrate = !this.st.vibrate
        else this.st.msgSound = !this.st.msgSound
        break
      case 'right': changed = true
        if (this.sel === 0) this.st.ringLevel = (this.st.ringLevel + 1) % 5
        else if (this.sel === 1) cycleAlert(1)
        else if (this.sel === 2) this.st.keyBeep = !this.st.keyBeep
        else if (this.sel === 3) this.st.vibrate = !this.st.vibrate
        else this.st.msgSound = !this.st.msgSound
        break
      case 'ok':
      case 'soft1':
        changed = true
        if (this.sel === 0) this.st.ringLevel = (this.st.ringLevel + 1) % 5
        else if (this.sel === 1) cycleAlert(1)
        else if (this.sel === 2) this.st.keyBeep = !this.st.keyBeep
        else if (this.sel === 3) this.st.vibrate = !this.st.vibrate
        else this.st.msgSound = !this.st.msgSound
        break
      case 'soft2':
      case 'back':
      case 'clear':
        this.ctx.host.relaunch?.(profilesApp('list')); return
      default:
        return
    }
    if (changed) void this.commit()
    this.draw()
  }

  private async commit() {
    // 编辑的是活动模式 → 保存并立即重新应用
    await this.ctx.host.saveProfiles?.(this.conf, this.idx === this.conf.active)
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
    const st = this.st
    const val = (i: number): string => {
      switch (i) {
        case 0: return st.ringLevel === 0 ? str.pfLevel0 : String(st.ringLevel)
        case 1:
          return st.alert === 'ring' ? str.tnAlertRing
            : st.alert === 'ascending' ? str.tnAlertAscending : str.tnAlertOnce
        case 2: return st.keyBeep ? str.settingsOn : str.settingsOff
        case 3: return st.vibrate ? str.settingsOn : str.settingsOff
        default: return st.msgSound ? str.settingsOn : str.settingsOff
      }
    }
    const labels = [str.pfVol, str.pfAlert, str.tnKeyTones, str.tnVibrate, str.pfMsg]
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= PersListUI.N) break
      const y = r * RH
      s.text(2, y + 1, labels[i], { size: 9 })
      s.textRight(W - 2, y + 1, val(i), { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    }
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

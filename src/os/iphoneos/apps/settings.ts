import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrStroke, gloss } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconSettings } from '../icons'
import { drawSwitch } from '../widgets'
import { Scroller } from '../scroll'

type View =
  | 'root' | 'wifi' | 'sounds' | 'ringtone' | 'brightness'
  | 'general' | 'about' | 'intl' | 'language' | 'datetime' | 'autolock'
  | 'wallpaper' | 'mailset' | 'phoneset' | 'safariset' | 'ipodset' | 'photoset'

interface SetState {
  airplane: boolean
  wifiOn: boolean
  wifiSel: number
  bluetooth: boolean
  ringIdx: number
  vibRing: boolean
  vibSilent: boolean
  brightness: number
  autoLock: number
  h24: boolean
  autoTime: boolean
  wallpaper: number
  mailFetch: boolean
  mailBcc: boolean
  callWaiting: boolean
  callerId: boolean
  js: boolean
  blockPlugins: boolean
  cookies: boolean
  soundCheck: boolean
  enhance: boolean
}

const AL = [1, 2, 3, 4, 0]

// 分组圆角表布局常量（真机 1.0 grouped table：灰底 + 白色圆角组）
const GX = 10
const GW = 300
const RH = 44
const GAP = 20
const TOP = 78
const HDR = 18

type RowAct =
  | { kind: 'nav'; view: View }
  | { kind: 'switch'; get: () => boolean; set: () => void }
  | { kind: 'check'; get: () => boolean; set: () => void }
  | { kind: 'value' }
  | { kind: 'none' }

interface Row {
  label: string
  act: RowAct
  value?: () => string
}

interface Group {
  header?: string
  rows: Row[]
}

/**
 * Settings：真机 1.0 为分组圆角表（灰底 + 白色圆角组，行首无图标——
 * 行首彩色图标是 iOS 7 才有的）；石墨灰导航栏。
 */
class SettingsApp extends IphoneApp {
  private view: View = 'root'
  private sc = new Scroller(() => this.draw())
  private st: SetState = {
    airplane: false, wifiOn: true, wifiSel: 0, bluetooth: false, ringIdx: 0,
    vibRing: true, vibSilent: false, brightness: 0.65, autoLock: 1, h24: false, autoTime: true,
    wallpaper: 0, mailFetch: true, mailBcc: false, callWaiting: true, callerId: true,
    js: true, blockPlugins: false, cookies: true, soundCheck: false, enhance: true,
  }

  start() {
    super.start()
    void this.ctx.store.get<SetState>('settings').then((v) => {
      if (v) {
        this.st = { ...this.st, ...v }
        this.bridge.setRingIdx(v.ringIdx ?? 0)
        this.draw()
      }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.KB_BG)
    this.drawSetBar(s)
    statusBar(s, { dark: false, onBar: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'brightness') {
      s.fillRect(0, 64, 320, 416, C.KB_BG)
      this.drawBrightness(s)
      s.render()
      return
    }
    const groups = this.groupsFor()
    this.sc.setContent(this.contentH(groups), 480 - 64)
    let y = TOP - this.sc.offset
    for (const g of groups) {
      if (g.header) {
        if (y > 60 && y < 480)
          s.text(GX + 12, y + 2, g.header, { size: 13, font: F_BOLD(13), color: C.HDR_GRAY })
        y += HDR
      }
      const gh = g.rows.length * RH
      if (y + gh > 64 && y < 480) {
        rr(s, GX, y, GW, gh, 9, C.WHITE)
        rrStroke(s, GX, y, GW, gh, 9, C.GRAY5)
        g.rows.forEach((r, i) => this.drawRow(s, r, y + i * RH, i < g.rows.length - 1))
      }
      y += gh + GAP
    }
    s.render()
  }

  private drawRow(s: Screen, r: Row, ry: number, sep: boolean) {
    if (ry + RH < 64 || ry > 480) return
    s.text(GX + 12, ry + 12, r.label, { size: 18, font: F_REG(18), color: C.INK })
    const cy = ry + 22
    if (r.act.kind === 'nav') {
      const v = r.value?.()
      if (v) s.textRight(282, ry + 13, v, { size: 14, font: F_REG(14), color: C.GRAY3 })
      this.chevron(s, cy)
    } else if (r.act.kind === 'switch') {
      drawSwitch(s, 250, ry + 8, r.act.get())
    } else if (r.act.kind === 'check' && r.act.get()) {
      this.check(s, 288, cy)
    } else if (r.act.kind === 'value' || r.act.kind === 'none') {
      const v = r.value?.()
      if (v) s.textRight(296, ry + 12, v, { size: 15, font: F_REG(15), color: C.GRAY3 })
    }
    if (sep) s.fillRect(GX + 12, ry + RH - 1, GW - 24, 1, C.GRAY6)
  }

  private contentH(groups: Group[]): number {
    let h = TOP - 64
    for (const g of groups) h += (g.header ? HDR : 0) + g.rows.length * RH + GAP
    return h
  }

  /** 石墨灰导航栏（含状态栏区域，共 64px） */
  private drawSetBar(s: Screen) {
    const [start, n] = R.SET_NAV
    for (let j = 0; j < 64; j++) {
      const t = Math.floor((j / 63) * (n - 1))
      s.fillRect(0, j, 320, 1, start + t)
    }
    gloss(s, 0, 20, 320, 44, 0, C.WHITE, 3)
    s.fillRect(0, 63, 320, 1, C.GRAY2)
    const spec = this.barSpec()
    s.textCenter(160, 32, spec.title, { size: 19, font: F_BOLD(19), color: C.WHITE })
    if (spec.back !== undefined) {
      const label = spec.back.length > 9 ? spec.back.slice(0, 9) : spec.back
      const w = Math.max(52, s.measure(label, { size: 13, font: F_REG(13) }) + 22)
      rrStroke(s, 6, 27, w, 30, 5, C.WHITE)
      for (let t = -1; t <= 1; t++) {
        s.line(16, 36 + t, 11, 42 + t, C.WHITE)
        s.line(11, 42 + t, 16, 48 + t, C.WHITE)
      }
      s.text(20, 35, label, { size: 13, font: F_REG(13), color: C.WHITE })
    }
  }

  private barSpec(): { title: string; back?: string } {
    switch (this.view) {
      case 'root': return { title: this.str.apps.settings }
      case 'wifi': return { title: this.str.wifi, back: this.str.apps.settings }
      case 'sounds': return { title: this.str.sounds, back: this.str.apps.settings }
      case 'ringtone': return { title: this.str.ringtones, back: this.str.sounds }
      case 'brightness': return { title: this.str.brightness, back: this.str.apps.settings }
      case 'general': return { title: this.str.general, back: this.str.apps.settings }
      case 'about': return { title: this.str.about, back: this.str.general }
      case 'intl': return { title: this.str.international, back: this.str.general }
      case 'language': return { title: this.str.language, back: this.str.international }
      case 'datetime': return { title: this.str.dateTime, back: this.str.general }
      case 'autolock': return { title: this.str.autoLock, back: this.str.general }
      case 'wallpaper': return { title: this.str.setWallpaper, back: this.str.apps.settings }
      case 'mailset': return { title: this.str.apps.mail, back: this.str.apps.settings }
      case 'phoneset': return { title: this.str.apps.phone, back: this.str.apps.settings }
      case 'safariset': return { title: this.str.apps.safari, back: this.str.apps.settings }
      case 'ipodset': return { title: this.str.apps.ipod, back: this.str.apps.settings }
      case 'photoset': return { title: this.str.apps.photos, back: this.str.apps.settings }
    }
  }

  private chevron(s: Screen, cy: number) {
    s.line(292, cy - 6, 298, cy, C.GRAY4)
    s.line(298, cy, 292, cy + 6, C.GRAY4)
  }
  private check(s: Screen, x: number, cy: number) {
    s.line(x, cy, x + 5, cy + 6, C.BLUE)
    s.line(x + 5, cy + 6, x + 14, cy - 6, C.BLUE)
  }

  private drawBrightness(s: Screen) {
    const x = 42, w = 272, y = 120
    s.fillRect(x, y + 6, w, 8, C.GRAY5)
    const fill = Math.round(w * this.st.brightness)
    s.fillRect(x, y + 6, fill, 8, C.WHITE)
    s.fillRect(x + fill - 2, y, 4, 20, C.WHITE)
  }

  // ---------- 行定义 ----------

  private groupsFor(): Group[] {
    const st = this.st
    const s = this.str
    const nav = (view: View): RowAct => ({ kind: 'nav', view })
    const sw = (get: () => boolean, set: () => void): RowAct => ({ kind: 'switch', get, set })
    const ck = (get: () => boolean, set: () => void): RowAct => ({ kind: 'check', get, set })
    switch (this.view) {
      case 'root':
        return [
          { rows: [
            { label: s.airplane, act: sw(() => st.airplane, () => { st.airplane = !st.airplane }) },
            { label: s.wifi, value: () => (st.wifiOn ? s.wifiNetworks[st.wifiSel] : s.off), act: nav('wifi') },
            { label: s.bluetooth, act: sw(() => st.bluetooth, () => { st.bluetooth = !st.bluetooth }) },
          ] },
          { rows: [
            { label: s.sounds, act: nav('sounds') },
            { label: s.brightness, act: nav('brightness') },
            { label: s.setWallpaper, act: nav('wallpaper') },
          ] },
          { rows: [{ label: s.general, act: nav('general') }] },
          { rows: [
            { label: s.apps.mail, act: nav('mailset') },
            { label: s.apps.phone, act: nav('phoneset') },
            { label: s.apps.safari, act: nav('safariset') },
            { label: s.apps.ipod, act: nav('ipodset') },
            { label: s.apps.photos, act: nav('photoset') },
          ] },
        ]
      case 'wifi':
        return [
          { rows: [{ label: s.wifi, act: sw(() => st.wifiOn, () => { st.wifiOn = !st.wifiOn }) }] },
          {
            header: s.wifi,
            rows: [0, 1].map((i): Row => ({
              label: s.wifiNetworks[i]!,
              act: ck(() => st.wifiOn && st.wifiSel === i, () => { st.wifiSel = i }),
            })),
          },
        ]
      case 'sounds':
        return [
          { rows: [{ label: s.ringtones, value: () => s.ringtoneNames[st.ringIdx], act: nav('ringtone') }] },
          { rows: [
            { label: s.vibRing, act: sw(() => st.vibRing, () => { st.vibRing = !st.vibRing }) },
            { label: s.vibSilent, act: sw(() => st.vibSilent, () => { st.vibSilent = !st.vibSilent }) },
          ] },
        ]
      case 'ringtone':
        return [{ rows: [0, 1, 2, 3].map((i): Row => ({
          label: s.ringtoneNames[i]!,
          act: ck(() => st.ringIdx === i, () => { st.ringIdx = i }),
        })) }]
      case 'general':
        return [
          { rows: [{ label: s.about, act: nav('about') }] },
          { rows: [
            { label: s.dateTime, act: nav('datetime') },
            { label: s.international, act: nav('intl') },
            {
              label: s.autoLock,
              value: () => (AL[st.autoLock] ? AL[st.autoLock] + ' min' : 'Never'),
              act: nav('autolock'),
            },
          ] },
        ]
      case 'about':
        return [{ rows: [
          ['Name', 'My iPhone'], ['Songs', '4'], ['Videos', '3'],
          ['Photos', String(this.bridge.photos().length)],
          ['Version', '1.0 (1A543a)'], ['Model', 'A1203'],
          ['Carrier', 'AT&T 4.0'], ['Capacity', '8 GB'],
        ].map(([label, v]): Row => ({
          label: label!, value: () => v, act: { kind: 'value' },
        })) }]
      case 'intl':
        return [{ rows: [
          {
            label: s.language,
            value: () => (this.ctx.lang.get() === 'zh' ? '简体中文' : 'English'),
            act: nav('language'),
          },
          {
            label: 'Region Format',
            value: () => (this.ctx.lang.get() === 'zh' ? '中国' : 'United States'),
            act: { kind: 'none' },
          },
        ] }]
      case 'language':
        return [{ rows: [
          { label: '简体中文', act: ck(() => this.ctx.lang.get() === 'zh', () => this.bridge.setLang('zh')) },
          { label: 'English', act: ck(() => this.ctx.lang.get() === 'en', () => this.bridge.setLang('en')) },
        ] }]
      case 'datetime':
        return [{ rows: [
          { label: '24-Hour Time', act: sw(() => st.h24, () => { st.h24 = !st.h24 }) },
          { label: 'Set Automatically', act: sw(() => st.autoTime, () => { st.autoTime = !st.autoTime }) },
        ] }]
      case 'autolock':
        return [{ rows: AL.map((mm, i): Row => ({
          label: mm ? mm + ' min' : 'Never',
          act: ck(() => st.autoLock === i, () => { st.autoLock = i }),
        })) }]
      case 'wallpaper':
        return [{ rows: [0, 1, 2].map((i): Row => ({
          label: s.wallpaperNames[i]!,
          act: ck(() => st.wallpaper === i, () => { st.wallpaper = i }),
        })) }]
      case 'mailset':
        return [{ rows: [
          { label: s.mailFetch, act: sw(() => st.mailFetch, () => { st.mailFetch = !st.mailFetch }) },
          { label: s.mailBcc, act: sw(() => st.mailBcc, () => { st.mailBcc = !st.mailBcc }) },
        ] }]
      case 'phoneset':
        return [{ rows: [
          { label: s.callWaiting, act: sw(() => st.callWaiting, () => { st.callWaiting = !st.callWaiting }) },
          { label: s.callerId, act: sw(() => st.callerId, () => { st.callerId = !st.callerId }) },
        ] }]
      case 'safariset':
        return [{ rows: [
          { label: s.js, act: sw(() => st.js, () => { st.js = !st.js }) },
          { label: s.blockPlugins, act: sw(() => st.blockPlugins, () => { st.blockPlugins = !st.blockPlugins }) },
          { label: s.cookies, act: sw(() => st.cookies, () => { st.cookies = !st.cookies }) },
        ] }]
      case 'ipodset':
        return [{ rows: [
          { label: s.soundCheck, act: sw(() => st.soundCheck, () => { st.soundCheck = !st.soundCheck }) },
        ] }]
      case 'photoset':
        return [{ rows: [
          { label: s.enhance, act: sw(() => st.enhance, () => { st.enhance = !st.enhance }) },
        ] }]
      case 'brightness':
        return []
    }
  }

  // ---------- 交互 ----------

  protected statusTap(): boolean {
    if (this.view === 'brightness') return false
    this.sc.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    if (y < 64) {
      if (x < 90 && this.view !== 'root') this.goBack()
      return
    }
    if (this.view === 'brightness') {
      if (y >= 110 && y < 140) {
        this.st.brightness = Math.max(0, Math.min(1, (x - 42) / 272))
        this.save()
        this.draw()
      }
      return
    }
    const hit = this.rowAt(y)
    if (!hit) return
    const a = hit.act
    if (a.kind === 'nav') {
      this.rowPress(() => { this.view = a.view; this.sc.offset = 0; this.draw() })
    } else if (a.kind === 'switch' && x >= 242) { a.set(); this.save(); this.draw() }
    else if (a.kind === 'check') {
      a.set()
      if (this.view === 'ringtone') this.bridge.setRingIdx(this.st.ringIdx)
      if (this.view === 'wallpaper') this.bridge.setWallpaper(this.st.wallpaper)
      this.save()
      this.draw()
    }
  }

  /** y 坐标 → 行（与 draw 的布局一致） */
  private rowAt(y: number): Row | null {
    let gy = TOP - this.sc.offset
    for (const g of this.groupsFor()) {
      if (g.header) gy += HDR
      const gh = g.rows.length * RH
      if (y >= gy && y < gy + gh) return g.rows[Math.floor((y - gy) / RH)] ?? null
      gy += gh + GAP
    }
    return null
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.view !== 'brightness' && y > 64) this.sc.onDrag(y, sy)
  }
  protected dragEnd() {
    this.sc.onEnd()
  }

  protected frame(dt: number) {
    super.frame(dt)
    if (this.sc.step(dt)) return
  }

  private goBack() {
    const back: Partial<Record<View, View>> = {
      wifi: 'root', sounds: 'root', ringtone: 'sounds', brightness: 'root',
      general: 'root', about: 'general', intl: 'general', language: 'intl',
      datetime: 'general', autolock: 'general', wallpaper: 'root',
      mailset: 'root', phoneset: 'root', safariset: 'root', ipodset: 'root', photoset: 'root',
    }
    this.view = back[this.view] ?? 'root'
    this.draw()
  }

  private save() {
    this.ctx.store.set('settings', this.st)
  }
}

export const settingsFactory = miniApp('settings', 'Settings', iconSettings, (ctx, b) => new SettingsApp(ctx, b))

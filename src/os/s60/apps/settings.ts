import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { RINGTONE_NAMES } from '../assets'
import { W, H, CONTENT_TOP, titleBar, softBar, clearContent, disc } from '../ui'

/**
 * 设置（B6 drill-down 树）：
 * 情景模式（+个性化）· 主题模式 · 日期和时间 · 手机设置（+通话/连接）·
 * 安全性设置（保密码 12345）· 恢复出厂设置（12345）。
 * 全部写入应用键 'conf'（设备键 settings:conf），OS watchStore 即时接管。
 */
const SEC_CODE = '12345'

export const settingsApp: MiniApp = {
  id: 'settings',
  name: '设置',
  nameEn: 'Settings',
  icon(s, x, y) {
    // 深底琥珀齿轮：圆环 + 四齿
    s.fillRect(x, y, 44, 44, C.DARK)
    s.fillRect(x + 19, y + 5, 6, 8, C.AMBER)
    s.fillRect(x + 19, y + 31, 6, 8, C.AMBER)
    s.fillRect(x + 5, y + 19, 8, 6, C.AMBER)
    s.fillRect(x + 31, y + 19, 8, 6, C.AMBER)
    disc(s, x + 22, y + 22, 11, C.AMBER)
    disc(s, x + 22, y + 22, 6, C.DARK)
  },
  start(ctx: AppContext) {
    const ui = new SettingsUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type Conf = S60ConfShape

interface S60ConfShape {
  wallpaper: number
  keyBeep: boolean
  ringtone: number
  profile: number
  activeStandby: boolean
  autoLock: boolean
  ringVolume: number
  vibration: boolean
  msgTone: boolean
  warnTone: boolean
  hour24: boolean
  brightness: number
  fontSize: number
  callWaiting: boolean
  callForward: boolean
  sendId: boolean
  bluetooth: boolean
  pinReq: boolean
  packetAlways: boolean
  autoTime: boolean
  /** 时钟调整（前端无系统时钟 API，存内部偏好；缺省跟随当前时刻） */
  adjHour: number
  adjMinute: number
}

function defaults(): Conf {
  const d = new Date()
  return {
    wallpaper: 0, keyBeep: true, ringtone: 0, profile: 0, activeStandby: true, autoLock: false,
    ringVolume: 7, vibration: true, msgTone: true, warnTone: true, hour24: true,
    brightness: 3, fontSize: 0, callWaiting: false, callForward: false, sendId: true,
    bluetooth: false, pinReq: false, packetAlways: false, autoTime: false,
    adjHour: d.getHours(), adjMinute: d.getMinutes(),
  }
}

// ---------- 页面模型 ----------

type PageKey = 'root' | 'profiles' | 'profilepers' | 'themes' | 'datetime'
  | 'phone' | 'call' | 'conn' | 'security'

interface Row {
  label: string
  value: () => string
  /** ok/right：打开或就地正向切换 */
  onOpen?: () => void
  /** left/right：就地改值（无 onOpen 时 right 也走 +1） */
  onChange?: (dir: 1 | -1) => void
}

interface Page {
  key: PageKey
  sel: number
}

class SettingsUI {
  private conf: Conf = defaults()
  private stack: Page[] = [{ key: 'root', sel: 0 }]
  /** 保密码输入（null=无弹层） */
  private codeTarget: 'reset' | 'seccode' | null = null
  private codeDraft = ''
  /** 居中提示框 */
  private note: string | null = null
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  async init() {
    const saved = await this.ctx.store.get<Partial<Conf>>('conf')
    this.conf = { ...defaults(), ...saved }
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  // ---------- 输入 ----------

  private onKey(k: DeviceKey) {
    if (this.note !== null) {
      this.note = null
      this.draw()
      return
    }
    if (this.codeTarget !== null) return this.codeKey(k)
    const page = this.stack[this.stack.length - 1]!
    const rows = this.rowsFor(page.key)
    const n = rows.length
    switch (k) {
      case 'up': page.sel = (page.sel + n - 1) % n; break
      case 'down': page.sel = (page.sel + 1) % n; break
      case 'ok': case 'right': case 'soft1': {
        const row = rows[page.sel]!
        if (row.onOpen) row.onOpen()
        else if (row.onChange) row.onChange(1)
        break
      }
      case 'left': {
        rows[page.sel]?.onChange?.(-1)
        break
      }
      case 'soft2': case 'back':
        this.goBack()
        return
      default: return
    }
    this.draw()
  }

  private goBack() {
    if (this.stack.length === 1) this.ctx.exit()
    else this.stack.pop()
  }

  private open(key: PageKey) {
    this.stack.push({ key, sel: 0 })
  }

  private persist() {
    void this.ctx.store.set('conf', this.conf)
  }

  /** 试听铃声 */
  private previewRingtone() {
    const r = RINGTONE_NAMES[this.conf.ringtone]!
    this.ctx.audio.unlock()
    if (this.conf.ringtone === 0 && this.ctx.audio.hasFile('nokia_tune')) {
      this.ctx.audio.playFile('nokia_tune', { volume: 0.6 })
    } else if (r.synth) {
      this.ctx.audio.melody(r.synth, 160)
    }
  }

  // ---------- 保密码 ----------

  private codeKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      if (this.codeDraft.length < 5) this.codeDraft += k
    } else switch (k) {
      case 'clear': this.codeDraft = this.codeDraft.slice(0, -1); break
      case 'ok': case 'soft1': this.submitCode(); return
      case 'soft2': case 'back': this.codeTarget = null; break
      default: return
    }
    this.draw()
  }

  private submitCode() {
    const target = this.codeTarget
    this.codeTarget = null
    if (this.codeDraft !== SEC_CODE) {
      this.codeDraft = ''
      this.note = this.s().codeBad
      this.draw()
      return
    }
    this.codeDraft = ''
    if (target === 'reset') {
      void this.doReset()
    } else {
      this.note = this.s().codeOk
      this.draw()
    }
  }

  private async doReset() {
    const conf = defaults()
    await this.ctx.host.factoryReset?.(conf)
    this.conf = conf
    this.note = this.s().resetDone
    this.stack = [{ key: 'root', sel: 0 }]
    this.draw()
  }

  // ---------- 行定义 ----------

  private s() { return s60Strings(this.ctx.lang.get()) }

  private rowsFor(key: PageKey): Row[] {
    const str = this.s()
    const en = this.ctx.lang.get() === 'en'
    const toggle = (get: () => boolean, set: (v: boolean) => void): Row['onChange'] =>
      () => { set(!get()); this.persist() }
    const cycle = (get: () => number, set: (v: number) => void, n: number,
      after?: () => void): Row['onChange'] =>
      (dir) => { set((get() + (dir === 1 ? 1 : n - 1)) % n); after?.(); this.persist() }
    const onOff = (v: boolean) => v ? str.setOn : str.setOff

    switch (key) {
      case 'root':
        return [
          { label: str.setProfiles, value: () => str.profileNames[this.conf.profile]!, onOpen: () => this.open('profiles') },
          { label: str.setThemes, value: () => str.wallpapers[this.conf.wallpaper]!, onOpen: () => this.open('themes') },
          { label: str.setDateTime, value: () => str.setHour24, onOpen: () => this.open('datetime') },
          { label: str.setPhone, value: () => str.setCallSet, onOpen: () => this.open('phone') },
          { label: str.setSecurity, value: () => str.setPinReq, onOpen: () => this.open('security') },
          {
            label: str.setFactory, value: () => '',
            onOpen: () => { this.codeTarget = 'reset'; this.codeDraft = '' },
          },
        ]
      case 'profiles':
        return str.profileNames.map((name, i) => ({
          label: name,
          value: () => this.conf.profile === i ? '✓' : '',
          onOpen: () => {
            this.conf.profile = i
            this.persist()
            this.open('profilepers')
          },
        }))
      case 'profilepers':
        return [
          {
            label: str.setRingtone,
            value: () => en ? RINGTONE_NAMES[this.conf.ringtone]!.en : RINGTONE_NAMES[this.conf.ringtone]!.zh,
            onChange: cycle(() => this.conf.ringtone, (v) => (this.conf.ringtone = v),
              RINGTONE_NAMES.length, () => this.previewRingtone()),
          },
          {
            label: str.setRingVolume, value: () => `${this.conf.ringVolume}`,
            onChange: (dir) => {
              this.conf.ringVolume = Math.max(1, Math.min(10, this.conf.ringVolume + dir))
              this.persist()
            },
          },
          { label: str.setVibration, value: () => onOff(this.conf.vibration),
            onChange: toggle(() => this.conf.vibration, (v) => (this.conf.vibration = v)) },
          { label: str.setKeyBeep, value: () => onOff(this.conf.keyBeep),
            onChange: toggle(() => this.conf.keyBeep, (v) => (this.conf.keyBeep = v)) },
          { label: str.setMsgTone, value: () => onOff(this.conf.msgTone),
            onChange: toggle(() => this.conf.msgTone, (v) => (this.conf.msgTone = v)) },
          { label: str.setWarnTone, value: () => onOff(this.conf.warnTone),
            onChange: toggle(() => this.conf.warnTone, (v) => (this.conf.warnTone = v)) },
        ]
      case 'themes':
        return [
          { label: str.setWallpaper, value: () => str.wallpapers[this.conf.wallpaper]!,
            onChange: cycle(() => this.conf.wallpaper, (v) => (this.conf.wallpaper = v), 3) },
          { label: str.setFontSize, value: () => str.fontSizes[this.conf.fontSize]!,
            onChange: cycle(() => this.conf.fontSize, (v) => (this.conf.fontSize = v), 2) },
        ]
      case 'datetime':
        return [
          { label: str.setHour24, value: () => onOff(this.conf.hour24),
            onChange: toggle(() => this.conf.hour24, (v) => (this.conf.hour24 = v)) },
          {
            label: str.setHour, value: () => String(this.conf.adjHour).padStart(2, '0'),
            onChange: (dir) => {
              this.conf.adjHour = (this.conf.adjHour + (dir === 1 ? 1 : 23)) % 24
              this.persist()
            },
          },
          {
            label: str.setMinute, value: () => String(this.conf.adjMinute).padStart(2, '0'),
            onChange: (dir) => {
              this.conf.adjMinute = (this.conf.adjMinute + (dir === 1 ? 1 : 59)) % 60
              this.persist()
            },
          },
          { label: str.setAutoTime, value: () => onOff(this.conf.autoTime),
            onChange: toggle(() => this.conf.autoTime, (v) => (this.conf.autoTime = v)) },
        ]
      case 'phone':
        return [
          { label: str.setActiveStandby, value: () => onOff(this.conf.activeStandby),
            onChange: toggle(() => this.conf.activeStandby, (v) => (this.conf.activeStandby = v)) },
          { label: str.setAutoLock, value: () => onOff(this.conf.autoLock),
            onChange: toggle(() => this.conf.autoLock, (v) => (this.conf.autoLock = v)) },
          { label: str.setBrightness, value: () => str.brightnessV[this.conf.brightness]!,
            onChange: cycle(() => this.conf.brightness, (v) => (this.conf.brightness = v), 4) },
          {
            label: str.setLanguage,
            value: () => en ? 'English' : '简体中文',
            onOpen: () => {
              const next = en ? 'zh' : 'en'
              this.ctx.host.setLang?.(next)
            },
          },
          { label: str.setCallSet, value: () => '', onOpen: () => this.open('call') },
          { label: str.setConnSet, value: () => '', onOpen: () => this.open('conn') },
        ]
      case 'call':
        return [
          { label: str.setCallWaiting, value: () => onOff(this.conf.callWaiting),
            onChange: toggle(() => this.conf.callWaiting, (v) => (this.conf.callWaiting = v)) },
          { label: str.setCallForward, value: () => onOff(this.conf.callForward),
            onChange: toggle(() => this.conf.callForward, (v) => (this.conf.callForward = v)) },
          { label: str.setSendId, value: () => onOff(this.conf.sendId),
            onChange: toggle(() => this.conf.sendId, (v) => (this.conf.sendId = v)) },
        ]
      case 'conn':
        return [
          { label: str.setBluetooth, value: () => onOff(this.conf.bluetooth),
            onChange: toggle(() => this.conf.bluetooth, (v) => (this.conf.bluetooth = v)) },
          { label: str.setPacketData, value: () => str.packetDataV[this.conf.packetAlways ? 0 : 1]!,
            onChange: toggle(() => this.conf.packetAlways, (v) => (this.conf.packetAlways = v)),
          },
        ]
      case 'security':
        return [
          { label: str.setPinReq, value: () => onOff(this.conf.pinReq),
            onChange: toggle(() => this.conf.pinReq, (v) => (this.conf.pinReq = v)) },
          {
            label: str.setSecCode, value: () => SEC_CODE.replace(/./g, '*'),
            onOpen: () => { this.codeTarget = 'seccode'; this.codeDraft = '' },
          },
        ]
    }
  }

  // ---------- 绘制 ----------

  private titleFor(key: PageKey): string {
    const str = this.s()
    switch (key) {
      case 'root': return str.setTitle
      case 'profiles': return str.setProfiles
      case 'profilepers': return str.setProfiles
      case 'themes': return str.setThemes
      case 'datetime': return str.setDateTime
      case 'phone': return str.setPhone
      case 'call': return str.setCallSet
      case 'conn': return str.setConnSet
      case 'security': return str.setSecurity
    }
  }

  private draw() {
    const s = this.ctx.screen
    const str = this.s()
    clearContent(s)
    const page = this.stack[this.stack.length - 1]!
    titleBar(s, this.titleFor(page.key))
    const rows = this.rowsFor(page.key)
    const ROW_H = Math.min(34, Math.floor(230 / rows.length))
    rows.forEach((r, i) => {
      const y = CONTENT_TOP + 10 + i * ROW_H
      const selRow = i === page.sel
      if (selRow) s.fillRect(4, y - 3, W - 8, ROW_H - 4, C.BLUE)
      s.text(14, y, r.label, { size: 13, color: selRow ? C.WHITE : C.INK })
      const val = r.value()
      if (val) s.textRight(W - 14, y + 1, val, { size: 12, color: selRow ? C.AMBER : C.BLUE })
    })
    softBar(s, str.contactsBack === 'Back' ? 'Select' : '选择', str.contactsBack)
    if (this.codeTarget !== null) this.drawCode()
    if (this.note !== null) this.drawNote(this.note)
  }

  private drawCode() {
    const s = this.ctx.screen
    const str = this.s()
    // 调暗 + 输入面板
    s.fillRect(0, 0, W, H, C.DARK)
    s.fillRect(20, 110, W - 40, 90, C.WHITE)
    s.textCenter(W / 2, 124, str.codeTitle, { size: 13, color: C.INK })
    s.textCenter(W / 2, 156, this.codeDraft.replace(/./g, '*') || '—',
      { size: 24, color: C.BLUE })
    s.textCenter(W / 2, 184, 'OK', { size: 10, color: C.GRAY })
  }

  private drawNote(text: string) {
    const s = this.ctx.screen
    const w = 180
    const x = (W - w) / 2
    const y = 120
    s.fillRect(x - 2, y - 2, w + 4, 56, C.GRAY)
    s.fillRect(x, y, w, 52, C.WHITE)
    s.textCenter(W / 2, y + 20, text, { size: 13, color: C.INK })
    s.textCenter(W / 2, y + 38, this.s().aboutAnyKey, { size: 9, color: C.GRAY })
  }
}

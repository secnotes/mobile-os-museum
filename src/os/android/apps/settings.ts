import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import type { AndroidStrings } from '../strings'
import { C } from '../palette'
import { assets, RINGTONE_NAMES } from '../assets'
import { W, H, STATUS_H, statusBar, roundRect, clipToWidth, iconTile } from '../ui'
import { APPS } from './registry'

/**
 * Android 1.0 设置：真机 1.0 固件恰为八大项 ——
 * 无线控制 / 通话设置 / 声音和显示 / 数据同步 / 安全和位置 /
 * 应用程序 / SD 卡与手机存储 / 关于手机（含恢复出厂设置）。
 * 全部开关持久化到本设备 store；语言跟随展馆切换。
 */
export const settingsApp: MiniApp = {
  id: 'settings',
  name: '设置',
  nameEn: 'Settings',
  icon(s, x, y) {
    iconTile(s, x, y, C.GRAY, C.PALE)
    // 白色齿轮（外圈 + 中心孔）
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const d = dx * dx + dy * dy
        if ((d <= 81 && d >= 36) || (d <= 9 && d >= 4)) s.pset(x + 14 + dx, y + 14 + dy, C.WHITE)
      }
    for (let i = 0; i < 4; i++) {
      s.fillRect(x + 13, y + 3 + i * 6, 2, 3, C.WHITE)
      s.fillRect(x + 3 + i * 6, y + 13, 3, 2, C.WHITE)
    }
  },
  start(ctx: AppContext) {
    const ui = new SettingsUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type SId =
  | 'root' | 'wireless' | 'wifisettings' | 'btsettings' | 'mobile'
  | 'call' | 'voicemail' | 'forwarding'
  | 'sounddisp' | 'ringtones' | 'brightness' | 'timeout' | 'animation' | 'wallpaper'
  | 'sync'
  | 'security' | 'pattern' | 'simlock'
  | 'applications' | 'manageapps' | 'appinfo' | 'services' | 'development'
  | 'sd'
  | 'datetime' | 'locale'
  | 'about' | 'status' | 'factoryreset'

type Row =
  | { kind: 'toggle'; label: string; sub?: string; on: boolean; act: () => void }
  | { kind: 'link'; label: string; sub?: string; act: () => void }
  | { kind: 'action'; label: string; sub?: string; act: () => void }
  | { kind: 'radio'; label: string; on: boolean; act: () => void }
  | { kind: 'info'; label: string; value?: string }

interface NavEntry {
  id: SId
  sel: number
}

interface ConfirmState {
  title: string
  msg: string
  okLabel: string
  onOk: () => void
}

interface EditorState {
  title: string
  value: string
  digitsOnly: boolean
  onDone: (v: string) => void
}

/** 行距：真机设置列表约 42px 行高 */
const PITCH = 42
const TITLE_H = 30
const CONTENT_TOP = STATUS_H + TITLE_H

/** Manage applications 的条目（进入时快照，避免卸载后索引漂移） */
interface ManageEntry {
  label: string
  sizeMb: number
  thirdParty: boolean
  icon?: MiniApp['icon']
}

class SettingsUI {
  private nav: NavEntry[] = [{ id: 'root', sel: 0 }]
  private dead = false

  // 持久化开关
  private airplane = false
  private wifi = false
  private bt = false
  private btDiscover = false
  private silent = false
  private vibrate = true
  private tones = true
  private sdnotify = true
  private haptic = true
  private rotate = true
  private brightnessV = 0.6
  private timeoutSec = 60
  private animationV = 2
  private wallpaperV = 0
  private ringtoneV = 1
  private bgdata = true
  private autosync = true
  private syncG = true
  private syncC = true
  private syncK = true
  private lastsync: { g: number; c: number; k: number } | null = null
  private wifiloc = false
  private gps = false
  private patternP: number[] | null = null
  private simlockOn = false
  private simpin = '1234'
  private showpw = true
  private unknownSrc = false
  private usbdebug = false
  private stayawake = false
  private mockloc = false
  private sdunmounted = false
  private sdUsedMb = 32
  private vmNum = '+1 805-637-7243'
  private cwaiting = true
  private callerid: 'd' | 'hide' | 'show' = 'd'
  private mRoam = false
  private only2g = false
  /** 24 小时制（日期和时间） */
  private h24 = false
  private fwdAlwaysOn = false
  private fwdBusyOn = false
  private fwdUnansOn = false
  private fwdUnreachOn = false

  // 会话内状态
  private connectedAp: string | null = null
  private btFoundDevice: string | null = null
  private manageList: ManageEntry[] = []
  private appInfoIdx = -1
  private servicesAlive = [0, 1, 2, 3]

  // 浮层
  private confirm: ConfirmState | null = null
  private editor: EditorState | null = null
  private toastText = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private ringStop: (() => void) | null = null

  // 解锁图案录制
  private patPhase: 'menu' | 'draw' | 'confirm' | 'disable' = 'menu'
  private patFirst: number[] | null = null
  private patEntry: number[] = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    if (this.ringStop) this.ringStop()
    if (this.toastTimer) clearTimeout(this.toastTimer)
    for (const t of this.timers) clearTimeout(t)
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    const s = this.ctx.store
    this.airplane = (await s.get<boolean>('airplane')) ?? this.airplane
    this.wifi = (await s.get<boolean>('wifi')) ?? this.wifi
    this.bt = (await s.get<boolean>('bt')) ?? this.bt
    this.btDiscover = (await s.get<boolean>('btDiscover')) ?? this.btDiscover
    this.silent = (await s.get<boolean>('silent')) ?? this.silent
    this.vibrate = (await s.get<boolean>('vibrate')) ?? this.vibrate
    this.tones = (await s.get<boolean>('tones')) ?? this.tones
    this.sdnotify = (await s.get<boolean>('sdnotify')) ?? this.sdnotify
    this.haptic = (await s.get<boolean>('haptic')) ?? this.haptic
    this.rotate = (await s.get<boolean>('rotate')) ?? this.rotate
    this.brightnessV = (await s.get<number>('brightness')) ?? this.brightnessV
    this.timeoutSec = (await s.get<number>('timeout')) ?? this.timeoutSec
    this.animationV = (await s.get<number>('animation')) ?? this.animationV
    this.wallpaperV = (await s.get<number>('wallpaper')) ?? this.wallpaperV
    this.ringtoneV = (await s.get<number>('ringtone')) ?? this.ringtoneV
    this.bgdata = (await s.get<boolean>('bgdata')) ?? this.bgdata
    this.autosync = (await s.get<boolean>('autosync')) ?? this.autosync
    this.syncG = (await s.get<boolean>('syncG')) ?? this.syncG
    this.syncC = (await s.get<boolean>('syncC')) ?? this.syncC
    this.syncK = (await s.get<boolean>('syncK')) ?? this.syncK
    this.lastsync = (await s.get<typeof this.lastsync>('lastsync')) ?? null
    this.wifiloc = (await s.get<boolean>('wifiloc')) ?? this.wifiloc
    this.gps = (await s.get<boolean>('gps')) ?? this.gps
    this.patternP = (await s.get<number[]>('pattern')) ?? null
    this.simlockOn = (await s.get<boolean>('simlock')) ?? this.simlockOn
    this.showpw = (await s.get<boolean>('showpw')) ?? this.showpw
    this.unknownSrc = (await s.get<boolean>('unknownSrc')) ?? this.unknownSrc
    this.usbdebug = (await s.get<boolean>('usbdebug')) ?? this.usbdebug
    this.stayawake = (await s.get<boolean>('stayawake')) ?? this.stayawake
    this.mockloc = (await s.get<boolean>('mockloc')) ?? this.mockloc
    this.sdunmounted = (await s.get<boolean>('sdunmounted')) ?? this.sdunmounted
    this.sdUsedMb = (await s.get<number>('sdused')) ?? this.sdUsedMb
    this.vmNum = (await s.get<string>('vmNum')) ?? this.vmNum
    this.cwaiting = (await s.get<boolean>('cwaiting')) ?? this.cwaiting
    this.callerid = (await s.get<typeof this.callerid>('callerid')) ?? this.callerid
    this.mRoam = (await s.get<boolean>('mRoam')) ?? this.mRoam
    this.only2g = (await s.get<boolean>('only2g')) ?? this.only2g
    this.h24 = (await s.get<boolean>('h24')) ?? this.h24
    this.fwdAlwaysOn = (await s.get<boolean>('fwdAlwaysOn')) ?? this.fwdAlwaysOn
    this.fwdBusyOn = (await s.get<boolean>('fwdBusyOn')) ?? this.fwdBusyOn
    this.fwdUnansOn = (await s.get<boolean>('fwdUnansOn')) ?? this.fwdUnansOn
    this.fwdUnreachOn = (await s.get<boolean>('fwdUnreachOn')) ?? this.fwdUnreachOn
    this.draw()
  }

  // ---------- 导航 ----------

  private get cur(): NavEntry {
    return this.nav[this.nav.length - 1]!
  }

  private get screenId(): SId {
    return this.cur.id
  }

  private get sel(): number {
    return this.cur.sel
  }

  private set sel(v: number) {
    this.cur.sel = v
  }

  private push(id: SId) {
    this.nav.push({ id, sel: 0 })
  }

  private pop() {
    if (this.nav.length > 1) this.nav.pop()
  }

  // ---------- Toast / Confirm / Editor ----------

  private toast(msg: string, ms = 2000) {
    this.toastText = msg
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastText = ''
      this.toastTimer = null
      this.draw()
    }, ms)
    this.draw()
  }

  private askConfirm(title: string, msg: string, onOk: () => void, okLabel?: string) {
    const str = androidStrings(this.ctx.lang.get())
    this.confirm = { title, msg, okLabel: okLabel ?? str.btnOk, onOk }
    this.draw()
  }

  private openEditor(title: string, initial: string, digitsOnly: boolean, onDone: (v: string) => void) {
    this.editor = { title, value: initial, digitsOnly, onDone }
    this.draw()
  }

  /** 延迟执行（dispose 时清理，防止退出后重绘） */
  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t)
      if (!this.dead) fn()
    }, ms)
    this.timers.push(t)
  }

  private set(key: string, value: unknown) {
    ;(this as unknown as Record<string, unknown>)[key] = value
    void this.ctx.store.set(key, value)
  }

  // ---------- 行模型 ----------

  private rows(str: AndroidStrings): Row[] {
    switch (this.screenId) {
      case 'root':
        return [
          { kind: 'link', label: str.setWireless, sub: str.wAirplane, act: () => this.push('wireless') },
          { kind: 'link', label: str.setCall, sub: str.cVmService, act: () => this.push('call') },
          { kind: 'link', label: str.setSoundDisplay, sub: str.sdRingtone, act: () => this.push('sounddisp') },
          { kind: 'link', label: str.setSync, sub: str.syncGmail, act: () => this.push('sync') },
          { kind: 'link', label: str.setSecurity, sub: str.secPattern, act: () => this.push('security') },
          { kind: 'link', label: 'Applications', sub: str.setSd, act: () => this.push('applications') },
          { kind: 'link', label: str.setSd, sub: str.sdTotal, act: () => this.push('sd') },
          { kind: 'link', label: str.setDateTime, sub: str.dtZone, act: () => this.push('datetime') },
          { kind: 'link', label: str.setLocale, sub: str.localeZh, act: () => this.push('locale') },
          { kind: 'link', label: str.settingsAbout, sub: str.aboutModel, act: () => this.push('about') },
        ]
      case 'wireless':
        return [
          { kind: 'toggle', label: str.wAirplane, on: this.airplane, act: () => this.set('airplane', !this.airplane) },
          { kind: 'toggle', label: str.wWifi, on: this.wifi, act: () => this.toggleWifi(!this.wifi) },
          { kind: 'link', label: str.wWifiSet, act: () => this.push('wifisettings') },
          { kind: 'toggle', label: str.wBt, on: this.bt, act: () => this.set('bt', !this.bt) },
          { kind: 'link', label: str.wBtSet, sub: this.bt ? undefined : str.settingsOff, act: () => this.push('btsettings') },
          { kind: 'link', label: str.wMobile, act: () => this.push('mobile') },
        ]
      case 'wifisettings': {
        const rows: Row[] = [
          { kind: 'toggle', label: str.wWifi, on: this.wifi, act: () => this.toggleWifi(!this.wifi) },
          { kind: 'toggle', label: str.wfNotify, on: this.sdnotify, act: () => this.set('sdnotify', !this.sdnotify) },
        ]
        if (this.wifi)
          for (const ap of str.wfAps)
            rows.push({
              kind: 'action',
              label: ap.name,
              sub: this.connectedAp === ap.name ? str.settingsOn : ap.sec ? '🔒' : undefined,
              act: () => this.connectAp(ap.name, ap.sec, str),
            })
        return rows
      }
      case 'btsettings': {
        const rows: Row[] = [
          { kind: 'toggle', label: str.wBt, on: this.bt, act: () => this.set('bt', !this.bt) },
          { kind: 'info', label: str.btDeviceName, value: 'T-Mobile G1' },
          { kind: 'toggle', label: str.btDiscoverable, on: this.btDiscover, act: () => this.set('btDiscover', !this.btDiscover) },
        ]
        if (this.bt) {
          rows.push({ kind: 'info', label: str.btPaired })
          if (this.btFoundDevice) {
            const found = this.btFoundDevice
            rows.push({ kind: 'action', label: found, sub: str.settingsOff, act: () => this.toast(str.btFound(found)) })
          }
          rows.push({
            kind: 'action',
            label: str.btScan,
            act: () => {
              this.toast(str.btScanning)
              this.later(1800, () => {
                this.btFoundDevice = str.btFakeDevice
                this.toast(str.btFound(str.btFakeDevice))
              })
            },
          })
        }
        return rows
      }
      case 'mobile':
        return [
          { kind: 'toggle', label: str.mRoaming, on: this.mRoam, act: () => this.set('mRoam', !this.mRoam) },
          { kind: 'toggle', label: str.m2g, on: this.only2g, act: () => this.set('only2g', !this.only2g) },
          { kind: 'info', label: str.mApn, value: 'T-Mobile' },
          {
            kind: 'action', label: str.mOperators,
            act: () => {
              this.toast(str.mSearching)
              this.later(1800, () => this.toast(str.mOperatorFound))
            },
          },
        ]
      case 'call':
        return [
          { kind: 'info', label: str.cVmService, value: 'T-Mobile' },
          { kind: 'link', label: str.cVmSettings, act: () => this.push('voicemail') },
          { kind: 'toggle', label: str.cWaiting, on: this.cwaiting, act: () => this.set('cwaiting', !this.cwaiting) },
          { kind: 'radio', label: str.cIdDefault, on: this.callerid === 'd', act: () => this.setCallerId('d') },
          { kind: 'radio', label: str.cIdHide, on: this.callerid === 'hide', act: () => this.setCallerId('hide') },
          { kind: 'radio', label: str.cIdShow, on: this.callerid === 'show', act: () => this.setCallerId('show') },
          {
            kind: 'link', label: str.fwdTitle,
            sub: [this.fwdAlwaysOn, this.fwdBusyOn, this.fwdUnansOn, this.fwdUnreachOn].some(Boolean)
              ? str.settingsOn : str.settingsOff,
            act: () => this.push('forwarding'),
          },
        ]
      case 'voicemail':
        return [
          { kind: 'info', label: str.cVmService, value: 'T-Mobile' },
          {
            kind: 'action', label: str.callVoicemail, sub: this.vmNum,
            act: () => this.openEditor(str.callVoicemail, this.vmNum, true, (v) => {
              this.set('vmNum', v)
            }),
          },
        ]
      case 'forwarding':
        return [
          { kind: 'toggle', label: str.fwdAlways, on: this.fwdAlwaysOn, act: () => this.set('fwdAlwaysOn', !this.fwdAlwaysOn) },
          { kind: 'toggle', label: str.fwdBusy, on: this.fwdBusyOn, act: () => this.set('fwdBusyOn', !this.fwdBusyOn) },
          { kind: 'toggle', label: str.fwdUnanswered, on: this.fwdUnansOn, act: () => this.set('fwdUnansOn', !this.fwdUnansOn) },
          { kind: 'toggle', label: str.fwdUnreachable, on: this.fwdUnreachOn, act: () => this.set('fwdUnreachOn', !this.fwdUnreachOn) },
        ]
      case 'sounddisp':
        return [
          { kind: 'toggle', label: str.sdSilent, on: this.silent, act: () => this.toggleSilent(!this.silent) },
          { kind: 'link', label: str.sdRingtone, sub: this.ringtoneName(), act: () => this.push('ringtones') },
          { kind: 'toggle', label: str.sdVibrate, on: this.vibrate, act: () => this.set('vibrate', !this.vibrate) },
          { kind: 'toggle', label: str.sdTones, on: this.tones, act: () => this.set('tones', !this.tones) },
          { kind: 'toggle', label: str.sdSdNotify, on: this.sdnotify, act: () => this.set('sdnotify', !this.sdnotify) },
          { kind: 'toggle', label: str.sdHaptic, on: this.haptic, act: () => this.set('haptic', !this.haptic) },
          { kind: 'link', label: str.brTitle, sub: `${Math.round(this.brightnessV * 100)}%`, act: () => this.push('brightness') },
          { kind: 'link', label: str.toTitle, sub: str.toLabels[this.timeoutIdx()], act: () => this.push('timeout') },
          { kind: 'toggle', label: str.sdRotate, on: this.rotate, act: () => this.set('rotate', !this.rotate) },
          { kind: 'link', label: str.sdAnimation, sub: this.animLabel(str), act: () => this.push('animation') },
          { kind: 'link', label: str.settingsWallpaper, sub: str.wallpaperNames[this.wallpaperV], act: () => this.push('wallpaper') },
        ]
      case 'ringtones':
        return RINGTONE_NAMES.map((r, i) => ({
          kind: 'radio' as const,
          label: this.ctx.lang.get() === 'en' ? r.en : r.zh,
          on: i === this.ringtoneV,
          act: () => this.pickRingtone(i),
        }))
      case 'timeout':
        return [15, 30, 60, 120, 600, 1800].map((sec, i) => ({
          kind: 'radio' as const,
          label: str.toLabels[i]!,
          on: sec === this.timeoutSec,
          act: () => {
            this.timeoutSec = sec
            void this.ctx.store.set('timeout', sec)
            this.draw()
          },
        }))
      case 'animation':
        return [str.anNone, str.anSome, str.anAll].map((label, i) => ({
          kind: 'radio' as const,
          label,
          on: i === this.animationV,
          act: () => {
            this.animationV = i
            void this.ctx.store.set('animation', i)
            this.draw()
          },
        }))
      case 'wallpaper':
        return [0, 1, 2].map((i) => ({
          kind: 'radio' as const,
          label: str.wallpaperNames[i]!,
          on: i === this.wallpaperV,
          act: () => {
            this.wallpaperV = i
            void this.ctx.store.set('wallpaper', i)
            this.draw()
          },
        }))
      case 'sync': {
        const ls = this.lastsync
        const fmt = (t: number) =>
          `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}`
        return [
          { kind: 'toggle', label: str.syBg, on: this.bgdata, act: () => this.set('bgdata', !this.bgdata) },
          { kind: 'toggle', label: str.syAuto, on: this.autosync, act: () => this.set('autosync', !this.autosync) },
          { kind: 'toggle', label: str.syncGmail, sub: ls ? fmt(ls.g) : str.syNever, on: this.syncG, act: () => this.set('syncG', !this.syncG) },
          { kind: 'toggle', label: str.syncCalendar, sub: ls ? fmt(ls.c) : str.syNever, on: this.syncC, act: () => this.set('syncC', !this.syncC) },
          { kind: 'toggle', label: str.syncContacts, sub: ls ? fmt(ls.k) : str.syNever, on: this.syncK, act: () => this.set('syncK', !this.syncK) },
          { kind: 'action', label: str.sySyncNow, act: () => this.doSync(str) },
        ]
      }
      case 'security':
        return [
          { kind: 'toggle', label: str.secWifiLoc, on: this.wifiloc, act: () => this.set('wifiloc', !this.wifiloc) },
          { kind: 'toggle', label: str.secGps, on: this.gps, act: () => this.set('gps', !this.gps) },
          {
            kind: 'link', label: str.seSetPattern,
            sub: this.patternP ? `${this.patternP.length} ●` : str.secPatternOff,
            act: () => {
              this.patPhase = this.patternP ? 'menu' : 'draw'
              this.patFirst = null
              this.patEntry = []
              this.push('pattern')
            },
          },
          { kind: 'link', label: str.seSimLock, sub: this.simlockOn ? str.settingsOn : str.settingsOff, act: () => this.push('simlock') },
          { kind: 'toggle', label: str.seShowPw, on: this.showpw, act: () => this.set('showpw', !this.showpw) },
        ]
      case 'simlock':
        return [
          {
            kind: 'toggle', label: str.simLockRow, on: this.simlockOn,
            act: () => {
              if (this.simlockOn) {
                this.simlockOn = false
                void this.ctx.store.set('simlock', false)
                this.draw()
              }
              else this.openEditor(str.simPinPrompt, '', true, (v) => this.verifyPinAndLock(v, str))
            },
          },
          {
            kind: 'action', label: str.simChangePin,
            act: () => this.openEditor(str.simPinPrompt, '', true, (v) => this.changePinStep1(v, str)),
          },
        ]
      case 'applications':
        return [
          { kind: 'toggle', label: str.apUnknown, on: this.unknownSrc, act: () => this.set('unknownSrc', !this.unknownSrc) },
          { kind: 'link', label: str.apManage, act: () => void this.openManageApps() },
          { kind: 'link', label: str.apRunning, act: () => this.push('services') },
          { kind: 'link', label: str.apDev, act: () => this.push('development') },
        ]
      case 'manageapps':
        return this.manageList.map((e, i) => ({
          kind: 'action' as const,
          label: e.label,
          sub: e.thirdParty ? str.marketInstalled : undefined,
          act: () => {
            this.appInfoIdx = i
            this.push('appinfo')
          },
        }))
      case 'appinfo': {
        const e = this.manageList[this.appInfoIdx]
        if (!e) return []
        const rows: Row[] = [
          { kind: 'info', label: str.mngSize(e.sizeMb) },
          { kind: 'info', label: 'Storage', value: `${e.sizeMb} MB` },
          { kind: 'action', label: str.mngForceStop, act: () => this.toast(str.mngStopped) },
          { kind: 'action', label: str.mngClearData, act: () => this.toast(str.mngCleared) },
          { kind: 'action', label: str.mngClearCache, act: () => this.toast(str.mngCleared) },
        ]
        if (e.thirdParty)
          rows.push({
            kind: 'action', label: str.mngUninstall,
            act: () => this.uninstallEntry(e, str),
          })
        return rows
      }
      case 'services':
        return str.svcItems
          .map((it, i) => ({ i, it }))
          .filter(({ i }) => this.servicesAlive.includes(i))
          .map(({ i, it }) => ({
            kind: 'action' as const,
            label: it.name,
            sub: it.sub,
            act: () => {
              this.servicesAlive = this.servicesAlive.filter((x) => x !== i)
              this.toast(str.svcStopped(it.name))
            },
          }))
      case 'development':
        return [
          { kind: 'toggle', label: str.devUsb, on: this.usbdebug, act: () => this.set('usbdebug', !this.usbdebug) },
          { kind: 'toggle', label: str.devStay, on: this.stayawake, act: () => this.set('stayawake', !this.stayawake) },
          { kind: 'toggle', label: str.devMock, on: this.mockloc, act: () => this.set('mockloc', !this.mockloc) },
        ]
      case 'sd': {
        const rows: Row[] = []
        if (this.sdunmounted) {
          rows.push({ kind: 'info', label: str.sdUnmounted })
          rows.push({
            kind: 'action', label: 'Mount SD card',
            act: () => {
              this.sdunmounted = false
              void this.ctx.store.set('sdunmounted', false)
              this.draw()
            },
          })
        } else {
          rows.push({ kind: 'info', label: str.sdTotal, value: '1.00 GB' })
          rows.push({ kind: 'info', label: str.sdAvail, value: `${1024 - this.sdUsedMb} MB` })
          rows.push({
            kind: 'action', label: str.sdUnmount,
            act: () => this.askConfirm(str.sdUnmount, str.sdUnmountMsg, () => {
              this.sdunmounted = true
              void this.ctx.store.set('sdunmounted', true)
              this.draw()
            }),
          })
          rows.push({
            kind: 'action', label: str.sdFormat,
            act: () => this.askConfirm(str.sdFormat, str.sdFormatMsg, () => {
              this.sdUsedMb = 4
              void this.ctx.store.set('sdused', 4)
              this.toast(str.sdFormatDone)
            }),
          })
        }
        rows.push({ kind: 'info', label: str.sdIntAvail, value: '76 MB' })
        return rows
      }
      case 'datetime': {
        const d = new Date()
        const two = (n: number) => String(n).padStart(2, '0')
        const dateStr = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
        const timeStr = `${two(d.getHours())}:${two(d.getMinutes())}`
        return [
          { kind: 'toggle', label: str.dtAuto, on: true, act: () => this.toast(str.dtAuto) },
          { kind: 'info', label: str.dtNow(dateStr, timeStr) },
          { kind: 'info', label: str.dtZone },
          { kind: 'toggle', label: str.dt24h, on: this.h24, act: () => this.setH24(!this.h24) },
        ]
      }
      case 'locale':
        return [
          { kind: 'radio', label: str.localeZh, on: this.ctx.lang.get() === 'zh', act: () => this.setLang('zh') },
          { kind: 'radio', label: str.localeEn, on: this.ctx.lang.get() === 'en', act: () => this.setLang('en') },
        ]
      case 'about':
        return [
          {
            kind: 'action', label: str.abUpdates,
            act: () => {
              this.toast(str.abChecking)
              this.later(1600, () => this.toast(str.abUpToDate))
            },
          },
          { kind: 'link', label: str.abStatus, act: () => this.push('status') },
          { kind: 'info', label: str.aboutModel },
          { kind: 'info', label: str.aboutFirmware },
          { kind: 'info', label: str.abBaseband },
          { kind: 'info', label: str.aboutKernel },
          { kind: 'info', label: str.aboutBuild },
          { kind: 'info', label: str.aboutBattery(this.ctx.battery.percent) },
          { kind: 'link', label: str.frTitle, act: () => { this.push('factoryreset'); this.cur.sel = 1 } },
        ]
      case 'status':
        return [
          { kind: 'info', label: str.stBatteryState, value: str.stDischarging },
          { kind: 'info', label: str.aboutBattery(this.ctx.battery.percent) },
          { kind: 'info', label: str.stSignal, value: '-77 dBm · 13 asu' },
          { kind: 'info', label: str.stService, value: 'T-Mobile' },
          { kind: 'info', label: str.stMobileState, value: 'Connected' },
          { kind: 'info', label: str.stRoaming, value: 'Not roaming' },
          { kind: 'info', label: str.stImei, value: '358281010674931' },
          { kind: 'info', label: str.stImeiSv, value: '02' },
          { kind: 'info', label: str.stNumber, value: '+18056377243' },
        ]
      case 'factoryreset':
        return [
          { kind: 'info', label: str.frWarn },
          {
            kind: 'action', label: str.frReset,
            act: () => this.askConfirm(str.frTitle, str.frWarn, () => {
              void this.ctx.store.clearAll().then(() => {
                this.toast(str.frDone, 1200)
                this.later(900, () => this.ctx.exit())
              })
            }),
          },
        ]
      case 'pattern':
      case 'brightness':
        return []
    }
  }

  // ---------- 业务动作 ----------

  private ringtoneName(): string {
    const r = RINGTONE_NAMES[this.ringtoneV]
    if (!r) return ''
    return this.ctx.lang.get() === 'en' ? r.en : r.zh
  }

  private timeoutIdx(): number {
    const i = [15, 30, 60, 120, 600, 1800].indexOf(this.timeoutSec)
    return i < 0 ? 2 : i
  }

  private animLabel(str: AndroidStrings): string {
    return [str.anNone, str.anSome, str.anAll][this.animationV] ?? str.anAll
  }

  private toggleWifi(on: boolean) {
    this.wifi = on
    void this.ctx.store.set('wifi', on)
    if (!on) this.connectedAp = null
    this.draw()
  }

  private setCallerId(v: 'd' | 'hide' | 'show') {
    this.callerid = v
    void this.ctx.store.set('callerid', v)
    this.draw()
  }

  private setH24(on: boolean) {
    this.h24 = on
    void this.ctx.store.set('h24', on)
    this.draw()
  }

  private setLang(lang: 'zh' | 'en') {
    if (lang === this.ctx.lang.get()) return
    this.ctx.lang.set?.(lang)
    this.draw()
  }

  private toggleSilent(on: boolean) {
    this.silent = on
    void this.ctx.store.set('silent', on)
    this.draw()
  }

  private connectAp(name: string, secured: boolean, str: AndroidStrings) {
    if (this.connectedAp === name) {
      this.connectedAp = null
      this.draw()
      return
    }
    const doConnect = () => {
      this.toast(str.wfConnecting(name), 1400)
      this.later(1300, () => {
        this.connectedAp = name
        this.toast(str.wfConnected(name))
      })
    }
    if (secured) this.openEditor(str.wfPassTitle, '', false, doConnect)
    else doConnect()
  }

  private verifyPinAndLock(pin: string, str: AndroidStrings) {
    if (pin !== this.simpin) {
      this.toast(str.simWrong)
      return
    }
    this.simlockOn = true
    void this.ctx.store.set('simlock', true)
    this.draw()
  }

  private changePinStep1(oldPin: string, str: AndroidStrings) {
    if (oldPin !== this.simpin) {
      this.toast(str.simWrong)
      return
    }
    this.openEditor(str.simChangePin, '', true, (newPin) => {
      if (newPin.length < 4) {
        this.toast(str.simWrong)
        return
      }
      this.openEditor(str.simChangePin, '', true, (again) => {
        if (again !== newPin) {
          this.toast(str.patMatchFail)
          return
        }
        this.simpin = newPin
        this.toast(str.simPinChanged)
      })
    })
  }

  private pickRingtone(i: number) {
    if (this.ringStop) this.ringStop()
    this.ringtoneV = i
    void this.ctx.store.set('ringtone', i)
    this.ctx.audio.unlock()
    const name = RINGTONE_NAMES[i]?.file
    if (name && this.ctx.audio.hasFile(name))
      this.ringStop = this.ctx.audio.playFile(name, { volume: 0.5 })
    this.draw()
  }

  private doSync(str: AndroidStrings) {
    this.toast(str.sySyncing, 1400)
    this.later(1400, () => {
      const now = Date.now()
      this.lastsync = { g: now, c: now, k: now }
      void this.ctx.store.set('lastsync', this.lastsync)
      this.toast(str.syDone)
    })
  }

  private async openManageApps() {
    const en = this.ctx.lang.get() === 'en'
    const builtins: ManageEntry[] = APPS.map((app) => ({
      label: en ? app.nameEn ?? app.name : app.name,
      sizeMb: pseudoMb(app.id),
      thirdParty: false,
      icon: app.icon,
    }))
    const thirdParty: ManageEntry[] = []
    if (this.ctx.host.getInstalledApps)
      for (const name of await this.ctx.host.getInstalledApps())
        thirdParty.push({ label: name, sizeMb: pseudoMb(name) + 1, thirdParty: true })
    this.manageList = [...builtins, ...thirdParty]
    this.appInfoIdx = -1
    this.push('manageapps')
    this.draw()
  }

  private uninstallEntry(e: ManageEntry, str: AndroidStrings) {
    void this.ctx.host.uninstallApp?.(e.label).then(() => {
      this.manageList = this.manageList.filter((x) => x !== e)
      this.pop()
      this.toast(str.mngUninstalled(e.label))
    })
  }

  // ---------- 解锁图案 ----------

  private static PAT_POS: ReadonlyArray<[number, number]> = [
    [100, 145], [160, 145], [220, 145],
    [100, 205], [160, 205], [220, 205],
    [100, 265], [160, 265], [220, 265],
  ]

  private patAt(x: number, y: number): number {
    for (let i = 0; i < 9; i++) {
      const [px, py] = SettingsUI.PAT_POS[i]!
      const dx = x - px
      const dy = y - py
      if (dx * dx + dy * dy <= 20 * 20) return i
    }
    return -1
  }

  private patAdd(i: number) {
    if (this.patEntry.includes(i)) return
    const last = this.patEntry[this.patEntry.length - 1]
    if (last !== undefined) {
      // 跨中连接时自动带上中点节点（真机行为）
      const [ax, ay] = SettingsUI.PAT_POS[last]!
      const [bx, by] = SettingsUI.PAT_POS[i]!
      const midR = (ax + bx) / 2
      const midC = (ay + by) / 2
      const mid = SettingsUI.PAT_POS.findIndex(
        ([px, py]) => px === midR && py === midC,
      )
      if (mid >= 0 && !this.patEntry.includes(mid)) this.patEntry.push(mid)
    }
    this.patEntry.push(i)
    this.draw()
  }

  private patContinue(str: AndroidStrings) {
    if (this.patPhase === 'draw') {
      if (this.patEntry.length < 4) {
        this.toast(str.patTooShort)
        return
      }
      this.patFirst = this.patEntry
      this.patEntry = []
      this.patPhase = 'confirm'
      this.draw()
    } else if (this.patPhase === 'confirm') {
      const same =
        this.patEntry.length === this.patFirst!.length &&
        this.patEntry.every((v, i) => v === this.patFirst![i])
      if (!same) {
        this.toast(str.patMatchFail)
        this.patFirst = null
        this.patEntry = []
        this.patPhase = 'draw'
        this.draw()
        return
      }
      this.patternP = this.patFirst
      void this.ctx.store.set('pattern', this.patFirst)
      this.pop()
      this.toast(str.patSaved)
    } else if (this.patPhase === 'disable') {
      const same =
        this.patternP !== null &&
        this.patEntry.length === this.patternP.length &&
        this.patEntry.every((v, i) => v === this.patternP![i])
      if (!same) {
        this.toast(str.patMatchFail)
        return
      }
      this.patternP = null
      void this.ctx.store.set('pattern', null)
      this.pop()
      this.toast(str.patRemoved)
    }
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    // 文本编辑浮层优先
    if (this.editor) {
      this.editorKey(k)
      return
    }
    if (this.confirm) {
      if (k === 'ok') {
        const c = this.confirm
        this.confirm = null
        c.onOk()
        this.draw()
      } else if (k === 'back' || k === 'menu') {
        this.confirm = null
        this.draw()
      }
      return
    }
    // 亮度调节页
    if (this.screenId === 'brightness') {
      if (k === 'right' || k === 'up') this.brightnessV = Math.min(1, this.brightnessV + 0.05)
      else if (k === 'left' || k === 'down') this.brightnessV = Math.max(0.15, this.brightnessV - 0.05)
      else if (k === 'ok') {
        void this.ctx.store.set('brightness', this.brightnessV)
        this.pop()
      } else if (k === 'back') this.pop()
      else return
      this.draw()
      return
    }
    // 解锁图案页
    if (this.screenId === 'pattern') {
      this.patternKey(k)
      return
    }
    const str = androidStrings(this.ctx.lang.get())
    const rows = this.rows(str)
    switch (k) {
      case 'up':
        if (rows.length) this.sel = (this.sel + rows.length - 1) % rows.length
        break
      case 'down':
        if (rows.length) this.sel = (this.sel + 1) % rows.length
        break
      case 'ok': {
        const row = rows[this.sel]
        if (row) this.activate(row)
        break
      }
      case 'back':
        if (this.nav.length === 1) {
          this.ctx.exit()
          return
        }
        this.pop()
        break
      default:
        return
    }
    this.draw()
  }

  private editorKey(k: DeviceKey) {
    const e = this.editor!
    switch (k) {
      case 'clear':
        e.value = e.value.slice(0, -1)
        break
      case 'ok':
        this.editor = null
        e.onDone(e.value)
        break
      case 'back':
        this.editor = null
        this.draw()
        break
      default: {
        const ch = charOf(k)
        if (!ch) return
        if (e.digitsOnly && !/[0-9+]/.test(ch)) return
        e.value += ch
      }
    }
    this.draw()
  }

  private patternKey(k: DeviceKey) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.patPhase === 'menu') {
      if (k === 'back') this.pop()
      else if (k === 'ok') {
        if (this.sel === 0) {
          this.patPhase = 'draw'
          this.patFirst = null
          this.patEntry = []
        } else if (this.sel === 1) {
          this.patPhase = 'disable'
          this.patEntry = []
        }
      } else if (k === 'up') this.sel = 0
      else if (k === 'down') this.sel = 1
      else return
      this.draw()
      return
    }
    switch (k) {
      case 'back':
        if (this.patternP) {
          this.patPhase = 'menu'
          this.sel = 0
        } else this.pop()
        break
      case 'ok':
        this.patContinue(str)
        return
      default:
        return
    }
    this.draw()
  }

  private activate(row: Row) {
    switch (row.kind) {
      case 'toggle':
      case 'action':
      case 'link':
      case 'radio':
        row.act()
        break
      case 'info':
        this.draw()
        break
    }
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.editor) {
      // 按钮区：OK / Cancel
      if (y >= 350 && y < 392) {
        if (x >= 30 && x < 160) {
          const e = this.editor
          this.editor = null
          e.onDone(e.value)
          this.draw()
          return
        }
        if (x >= 170 && x < 300) {
          this.editor = null
          this.draw()
          return
        }
      }
      return
    }
    if (this.confirm) {
      if (y >= 300 && y < 344) {
        if (x >= 30 && x < 160) {
          const c = this.confirm
          this.confirm = null
          c.onOk()
          this.draw()
        } else if (x >= 170 && x < 300) {
          this.confirm = null
          this.draw()
        }
      }
      return
    }
    if (this.screenId === 'brightness') {
      if (y > 200 && y < 240) {
        this.brightnessV = Math.max(0.15, Math.min(1, 0.15 + (x / W) * 0.85))
        this.draw()
      }
      return
    }
    if (this.screenId === 'factoryreset') {
      if (y >= 380 && y < 424) {
        const row = this.rows(str)[1]
        if (row?.kind === 'action') row.act()
      }
      return
    }
    if (this.screenId === 'pattern') {
      this.patternTap(x, y)
      return
    }
    const rows = this.rows(str)
    const scroll = this.scrollFor(rows.length)
    for (let i = 0; i < rows.length; i++) {
      const y0 = this.rowY(i - scroll)
      if (y >= y0 - 2 && y < y0 + PITCH - 2) {
        this.sel = i
        this.activate(rows[i]!)
        this.draw()
        return
      }
    }
  }

  private patternTap(x: number, y: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.patPhase === 'menu') {
      // 两个条目：更改 / 关闭
      if (y >= 200 && y < 250) {
        this.patPhase = 'draw'
        this.patFirst = null
        this.patEntry = []
        this.draw()
      } else if (y >= 250 && y < 300) {
        this.patPhase = 'disable'
        this.patEntry = []
        this.draw()
      } else if (y >= 380 && y < 420) this.patContinue(str)
      else if (y > 430 && y < 470) this.dialEmergency()
      return
    }
    // Continue 按钮
    if (y >= 380 && y < 420) {
      this.patContinue(str)
      return
    }
    // Emergency call
    if (y > 430 && y < 470) {
      this.dialEmergency()
      return
    }
    const node = this.patAt(x, y)
    if (node >= 0) this.patAdd(node)
  }

  private dialEmergency() {
    this.ctx.host.dial?.('911')
  }

  // ---------- 几何 ----------

  private rowY(i: number): number {
    return CONTENT_TOP + 10 + i * PITCH
  }

  private scrollFor(n: number): number {
    const visible = Math.floor((H - CONTENT_TOP - 14) / PITCH)
    if (n <= visible) return 0
    // 标准列表滚动：仅当选中行落到可视窗口底部之下才下滚，避免 sel>0 即错位
    return Math.max(0, Math.min(this.sel - visible + 1, n - visible))
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    // 每帧内容不同（开关/页面切换），先清像素缓冲与 overlays，杜绝勾选框残留
    s.clear()
    const str = androidStrings(this.ctx.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
      silent: this.silent,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    s.fillRect(0, STATUS_H, W, TITLE_H, C.PALE)
    s.text(12, STATUS_H + 7, this.title(str), { size: 15, color: C.INK })

    if (this.screenId === 'pattern') this.drawPatternPage(str)
    else if (this.screenId === 'brightness') this.drawBrightnessPage(str)
    else if (this.screenId === 'factoryreset') this.drawFactoryPage(str)
    else this.drawList(str)

    if (this.editor) this.drawEditor(str)
    if (this.confirm) this.drawConfirm(str)
    if (this.toastText) this.drawToast()
    s.render()
  }

  private title(str: AndroidStrings): string {
    switch (this.screenId) {
      case 'root': return str.settingsTitle
      case 'wireless': return str.setWireless
      case 'wifisettings': return str.wWifiSet
      case 'btsettings': return str.wBtSet
      case 'mobile': return str.wMobile
      case 'call': return str.setCall
      case 'voicemail': return str.cVmSettings
      case 'forwarding': return str.fwdTitle
      case 'sounddisp': return str.setSoundDisplay
      case 'ringtones': return str.sdRingtone
      case 'brightness': return str.brTitle
      case 'timeout': return str.toTitle
      case 'animation': return str.anTitle
      case 'wallpaper': return str.settingsWallpaper
      case 'sync': return str.setSync
      case 'security': return str.setSecurity
      case 'pattern': return str.seSetPattern
      case 'simlock': return str.seSimLock
      case 'applications': return 'Applications'
      case 'manageapps': return str.apManage
      case 'appinfo': return str.mngAppInfo
      case 'services': return str.apRunning
      case 'development': return str.apDev
      case 'sd': return str.setSd
      case 'datetime': return str.setDateTime
      case 'locale': return str.setLocale
      case 'about': return str.aboutTitle
      case 'status': return str.abStatus
      case 'factoryreset': return str.frTitle
    }
  }

  private drawList(str: AndroidStrings) {
    const s = this.ctx.screen
    const rows = this.rows(str)
    const scroll = this.scrollFor(rows.length)
    const checkOn = assets.fw('btnCheckOn')
    const checkOff = assets.fw('btnCheckOff')
    for (let i = 0; i < rows.length; i++) {
      const y = this.rowY(i - scroll)
      if (y < CONTENT_TOP - 2 || y > H - 8) continue
      const row = rows[i]!
      if (i === this.sel) roundRect(s, 8, y - 2, W - 16, PITCH - 4, 8, C.PALE, null)
      let labelX = 16
      // 应用管理列表：左侧小图标
      if (this.screenId === 'manageapps') {
        const e = this.manageList[i]
        if (e?.icon) e.icon(s, 6, y - 2)
        labelX = 44
      }
      const isRoot = this.screenId === 'root'
      const linkSubBelow = isRoot && row.kind === 'link' && !!row.sub
      const hasRight =
        row.kind === 'toggle' || row.kind === 'radio' ||
        (row.kind === 'link' && !linkSubBelow) ||
        (row.kind === 'info' && !!row.value) ||
        (row.kind === 'action' && !!row.sub)
      const maxLabel = hasRight ? W - labelX - 110 : W - labelX - 20
      s.text(labelX, y + 8, clipToWidth(s, row.label, maxLabel, 12), { size: 12, color: C.INK })
      // 根行副标题：题下第二行（灰色小字），与右侧状态无关
      if (linkSubBelow && row.kind === 'link' && row.sub)
        s.text(labelX, y + 24, clipToWidth(s, row.sub, W - labelX - 24, 10), { size: 10, color: C.GRAY })
      switch (row.kind) {
        case 'toggle': {
          if (row.sub) s.textRight(W - 48, y + 8, clipToWidth(s, row.sub, 70, 11), { size: 11, color: C.GRAY })
          if (checkOn && checkOff)
            s.blit(row.on ? checkOn : checkOff, W - 42, y - 2, { w: 28, h: 28 })
          else {
            roundRect(s, W - 52, y + 4, 34, 18, 5, row.on ? C.GREEN : C.GRAY, null)
            s.fillRect(W - 48 + (row.on ? 16 : 2), y + 7, 12, 12, C.WHITE)
          }
          break
        }
        case 'radio': {
          // 真机单选点：绿色实心圆（注意花括号：else 不得绑定到内层 if）
          if (row.on) {
            for (let dy = -6; dy <= 6; dy++)
              for (let dx = -6; dx <= 6; dx++)
                if (dx * dx + dy * dy <= 36) s.pset(W - 28 + dx, y + 12 + dy, C.GREEN)
          } else {
            s.frameRect(W - 34, y + 6, 13, 13)
          }
          break
        }
        case 'link':
          if (row.sub && !linkSubBelow) s.textRight(W - 34, y + 8, clipToWidth(s, row.sub, 110, 11), { size: 11, color: C.GRAY })
          s.text(W - 20, y + 6, '›', { size: 16, color: C.GRAY })
          break
        case 'info':
          if (row.value) s.textRight(W - 14, y + 8, clipToWidth(s, row.value, 150, 11), { size: 11, color: C.GRAY })
          break
        case 'action':
          if (row.sub) s.textRight(W - 14, y + 8, clipToWidth(s, row.sub, 150, 11), { size: 11, color: C.GRAY })
          break
      }
    }
    // 长列表滚动条
    const visible = Math.floor((H - CONTENT_TOP - 14) / PITCH)
    if (rows.length > visible) {
      const barH = Math.max(24, Math.round((visible / rows.length) * (H - CONTENT_TOP - 20)))
      const barY = CONTENT_TOP + 10 + Math.round((scroll / Math.max(1, rows.length - visible)) * (H - CONTENT_TOP - 20 - barH))
      s.fillRect(W - 5, barY, 3, barH, C.GRAY)
    }
    void str
  }

  // ----- 恢复出厂警告页 -----

  private drawFactoryPage(str: AndroidStrings) {
    const s = this.ctx.screen
    // 警告图标（三角叹号）
    for (let dy = 0; dy < 26; dy++)
      for (let dx = -13; dx <= 13; dx++)
        if (Math.abs(dx) <= 13 - dy / 2)
          s.pset(W / 2 + dx, 100 + dy, C.AMBER)
    s.fillRect(W / 2 - 2, 108, 4, 12, C.WHITE)
    s.fillRect(W / 2 - 2, 123, 4, 4, C.WHITE)
    this.wrapMsg(str.frWarn, W - 48).slice(0, 7).forEach((ln, i) =>
      s.text(24, 150 + i * 20, ln, { size: 12, color: C.INK }))
    if (this.sel === 1) roundRect(s, 30, 378, W - 60, 46, 10, C.PALE, null)
    roundRect(s, 40, 384, W - 80, 34, 8, C.RED, null)
    s.textCenter(W >> 1, 396, str.frReset, { size: 14, color: C.WHITE })
  }

  // ----- 亮度页 -----

  private drawBrightnessPage(str: AndroidStrings) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 180, `${Math.round(this.brightnessV * 100)}%`, { size: 22, color: C.INK })
    // 滑轨
    roundRect(s, 30, 206, W - 60, 16, 8, C.PALE, C.GRAY)
    const fillW = Math.round(((this.brightnessV - 0.15) / 0.85) * (W - 60))
    if (fillW > 0) roundRect(s, 30, 206, fillW, 16, 8, C.GREEN, null)
    s.textCenter(W >> 1, 260, str.brHint, { size: 11, color: C.GRAY })
    // 实时调光黑层
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = `rgba(0,0,0,${(1 - this.brightnessV).toFixed(3)})`
    g.fillRect(0, 0, W, H)
    s.blit(c, 0, 0)
  }

  // ----- 解锁图案页 -----

  private drawPatternPage(str: AndroidStrings) {
    const s = this.ctx.screen
    if (this.patPhase === 'menu') {
      s.textCenter(W >> 1, 170, str.seSetPattern, { size: 13, color: C.INK })
      this.menuRow(s, 210, str.patChange, this.sel === 0)
      this.menuRow(s, 256, str.patDisable, this.sel === 1)
    } else {
      const hint =
        this.patPhase === 'draw'
          ? this.patFirst ? str.patRedraw : str.patDraw
          : str.patRedraw
      s.textCenter(W >> 1, 108, hint, { size: 13, color: C.INK })
      // 连线
      const entry = this.patEntry
      for (let i = 1; i < entry.length; i++) {
        const [ax, ay] = SettingsUI.PAT_POS[entry[i - 1]!]!
        const [bx, by] = SettingsUI.PAT_POS[entry[i]!]!
        seg(s, ax, ay, bx, by, C.GREEN)
      }
      for (let i = 0; i < 9; i++) {
        const [cx, cy] = SettingsUI.PAT_POS[i]!
        const on = entry.includes(i)
        ring(s, cx, cy, 13, on ? C.GREEN : C.PALE)
        if (on) disc(s, cx, cy, 5, C.GREEN)
      }
      // Continue 按钮
      const enabled = entry.length >= 4
      roundRect(s, 40, 380, W - 80, 40, 10, enabled ? C.GREEN : C.PALE, null)
      s.textCenter(W >> 1, 394, str.patContinue, { size: 14, color: enabled ? C.WHITE : C.GRAY })
    }
    // Emergency call 按钮
    roundRect(s, 40, 432, W - 80, 36, 8, C.WHITE, C.GRAY)
    s.textCenter(W >> 1, 444, str.patEmergency, { size: 12, color: C.INK })
  }

  private menuRow(s: AppContext['screen'], y: number, label: string, selected: boolean) {
    if (selected) roundRect(s, 20, y - 22, W - 40, 40, 8, C.PALE, null)
    s.textCenter(W >> 1, y, label, { size: 14, color: C.INK })
  }

  // ----- 文本编辑浮层 -----

  private drawEditor(str: AndroidStrings) {
    const e = this.editor
    if (!e) return
    const s = this.ctx.screen
    // 深色背板画在调色板层（不能用 dim()：那是全彩 overlay，会盖到卡片自身）
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.INK)
    roundRect(s, 16, 180, W - 32, 200, 10, C.WHITE, C.GRAY)
    s.text(30, 208, e.title, { size: 14, color: C.INK })
    // 输入框
    roundRect(s, 30, 228, W - 60, 40, 6, C.WHITE, C.GRAY)
    s.text(38, 240, clipToWidth(s, e.value + '▌', W - 76, 14), { size: 14, color: C.INK })
    this.dialogButtons(str)
  }

  private drawConfirm(str: AndroidStrings) {
    const cf = this.confirm
    if (!cf) return
    const s = this.ctx.screen
    // 深色背板画在调色板层（不能用 dim()：那是全彩 overlay，会盖到卡片自身）
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.INK)
    roundRect(s, 16, 180, W - 32, 160, 10, C.WHITE, C.GRAY)
    s.text(30, 208, cf.title, { size: 14, color: C.INK })
    const lines = this.wrapMsg(cf.msg, W - 60)
    lines.slice(0, 3).forEach((ln, i) => s.text(30, 240 + i * 18, ln, { size: 12, color: C.INK }))
    // 按钮位置与 onTap 判定一致（y 300..344）
    roundRect(s, 30, 300, 130, 40, 8, C.GREEN, null)
    s.textCenter(95, 314, cf.okLabel, { size: 13, color: C.WHITE })
    roundRect(s, 170, 300, 120, 40, 8, C.PALE, C.GRAY)
    s.textCenter(230, 314, str.btnCancel, { size: 13, color: C.INK })
  }

  private dialogButtons(str: AndroidStrings) {
    const s = this.ctx.screen
    roundRect(s, 30, 350, 130, 42, 8, C.GREEN, null)
    s.textCenter(95, 365, str.btnOk, { size: 13, color: C.WHITE })
    roundRect(s, 170, 350, 120, 42, 8, C.PALE, C.GRAY)
    s.textCenter(230, 365, str.btnCancel, { size: 13, color: C.INK })
  }

  private wrapMsg(msg: string, maxW: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const ch of msg) {
      const test = line + ch
      if (this.ctx.screen.measure(test, { size: 12 }) > maxW && line) {
        lines.push(line)
        line = ch
      } else line = test
    }
    lines.push(line)
    return lines
  }

  private drawToast() {
    const s = this.ctx.screen
    const c = document.createElement('canvas')
    const pad = 16
    const fsize = 13
    const g = c.getContext('2d')!
    g.font = `${fsize}px sans-serif`
    const tw = Math.ceil(g.measureText(this.toastText).width)
    c.width = tw + pad * 2
    c.height = 34
    const g2 = c.getContext('2d')!
    g2.fillStyle = 'rgba(30,30,30,0.92)'
    const r = 10
    g2.beginPath()
    g2.moveTo(r, 0)
    g2.arcTo(c.width, 0, c.width, c.height, r)
    g2.arcTo(c.width, c.height, 0, c.height, r)
    g2.arcTo(0, c.height, 0, 0, r)
    g2.arcTo(0, 0, c.width, 0, r)
    g2.closePath()
    g2.fill()
    g2.font = `${fsize}px sans-serif`
    g2.fillStyle = '#ffffff'
    g2.textBaseline = 'middle'
    g2.fillText(this.toastText, pad, c.height / 2 + 1)
    s.blit(c, (W - c.width) >> 1, H - 80)
  }
}

/** DeviceKey → 可输入字符 */
function charOf(k: DeviceKey): string | null {
  if (k.length === 1) {
    if (/[a-z0-9]/.test(k)) return k
    if (k === '.' || k === ',') return k
  }
  if (k === 'space') return ' '
  return null
}

/** 确定性伪大小（按 id 字符串散列） */
function pseudoMb(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return +(0.5 + (h % 180) / 10).toFixed(1)
}

/** 带颜色的线段 */
function seg(s: AppContext['screen'], x0: number, y0: number, x1: number, y1: number, v: number) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (;;) {
    s.pset(x, y, v)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
}

/** 空心圆环 */
function ring(s: AppContext['screen'], cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy
      if (d <= r * r && d >= (r - 3) * (r - 3)) s.pset(cx + dx, cy + dy, v)
    }
}

/** 实心圆 */
function disc(s: AppContext['screen'], cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, v)
}

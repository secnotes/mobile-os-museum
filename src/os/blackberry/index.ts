import type {
  PhoneOS, PhoneOSFactory, OSDeps, MiniApp, AppContext,
} from '../../kernel/types'
import type { CallEntry } from '../../scenario/data'
import type { DeviceKey } from '../../hal/input'
import type { Screen } from '../../hal/screen'
import { AppRuntime } from '../../kernel/runtime'
import { C } from './palette'
import { rr, rrStroke, rrGrad, gradV, disc } from './graphics'
import { bbStrings, type BBStrings } from './strings'
import { RINGTONES, MSG_TONE, ALARM_NOTES } from './ringtones'
import { loadContacts } from '../../scenario/data'
import type {
  BBHost, MsgThread, BBMContact, BBPhoto, BBContact2, SmsMsg,
} from './apps/common'
import { drawIcon } from './apps/icons'
import { MessagesApp } from './apps/messages'
import { CalendarApp } from './apps/calendar'
import { ContactsApp } from './apps/contacts'
import { BrowserApp } from './apps/browser'
import { MediaApp } from './apps/media'
import { CameraApp } from './apps/camera'
import { BBMApp } from './apps/bbm'
import { PhoneApp } from './apps/phone'
import { OptionsApp } from './apps/options'
import { SearchApp } from './apps/search'
import { HelpApp } from './apps/help'
import { CalculatorApp } from './apps/calculator'
import { ClockApp } from './apps/clock'
import { MemoApp, TasksApp } from './apps/memo'
import { BreakerApp } from './apps/breaker'

/**
 * BlackBerry Bold 9000（2008，BlackBerry OS 4.6）。
 * 非触屏：感光轨迹球 + 珍珠式 QWERTY；系统 UI 走 Precision 主题（壁纸 + 左侧图标栏）。
 * 应用经 AppRuntime 启动，输入全部是 DeviceKey。
 */

type State =
  | 'off' | 'boot' | 'shutdown'
  | 'home' | 'locked'
  | 'calling' | 'incall' | 'ringing' | 'alarm'

type AppCtor = new (ctx: AppContext, init?: string) => { start(): void }

const APP_CTORS: Record<string, AppCtor> = {
  messages: MessagesApp,
  calendar: CalendarApp,
  contacts: ContactsApp,
  browser: BrowserApp,
  media: MediaApp,
  camera: CameraApp,
  bbm: BBMApp,
  phone: PhoneApp,
  options: OptionsApp,
  search: SearchApp,
  help: HelpApp,
  calculator: CalculatorApp,
  clock: ClockApp,
  memopad: MemoApp,
  tasks: TasksApp,
  breaker: BreakerApp,
}

/** 主屏图标顺序（OS 4.6 AT&T Precision 默认停靠） */
const APP_ORDER = [
  'messages', 'calendar', 'contacts', 'browser',
  'media', 'camera', 'bbm', 'phone',
  'options', 'search', 'help', 'calculator',
  'clock', 'memopad', 'tasks', 'breaker',
] as const

const ICON_SLOT = 52
const DOCK_TOP = 26
const DOCK_VIEW = 256

/** 声音情景（BB OS「Profiles」：Normal/Loud/Vibrate/Quiet/Silent） */
type SoundProfile = 'normal' | 'loud' | 'vibrate' | 'quiet' | 'silent'
const PROFILES: ReadonlyArray<{ id: SoundProfile; zh: string; en: string }> = [
  { id: 'normal', zh: '普通', en: 'Normal' },
  { id: 'loud', zh: '大声', en: 'Loud' },
  { id: 'vibrate', zh: '振动', en: 'Vibrate' },
  { id: 'quiet', zh: '安静', en: 'Quiet' },
  { id: 'silent', zh: '静音', en: 'Silent' },
]

// 顶部点按面板几何
const TRAY_X = 8
const TRAY_Y = 24
const TRAY_W = 248
const PROFILE_ROW = 28
const ALERT_ROW = 26

export default {
  create(deps: OSDeps): PhoneOS {
    return new BlackBerryOS(deps)
  },
} satisfies PhoneOSFactory

class BlackBerryOS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private t = 0
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private runtime: AppRuntime
  // 注意：不能写成字段初始化器（native class fields 先于构造体里的参数属性赋值执行）
  private str: BBStrings

  // 数据
  private threads: MsgThread[] = []
  private bbmContacts: BBMContact[] = []
  private photos: BBPhoto[] = []
  private contacts: BBContact2[] = []
  private callLog: CallEntry[] = []
  private homeSel = 0
  private dockOff = 0
  private ringIdx = 0
  private vibe = true
  private soundProfile: SoundProfile = 'normal'
  /** 点状态栏展开的通知/情景面板 */
  private tray = false
  private alarmCfg = { on: false, h: 7, m: 30 }
  private alarmFiredDate = ''
  private ringStop: (() => void) | null = null
  private toast = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  // 通话
  private call: {
    tel: string; name: string; startedAt: number; connected: boolean; dir: 'in' | 'out'
  } | null = null
  private callTimer: ReturnType<typeof setTimeout> | null = null
  private ringbackInt: ReturnType<typeof setInterval> | null = null

  // 解锁组合 / End 长按 / 启动参数
  private starArmedUntil = 0
  private endHoldStart: number | null = null
  private pendingInit: string | undefined
  private bootAt = -10

  constructor(private deps: OSDeps) {
    this.str = bbStrings(deps.lang.get())
    this.runtime = new AppRuntime(deps, () => this.onAppExit())
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    this.contacts = (await loadContacts(this.deps.store.get.bind(this.deps.store))).map((c) => ({
      name: c.name, tel: c.tel, email: c.email,
    }))
    this.threads = (await this.deps.store.get<MsgThread[]>('bb:threads')) ?? this.seedThreads()
    this.bbmContacts = (await this.deps.store.get<BBMContact[]>('bb:bbm')) ?? this.seedBBM()
    this.photos = (await this.deps.store.get<BBPhoto[]>('bb:photos')) ?? []
    this.callLog = (await this.deps.store.get<CallEntry[]>('bb:calllog')) ?? []
    this.ringIdx = (await this.deps.store.get<number>('bb:ringtone')) ?? 0
    this.vibe = (await this.deps.store.get<boolean>('bb:vibe')) ?? true
    this.alarmCfg = (await this.deps.store.get('bb:alarm')) ?? { on: false, h: 7, m: 30 }
    const savedProfile = await this.deps.store.get<string>('bb:profile')
    if (PROFILES.some((p) => p.id === savedProfile)) this.soundProfile = savedProfile as SoundProfile

    this.offs.push(this.deps.input.subscribe((k, rep) => this.onInput(k, rep)))
    this.offs.push(this.deps.input.subscribeTap((x, y) => this.onTap(x, y)))
    this.offs.push(this.deps.lang.onChange(() => { this.str = bbStrings(this.deps.lang.get()) }))
    this.offs.push(
      this.deps.frames.add((dt) => this.frame(dt)),
    )
    // 闹钟检查（每 5 秒）
    const alarmInt = setInterval(() => this.checkAlarm(), 5000)
    this.offs.push(() => clearInterval(alarmInt))
    this.updateLed()
    this.drawOff()
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.stopRing()
    if (this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null }
    if (this.ringbackInt) { clearInterval(this.ringbackInt); this.ringbackInt = null }
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const off of this.offs.splice(0)) off()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 帧驱动 ----------

  private frame(dt: number) {
    this.t += dt
    // End 长按 1.2s = 电源
    if (this.deps.input.isDown('end')) {
      if (this.endHoldStart === null) this.endHoldStart = this.t
      else if (this.t - this.endHoldStart >= 1.2) {
        this.endHoldStart = null
        if (this.powered) this.shutdown()
        else this.boot()
      }
    } else {
      this.endHoldStart = null
    }
    if (!this.powered || this.state === 'off' || this.state === 'shutdown') return
    if (this.runtime.active) return
    this.draw()
  }

  // ---------- 输入 ----------

  private onInput(k: DeviceKey, rep: boolean) {
    if (this.state === 'off') {
      if (k === 'power') this.boot()
      return
    }
    if (this.state === 'boot' || this.state === 'shutdown') return
    if (this.runtime.active) {
      // 应用运行中：End 短按回主屏；其余键归应用
      if (k === 'end' && !rep) this.runtime.close()
      return
    }
    if (k === 'power') {
      this.shutdown()
      return
    }
    switch (this.state) {
      case 'home': this.homeKey(k, rep); break
      case 'locked': this.lockKey(k); break
      case 'calling':
        if (k === 'end' || k === 'back' || k === 'clear') this.hangUp(false)
        break
      case 'incall':
        if (k === 'end' || k === 'back' || k === 'clear' || k === 'ok') this.hangUp(true)
        break
      case 'ringing': this.ringingKey(k); break
      case 'alarm':
        this.stopAlarmRinging()
        this.goHome()
        break
      default: break
    }
  }

  private homeKey(k: DeviceKey, rep: boolean) {
    const n = APP_ORDER.length
    if (k === 'up' && !rep) {
      this.homeSel = (this.homeSel + n - 1) % n
      this.ensureDock()
    } else if (k === 'down' && !rep) {
      this.homeSel = (this.homeSel + 1) % n
      this.ensureDock()
    } else if (k === 'ok') {
      this.launchApp(APP_ORDER[this.homeSel]!)
    } else if (k === 'call') {
      this.launchApp('phone')
    } else if (k === 'mute') {
      this.state = 'locked'
    } else if (k === 'soft1') {
      this.launchApp('phone')
    } else if (k === 'soft2') {
      this.launchApp('camera')
    } else if (k === 'vol') {
      this.showToast('VOL')
    } else if (k === 'search') {
      this.launchApp('search')
    } else if (/^[a-z]$/.test(k)) {
      this.launchApp('search', k)
    } else if (/^[0-9]$/.test(k)) {
      this.launchApp('phone', k)
    }
  }

  private lockKey(k: DeviceKey) {
    if (k === 'mute') {
      this.tray = false
      this.goHome()
      return
    }
    if (k === '*') this.starArmedUntil = this.t + 1.5
    else if (k === 'call' && this.t < this.starArmedUntil) this.goHome()
  }

  private ringingKey(k: DeviceKey) {
    if (k === 'call' || k === 'ok') {
      this.stopRing()
      this.state = 'incall'
      if (this.call) this.call.connected = true
    } else if (k === 'end' || k === 'back' || k === 'clear') {
      this.hangUp(false, true)
    }
  }

  // ---------- 画布点按（浏览器操作便利；真机由轨迹球 + 按键完成） ----------

  private onTap(x: number, y: number) {
    if (!this.powered || this.runtime.active) return
    switch (this.state) {
      case 'home': this.homeTap(x, y); break
      case 'ringing':
        // 底部提示行：左半屏接听 / 右半屏忽略
        if (y >= 268 && y <= 305) {
          if (x < 240) {
            this.stopRing()
            this.state = 'incall'
            if (this.call) this.call.connected = true
          } else this.hangUp(false, true)
        }
        break
      default: break
    }
  }

  private homeTap(x: number, y: number) {
    if (this.tray) {
      this.trayTap(x, y)
      return
    }
    // 顶部状态栏 → 展开通知/情景面板
    if (y < 22) {
      this.tray = true
      return
    }
    // 左侧图标栏：映射到最近槽位并直接启动
    if (x < 52 && y >= DOCK_TOP - 6) {
      const i = Math.max(0, Math.min(APP_ORDER.length - 1,
        Math.round((y - (DOCK_TOP + 24) + this.dockOff) / ICON_SLOT)))
      this.homeSel = i
      this.ensureDock()
      this.launchApp(APP_ORDER[i]!)
      return
    }
    // Today 最近会话（右侧）：进对应线程
    if (x >= 206 && y >= 148 && y < 238) {
      const i = Math.floor((y - 156) / 26)
      const t = this.threads[i]
      if (t) {
        this.hostBridge.markThreadRead(t.tel)
        this.launchApp('messages', t.tel)
      }
    }
  }

  /** 面板高度（与绘制共用） */
  private trayH(unreadN: number): number {
    return 10 + PROFILES.length * PROFILE_ROW + (unreadN ? 12 + unreadN * ALERT_ROW + 8 : 6)
  }

  private trayTap(x: number, y: number) {
    const unread = this.threads.filter((t) => t.unread).slice(0, 3)
    const h = this.trayH(unread.length)
    // 点面板外：收起
    if (x < TRAY_X || x > TRAY_X + TRAY_W || y < TRAY_Y || y > TRAY_Y + h) {
      this.tray = false
      return
    }
    const r0 = TRAY_Y + 10
    for (let k = 0; k < PROFILES.length; k++) {
      if (y >= r0 + k * PROFILE_ROW && y < r0 + (k + 1) * PROFILE_ROW) {
        this.setProfile(PROFILES[k]!.id)
        return
      }
    }
    if (unread.length) {
      const a0 = r0 + PROFILES.length * PROFILE_ROW + 12
      for (let j = 0; j < unread.length; j++) {
        if (y >= a0 + j * ALERT_ROW && y < a0 + (j + 1) * ALERT_ROW) {
          const t = unread[j]!
          this.tray = false
          this.hostBridge.markThreadRead(t.tel)
          this.launchApp('messages', t.tel)
          return
        }
      }
    }
  }

  private setProfile(p: SoundProfile) {
    this.soundProfile = p
    void this.deps.store.set('bb:profile', p)
    this.tray = false
  }

  // ---------- 电源 ----------

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.bootAt = this.t
  }

  private shutdown() {
    if (this.runtime.active) this.runtime.close()
    this.stopRing()
    this.state = 'shutdown'
    this.timers.push(setTimeout(() => {
      this.state = 'off'
      this.powered = false
      this.deps.screen.clear()
      this.deps.screen.render()
      this.updateLed()
    }, 1100))
  }

  private goHome() {
    this.state = 'home'
  }

  private onAppExit() {
    this.state = 'home'
  }

  // ---------- 应用启动 ----------

  private launchApp(id: string, init?: string) {
    this.pendingInit = init
    const Ctor = APP_CTORS[id]!
    const name = this.str.apps[id] ?? id
    const app: MiniApp = {
      id,
      name,
      start: (ctx: AppContext) => new Ctor(ctx, this.pendingInit).start(),
    }
    this.pendingInit = undefined
    this.runtime.launch(app, this.hostBridge)
  }

  private ensureDock() {
    const y0 = this.homeSel * ICON_SLOT
    const y1 = y0 + ICON_SLOT
    if (y0 < this.dockOff) this.dockOff = y0
    else if (y1 > this.dockOff + DOCK_VIEW) {
      this.dockOff = Math.min(APP_ORDER.length * ICON_SLOT - DOCK_VIEW, y1 - DOCK_VIEW)
    }
  }

  private showToast(text: string) {
    this.toast = text
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => { this.toast = '' }, 1500)
  }

  // ---------- 通话 ----------

  private beginCall(tel: string, name?: string) {
    const who = name || this.contactName(tel)
    this.call = {
      tel, name: who, startedAt: Date.now(), connected: false, dir: 'out',
    }
    this.state = 'calling'
    // 回铃音：长 1s 停 2s（北美节奏 2s/4s 简化）
    this.deps.audio.ringbackTone(1)
    this.ringbackInt = setInterval(() => this.deps.audio.ringbackTone(1), 3000)
    this.callTimer = setTimeout(() => {
      if (!this.call || this.state !== 'calling') return
      this.call.connected = true
      this.call.startedAt = Date.now()
      if (this.ringbackInt) { clearInterval(this.ringbackInt); this.ringbackInt = null }
      this.state = 'incall'
    }, 2600)
  }

  /**
   * 挂断 / 拒接 / 超时。
   * @param wasConnected 已接通（计时长）
   * @param incoming 拒接来电（missed=true）
   */
  private hangUp(wasConnected: boolean, incoming = false) {
    if (this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null }
    if (this.ringbackInt) { clearInterval(this.ringbackInt); this.ringbackInt = null }
    this.stopRing()
    if (this.call) {
      const c = this.call
      const isIncoming = c.dir === 'in' || incoming
      const dur = wasConnected && c.connected
        ? Math.round((Date.now() - c.startedAt) / 1000)
        : 0
      this.writeCallLog({
        tel: c.tel, name: c.name,
        dir: isIncoming ? 'in' : 'out',
        dur,
        // 来电未接通（忽略/超时）= 未接；已接的来电与外呼都不是
        missed: isIncoming && !wasConnected,
      })
      this.call = null
    }
    this.goHome()
    this.updateLed()
  }

  incomingCall(tel: string, name?: string): void {
    if (!this.powered || this.state === 'off') return
    if (this.runtime.active) this.runtime.close()
    this.call = {
      tel, name: name || this.contactName(tel), startedAt: Date.now(), connected: false, dir: 'in',
    }
    this.state = 'ringing'
    this.tray = false
    this.startRingtoneLoop()
    // Vibrate 情景必振动；其余情景跟「振动」设置；Silent 不振动
    const willVibe = this.soundProfile === 'vibrate'
      || (this.vibe && this.soundProfile !== 'silent')
    if (willVibe && navigator.vibrate) navigator.vibrate([400, 300, 400])
    // 20s 未接 → 记未接
    this.callTimer = setTimeout(() => {
      if (this.state === 'ringing') this.hangUp(false, true)
    }, 20000)
  }

  private contactName(tel: string): string {
    return this.contacts.find((c) => c.tel === tel)?.name ?? tel
  }

  // ---------- 短信 / BBM ----------

  injectSms(from: string, text: string): void {
    if (!this.powered) return
    const name = this.contactName(from)
    let th = this.threads.find((t) => t.tel === from)
    if (!th) {
      th = { tel: from, name, kind: 'sms', unread: false, msgs: [] }
      this.threads.unshift(th)
    }
    th.unread = true
    th.msgs.push({ dir: 'in', text, ts: Date.now() })
    void this.deps.store.set('bb:threads', this.threads)
    this.deps.audio.melody(MSG_TONE, 240)
    if (this.state === 'home') this.showToast('✉')
    this.updateLed()
  }

  private pushIncoming(th: MsgThread, text: string) {
    th.msgs.push({ dir: 'in', text, ts: Date.now() })
    th.unread = true
    void this.deps.store.set('bb:threads', this.threads)
    this.deps.audio.melody(MSG_TONE, 240)
    this.updateLed()
  }

  private sendReplyLater(th: MsgThread) {
    this.timers.push(setTimeout(() => {
      const pool = this.deps.lang.get() === 'en'
        ? ['Drive safe.', 'OK, got it.', "I'll send Dad to pick you up.", 'Take care.']
        : this.str.replies
      const i = th.msgs.length % pool.length
      this.pushIncoming(th, pool[i]!)
    }, 2200))
  }

  // ---------- 铃声循环 ----------

  private startRingtoneLoop() {
    // 铃声音量跟情景：Loud 满响 / Quiet 轻响 / Vibrate·Silent 不响
    const vol = this.soundProfile === 'loud' ? 1
      : this.soundProfile === 'normal' ? 0.6
      : this.soundProfile === 'quiet' ? 0.25
      : 0
    if (vol <= 0) return
    this.ringStop = this.deps.audio.playMelody(
      RINGTONES[this.ringIdx]!.notes, 168, { loop: true, volume: vol },
    )
  }

  private stopRing() {
    if (this.ringStop) { this.ringStop(); this.ringStop = null }
  }

  // ---------- 闹钟 ----------

  private checkAlarm() {
    if (!this.alarmCfg.on || this.state === 'alarm') return
    const now = new Date()
    const key = now.toDateString()
    if (now.getHours() === this.alarmCfg.h && now.getMinutes() === this.alarmCfg.m
      && this.alarmFiredDate !== key) {
      this.alarmFiredDate = key
      this.fireAlarm()
    }
  }

  private fireAlarm() {
    if (this.runtime.active) this.runtime.close()
    this.state = 'alarm'
    this.ringStop = this.deps.audio.playMelody(ALARM_NOTES, 240, { loop: true, volume: 0.6 })
  }

  private stopAlarmRinging() {
    this.stopRing()
  }

  // ---------- 通话记录 ----------

  private writeCallLog(e: {
    tel: string; name: string; dir: 'in' | 'out'; dur: number; missed: boolean
  }) {
    const entry: CallEntry = { id: Date.now(), ts: Date.now(), ...e }
    this.callLog = [entry, ...this.callLog].slice(0, 50)
    void this.deps.store.set('bb:calllog', this.callLog)
  }

  // ---------- 种子 ----------

  private seedThreads(): MsgThread[] {
    const momTel = '13800000000'
    return [
      {
        tel: momTel, name: '妈妈', kind: 'sms', unread: true,
        msgs: [{ dir: 'in', text: this.str.msgMom, ts: Date.now() - 3600_000 }],
      },
      {
        tel: '10086', name: 'AT&T', kind: 'sms', unread: false,
        msgs: [{ dir: 'in', text: this.str.msgWelcome, ts: Date.now() - 86400_000 }],
      },
    ]
  }

  private seedBBM(): BBMContact[] {
    return [
      {
        id: 1, name: '妈妈', status: this.str.available,
        msgs: [
          { dir: 'in', text: '在忙吗？看到消息回我一下', ts: Date.now() - 3600_000 },
        ],
      },
      {
        id: 2, name: '老李', status: this.str.available,
        msgs: [],
      },
    ]
  }

  // ---------- LED ----------

  private updateLed() {
    const unread = this.threads.some((t) => t.unread)
    window.dispatchEvent(new CustomEvent('bb-led', { detail: unread ? 'red' : 'off' }))
  }

  // ---------- host 桥 ----------

  private hostBridge: BBHost = {
    getThreads: async () =>
      JSON.parse(JSON.stringify(this.threads)) as MsgThread[],

    sendSms: (tel: string, text: string) => {
      let th = this.threads.find((t) => t.tel === tel)
      if (!th) {
        th = {
          tel, name: this.contactName(tel), kind: 'sms', unread: false, msgs: [],
        }
        this.threads.unshift(th)
      }
      const msg: SmsMsg = { dir: 'out', text, ts: Date.now() }
      th.msgs.push(msg)
      th.unread = false
      void this.deps.store.set('bb:threads', this.threads)
      this.sendReplyLater(th)
    },

    markThreadRead: (tel: string) => {
      const th = this.threads.find((t) => t.tel === tel)
      if (th && th.unread) {
        th.unread = false
        void this.deps.store.set('bb:threads', this.threads)
        this.updateLed()
      }
    },

    getBBM: async () =>
      JSON.parse(JSON.stringify(this.bbmContacts)) as BBMContact[],

    bbmSend: (id: number, text: string) => {
      const c = this.bbmContacts.find((x) => x.id === id)
      if (!c) return
      c.msgs.push({ dir: 'out', text, ts: Date.now() })
      void this.deps.store.set('bb:bbm', this.bbmContacts)
      this.timers.push(setTimeout(() => {
        const pool = this.deps.lang.get() === 'en'
          ? ['Drive safe.', 'OK, got it.', 'Take care.']
          : this.str.replies
        c.msgs.push({ dir: 'in', text: pool[c.msgs.length % pool.length]!, ts: Date.now() })
        void this.deps.store.set('bb:bbm', this.bbmContacts)
      }, 2000))
    },

    getPhotos2: async () => this.photos.slice(),

    addPhoto: (seed: number) => {
      const p: BBPhoto = { id: Date.now(), seed, ts: Date.now() }
      this.photos.unshift(p)
      void this.deps.store.set('bb:photos', this.photos)
      return p
    },

    deletePhoto2: async (id: number) => {
      this.photos = this.photos.filter((p) => p.id !== id)
      await this.deps.store.set('bb:photos', this.photos)
    },

    unreadCount: async () => this.threads.filter((t) => t.unread).length,

    setVibe: async (v: boolean) => {
      this.vibe = v
      await this.deps.store.set('bb:vibe', v)
    },
    getVibe: async () => this.vibe,

    saveAlarm: async (cfg) => {
      this.alarmCfg = cfg
      this.alarmFiredDate = ''
      await this.deps.store.set('bb:alarm', cfg)
    },
    getAlarm: async () => ({ ...this.alarmCfg }),

    dial: (number: string, name?: string) => {
      if (this.runtime.active) this.runtime.close()
      this.beginCall(number, name)
    },

    dialMsg: (tel: string) => {
      if (this.runtime.active) this.runtime.close()
      this.launchApp('messages', tel)
    },

    getCallLog: async () => this.callLog.slice(),

    deleteCallLog: async (kind) => {
      this.callLog = this.callLog.filter((e) => {
        if (kind === 'all') return false
        if (kind === 'missed') return !(e.dir === 'in' && e.missed)
        if (kind === 'received') return !(e.dir === 'in' && !e.missed)
        return !(e.dir === 'out')
      })
      await this.deps.store.set('bb:calllog', this.callLog)
    },

    getContacts: async () =>
      this.contacts.map((c) => ({ name: c.name, tel: c.tel, email: c.email })),

    saveContacts: async (list) => {
      this.contacts = list.map((c) => ({ name: c.name, tel: c.tel, email: c.email }))
    },

    setRingtone: (idx: number) => {
      this.ringIdx = idx
      void this.deps.store.set('bb:ringtone', idx)
    },
    getRingtoneIndex: async () => this.ringIdx,

    setLang: (lang) => {
      this.deps.lang.set?.(lang)
    },

    launchAppById: (id: string) => {
      this.launchApp(id)
    },

    factoryReset: async () => {
      const s = this.deps.store
      for (const k of [
        'bb:threads', 'bb:bbm', 'bb:photos', 'bb:calllog',
        'bb:ringtone', 'bb:vibe', 'bb:alarm',
      ]) await s.remove(k)
      this.callLog = []
      this.threads = this.seedThreads()
      this.bbmContacts = this.seedBBM()
      this.photos = []
      this.ringIdx = 0
      this.vibe = true
      this.alarmCfg = { on: false, h: 7, m: 30 }
      this.updateLed()
    },
  }

  // ---------- 绘制 ----------

  private drawOff() {
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  private draw() {
    const s = this.deps.screen
    switch (this.state) {
      case 'boot': this.drawBoot(); break
      case 'shutdown': this.drawShutdown(); break
      case 'home': this.drawHome(); break
      case 'locked': this.drawLocked(); break
      case 'calling':
      case 'incall':
      case 'ringing': this.drawCall(); break
      case 'alarm': this.drawAlarm(); break
      default: break
    }
    s.render()
  }

  private bbMark(s = this.deps.screen, cx: number, cy: number, r = 5) {
    // 七粒黑莓标志（蜂窝状）
    disc(s, cx - r * 2, cy, r, C.SELECT)
    disc(s, cx + r * 2, cy, r, C.SELECT)
    disc(s, cx - r, cy - Math.round(r * 1.7), r, C.SELECT)
    disc(s, cx - r, cy + Math.round(r * 1.7), r, C.SELECT)
    disc(s, cx + r, cy - Math.round(r * 1.7), r, C.SELECT)
    disc(s, cx + r, cy + Math.round(r * 1.7), r, C.SELECT)
    disc(s, cx, cy, r, C.SELECT)
  }

  private drawBoot() {
    const s = this.deps.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.t - this.bootAt > 3.0) {
      this.goHome()
      return
    }
    this.bbMark(s, 240, 110, 9)
    s.textCenter(240, 158, 'BlackBerry', { size: 34, color: C.INK })
    // 进度条
    rr(s, 130, 214, 220, 7, 3, C.G3)
    const p = Math.min(1, (this.t - this.bootAt) / 3.0)
    rr(s, 130, 214, Math.round(220 * p), 7, 3, C.SELECT)
  }

  private drawShutdown() {
    const s = this.deps.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    this.bbMark(s, 240, 130, 9)
    s.textCenter(240, 178, 'BlackBerry', { size: 34, color: C.INK })
  }

  /** 顶部状态栏（真机横幅：黑色高光底带 + BES 四点圆标 + 居中运营商 + 12 小时制） */
  private drawStatus(s = this.deps.screen, now = new Date()) {
    // 黑色高光横幅：深色底 + 顶部渐疏高光点 + 底部 1px 分隔线
    s.fillRect(0, 0, 480, 22, C.G8)
    // 顶部渐疏高光点（越靠上越密，两行即止）
    for (let x = 0; x < 480; x += 3) s.pset(x + 1, 1, C.G6)
    for (let x = 0; x < 480; x += 6) s.pset(x + 3, 2, C.G6)
    for (let x = 0; x < 480; x += 11) s.pset(x, 3, C.G6)
    s.fillRect(0, 21, 480, 1, C.G6)
    // 信号：5 格
    for (let i = 0; i < 5; i++) {
      s.fillRect(8 + i * 4, 20 - (3 + i * 2), 3, 3 + i * 2, C.WHITE)
    }
    s.text(32, 6, '3G', { size: 10, color: C.WHITE })
    // BES/BIS 四点圆标（BlackBerry 数据服务已连接）
    for (const [dx, dy] of [[0, 0], [6, 0], [0, 6], [6, 6]] as const) {
      disc(s, 47 + dx, 8 + dy, 2, C.WHITE)
    }
    if (this.threads.some((t) => t.unread)) {
      // 小信封（横幅底色做镂空）
      s.fillRect(64, 7, 10, 7, C.WHITE)
      s.fillRect(65, 8, 8, 5, C.G8)
      s.line(64, 7, 69, 11, C.WHITE)
      s.line(69, 11, 74, 7, C.WHITE)
    }
    // 运营商居中
    s.textCenter(240, 5, this.str.carrier, { size: 13, color: C.WHITE })
    // 时间：真机默认 12 小时制带 AM/PM
    let hh = now.getHours()
    const ap = hh >= 12 ? 'PM' : 'AM'
    hh = hh % 12
    if (hh === 0) hh = 12
    const mm = String(now.getMinutes()).padStart(2, '0')
    s.textRight(444, 5, `${hh}:${mm} ${ap}`, { size: 13, color: C.WHITE })
    // 电池
    const pct = this.deps.battery.percent
    s.frameRect(452, 5, 20, 11)
    s.fillRect(472, 8, 2, 5, C.WHITE)
    const fw = Math.max(1, Math.round(18 * pct / 100))
    s.fillRect(453, 6, fw, 9, pct > 20 ? C.WHITE : C.RED)
  }

  private drawHome() {
    const s = this.deps.screen
    gradV(s, 0, 0, 480, 320, [C.WP0, 5])
    // 右下光晕
    disc(s, 420, 300, 90, C.WP3)
    disc(s, 420, 300, 60, C.WP4)
    this.drawStatus(s)

    // 大时间 / 日期（右侧）
    const now = new Date()
    let hh12 = now.getHours() % 12
    if (hh12 === 0) hh12 = 12
    const mm = String(now.getMinutes()).padStart(2, '0')
    s.text(210, 64, `${hh12}:${mm}`, { size: 44, color: C.WHITE })
    s.text(340, 84, now.getHours() >= 12 ? 'PM' : 'AM', { size: 18, color: C.WHITE })
    s.text(212, 120, this.str.homeDate(now), { size: 16, color: C.G1 })

    // Today：最近会话摘要
    const recent = this.threads.slice(0, 3)
    recent.forEach((t, i) => {
      const y = 156 + i * 26
      s.fillRect(212, y + 3, 8, 6, t.unread ? C.GOLD : C.G4)
      s.text(226, y, t.name, { size: 14, color: C.WHITE, maxWidth: 60 })
      const last = t.msgs[t.msgs.length - 1]
      if (last) s.text(290, y, last.text, { size: 14, color: C.G1, maxWidth: 180 })
    })

    // 左侧图标栏
    for (let i = 0; i < APP_ORDER.length; i++) {
      const slotY = DOCK_TOP + i * ICON_SLOT - this.dockOff
      if (slotY < -ICON_SLOT || slotY > 300) continue
      const id = APP_ORDER[i]!
      if (i === this.homeSel) {
        rrStroke(s, 3, slotY + 2, 46, 46, 9, C.G7)
        rrStroke(s, 5, slotY + 4, 42, 42, 7, C.WHITE)
      }
      drawIcon(s, id, 7, slotY + 6, 40)
    }
    // 选中项名称
    s.text(58, DOCK_TOP + this.homeSel * ICON_SLOT - this.dockOff + 16,
      this.str.apps[APP_ORDER[this.homeSel]!]!, { size: 13, color: C.WHITE, maxWidth: 90 })

    if (this.toast) s.textCenter(240, 296, this.toast, { size: 18, color: C.GOLD })

    // 顶部点按展开的通知/情景面板（最上层）
    if (this.tray) this.drawTray(s)
  }

  /** 通知/情景面板：5 情景 + 未读通知（真机 Profiles/横幅通知的博物馆映射） */
  private drawTray(s: Screen) {
    const unread = this.threads.filter((t) => t.unread).slice(0, 3)
    const h = this.trayH(unread.length)
    rr(s, TRAY_X, TRAY_Y, TRAY_W, h, 8, C.WHITE)
    rrStroke(s, TRAY_X, TRAY_Y, TRAY_W, h, 8, C.G3)
    const en = this.deps.lang.get() === 'en'
    let y = TRAY_Y + 10
    PROFILES.forEach((p) => {
      this.profileGlyph(s, TRAY_X + 16, y + PROFILE_ROW / 2, p.id)
      s.text(TRAY_X + 34, y + 8, en ? p.en : p.zh, { size: 15, color: C.INK })
      if (this.soundProfile === p.id) {
        // 对勾
        s.line(TRAY_X + TRAY_W - 30, y + 15, TRAY_X + TRAY_W - 25, y + 20, C.SELECT)
        s.line(TRAY_X + TRAY_W - 25, y + 20, TRAY_X + TRAY_W - 15, y + 8, C.SELECT)
      }
      y += PROFILE_ROW
    })
    if (unread.length) {
      s.fillRect(TRAY_X + 12, y + 4, TRAY_W - 24, 1, C.G3)
      y += 12
      unread.forEach((t) => {
        // 小信封（灰体 + 白翻口）
        const ex = TRAY_X + 12, ey = y + 7
        s.fillRect(ex, ey, 12, 9, C.G6)
        s.fillRect(ex + 1, ey + 1, 10, 7, C.WHITE)
        s.line(ex + 1, ey + 2, ex + 6, ey + 6, C.G6)
        s.line(ex + 11, ey + 2, ex + 6, ey + 6, C.G6)
        s.text(TRAY_X + 34, y + 8, t.name, { size: 14, color: C.INK, maxWidth: 56 })
        const last = t.msgs[t.msgs.length - 1]
        if (last)
          s.text(TRAY_X + 98, y + 8, last.text, { size: 14, color: C.G6, maxWidth: TRAY_W - 110 })
        y += ALERT_ROW
      })
    }
  }

  /** 情景行小图标：喇叭 / 振动 / 静音（带斜杠） */
  private profileGlyph(s: Screen, cx: number, cy: number, p: SoundProfile) {
    if (p === 'vibrate') {
      // 机身 + 两侧振动波
      s.fillRect(cx - 2, cy - 5, 4, 10, C.INK)
      s.line(cx - 6, cy - 4, cx - 4, cy - 2, C.G6)
      s.line(cx - 6, cy, cx - 4, cy, C.G6)
      s.line(cx - 6, cy + 4, cx - 4, cy + 2, C.G6)
      s.line(cx + 4, cy - 2, cx + 6, cy - 4, C.G6)
      s.line(cx + 4, cy, cx + 6, cy, C.G6)
      s.line(cx + 4, cy + 2, cx + 6, cy + 4, C.G6)
      return
    }
    this.speakerIcon(s, cx, cy, C.INK)
    if (p === 'silent') {
      s.line(cx - 6, cy - 6, cx + 6, cy + 6, C.RED)
      return
    }
    // Normal/Loud 带声波；Quiet 无波
    if (p === 'normal' || p === 'loud') {
      s.line(cx + 5, cy - 3, cx + 8, cy - 5, C.INK)
      s.line(cx + 5, cy + 3, cx + 8, cy + 5, C.INK)
      if (p === 'loud') {
        s.line(cx + 9, cy - 6, cx + 12, cy - 8, C.INK)
        s.line(cx + 9, cy + 6, cx + 12, cy + 8, C.INK)
      }
    }
  }

  private speakerIcon(s: Screen, cx: number, cy: number, v: number) {
    // 喇叭：方块底座 + 三角扩口
    s.fillRect(cx - 5, cy - 2, 3, 5, v)
    for (let i = 0; i < 5; i++) s.fillRect(cx - 2, cy - 5 + i * 2, i + 1, 2, v)
  }

  private drawLocked() {
    const s = this.deps.screen
    gradV(s, 0, 0, 480, 320, [C.WP1, 4])
    this.drawStatus(s)
    const now = new Date()
    let lh = now.getHours() % 12
    if (lh === 0) lh = 12
    s.textCenter(240, 64,
      `${lh}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`,
      { size: 40, color: C.WHITE })
    // 挂锁
    rr(s, 218, 132, 44, 34, 6, C.WHITE)
    s.fillRect(226, 118, 28, 6, C.WHITE)
    s.fillRect(226, 118, 6, 20, C.WHITE)
    s.fillRect(248, 118, 6, 20, C.WHITE)
    s.textCenter(240, 182, this.str.locked, { size: 20, color: C.WHITE })
    s.textCenter(240, 250, this.str.unlockHint, { size: 13, color: C.G1 })
  }

  private drawCall() {
    const s = this.deps.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    const title = this.state === 'ringing'
      ? (this.deps.lang.get() === 'en' ? 'Incoming call' : '来电')
      : this.state === 'calling'
        ? this.str.calling
        : this.str.connected
    rrGrad(s, 0, 0, 480, 52, 0, [C.WP2, 3])
    s.textCenter(240, 16, title, { size: 20, color: C.WHITE })

    if (!this.call) return
    // 头像（初始字母）
    const pr = this.state === 'ringing'
      ? 40 + Math.round(4 * Math.sin(this.t * 6))
      : 40
    disc(s, 240, 120, pr + 2, C.G3)
    disc(s, 240, 120, pr, C.FIELD_BG)
    s.textCenter(240, 96, this.call.name.slice(0, 1).toUpperCase(), {
      size: 42, color: C.SELECT,
    })
    s.textCenter(240, 176, this.call.name, { size: 26, color: C.INK })
    // 陌生号码（无名）时 name 本身即号码，不再重复画第二行
    if (this.call.name !== this.call.tel) {
      s.textCenter(240, 210, this.call.tel, { size: 15, color: C.G6 })
    }

    if (this.state === 'calling') {
      // 呼叫动画三点
      for (let i = 0; i < 3; i++) {
        disc(s, 224 + i * 16, 252, 4, (this.t * 2) % 3 >= i ? C.SELECT : C.G3)
      }
    } else if (this.state === 'incall') {
      const dur = Math.max(0, Math.round((Date.now() - this.call.startedAt) / 1000))
      const txt = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`
      s.textCenter(240, 244, txt, { size: 30, color: C.SELECT })
    } else {
      s.text(150, 286, '🟢 ' + (this.deps.lang.get() === 'en' ? 'Send: answer' : '拨号键接听'),
        { size: 14, color: C.GREEN_D })
      s.text(300, 286, '🔴 ' + (this.deps.lang.get() === 'en' ? 'End: ignore' : '挂机键忽略'),
        { size: 14, color: C.RED_D })
    }
  }

  private drawAlarm() {
    const s = this.deps.screen
    const flash = Math.floor(this.t * 2) % 2 === 0
    s.fillRect(0, 0, 480, 320, flash ? C.WHITE : C.G1)
    disc(s, 240, 120, 34, C.GOLD)
    s.fillRect(232, 96, 16, 40, flash ? C.WHITE : C.G1)
    s.textCenter(240, 178, this.deps.lang.get() === 'en' ? 'Alarm' : '闹钟',
      { size: 30, color: C.INK })
    s.textCenter(240, 226,
      `${String(this.alarmCfg.h).padStart(2, '0')}:${String(this.alarmCfg.m).padStart(2, '0')}`,
      { size: 22, color: C.RED_D })
    s.textCenter(240, 272, this.deps.lang.get() === 'en' ? 'Press any key' : '按任意键停止',
      { size: 14, color: C.G6 })
  }
}

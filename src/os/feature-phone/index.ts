import type { PhoneOS, PhoneOSFactory, OSDeps, MiniApp } from '../../kernel/types'
import { AppRuntime } from '../../kernel/runtime'
import type { DeviceKey } from '../../hal/input'
import type { Msg } from './apps/messages'
import { messagesApp } from './apps/messages'
import { contactsApp } from './apps/contacts'
import type { ChatThread } from './apps/chat'
import { flashlightApp } from './apps/flashlight'
import { osStrings } from './strings'
import { BOOT_FRAMES, BOOT_W, BOOT_H, BOOT_FRAME_MS } from './boot'
import { buildMenu, type MenuList, type MenuNode } from './menu-tree'
import { loadContacts, type CallEntry } from '../../scenario/data'
import {
  RINGTONES, MSG_ALERTS, DEFAULT_TONES,
  type TonesConf, type Note,
} from './apps/tones-data'
import {
  DEFAULT_PROFILES, effectiveSettings,
  type ProfilesConf,
} from './apps/profiles-data'
import { SysClock } from './sysclock'
import type { AlarmConf } from './apps/alarm'
import type { CountdownConf } from './apps/countdown'
import { melodyDuration } from '../../hal/audio'

/**
 * 诺基亚经典铃声（Gran Vals 片段，Tárrega 1902，旋律已进入公有域）：
 * E5 D5 F#4 G#4 | C#5 B4 D4 E4 | B4 A4 C#4 E4 | A4
 */
const NOKIA_TUNE: ReadonlyArray<readonly [number, number]> = [
  [76, 0.5], [74, 0.5], [66, 1], [68, 1],
  [73, 0.5], [71, 0.5], [62, 1], [64, 1],
  [71, 0.5], [69, 0.5], [61, 1], [64, 1],
  [69, 2],
]
/** 原版开机动画帧缓存（首次开机解码一次） */
let bootFrames: Uint8Array[] | null = null
function decodeBootFrames(): Uint8Array[] {
  if (bootFrames) return bootFrames
  bootFrames = BOOT_FRAMES.map((b64) => {
    const bin = atob(b64)
    const out = new Uint8Array(BOOT_W * BOOT_H)
    let p = 0
    for (let i = 0; i < bin.length; i += 2) {
      const n = bin.charCodeAt(i)
      const k = bin.charCodeAt(i + 1)
      for (let j = 0; j < n; j++) out[p++] = k
    }
    return out
  })
  return bootFrames
}

export default {
  create(deps: OSDeps): PhoneOS {
    return new FeaturePhoneOS(deps)
  },
} satisfies PhoneOSFactory

class FeaturePhoneOS implements PhoneOS {
  private state: 'off' | 'boot' | 'ui' | 'shutdown' = 'off'
  private powered = false
  private appActive = false
  private ui: UIState | null = null
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  /** 铃声/音量/按键音等（tones app 写裸键 tones:conf，本 OS 监听） */
  tones: TonesConf = { ...DEFAULT_TONES }
  /** 情景模式（profiles app 写裸键 profiles:conf，激活时写回 tones:conf） */
  profiles: ProfilesConf = { active: DEFAULT_PROFILES.active, pers: [...DEFAULT_PROFILES.pers] }
  /** switchApp 期间抑制 onAppExit（app 间直接切换，不回菜单） */
  private suppressExit = false
  /** 键盘锁：待机 UI 切换为 LockedIdleUI；通话结束后仍保持锁定 */
  locked = false
  /** 自动键盘锁开关（1100：keyguard:conf，3310 无此功能） */
  keyguardAuto = false
  /** 待机最近一次按键时刻（自动锁计时用） */
  idleActivityAt = Date.now()
  /** 未读短信（驱动待机屏信封图标），由 store 监听派生 */
  unread = false
  /** 待处理的来电（设备关机/在应用中时暂存，回到待机后触发） */
  private pendingIncoming: { tel: string; name?: string } | null = null
  /** host.dial 暂存：应用退出后直接发起呼叫 */
  private pendingAutoCall: { num: string; name: string } | null = null
  /** 系统时钟（time:offset，时间设置页写、待机时钟/闹钟读） */
  sysclock = new SysClock()
  /** 闹钟本次响铃的 HH:MM 标记（防同一分钟重复；跨分钟后清空重新武装） */
  private alarmLastFire = ''

  private runtime: AppRuntime
  /** 供同文件的 UI 类（IdleUI/MenuUI）使用 */
  readonly deps: OSDeps
  /** 菜单模型（按机型产出：两棵树 + 待机屏形态标志） */
  readonly model: ReturnType<typeof buildMenu>
  /** 菜单导航栈帧（app 退出后恢复同一位置） */
  menuStack: MenuFrame[] = []

  constructor(deps: OSDeps) {
    this.deps = deps
    this.model = buildMenu(deps.profile)
    this.runtime = new AppRuntime(deps, () => this.onAppExit())
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    // 真机 Nokia tune（公有域 Gran Vals 真声录音），开机用；未就绪回落合成旋律
    void this.deps.audio.loadFiles({ nokia_tune: 'feature-phone/sounds/nokia_tune.ogg' })
    await this.sysclock.load(this.deps.store)
    await this.loadTones()
    await this.loadProfiles()
    await this.loadKeyguard()
    await this.seedMessages()
    await this.refreshUnread()
    this.watchStore()
    this.offs.push(this.deps.input.subscribe((k, repeat) => this.onInput(k, repeat)))
    this.offs.push(this.deps.lang.onChange(() => this.onLangChange()))
    this.drawOff()
  }

  /** 语言切换：重绘系统界面；种子短信若原封未动则跟随语言重播 */
  private onLangChange() {
    if (this.state !== 'ui') return
    void this.seedMessages()
    this.ui?.redraw?.()
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.locked = false
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const off of this.offs.splice(0)) off()
    this.ui?.destroy?.()
    this.ui = null
    this.runtime.close()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 电源 ----------

  /** 数字/井星键发 DTMF 双音频，其余键普通哔声 */
  private beep(key: DeviceKey) {
    if (/^[0-9*#]$/.test(key)) this.deps.audio.dtmf(key)
    else this.deps.audio.keypad()
  }

  private onInput(key: DeviceKey, repeat = false) {
    if (key === 'power') {
      // 电源长按/短按在物理层另有判定，这里只接受单次触发
      if (repeat) return
      if (!this.powered) this.boot()
      else this.shutdown()
      return
    }
    if (!this.powered || this.state !== 'ui') return
    if (this.tones.keyBeep) this.beep(key)
    if (this.appActive) return // 交给应用自己处理
    this.ui?.input(key, repeat)
  }

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.deps.audio.unlock()
    // 真机 Nokia tune OGG（公有域真声）；未加载完成则回落合成旋律（140bpm 铺满 4.5s 握手动画）
    if (this.deps.audio.hasFile('nokia_tune')) {
      this.deps.audio.playFile('nokia_tune', { volume: 0.7 })
    } else {
      this.deps.audio.melody(NOKIA_TUNE, 140)
    }
    this.startAlertMonitor()
    let t = 0
    let last = -1
    const off = this.deps.frames.add((dt) => {
      if (this.state !== 'boot') {
        off()
        return
      }
      t += dt
      const idx = Math.min(BOOT_FRAMES.length - 1, Math.floor((t * 1000) / BOOT_FRAME_MS))
      if (idx !== last) {
        last = idx
        this.drawBootFrame(decodeBootFrames()[idx])
      }
    })
    this.timers.push(
      setTimeout(() => {
        off()
        if (this.state === 'boot') this.enterIdle()
      }, BOOT_FRAMES.length * BOOT_FRAME_MS + 100),
    )
  }

  /** 单色握手动画帧：保比例缩放居中（3310 原生 40×48；1100 屏更大则放大） */
  private drawBootFrame(fr: Uint8Array) {
    const s = this.deps.screen
    s.clear()
    const scale = Math.min(s.w / BOOT_W, s.h / BOOT_H)
    const dw = Math.round(BOOT_W * scale)
    const dh = Math.round(BOOT_H * scale)
    const ox = (s.w - dw) >> 1
    const oy = (s.h - dh) >> 1
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(BOOT_H - 1, (y / scale) | 0)
      const row = sy * BOOT_W
      for (let x = 0; x < dw; x++) {
        if (fr[row + Math.min(BOOT_W - 1, (x / scale) | 0)]) s.pset(ox + x, oy + y)
      }
    }
  }

  private shutdown() {
    if (this.state === 'shutdown' || this.state === 'off') return
    this.state = 'shutdown' // 先置状态，防止 runtime.close 的回调重绘菜单
    this.locked = false
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.runtime.close()
    this.ui?.destroy?.()
    this.ui = null
    let t = 0
    let flashes = 0
    const off = this.deps.frames.add((dt) => {
      t += dt
      if (t < 0.13) return
      t = 0
      this.deps.screen.invertRect(0, 0, this.deps.screen.w, this.deps.screen.h)
      if (++flashes >= 6) {
        off()
        this.powered = false
        this.state = 'off'
        this.drawOff()
      }
    })
  }

  private drawOff() {
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- UI 状态切换（供 UI 类调用，故为 public） ----------

  enterIdle() {
    this.state = 'ui'
    this.appActive = false
    this.idleActivityAt = Date.now()
    // 待机不持有菜单栈：从待机直接启动的 app 退出时应回待机而非菜单
    this.menuStack = []
    this.ui?.destroy?.()
    this.ui = this.locked ? new LockedIdleUI(this) : new IdleUI(this)
    // 回到待机后，若有暂存的来电则触发
    if (this.pendingIncoming) {
      const p = this.pendingIncoming
      this.pendingIncoming = null
      this.enterRinging(p.tel, p.name)
    }
  }

  /** 锁键盘（仅待机态可锁；真机 Menu+*） */
  lock() {
    if (this.state !== 'ui' || this.appActive) return
    this.locked = true
    this.ui?.destroy?.()
    this.ui = new LockedIdleUI(this)
  }

  /** 解键盘锁（真机 Menu+*） */
  unlock() {
    this.locked = false
    this.enterIdle()
  }

  /** 锁态拨紧急号 112：进拨号界面（用户再按呼叫），通话结束仍保持锁定 */
  emergencyDial(num: string) {
    this.state = 'ui'
    this.appActive = false
    this.ui?.destroy?.()
    this.ui = new DialUI(this, num)
  }

  /** 来电（情景编排触发） */
  enterRinging(tel: string, name?: string) {
    if (this.state !== 'ui') { this.pendingIncoming = { tel, name }; return }
    if (this.appActive) { this.pendingIncoming = { tel, name }; return }
    this.ui?.destroy?.()
    this.ui = new RingingUI(this, tel, name)
  }

  /** 从待机进功能表：导航栈重置为根；viaMenuKey 决定 Menu+* 快捷锁是否可用 */
  enterMenu(viaMenuKey = false) {
    this.menuStack = [{ node: this.model.root, sel: 0, top: 0 }]
    this.menuOpenedAt = Date.now()
    this.menuOpenedViaKey = viaMenuKey
    this.showMenu()
  }

  /** 功能表打开时刻（MenuUI 判定 * 快捷锁用） */
  menuOpenedAt = 0
  private menuOpenedViaKey = false

  /** MenuUI 中按 *：仅在按功能表键打开根菜单 1.5s 内成立（真机 Menu+*） */
  shortcutLockEligible(): boolean {
    return (
      this.menuOpenedViaKey &&
      this.menuStack.length === 1 &&
      Date.now() - this.menuOpenedAt < 1500
    )
  }

  private showMenu() {
    this.state = 'ui'
    this.appActive = false
    this.ui?.destroy?.()
    this.ui = new MenuUI(this)
  }

  /** 待机按数字直接拨号（真机行为） */
  enterDial(firstDigit: string) {
    this.state = 'ui'
    this.appActive = false
    this.ui?.destroy?.()
    this.ui = new DialUI(this, firstDigit)
  }

  launch(app: MiniApp) {
    this.ui?.destroy?.()
    this.ui = null
    this.appActive = true
    this.runtime.launch(app, {
      messageSent: (to) => this.scheduleReply(to),
      getUserTune: () =>
        this.deps.store.get<number[]>('composer:tune').then((t) => t ?? null),
      getContacts: () => loadContacts(this.deps.store.get.bind(this.deps.store)),
      getCallLog: () =>
        this.deps.store.get<CallEntry[]>('calllog').then((l) => l ?? []),
      deleteCallLog: (kind) => this.deleteCallLog(kind),
      dial: (num, name) => this.dial(num, name),
      saveContacts: (list) => this.deps.store.set('contacts', list),
      sendCard: (name, tel) => this.sendCard(name, tel),
      chatSend: (text) => void this.chatSend(text),
      getProfiles: async () => this.profiles,
      saveProfiles: (conf, apply) => this.saveProfiles(conf, apply),
      relaunch: (app) => this.switchApp(app),
      setClockTime: (h, m) => this.sysclock.setTime(this.deps.store, h, m),
      setClockDate: (y, mo, d) => this.sysclock.setDate(this.deps.store, y, mo, d),
      factoryReset: () => this.factoryReset(),
    })
  }

  /** 恢复出厂：清空本设备全部键，内存态回默认并重播种子短信 */
  private async factoryReset() {
    await this.deps.store.clearAll()
    this.tones = { ...DEFAULT_TONES }
    this.profiles = { active: DEFAULT_PROFILES.active, pers: [...DEFAULT_PROFILES.pers] }
    this.keyguardAuto = false
    this.locked = false
    await this.applyProfile(0)
    await this.seedMessages()
    await this.refreshUnread()
  }

  // ---------- 闹钟/倒计时监视 ----------

  /** 开机后每 5s 巡检（关机时 timers 被清空，再次开机重新启动） */
  private startAlertMonitor() {
    const tick = () => {
      void this.checkAlerts()
      this.timers.push(setTimeout(tick, 5000))
    }
    this.timers.push(setTimeout(tick, 5000))
  }

  private async checkAlerts() {
    if (!this.powered || this.state !== 'ui') return
    // 来电响铃/通话中不抢占（本拍跳过，下拍再来：闹钟标记尚未置位、倒计时 conf 仍 run）
    if (this.ui instanceof RingingUI || this.ui instanceof DialUI) return
    // 闹钟：时/分吻合即响（同分钟只响一次）
    const alarm = await this.deps.store.get<AlarmConf>('alarm:conf')
    const now = this.sysclock.now()
    const key = `${now.getHours()}:${now.getMinutes()}`
    if (alarm?.on && `${alarm.h}:${alarm.m}` === key) {
      if (this.alarmLastFire !== key) {
        this.alarmLastFire = key
        this.fireAlert('alarm')
      }
    } else if (this.alarmLastFire) {
      this.alarmLastFire = ''
    }
    // 倒计时：到点急哔+闪烁，conf 置为停
    const cd = await this.deps.store.get<CountdownConf>('countdown:conf')
    if (cd?.run && cd.endAt <= Date.now()) {
      await this.deps.store.set('countdown:conf', { ...cd, run: false })
      this.fireAlert('timer')
    }
  }

  /** 闹钟/倒计时到点：抢占当前界面（含 app），任意键停止后回待机 */
  private fireAlert(kind: 'alarm' | 'timer') {
    this.suppressExit = true
    this.runtime.close()
    this.suppressExit = false
    this.appActive = false
    this.state = 'ui'
    this.ui?.destroy?.()
    this.ui = new AlertUI(this, kind)
  }

  /** 保存情景模式配置；apply 时立即把活动模式写入铃声配置 */
  private async saveProfiles(conf: unknown, apply: boolean) {
    this.profiles = conf as ProfilesConf
    await this.deps.store.set('profiles:conf', this.profiles)
    if (apply) await this.applyProfile(this.profiles.active)
  }

  /** app 间直接切换（不回菜单、不恢复栈） */
  private switchApp(app: MiniApp) {
    this.suppressExit = true
    this.runtime.close()
    this.suppressExit = false
    this.launch(app)
  }

  /** 应用请求拨号：关应用 → DialUI 直接进呼叫中（不等用户再按） */
  private dial(num: string, name?: string) {
    if (!num) return
    this.pendingAutoCall = { num, name: name ?? '' }
    this.runtime.close()
  }

  private onAppExit() {
    this.appActive = false
    if (this.suppressExit || this.state !== 'ui') return
    // host.dial 发起的退出：直接进自动呼叫
    if (this.pendingAutoCall) {
      const p = this.pendingAutoCall
      this.pendingAutoCall = null
      this.state = 'ui'
      this.ui?.destroy?.()
      this.ui = new DialUI(this, p.num, true, p.name)
      return
    }
    // 回到退出前所在的菜单列表与选中位置；从待机直接启动的 app（手电筒/通讯录等）栈为空 → 回待机
    if (!this.menuStack.length) {
      this.enterIdle()
      return
    }
    this.showMenu()
  }

  /** 清空通话记录：按类过滤保留其余条目，重写裸键 calllog */
  private async deleteCallLog(kind: 'all' | 'missed' | 'received' | 'dialled') {
    const log = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    const keep = log.filter((e) => {
      if (kind === 'all') return false
      if (kind === 'missed') return !e.missed
      if (kind === 'received') return !(e.dir === 'in' && !e.missed)
      return e.dir !== 'out' // dialled
    })
    await this.deps.store.set('calllog', keep)
  }

  // ---------- 短信生态（OS 层负责：种子消息、自动回复、铃声） ----------

  private async seedMessages() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    const s = osStrings(this.deps.lang.get())
    if (inbox) {
      // 收件箱仍是原封种子（用户尚未收发任何短信）时，跟随语言重播种子；
      // 一旦有过收发，消息像真手机一样保留原语言。
      const seedTexts = [
        ...Object.values(osStrings('zh')),
        ...Object.values(osStrings('en')),
      ].flatMap((v) => (typeof v === 'string' ? [v] : []))
      const pristine =
        inbox.length === 2 && inbox.every((m) => seedTexts.includes(m.text))
      if (!pristine) return
    }
    const now = Date.now()
    await this.deps.store.set('messages:inbox', [
      { id: now - 7200_000, from: '10086', text: s.seedWelcome, ts: now - 7200_000, read: false, mine: false },
      { id: now - 3600_000, from: s.recipient, text: s.seedMom, ts: now - 3600_000, read: false, mine: false },
    ] satisfies Msg[])
  }

  private scheduleReply(to?: string) {
    const delay = 4500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.deliverReply(to ?? ''), delay))
  }

  private async deliverReply(to: string) {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    const s = osStrings(this.deps.lang.get())
    const contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    const matched = contacts.find((c) => c.tel === to)
    const from = matched?.name ?? (to || s.recipient)
    inbox.push({
      id: Date.now(),
      from,
      text: s.replies[Math.floor(Math.random() * s.replies.length)],
      ts: Date.now(),
      read: false,
      mine: false,
    })
    await this.deps.store.set('messages:inbox', inbox)
    // 短信提示音：tones:conf.msgIdx 选定（msgSound=false 的情景不响）
    if (this.tones.msgSound) {
      this.deps.audio.unlock()
      this.deps.audio.melody(MSG_ALERTS[this.tones.msgIdx]?.notes ?? MSG_ALERTS[1]!.notes, 260)
    }
  }

  // ---------- 发送名片 / Chat ----------

  /** 通讯录“发送名片”：预填文本写裸键 messages:prefill，切写信息 */
  private async sendCard(name: string, tel: string) {
    await this.deps.store.set('messages:prefill', { text: `${name} ${tel}` })
    if (this.appActive) this.switchApp(messagesApp('write'))
    else this.launch(messagesApp('write'))
  }

  /** Chat 发出一行：写线程后调度同线程回复（回复不进 SMS inbox） */
  private async chatSend(text: string) {
    await this.appendChat(text, true)
    const delay = 3500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.chatReply(), delay))
  }

  private async chatReply() {
    const s = osStrings(this.deps.lang.get())
    await this.appendChat(s.replies[Math.floor(Math.random() * s.replies.length)]!, false)
    if (this.tones.msgSound) {
      this.deps.audio.unlock()
      this.deps.audio.melody(MSG_ALERTS[this.tones.msgIdx]?.notes ?? MSG_ALERTS[1]!.notes, 220)
    }
  }

  private async appendChat(text: string, mine: boolean) {
    const threads = (await this.deps.store.get<ChatThread[]>('chat:threads')) ?? []
    const th = threads[0]
    if (!th) return
    th.lines.push({ id: Date.now(), mine, text, ts: Date.now() })
    await this.deps.store.set('chat:threads', threads)
  }

  private async refreshUnread() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    this.unread = !!inbox?.some((m) => !m.read && !m.mine)
  }

  // ---------- 情景编排：来电 / 来短信 / 通话记录 ----------

  /** 外部来电（DeviceShell 调度器触发） */
  incomingCall(tel: string, name?: string) {
    if (!this.powered || this.state !== 'ui') {
      this.pendingIncoming = { tel, name }
      return
    }
    this.enterRinging(tel, name)
  }

  /** 外部来短信（DeviceShell 调度器触发） */
  async injectSms(from: string, text: string) {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    inbox.push({ id: Date.now(), from, text, ts: Date.now(), read: false, mine: false })
    await this.deps.store.set('messages:inbox', inbox)
    // 提示音按 tones:conf.msgIdx（msgSound=false 的情景不响）
    if (this.powered && this.tones.msgSound) {
      this.deps.audio.unlock()
      this.deps.audio.melody(MSG_ALERTS[this.tones.msgIdx]?.notes ?? MSG_ALERTS[1]!.notes, 260)
    }
  }

  /** 记一条通话（去电/来电/未接），供 DialUI 与 RingingUI 调用 */
  async recordCall(e: Omit<CallEntry, 'id' | 'ts'>) {
    const log = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    log.push({ ...e, id: Date.now(), ts: Date.now() })
    // 保留最近 30 条
    const trimmed = log.slice(-30)
    await this.deps.store.set('calllog', trimmed)
  }

  // ---------- 铃声设置（跨界面联动） ----------

  private async loadTones() {
    const saved = await this.deps.store.get<TonesConf>('tones:conf')
    if (saved) this.tones = { ...DEFAULT_TONES, ...saved }
  }

  /** 载入自动键盘锁设置（keyguard app 经 AppStore 写 <dev>:keyguard:conf） */
  private async loadKeyguard() {
    const saved = await this.deps.store.get<{ auto: boolean }>('keyguard:conf')
    this.keyguardAuto = !!saved?.auto
  }

  /** 待机按键活动：刷新自动锁计时 */
  touchActivity() {
    this.idleActivityAt = Date.now()
  }

  /** 载入情景模式；首次使用（无 profiles:conf）则套用 General 预设 */
  private async loadProfiles() {
    const saved = await this.deps.store.get<ProfilesConf>('profiles:conf')
    if (saved) { this.profiles = saved; return }
    await this.applyProfile(0)
  }

  /** 激活某模式：把该模式设置并入 tones 并落 tones:conf（铃声选择/曲目索引不动） */
  private async applyProfile(idx: number) {
    const s = effectiveSettings(this.profiles, idx)
    this.profiles.active = idx
    this.tones = {
      ...this.tones,
      ringLevel: s.ringLevel,
      alert: s.alert,
      keyBeep: s.keyBeep,
      vibrate: s.vibrate,
      msgSound: s.msgSound,
    }
    await this.deps.store.set('tones:conf', this.tones)
  }

  private watchStore() {
    const prefix = `${this.deps.profile.id}:`
    this.offs.push(
      this.deps.store.onChange((fk) => {
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}tones:`)) void this.loadTones()
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}messages:`)) void this.refreshUnread()
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}profiles:`))
          void this.deps.store.get<ProfilesConf>('profiles:conf').then((c) => { if (c) this.profiles = c })
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}keyguard:`)) void this.loadKeyguard()
      }),
    )
  }
}

interface UIState {
  input(key: DeviceKey, repeat: boolean): void
  destroy?(): void
  /** 语言切换后的重绘（每帧自绘的界面无需实现） */
  redraw?(): void
}

// ---------- 待机屏 ----------

class IdleUI implements UIState {
  private t = 0
  private offs: Array<() => void> = []
  /** clear 长按计时（1100：待机按住 ≥900ms 进手电筒；frame 里看 isDown） */
  private clearArmed = false
  private clearHeld = 0

  constructor(protected os: FeaturePhoneOS) {
    this.offs.push(
      os.deps.frames.add((dt) => {
        this.t += dt
        // 自动键盘锁（1100）：待机 12s 无操作（锁定态不重复触发）
        if (!this.os.locked && this.os.keyguardAuto && Date.now() - this.os.idleActivityAt > 12000) {
          this.os.lock()
          return
        }
        if (this.clearArmed) {
          if (!this.os.deps.input.isDown('clear')) {
            // 短按松手：待机 C 无动作（真机如此）
            this.clearArmed = false
          } else {
            this.clearHeld += dt
            if (this.clearHeld >= 0.9) {
              this.clearArmed = false
              this.os.launch(flashlightApp)
              return
            }
          }
        }
        this.draw()
      }),
    )
  }

  input(key: DeviceKey, repeat: boolean) {
    this.os.touchActivity()
    if (repeat) return
    if (/^[0-9*#]$/.test(key)) this.os.enterDial(key)
    // 功能表键：打开菜单并准备 Menu+* 快捷锁；上下键直接进菜单但不武装
    else if (key === 'ok' || key === 'soft1') this.os.enterMenu(true)
    else if (key === 'up' || key === 'down') this.os.enterMenu(false)
    // 右软键 = Names（通讯录），真机两机一致
    else if (key === 'soft2') this.os.launch(contactsApp('search'))
    // C：不立即动作，按住时长交给 frame 判定（短按无动作 / 长按手电筒）
    else if (key === 'clear') { this.clearArmed = true; this.clearHeld = 0 }
  }

  redraw() {
    /* 待机屏每帧自绘，语言切换自然生效 */
  }

  destroy() {
    this.offs.forEach((off) => off())
  }

  protected draw() {
    this.drawIdle(false, false)
  }

  /**
   * 待机内容（LockedIdleUI 复用）：
   * skipClock=true 不画大时钟（锁定屏让出中央）；skipLabels=true 不画底部软键行。
   */
  protected drawIdle(skipClock: boolean, skipLabels: boolean) {
    const { screen, battery } = this.os.deps
    const str = osStrings(this.os.deps.lang.get())
    const W = screen.w
    const H = screen.h
    screen.clear()
    // 信号强度（随时间轻微波动，1..最高段）
    const strength = Math.min(5, Math.max(1, 3 + Math.round(Math.sin(this.t / 9) * 0.9)))
    if (this.os.model.dashedSignal) this.drawDashedSignal(strength)
    else this.drawBarSignal(strength)
    // 电量格（右上角锚定）：边框 + 内部填充留 1px 上下边距，不顶满
    const cells = Math.ceil(battery.percent / 25)
    screen.frameRect(W - 18, 2, 15, 7)
    for (let i = 0; i < 4; i++) {
      if (i < cells) screen.fillRect(W - 17 + i * 4, 4, 3, 3)
    }
    // 未读短信：闪烁信封（电量左侧）
    if (this.os.unread && Math.floor(this.t * 2) % 2 === 0) {
      screen.bitmap(W - 29, 2, [
        '########',
        '#......#',
        '##....##',
        '#.#..#.#',
        '#..##..#',
        '#......#',
        '########',
      ])
    }
    // 运营商名居中（小字）
    screen.textCenter(W >> 1, 11, str.operator, { size: 9 })
    if (!skipClock && this.os.model.idleClock) {
      // 1100：居中大时钟（用户在时间设置里校准过的系统时间）
      const d = this.os.sysclock.now()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      screen.textCenter(W >> 1, 22, `${hh}:${mm}`, { size: 14 })
    }
    if (!skipLabels) {
      if (this.os.model.idleClock) {
        // 底部软键：功能表 / 通讯录
        screen.text(1, H - 10, str.idleMenu, { size: 9 })
        screen.textRight(W - 1, H - 10, str.idleNames, { size: 9 })
      } else {
        // 3310：无时钟，Navi 引导字居中
        screen.textCenter(W >> 1, H - 10, str.idleMenu, { size: 9 })
      }
    }
  }

  /** 1100：左上四级阶梯信号柱 */
  private drawBarSignal(strength: number) {
    const screen = this.os.deps.screen
    for (let i = 0; i < 4; i++) {
      const h = 2 + i * 2
      if (i < strength) screen.fillRect(2 + i * 3, 10 - h, 2, h)
      else screen.frameRect(2 + i * 3, 10 - h, 2, h)
    }
  }

  /** 3310：最左缘竖虚线列，两亮一灭，强度决定自下而上点亮段数 */
  private drawDashedSignal(strength: number) {
    const screen = this.os.deps.screen
    // 底段贴近软键行上沿，向上排 5 段
    for (let i = 0; i < 5; i++) {
      if (i >= strength) continue
      const y = 34 - i * 3
      screen.fillRect(0, y, 2, 2)
    }
  }
}

// ---------- 键盘锁定待机（真机：锁图标 + Menu+* 解锁 + 112 紧急呼叫） ----------

const PADLOCK: string[] = [
  '..####..',
  '.##..##.',
  '.##..##.',
  '########',
  '#.#..#.#',
  '#.#..#.#',
  '########',
  '########',
]

class LockedIdleUI extends IdleUI {
  /** 解锁序列 Menu+* 的窗口 */
  private armed = false
  private armedAt = 0
  /** 已录入的紧急号缓冲（只接受 112 前缀） */
  private buf = ''
  /** 「键盘已锁」提示截止时刻 */
  private lockedUntil = 0

  constructor(os: FeaturePhoneOS) {
    super(os)
  }

  input(key: DeviceKey, repeat: boolean) {
    this.os.touchActivity()
    if (repeat) return
    switch (key) {
      case 'ok':
      case 'soft1':
        if (this.buf === '112') { this.os.emergencyDial(this.buf); return }
        this.armed = true
        this.armedAt = Date.now()
        break
      case '*':
        if (this.armed && Date.now() - this.armedAt < 1500) this.os.unlock()
        else { this.armed = false; this.showLocked() }
        break
      default:
        if (/^[0-9]$/.test(key)) {
          this.armed = false
          const nb = this.buf + key
          if ('112'.startsWith(nb)) this.buf = nb
          else { this.buf = ''; this.showLocked() }
        } else {
          this.showLocked()
        }
    }
  }

  private showLocked() {
    this.lockedUntil = Date.now() + 1200
  }

  protected draw() {
    // 待机背景（无时钟、无底部软键行，中央全部留给锁定界面）
    this.drawIdle(true, true)
    const s = this.os.deps.screen
    const str = osStrings(this.os.deps.lang.get())
    const W = s.w
    const H = s.h
    if (this.buf) {
      // 紧急号码录入：大号显示 + 紧急呼叫字样
      s.textCenter(W >> 1, (H >> 1) - 10, this.buf, { size: 14 })
      if (this.buf === '112') s.textCenter(W >> 1, (H >> 1) + 8, str.kgEmergency, { size: 9 })
    } else if (Date.now() < this.lockedUntil) {
      s.frameRect(4, (H >> 1) - 8, W - 8, 16)
      s.textCenter(W >> 1, (H >> 1) - 4, str.kgLocked, { size: 9 })
    } else if (this.armed && Date.now() - this.armedAt < 1500) {
      s.textCenter(W >> 1, (H >> 1) - 4, str.kgUnlockHint, { size: 9 })
    } else {
      // 常规锁定：中央挂锁
      s.bitmap((W >> 1) - 4, (H >> 1) - 4, PADLOCK)
    }
  }
}

// ---------- 闹钟/倒计时到点全屏提示（闪烁 + 急哔，任意键停止后回待机） ----------

class AlertUI implements UIState {
  private t = 0
  private beepAt = 0
  private offs: Array<() => void> = []

  constructor(
    private os: FeaturePhoneOS,
    private kind: 'alarm' | 'timer',
  ) {
    this.offs.push(
      os.deps.frames.add((dt) => {
        this.t += dt
        // 闹钟：高低双音每秒一组；倒计时：三连短急哔每 1.2s 一组
        if (this.t >= this.beepAt) {
          const audio = this.os.deps.audio
          audio.unlock()
          if (this.kind === 'alarm') {
            audio.tone(880, 0.12, { type: 'square', gain: 0.07 })
            setTimeout(() => audio.tone(1175, 0.15, { type: 'square', gain: 0.07 }), 160)
            this.beepAt = this.t + 1
          } else {
            audio.tone(1320, 0.07, { type: 'square', gain: 0.08 })
            setTimeout(() => audio.tone(1320, 0.07, { type: 'square', gain: 0.08 }), 130)
            setTimeout(() => audio.tone(1320, 0.07, { type: 'square', gain: 0.08 }), 260)
            this.beepAt = this.t + 1.2
          }
        }
        this.draw()
      }),
    )
  }

  input() {
    // 任意键停止，回待机（不恢复被抢占的 app）
    this.os.enterIdle()
  }

  destroy() {
    this.offs.forEach((off) => off())
  }

  private draw() {
    const s = this.os.deps.screen
    const str = osStrings(this.os.deps.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    const text = this.kind === 'alarm' ? str.alarmAlert : str.cdDone
    s.textCenter(W >> 1, (H >> 1) - 6, text, { size: 14 })
    // 边框闪烁
    if (Math.floor(this.t * 2) % 2 === 0) s.frameRect(2, (H >> 1) - 12, W - 4, 24)
  }
}

// ---------- 功能表（栈式滚动文本列表，对齐 1100/3310 真机） ----------

/** 导航栈帧：当前列表 + 选中项 + 滚动窗顶 */
interface MenuFrame {
  node: MenuList
  sel: number
  top: number
}

class MenuUI implements UIState {
  /** 行高 11px（9px 字） */
  private static readonly RH = 11
  /** 可视行数：3310 3 行 / 1100 4 行 */
  private readonly rows: number
  /** 数字快捷序号缓冲（1500ms） */
  private numBuf = ''
  private numTimer: ReturnType<typeof setTimeout> | null = null
  /** clear 长按计时（armed 后在 frame 里看 isDown） */
  private clearArmed = false
  private clearHeld = 0
  private offs: Array<() => void> = []

  constructor(private os: FeaturePhoneOS) {
    this.rows = Math.floor((os.deps.screen.h - 11) / 11)
    this.offs.push(os.deps.frames.add((dt) => this.frame(dt)))
    this.adjustTop()
    this.draw()
  }

  input(key: DeviceKey, repeat: boolean) {
    if (repeat) return
    const f = this.os.menuStack[this.os.menuStack.length - 1]
    switch (key) {
      case 'up':
        this.move(f, -1)
        break
      case 'down':
        this.move(f, 1)
        break
      case 'ok':
      case 'soft1':
        this.openNode(f.node.items[f.sel])
        break
      // clear/back：不立即返回，松手短按才返回（按住 ≥700ms 为回根帧）
      case 'clear':
      case 'back':
      case 'soft2':
        this.clearArmed = true
        this.clearHeld = 0
        break
      case '*':
        // 真机 Menu+*：功能表键打开根菜单 1.5s 内按 * 即锁键盘
        if (this.os.shortcutLockEligible()) this.os.lock()
        break
      default:
        if (/^[0-9]$/.test(key)) this.typeDigit(f, key)
    }
  }

  redraw() {
    this.draw()
  }

  destroy() {
    this.offs.forEach((off) => off())
    if (this.numTimer) clearTimeout(this.numTimer)
  }

  private frame(dt: number) {
    if (!this.clearArmed) return
    const { input } = this.os.deps
    if (!input.isDown('clear') && !input.isDown('back')) {
      // 已松手 = 短按：弹一层
      this.clearArmed = false
      this.backOne()
      return
    }
    this.clearHeld += dt
    if (this.clearHeld >= 0.7) {
      // 长按：一次弹回根帧
      this.clearArmed = false
      this.os.menuStack = this.os.menuStack.slice(0, 1)
      const root = this.os.menuStack[0]
      root.sel = 0
      root.top = 0
      this.draw()
    }
  }

  private backOne() {
    this.resetNum()
    if (this.os.menuStack.length > 1) {
      this.os.menuStack.pop()
      this.draw()
    } else {
      this.os.enterIdle()
    }
  }

  private move(f: MenuFrame, d: number) {
    this.resetNum()
    const n = f.node.items.length
    f.sel = (f.sel + d + n) % n
    this.adjustTop()
    this.draw()
  }

  private openNode(node: MenuNode) {
    this.resetNum()
    if (node.kind === 'list') {
      this.os.menuStack.push({ node, sel: 0, top: 0 })
      this.adjustTop()
      this.draw()
    } else {
      this.os.launch(node.app)
    }
  }

  /** 数字快捷序号：1100 根层两位（先收 0），其余单位序号 */
  private typeDigit(f: MenuFrame, d: string) {
    const items = f.node.items
    const tryBuf = (buf: string) => {
      const exact = items.filter((i) => i.num === buf)
      const prefixes = items.filter((i) => i.num && i.num.startsWith(buf) && i.num !== buf)
      return { exact, prefixes }
    }
    const buf = this.numBuf + d
    const { exact, prefixes } = tryBuf(buf)
    if (exact.length && !prefixes.length) {
      this.openNode(exact[0])
      return
    }
    if (exact.length || prefixes.length) {
      // 序号尚有歧义（如 3310 根层 '1' 对 '11/12/13'）：选中先跳到精确项，
      // 等下一位；1.5s 无后续再打开精确项
      this.armNum(buf, f, exact.length ? exact[0] : null, tryBuf)
      return
    }
    // 无匹配：用当前数字重新起缓冲
    this.resetNum()
    const restart = tryBuf(d)
    if (restart.exact.length && !restart.prefixes.length) this.openNode(restart.exact[0])
    else if (restart.exact.length || restart.prefixes.length)
      this.armNum(d, f, restart.exact.length ? restart.exact[0] : null, tryBuf)
  }

  private armNum(
    buf: string,
    f: MenuFrame,
    exact: MenuNode | null,
    tryBuf: (b: string) => { exact: MenuNode[]; prefixes: MenuNode[] },
  ) {
    this.numBuf = buf
    if (exact) {
      f.sel = f.node.items.indexOf(exact)
      this.adjustTop()
      this.draw()
    }
    if (this.numTimer) clearTimeout(this.numTimer)
    this.numTimer = setTimeout(() => {
      const cur = this.numBuf
      this.resetNum()
      const t = tryBuf(cur)
      if (t.exact.length) this.openNode(t.exact[0])
    }, 1500)
  }

  private resetNum() {
    this.numBuf = ''
    if (this.numTimer) {
      clearTimeout(this.numTimer)
      this.numTimer = null
    }
  }

  /** 保证选中行落在滚动窗内 */
  private adjustTop() {
    for (const f of this.os.menuStack) {
      if (f.sel < f.top) f.top = f.sel
      if (f.sel >= f.top + this.rows) f.top = f.sel - this.rows + 1
      if (f.top < 0) f.top = 0
    }
  }

  private draw() {
    const { screen, lang } = this.os.deps
    const s = osStrings(lang.get())
    const W = screen.w
    const H = screen.h
    screen.clear()
    const f = this.os.menuStack[this.os.menuStack.length - 1]
    // 列表行：先绘文字再反白选中行 → 亮条暗字
    for (let r = 0; r < this.rows; r++) {
      const i = f.top + r
      const node = f.node.items[i]
      if (!node) break
      const y = r * MenuUI.RH
      const label = lang.get() === 'zh' ? node.label.zh : node.label.en
      screen.text(2, y + 1, label, { size: 9 })
      if (i === f.sel) screen.invertRect(0, y, W, MenuUI.RH)
    }
    // 右侧 1px 滚动条（仅超长列表）
    const total = f.node.items.length
    if (total > this.rows) {
      const trackH = H - 11
      const thumbY = Math.floor((f.top / total) * trackH)
      const thumbH = Math.max(2, Math.floor((this.rows / total) * trackH))
      screen.fillRect(W - 1, thumbY, 1, thumbH)
    }
    // 底部：Select / Back
    screen.text(1, H - 10, s.menuSelect, { size: 9 })
    screen.textRight(W - 1, H - 10, s.menuBack, { size: 9 })
  }
}

// ---------- 拨号 / 通话（真机：待机按数字即拨号） ----------

class DialUI implements UIState {
  private num: string
  private sub: 'dial' | 'calling' | 'call' = 'dial'
  private t = 0
  private offs: Array<() => void> = []
  private ringInt: ReturnType<typeof setInterval> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  /** 通话接通时刻（用于计算时长） */
  private connectedAt = 0
  /** 被叫名（从通讯录/电话本经 host.dial 发起呼叫时带上） */
  private callName: string

  constructor(private os: FeaturePhoneOS, firstDigit: string, autoCall = false, callName = '') {
    this.num = firstDigit
    this.callName = callName
    this.offs.push(
      os.deps.frames.add((dt) => {
        this.t += dt
        this.draw()
      }),
    )
    if (autoCall) this.startCall()
  }

  input(key: DeviceKey) {
    if (this.sub === 'dial') {
      if (/^[0-9*#]$/.test(key)) {
        if (this.num.length < 12) this.num += key
      } else if (key === 'clear') {
        this.num = this.num.slice(0, -1)
        if (!this.num) this.os.enterIdle()
      } else if (key === 'ok' || key === 'soft1') {
        this.startCall()
      } else if (key === 'soft2' || key === 'back') {
        this.os.enterIdle()
      }
      return
    }
    // 呼叫中 / 通话中：soft2 挂断
    if (key === 'soft2' || key === 'back' || key === 'ok' || key === 'clear') {
      this.endCall()
    }
  }

  redraw() {
    /* 每帧自绘 */
  }

  private startCall() {
    this.sub = 'calling'
    this.t = 0
    // 回铃音：440+480Hz（拨通前的等待音）
    this.os.deps.audio.ringbackTone(0.4)
    this.ringInt = setInterval(() => this.os.deps.audio.ringbackTone(0.4), 1200)
    this.connectTimer = setTimeout(() => {
      if (this.sub === 'calling') {
        this.sub = 'call'
        this.t = 0
        this.connectedAt = Date.now()
      }
    }, 2600)
  }

  private endCall() {
    // 记录去电：仅在真正接通后记录（未接通挂断不计入）
    if (this.sub === 'call') {
      void this.os.recordCall({
        tel: this.num,
        name: this.callName,
        dir: 'out',
        dur: Math.floor((Date.now() - this.connectedAt) / 1000),
        missed: false,
      })
    }
    this.os.enterIdle() // destroy() 清理回铃音/定时器
  }

  destroy() {
    if (this.ringInt) {
      clearInterval(this.ringInt)
      this.ringInt = null
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.offs.forEach((off) => off())
  }

  private draw() {
    const s = this.os.deps.screen
    const str = osStrings(this.os.deps.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.sub === 'dial') {
      const cursor = Math.floor(this.t * 2) % 2 === 0 ? '_' : ''
      s.textCenter(W >> 1, Math.max(12, (H >> 1) - 12), this.num + cursor, { size: 14 })
      if (this.num) {
        s.text(1, H - 11, str.dialCall, { size: 9 })
        s.textRight(W - 1, H - 11, str.dialExit, { size: 9 })
      }
    } else if (this.sub === 'calling') {
      s.textCenter(W >> 1, Math.max(12, (H >> 1) - 18), str.calling, { size: 9 })
      s.textCenter(W >> 1, Math.max(12, (H >> 1) - 4), this.num, { size: 14 })
      s.textCenter(W >> 1, (H >> 1) + 12, '.'.repeat(Math.floor(this.t * 2) % 4))
      s.textRight(W - 1, H - 11, str.endCall, { size: 9 })
    } else {
      s.textCenter(W >> 1, Math.max(10, (H >> 1) - 16), str.inCall, { size: 9 })
      const sec = Math.floor(this.t)
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      s.textCenter(W >> 1, Math.max(12, (H >> 1) - 2), `${mm}:${ss}`, { size: 14 })
      s.textRight(W - 1, H - 11, str.endCall, { size: 9 })
    }
  }
}

// ---------- 来电（情景编排触发，系统级中断） ----------

class RingingUI implements UIState {
  private t = 0
  private offs: Array<() => void> = []
  private ringerStop: (() => void) | null = null
  private ringerTimers: Array<ReturnType<typeof setTimeout>> = []
  private vibTimer: ReturnType<typeof setInterval> | null = null
  private missTimer: ReturnType<typeof setTimeout> | null = null
  private answered = false
  private dead = false
  private connectedAt = 0
  /** 各级音量（0 级由情景模式 Silent 写入：不响） */
  private static readonly LEVEL_VOL = [0, 0.15, 0.3, 0.45, 0.6]

  constructor(private os: FeaturePhoneOS, private tel: string, private name?: string) {
    this.offs.push(os.deps.frames.add((dt) => { this.t += dt; this.draw() }))
    os.deps.audio.unlock()
    void this.startRinger()
    // ~15s 未接 → 自动挂断记未接
    this.missTimer = setTimeout(() => { if (!this.answered) this.reject() }, 15000)
  }

  /** 按 tones:conf 选定的曲目与提醒方式响铃（异步取曲目，途中挂断则中止） */
  private async startRinger() {
    const c = this.os.tones
    const tune = await this.resolveTune()
    if (this.dead || this.answered) return
    const vol = RingingUI.LEVEL_VOL[c.ringLevel] ?? 0.3
    if (c.alert === 'ring') {
      if (vol > 0)
        this.ringerStop = this.os.deps.audio.playMelody(tune.notes, tune.bpm, { loop: true, volume: vol })
    } else if (c.alert === 'once') {
      if (vol > 0)
        this.ringerStop = this.os.deps.audio.playMelody(tune.notes, tune.bpm, { volume: vol })
    } else {
      // Ascending：每遍音量升一级，到最高级保持
      let level = 1
      const chain = () => {
        if (this.dead || this.answered) return
        this.ringerStop = this.os.deps.audio.playMelody(tune.notes, tune.bpm, {
          volume: RingingUI.LEVEL_VOL[level]!,
        })
        const next = Math.min(4, level + 1)
        const tm = setTimeout(chain, melodyDuration(tune.notes, tune.bpm) * 1000)
        level = next
        this.ringerTimers.push(tm)
      }
      chain()
    }
    // 振动（真机振铃同步；浏览器不支持时静默无效）
    if (c.vibrate && navigator.vibrate) {
      navigator.vibrate([600, 300])
      this.vibTimer = setInterval(() => navigator.vibrate([600, 300]), 1200)
    }
  }

  /** 解析当前铃声：索引在表内直接取；超出 = 用户自编曲调（缺失回 Nokia tune） */
  private async resolveTune(): Promise<{ notes: ReadonlyArray<Note>; bpm: number }> {
    const idx = this.os.tones.ringIdx
    if (idx >= 0 && idx < RINGTONES.length) {
      const t = RINGTONES[idx]!
      return { notes: t.notes, bpm: t.bpm ?? 200 }
    }
    const raw = await this.os.deps.store.get<number[]>('composer:tune')
    if (raw?.length) return { notes: raw.map((n) => [n > 0 ? 71 + n : 0, 1] as Note), bpm: 200 }
    return { notes: RINGTONES[0]!.notes, bpm: 200 }
  }

  input(key: DeviceKey) {
    switch (key) {
      case 'soft1':
      case 'ok':
        this.answer()
        break
      case 'soft2':
      case 'back':
      case 'clear':
        // 手动拒接：只要没接通就是未接来电
        this.reject()
        break
      default:
        return
    }
  }

  redraw() { /* 每帧自绘 */ }

  /** 停掉铃声/振动/续排定时器 */
  private stopRinger() {
    this.ringerStop?.()
    this.ringerStop = null
    for (const t of this.ringerTimers.splice(0)) clearTimeout(t)
    if (this.vibTimer) { clearInterval(this.vibTimer); this.vibTimer = null }
  }

  private answer() {
    if (this.answered) return
    this.answered = true
    this.stopRinger()
    if (this.missTimer) clearTimeout(this.missTimer)
    this.connectedAt = Date.now()
    // 切到通话态（仍由 RingingUI 的帧回调绘制 in-call）
    this.t = 0
  }

  private reject() {
    this.dead = true
    this.stopRinger()
    if (this.missTimer) clearTimeout(this.missTimer)
    if (this.answered) {
      // 通话中挂断 → 记已接来电 + 时长
      void this.os.recordCall({
        tel: this.tel, name: this.name ?? '', dir: 'in',
        dur: Math.floor((Date.now() - this.connectedAt) / 1000), missed: false,
      })
    } else {
      // 未接听（手动拒接或超时）→ 一律记未接来电
      void this.os.recordCall({
        tel: this.tel, name: this.name ?? '', dir: 'in', dur: 0, missed: true,
      })
    }
    this.os.enterIdle()
  }

  destroy() {
    this.dead = true
    this.stopRinger()
    if (this.missTimer) clearTimeout(this.missTimer)
    this.offs.forEach((off) => off())
  }

  private draw() {
    const s = this.os.deps.screen
    const str = osStrings(this.os.deps.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.answered) {
      // 通话中
      const sec = Math.floor(this.t)
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      if (H <= 48) {
        // 3310 紧凑几何：size14 计时在 48px 高会被裁且与标签挤位
        s.textCenter(W >> 1, 8, str.inCall, { size: 9 })
        s.textCenter(W >> 1, 17, this.name || this.tel, { size: 9 })
        s.textCenter(W >> 1, 25, `${mm}:${ss}`, { size: 12 })
        s.textRight(W - 1, H - 11, str.endCall, { size: 9 })
      } else {
        s.textCenter(W >> 1, Math.max(10, (H >> 1) - 16), str.inCall, { size: 9 })
        s.textCenter(W >> 1, Math.max(12, (H >> 1) - 4), this.name || this.tel, { size: 12 })
        s.textCenter(W >> 1, (H >> 1) + 12, `${mm}:${ss}`, { size: 14 })
        s.textRight(W - 1, H - 11, str.endCall, { size: 9 })
      }
      // soft2/ok/clear 挂断 → reject(false) 记已接
      // （input 在 answer 后仍走 reject 路径，已置 answered）
      return
    }
    // 来电响铃：图标 + 名称 + 号码 + 接听/挂断
    const blink = Math.floor(this.t * 2) % 2 === 0
    if (blink) s.textCenter(W >> 1, Math.max(8, (H >> 1) - 22), str.incomingCall, { size: 9 })
    s.textCenter(W >> 1, Math.max(12, (H >> 1) - 8), this.name || this.tel, { size: 12 })
    if (this.name) s.textCenter(W >> 1, (H >> 1) + 4, this.tel, { size: 9 })
    s.text(1, H - 11, str.incomingAnswer, { size: 9 })
    s.textRight(W - 1, H - 11, str.incomingReject, { size: 9 })
  }
}

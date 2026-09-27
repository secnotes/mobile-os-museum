import type { PhoneOS, PhoneOSFactory, OSDeps, MiniApp } from '../../kernel/types'
import { AppRuntime } from '../../kernel/runtime'
import type { DeviceKey } from '../../hal/input'
import { type Msg } from './apps/messages'
import { loadContacts, type Contact, type CallEntry, type LogEvent } from '../../scenario/data'
import { s60Strings } from './strings'
import { C } from './palette'
import { assets, RINGTONE_NAMES, SMS_ALERT_NOTES } from './assets'
import { BOOT_FRAMES, BOOT_W, BOOT_H, BOOT_FRAME_MS } from './boot'
import { Transit } from './anim'
import { W, H, STATUS_H } from './ui'
import { MENU_TREE, findNode, type MenuNode } from './menu-tree'
import { getWallpaper } from './wallpaper'
import { drawIconSized } from './icons'
import { clockApp } from './apps/clock'
import { aboutApp } from './apps/about'

/**
 * 诺基亚经典铃声（Gran Vals 片段，Tárrega 1902，旋律已进入公有域）：
 * E5 D5 F#4 G#4 | C#5 B4 D4 E4 | B4 A4 C#4 E4 | A4
 * （OGG 未就绪时的合成回落）
 */
const NOKIA_TUNE: ReadonlyArray<readonly [number, number]> = [
  [76, 0.5], [74, 0.5], [66, 1], [68, 1],
  [73, 0.5], [71, 0.5], [62, 1], [64, 1],
  [71, 0.5], [69, 0.5], [61, 1], [64, 1],
  [69, 2],
]

/** 原版开机动画帧缓存（首次开机时解码一次） */
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

/** 数值越界守卫（loadSettings 用） */
function clampNum(v: number | undefined, min: number, max: number, dflt: number): number {
  return typeof v === 'number' && v >= min && v <= max ? v : dflt
}

/** 待机活动插件 6 项对应的功能表节点 id */
const AS_IDS = ['root-contacts', 'root-messages', 'root-calendar', 'root-player', 'root-media', 'root-av']

export default {
  create(deps: OSDeps): PhoneOS {
    return new S60OS(deps)
  },
} satisfies PhoneOSFactory

type State =
  | 'off'
  | 'boot'
  | 'shutdown'
  | 'idle'
  | 'menu'
  | 'dial'
  | 'calling'
  | 'call'
  | 'callend'
  | 'ringing'
  | 'incall'
  | 'app'
  | 'pwmenu'
  | 'locked'

interface S60Conf {
  wallpaper: number
  keyBeep: boolean
  ringtone: number
  profile: number
  activeStandby: boolean
  autoLock: boolean
  /** B6 设置树扩展 */
  ringVolume: number // 1–10
  vibration: boolean
  msgTone: boolean
  warnTone: boolean
  hour24: boolean
  brightness: number // 0–3
  fontSize: number // 0 普通 / 1 小号
  callWaiting: boolean
  callForward: boolean
  sendId: boolean
  bluetooth: boolean
  pinReq: boolean
}

class S60OS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private settings: S60Conf = {
    wallpaper: 0, keyBeep: true, ringtone: 0, profile: 0, activeStandby: true, autoLock: false,
    ringVolume: 7, vibration: true, msgTone: true, warnTone: true, hour24: true,
    brightness: 3, fontSize: 0, callWaiting: false, callForward: false, sendId: true,
    bluetooth: false, pinReq: false,
  }
  /** 未读短信（驱动待机屏信封图标） */
  unread = false
  /** 电话本请求的呼叫（应用退出后接管） */
  private pendingCall: { tel: string; name?: string } | null = null
  private runtime: AppRuntime
  private transit: Transit
  private menuUI: MenuUI | null = null
  /** 功能表宫格顶级选中记忆（真机重进菜单不归零） */
  rootSel = 0
  /** 应用启动来源（退出后回菜单还是回待机） */
  private launchFrom: 'idle' | 'menu' = 'menu'
  /** 当前界面动画时钟（每帧自绘状态共用） */
  private t = 0
  private dialNum = ''
  private callSecs = 0
  private lastRing = -1
  /** 通话控件：静音 / 扬声器 / 保持 + 选项菜单 */
  private callMute = false
  private callSpeaker = false
  private callHold = false
  private callOptsOpen = false
  private callOptsSel = 0
  /** 通讯录缓存（来电号码→姓名反查 / 联系人名持久化） */
  private contacts: Contact[] = []
  /** 来电信息 / 暂存来电 / 来电接通时刻 */
  private incoming: { tel: string; name?: string } | null = null
  private pendingIncoming: { tel: string; name?: string } | null = null
  private ringStop: (() => void) | null = null
  private missTimer: ReturnType<typeof setTimeout> | null = null
  /** 开机：阶段（0=NOKIA 字标 / 1=握手）+ 已绘帧号 + 铃声已起播 + 墙钟起点 */
  private bootStage = 0
  private bootFrame = -1
  private bootTuneStarted = false
  private bootStartAt = 0
  /** 待机活动插件选中 */
  private asSel = 0
  /** 日历插件当日事项标题（null=无事项） */
  private todayText: string | null = null
  /** MenuUI 只读设置（settings 为私有，经此访问） */
  get conf(): S60Conf { return this.settings }
  /** 键盘锁解锁组合：等待 * 键的阶段标记 */
  private unlockStage = false
  private unlockTimer: ReturnType<typeof setTimeout> | null = null
  /** 待机左软键暂挂（等 * 锁键盘；窗口超时再执行本职=信息） */
  private softPending = false
  private softTimer: ReturnType<typeof setTimeout> | null = null
  /** 自动锁：最近一次待机输入的时刻 */
  private lastInputAt = Date.now()
  /** 电源菜单：选中项 / 取卡提示文案 */
  private pmSel = 0
  private pmNote: string | null = null
  readonly deps: OSDeps

  constructor(deps: OSDeps) {
    this.deps = deps
    this.runtime = new AppRuntime(deps, () => this.onAppExit())
    this.transit = new Transit(deps.frames, deps.screen)
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    await this.loadSettings()
    this.rootSel = (await this.deps.store.get<number>('rootSel')) ?? 0
    await this.seedMessages()
    await this.refreshUnread()
    await this.refreshToday()
    this.contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    // 预加载真机声音（Nokia tune OGG）→ 加载后不影响重绘（声音异步缓存）
    void assets.loadAll(this.deps.audio)
    this.watchStore()
    // InputBus 不分发异常隔离：系统回调必须自己兜底，否则一个回调抛错会饿死后续订阅者与应用
    this.offs.push(
      this.deps.input.subscribe((k) => {
        try {
          this.onInput(k)
        } catch (e) {
          console.error('[s60] input error', e)
        }
      }),
    )
    this.offs.push(this.deps.lang.onChange(() => this.onLangChange()))
    // 常驻帧回调：每帧自绘状态在此绘制，menu/app 由各自绘制
    this.offs.push(
      this.deps.frames.add((dt) => {
        try {
          this.t += dt
          switch (this.state) {
            case 'boot':
              this.drawBoot()
              break
            case 'idle':
              this.drawIdle()
              this.maybeAutoLock()
              break
            case 'locked':
              this.drawIdle()
              this.drawLockBanner()
              break
            case 'pwmenu':
              this.drawPowerMenu()
              break
            case 'dial':
              this.drawDial()
              break
            case 'calling':
              this.drawCalling()
              break
            case 'call':
              this.drawCall()
              break
            case 'callend':
              this.drawCallEnd()
              break
            case 'ringing':
              this.drawRinging()
              break
            case 'incall':
              this.drawInCall()
              break
            default:
              break
          }
        } catch (e) {
          console.error('[s60] frame error', e)
        }
      }),
    )
    this.drawOff()
  }

  private onLangChange() {
    if (this.state === 'idle') void this.seedMessages()
    if (this.state === 'menu') this.menuUI?.draw()
    // 其余状态每帧自绘，语言切换自然生效
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.stopRinging()
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const off of this.offs.splice(0)) off()
    this.menuUI = null
    this.runtime.close()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 输入路由 ----------

  /** 数字/井星键发 DTMF 双音频，其余键普通哔声 */
  private beep(key: DeviceKey) {
    if (/^[0-9*#]$/.test(key)) this.deps.audio.dtmf(key)
    else this.deps.audio.keypad()
  }

  private onInput(key: DeviceKey) {
    if (key === 'power') {
      if (!this.powered) this.boot()
      else this.openPowerMenu()
      return
    }
    if (!this.powered) return
    if (this.state === 'boot' || this.state === 'shutdown') return
    // 键盘锁：只接受 软1→* 解锁组合（电源键在最前面已处理）
    if (this.state === 'locked') {
      this.lockedKey(key)
      return
    }
    if (this.settings.keyBeep) this.beep(key)
    if (this.state === 'app') return // 交给应用自己处理
    switch (this.state) {
      case 'idle':
        this.idleKey(key)
        break
      case 'menu':
        this.menuUI?.input(key)
        break
      case 'dial':
        this.dialKey(key)
        break
      case 'calling':
      case 'call':
      case 'callend':
      case 'incall':
        this.callKey(key)
        break
      case 'ringing':
        this.ringingKey(key)
        break
      case 'pwmenu':
        this.powerMenuKey(key)
        break
      default:
        break
    }
  }

  // ---------- 电源 ----------

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.t = 0
    this.bootStage = 0
    this.bootFrame = -1
    this.bootTuneStarted = false
    // 时序以墙钟为准：headless/后台标签下 rAF 会被节流（dt 被 clamp），累积 t 会慢于真实时间
    this.bootStartAt = performance.now()
    this.deps.audio.unlock()
    // 阶段 0（NOKIA 字标）1s 后由 drawBoot 推进到阶段 1（握手 + Nokia tune）
  }

  private shutdown() {
    if (this.state === 'shutdown' || this.state === 'off') return
    this.state = 'shutdown' // 先置状态，防止 runtime.close 的回调把菜单画出来
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.pendingCall = null
    this.runtime.close()
    this.menuUI = null
    // TFT 关机：三次白闪后熄灭
    let flashes = 0
    let ft = 0
    const off = this.deps.frames.add((dt) => {
      ft += dt
      if (ft < 0.09) return
      ft = 0
      const s = this.deps.screen
      s.clear()
      if (flashes % 2 === 0) s.fillRect(0, 0, W, H, C.WHITE)
      s.render()
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

  private drawBoot() {
    const s = this.deps.screen
    const elapsed = (performance.now() - this.bootStartAt) / 1000
    // 阶段推进
    if (this.bootStage === 0) {
      if (elapsed >= 1) {
        this.bootStage = 1
        this.bootFrame = -1
      } else {
        // 白底 + 蓝色 NOKIA 字标（真机首屏）
        s.clear()
        s.fillRect(0, 0, W, H, C.WHITE)
        s.textCenter(W / 2, H / 2 - 14, 'NOKIA', { size: 26, color: C.BLUE })
        s.render()
        return
      }
    }
    // 握手阶段：Nokia tune 与该阶段同时开始
    if (!this.bootTuneStarted) {
      this.bootTuneStarted = true
      if (this.deps.audio.hasFile('nokia_tune')) {
        this.deps.audio.playFile('nokia_tune', { volume: 0.7 })
      } else {
        this.deps.audio.melody(NOKIA_TUNE, 140)
      }
    }
    const localT = elapsed - 1
    // 握手播完 → 淡入待机（必须在帧去重之前判断：末帧之后不再有新帧，否则永远走不到切换）
    if (localT >= (BOOT_FRAMES.length * BOOT_FRAME_MS) / 1000 + 0.15) {
      this.enterIdle()
      return
    }
    const idx = Math.min(BOOT_FRAMES.length - 1, Math.floor((localT * 1000) / BOOT_FRAME_MS))
    if (idx === this.bootFrame) return
    this.bootFrame = idx
    const fr = decodeBootFrames()[idx]
    s.clear()
    s.fillRect(0, 0, W, H, C.WHITE)
    // 原版动画 176×208 → 放大到屏宽 240×283，垂直居中，白边补齐
    const scale = W / BOOT_W
    const dh = Math.round(BOOT_H * scale)
    const oy = (H - dh) >> 1
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(BOOT_H - 1, (y / scale) | 0)
      const row = sy * BOOT_W
      for (let x = 0; x < W; x++) {
        const k = fr[row + Math.min(BOOT_W - 1, (x / scale) | 0)]
        if (k !== C.WHITE) s.pset(x, oy + y, k) // 白底已铺，只画非白像素
      }
    }
    s.render()
  }

  // ---------- 状态切换 ----------

  enterIdle() {
    this.state = 'idle'
    this.dialNum = ''
    this.pendingCall = null
    this.menuUI = null
    this.cancelSoftPending()
    this.lastInputAt = Date.now()
    // 回到待机后补放暂存来电
    if (this.pendingIncoming) {
      const p = this.pendingIncoming
      this.pendingIncoming = null
      this.enterRinging(p.tel, p.name)
      return
    }
    this.transit.fade()
  }

  enterMenu() {
    this.state = 'menu'
    this.menuUI = new MenuUI(this)
    this.transit.fade()
  }

  /** 从待机快捷方式直达某节点（文件夹直接展开） */
  enterMenuAt(id: string) {
    this.state = 'menu'
    this.menuUI = new MenuUI(this, id)
    this.transit.fade()
  }

  launch(app: MiniApp, from: 'idle' | 'menu') {
    this.launchFrom = from
    this.menuUI = null
    this.state = 'app'
    this.transit.fade()
    this.runtime.launch(app, {
      messageSent: () => {
        void this.recordEvent({ kind: 'sms', dir: 'out', text: 'SMS' })
        this.scheduleReply()
      },
      dial: (tel, name) => {
        this.pendingCall = { tel, name }
        this.runtime.close() // 触发 onAppExit → startCall
      },
      getCallLog: async () => (await this.deps.store.get<CallEntry[]>('calllog')) ?? [],
      recordCall: (e) => void this.recordCall(e),
      getEvents: async () => (await this.deps.store.get<LogEvent[]>('logevents')) ?? [],
      recordEvent: (e) => void this.recordEvent(e),
      getPhotos: async () => (await this.deps.store.get<number[][]>('camera:photos')) ?? [],
      getContacts: async () => {
      // 首次读取无数据：把种子名片写回设备键（真机名片夹出厂即预置内容）
      const saved = await this.deps.store.get<Contact[]>('contacts')
      if (saved && saved.length) return saved
      const seeds = await loadContacts(this.deps.store.get.bind(this.deps.store))
      await this.deps.store.set('contacts', seeds)
      return seeds
    },
      saveContacts: async (cs) => {
        await this.deps.store.set('contacts', cs)
      },
      factoryReset: async (conf) => {
        await this.deps.store.clearAll()
        this.settings = conf as S60Conf
        await this.saveSettings()
        this.rootSel = 0
        this.contacts = []
        this.unread = false
      },
      setLang: (l) => this.deps.lang.set?.(l),
    })
  }

  private onAppExit() {
    if (this.state !== 'app') return
    if (this.pendingCall) this.startCall(this.pendingCall)
    else if (this.launchFrom === 'menu') this.enterMenu()
    else this.enterIdle()
  }

  // ---------- 待机 ----------

  private idleKey(key: DeviceKey) {
    this.lastInputAt = Date.now()
    // 非软键/* 的任何键：取消暂挂软键
    if (this.softPending && key !== 'soft1' && key !== '*') this.cancelSoftPending()
    if (/^[0-9*#]$/.test(key)) {
      // 暂挂窗口内的 * = 锁键盘组合（不进拨号盘）
      if (key === '*' && this.softPending) {
        this.cancelSoftPending()
        this.lockKeypad()
        return
      }
      this.dialNum = key
      this.state = 'dial'
      return
    }
    switch (key) {
      case 'soft1':
        // 左软键暂挂：900ms 内按 * = 锁键盘（真机组合），超时再进信息
        this.softPending = true
        if (this.softTimer) clearTimeout(this.softTimer)
        this.softTimer = setTimeout(() => {
          this.softPending = false
          this.softTimer = null
          if (this.powered) this.launch(findNode('root-messages')!.node.app!, 'idle')
        }, 900)
        this.timers.push(this.softTimer)
        break
      case 'soft2':
        // 右软键 = 时钟
        this.openClock()
        break
      case 'up':
      case 'down':
      case 'menu':
        this.enterMenu()
        break
      case 'left':
        if (this.settings.activeStandby)
          this.asSel = (this.asSel + AS_IDS.length - 1) % AS_IDS.length
        break
      case 'right':
        if (this.settings.activeStandby)
          this.asSel = (this.asSel + 1) % AS_IDS.length
        break
      case 'ok':
        if (this.settings.activeStandby) this.openActiveNode()
        else this.enterMenu()
        break
      default:
        break
    }
  }

  /** 打开活动插件当前项：应用直接启动，文件夹直达 */
  private openActiveNode() {
    const n = findNode(AS_IDS[this.asSel]!)!.node
    if (n.children) this.enterMenuAt(n.id)
    else if (n.app) this.launch(n.app, 'idle')
  }

  /** 右软键时钟 */
  private openClock() {
    this.launch(clockApp, 'idle')
  }

  private cancelSoftPending() {
    this.softPending = false
    if (this.softTimer) { clearTimeout(this.softTimer); this.softTimer = null }
  }

  private drawIdle() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.blitBg(getWallpaper(this.settings.wallpaper), 0, 0, { w: W, h: H })
    this.drawIdleStatus()
    const d = new Date()
    const hour = this.settings.hour24 ? d.getHours() : (d.getHours() % 12 || 12)
    const hh = String(hour).padStart(this.settings.hour24 ? 2 : 1, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    // 左上大时钟（小 × 前缀对齐真机照片，34px 细体）
    s.text(6, 42, '×', { size: 14, color: C.WHITE })
    s.text(22, 34, `${hh}:${mm}`, { size: 34, color: C.WHITE })
    // 情景模式名 + 日期行（时钟右侧）
    const wk = str.weekdays[(d.getDay() + 6) % 7]!
    s.text(130, 40, str.profileNames[this.settings.profile]!, { size: 20, color: C.WHITE })
    const dateTxt = this.deps.lang.get() === 'en'
      ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()} ${wk}`
      : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${wk}`
    s.text(130, 72, dateTxt, { size: 12, color: C.WHITE })
    // 活动待机：6 图标行 + 日历插件
    if (this.settings.activeStandby) {
      AS_IDS.forEach((id, i) => {
        const cx = 24 + i * 38
        if (i === this.asSel) {
          // 浅青选中块（圆角，仅围图标）
          s.fillRect(cx - 16, 106, 32, 36, C.CYAN)
          s.fillRect(cx - 14, 104, 28, 2, C.CYAN)
          s.fillRect(cx - 14, 142, 28, 2, C.CYAN)
          s.pset(cx - 16, 106, C.CYAN); s.pset(cx + 15, 106, C.CYAN)
          s.pset(cx - 16, 141, C.CYAN); s.pset(cx + 15, 141, C.CYAN)
        }
        drawIconSized(s, findNode(id)!.node.icon, cx - 15, 109, 30)
      })
      // 日历插件：小日历页 + 文案
      s.fillRect(10, 156, 13, 13, C.WHITE)
      s.fillRect(10, 156, 13, 3, C.RED)
      s.text(12, 162, '1', { size: 7, color: C.RED })
      s.text(30, 158, this.todayText ?? str.calNoEvents, { size: 13, color: C.WHITE })
    }
    // 底部深色软键标签（直接绘在亮色壁纸底部）
    s.text(10, H - 19, str.msgsTitle, { size: 12, color: C.INK })
    s.textRight(W - 10, H - 19, this.deps.lang.get() === 'en' ? 'Clock' : '时钟', { size: 12, color: C.INK })
    this.applyBrightness()
    s.render()
  }

  /** 亮度（B6）：非最高档时用稳定点阵压暗整屏（索引色无 alpha 的近似） */
  private applyBrightness() {
    const b = this.settings.brightness
    if (b >= 3) return
    const s = this.deps.screen
    const step = b === 2 ? 3 : 2 // 档 2：1/9 点；档 1：1/4 点；档 0：棋盘 ~1/2
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (b === 0 ? (x + y) % 2 === 0 : (x % step === 0 && y % step === 0))
          s.pset(x, y, C.DARK)
      }
  }

  /**
   * S60v3 真机状态栏横带：白 → 淡天蓝渐变 + 深藏青图标文字。
   * 左=信号柱 + 3G（或飞机）；中=运营商；右=时间 + 电量。待机与应用内同款。
   */
  private statusBand(offline: boolean) {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    // 白→PALE 竖向渐变（两色抖动近似）
    s.fillRect(0, 0, W, STATUS_H, C.WHITE)
    for (let y = STATUS_H / 2; y < STATUS_H; y++) {
      const step = Math.max(1, STATUS_H - y)
      for (let x = (y * 5) % step; x < W; x += step) s.pset(x, y, C.PALE)
    }
    s.fillRect(0, STATUS_H - 1, W, 1, C.PALE)
    if (!offline) {
      // 信号柱（深藏青，4 档）
      for (let i = 0; i < 4; i++) {
        const h = 4 + i * 3
        s.fillRect(8 + i * 5, 19 - h, 3, h, C.NAVY)
      }
      s.text(32, 7, '3G', { size: 11, color: C.NAVY })
    } else {
      this.drawAirplane(8, 5)
    }
    // 运营商居中
    s.textCenter(W >> 1, 7, str.operator, { size: 11, color: C.NAVY })
    // 未读信封（运营商右侧）
    if (this.unread && Math.floor(this.t * 2) % 2 === 0) {
      const ex = (W >> 1) + 46
      s.fillRect(ex, 7, 14, 10, C.AMBER)
      s.line(ex, 7, ex + 7, 13, C.INK)
      s.line(ex + 14, 7, ex + 7, 13, C.INK)
    }
    // 时间 + 电量（右）
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    const clock = `${two(d.getHours())}:${two(d.getMinutes())}`
    const cw = s.measure(clock, { size: 11 })
    s.text(W - 38 - cw - 6, 7, clock, { size: 11, color: C.NAVY })
    const pct = this.deps.battery.percent
    const cells = Math.ceil(pct / 25)
    s.fillRect(W - 34, 6, 24, 13, C.NAVY)
    s.fillRect(W - 33, 7, 22, 11, C.WHITE)
    s.fillRect(W - 10, 10, 3, 5, C.NAVY)
    for (let i = 0; i < 4; i++)
      if (i < cells) s.fillRect(W - 31 + i * 5, 9, 4, 7, pct <= 25 ? C.RED : C.NAVY)
  }

  /** 待机状态栏（S60v3 浅蓝白横带，覆盖壁纸上缘） */
  private drawIdleStatus() {
    this.statusBand(this.settings.profile === 5)
  }

  /** 小飞机（离线模式；状态栏浅底上用深藏青） */
  private drawAirplane(x: number, y: number) {
    const s = this.deps.screen
    s.fillRect(x + 2, y + 8, 10, 3, C.NAVY)
    s.fillRect(x + 11, y + 8, 4, 1, C.NAVY)
    s.pset(x + 14, y + 7, C.NAVY)
    s.fillRect(x + 5, y + 5, 3, 3, C.NAVY)
    s.fillRect(x + 1, y + 11, 3, 3, C.NAVY)
    s.pset(x + 2, y + 13, C.NAVY)
  }

  // ---------- 键盘锁 ----------

  private lockKeypad() {
    this.state = 'locked'
    this.unlockStage = false
    this.cancelSoftPending()
    if (this.unlockTimer) { clearTimeout(this.unlockTimer); this.unlockTimer = null }
  }

  private lockedKey(key: DeviceKey) {
    if (this.unlockStage) {
      if (key === '*') {
        this.enterIdle()
        return
      }
      this.unlockStage = false
      if (this.unlockTimer) { clearTimeout(this.unlockTimer); this.unlockTimer = null }
    } else if (key === 'soft1') {
      this.unlockStage = true
      this.unlockTimer = setTimeout(() => {
        this.unlockStage = false
        this.unlockTimer = null
      }, 1500)
    }
  }

  private drawLockBanner() {
    const s = this.deps.screen
    // 按键已锁 提示胶囊（屏幕上部居中）
    const str = s60Strings(this.deps.lang.get())
    s.fillRect(60, 150, 120, 24, C.INK)
    s.fillRect(58, 152, 2, 20, C.INK); s.fillRect(180, 152, 2, 20, C.INK)
    s.textCenter(W / 2, 157, str.keysLocked, { size: 12, color: C.WHITE })
    s.render()
  }

  private maybeAutoLock() {
    if (this.settings.autoLock && Date.now() - this.lastInputAt > 20000) this.lockKeypad()
  }

  // ---------- 电源键菜单 ----------

  private openPowerMenu() {
    if (this.state === 'app') return // 应用内电源交给应用
    this.pmSel = 0
    this.pmNote = null
    this.state = 'pwmenu'
  }

  private pmItemCount() {
    return 2 + s60Strings(this.deps.lang.get()).profileNames.length + 1
  }

  private powerMenuKey(key: DeviceKey) {
    if (this.pmNote) {
      this.pmNote = null
      this.state = 'idle'
      return
    }
    const n = this.pmItemCount()
    switch (key) {
      case 'up':
        this.pmSel = (this.pmSel + n - 1) % n
        break
      case 'down':
        this.pmSel = (this.pmSel + 1) % n
        break
      case 'ok':
        void this.pmExecute()
        return
      case 'back':
      case 'soft2':
      case 'soft1':
        this.state = this.menuUI ? 'menu' : 'idle'
        return
      default:
        return
    }
  }

  private async pmExecute() {
    const sel = this.pmSel
    if (sel === 0) {
      this.shutdown()
      return
    }
    if (sel === 1) {
      // 锁键盘
      this.state = 'idle'
      this.lockKeypad()
      return
    }
    const profiles = s60Strings(this.deps.lang.get()).profileNames
    const pi = sel - 2
    if (pi < profiles.length) {
      this.settings.profile = pi
      await this.saveSettings()
      this.state = 'idle'
      return
    }
    // 取出存储卡
    this.pmNote = s60Strings(this.deps.lang.get()).pmRemoveCardMsg
  }

  private drawPowerMenu() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.blitBg(getWallpaper(this.settings.wallpaper), 0, 0, { w: W, h: H })
    // 调暗底（无 alpha：整屏深墨）
    s.fillRect(0, 0, W, H, C.DARK)
    // 白色面板
    const items = [str.pmPowerOff, str.pmLockKeys, ...str.profileNames, str.pmRemoveCard]
    const ph = items.length * 24 + 18
    s.fillRect(22, 40, 196, ph, C.WHITE)
    s.fillRect(20, 42, 2, ph - 4, C.WHITE); s.fillRect(218, 42, 2, ph - 4, C.WHITE)
    s.fillRect(24, 38, 192, 2, C.WHITE); s.fillRect(24, 40 + ph, 192, 2, C.WHITE)
    items.forEach((label, i) => {
      const selRow = i === this.pmSel
      if (selRow) s.fillRect(30, 47 + i * 24, 180, 22, C.BLUE)
      s.textCenter(W / 2, 53 + i * 24, label, { size: 12, color: selRow ? C.WHITE : C.INK })
    })
    if (this.pmNote) {
      // 居中信息框
      const lines = this.pmNote.split('\n')
      const bh = lines.length * 18 + 24
      s.fillRect(24, (H - bh) / 2, 192, bh, C.WHITE)
      lines.forEach((ln, i) => s.textCenter(W / 2, (H - bh) / 2 + 14 + i * 18, ln, { size: 12, color: C.INK }))
    }
    s.render()
  }

  // ---------- 拨号 / 通话 ----------

  private dialKey(key: DeviceKey) {
    if (/^[0-9*#]$/.test(key)) {
      if (this.dialNum.length < 14) this.dialNum += key
      this.checkSecretCode()
      return
    }
    switch (key) {
      case 'clear':
        this.dialNum = this.dialNum.slice(0, -1)
        if (!this.dialNum) this.enterIdle()
        break
      case 'soft1':
        if (this.dialNum) this.startCall({ tel: this.dialNum })
        break
      case 'soft2':
      case 'back':
        this.enterIdle()
        break
      default:
        break
    }
  }

  /** 待机真机码：*#0000# 版本、*#7780# 还原、*#7370# 硬格 */
  private checkSecretCode() {
    if (this.dialNum.endsWith('*#0000#')) {
      this.dialNum = ''
      this.launch(aboutApp, 'idle')
    } else if (this.dialNum.endsWith('*#7780#') || this.dialNum.endsWith('*#7370#')) {
      this.dialNum = ''
      void this.factoryReset()
    }
  }

  /** 恢复出厂：清空本设备 store，重置内存态回待机 */
  private async factoryReset() {
    await this.deps.store.clearAll()
    this.settings = {
      wallpaper: 0, keyBeep: true, ringtone: 0, profile: 0,
      activeStandby: true, autoLock: false,
      ringVolume: 7, vibration: true, msgTone: true, warnTone: true, hour24: true,
      brightness: 3, fontSize: 0, callWaiting: false, callForward: false, sendId: true,
      bluetooth: false, pinReq: false,
    }
    this.unread = false
    this.contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    await this.refreshToday()
    this.enterIdle()
  }

  /** 呼叫中 / 通话中（去电 call、来电 incall 共用） */
  private callKey(key: DeviceKey) {
    const connected = this.state === 'call' || this.state === 'incall'
    // 选项菜单打开时：菜单自消化
    if (connected && this.callOptsOpen) {
      const n = this.callOptLabels().length
      switch (key) {
        case 'up': this.callOptsSel = (this.callOptsSel + n - 1) % n; break
        case 'down': this.callOptsSel = (this.callOptsSel + 1) % n; break
        case 'ok': this.runCallOption(this.callOptsSel); return
        case 'soft2': case 'back': this.callOptsOpen = false; break
        default: return
      }
      return
    }
    switch (key) {
      case 'soft2': case 'back': case 'clear':
        if (this.state === 'incall') this.endInCall()
        else this.hangup()
        break
      case 'soft1':
        if (connected) {
          this.callOptsOpen = true
          this.callOptsSel = 0
        }
        break
      default:
        break
    }
  }

  /** 选项标签：静音/扬声器/保持，标签随当前态变化 */
  private callOptLabels(): string[] {
    const str = s60Strings(this.deps.lang.get())
    return [
      this.callMute ? str.callUnmute : str.callMute,
      this.callSpeaker ? str.callEarpiece : str.callSpeaker,
      this.callHold ? str.callResume : str.callHold,
    ]
  }

  private runCallOption(i: number) {
    this.callOptsOpen = false
    if (i === 0) this.callMute = !this.callMute
    else if (i === 1) {
      this.callSpeaker = !this.callSpeaker
    } else {
      this.callHold = !this.callHold
    }
  }

  private startCall(target: { tel: string; name?: string }) {
    if (!target.name) {
      target.name = this.contacts.find((c) => c.tel === target.tel)?.name
    }
    this.pendingCall = target
    this.state = 'calling'
    this.t = 0
    this.lastRing = -1
    this.callMute = false
    this.callSpeaker = false
    this.callHold = false
    this.callOptsOpen = false
    this.timers.push(
      setTimeout(() => {
        if (this.state === 'calling') {
          this.state = 'call'
          this.callSecs = 0
          this.timers.push(
            setInterval(() => {
              if (this.state === 'call' && !this.callHold) this.callSecs++
            }, 1000),
          )
        }
      }, 2600),
    )
  }

  private hangup() {
    if (this.state === 'callend') return
    // 去电接通后挂断 → 记录
    if (this.state === 'call' && this.pendingCall) {
      void this.recordCall({
        tel: this.pendingCall.tel, name: this.pendingCall.name ?? '', dir: 'out',
        dur: this.callSecs, missed: false,
      })
    }
    for (const t of this.timers.splice(0)) clearTimeout(t) // 同时清掉计秒 interval
    this.state = 'callend'
    this.t = 0
    this.timers.push(
      // 真机挂断后只短暂停留结束提示（约 0.7s）即回待机
      setTimeout(() => {
        if (this.state === 'callend') this.enterIdle()
      }, 700),
    )
  }

  private callTarget(): { tel: string; name?: string } {
    return this.pendingCall ?? { tel: this.dialNum }
  }

  // ---------- 来电 / 来短信（情景编排触发） ----------

  /** 来电：离线模式直接拒（无网）；idle/menu/dial/callend 直接响铃；boot/off/app 暂存待回 idle 触发 */
  incomingCall(tel: string, name?: string) {
    if (this.settings.profile === 5) return // 离线模式：网络不可达
    const n = name ?? this.contacts.find((c) => c.tel === tel)?.name
    if (!this.powered || this.state === 'off' || this.state === 'boot' || this.state === 'shutdown' || this.state === 'app') {
      this.pendingIncoming = { tel, name: n }
      return
    }
    if (this.state === 'idle' || this.state === 'menu' || this.state === 'dial' || this.state === 'callend') {
      this.menuUI = null
      this.enterRinging(tel, n)
    } else {
      this.pendingIncoming = { tel, name: n }
    }
  }

  private enterRinging(tel: string, name?: string) {
    this.incoming = { tel, name }
    this.state = 'ringing'
    this.t = 0
    this.deps.audio.unlock()
    this.startRing()
    this.missTimer = setTimeout(() => {
      if (this.state === 'ringing') this.rejectCall()
    }, 15000)
    this.timers.push(this.missTimer)
  }

  /** 按情景模式起铃（B4：标准/无声/会议/户外/寻呼机；B6：音量/振动设置生效） */
  private startRing() {
    const audio = this.deps.audio
    const p = this.settings.profile
    if (p === 1) {
      // 无声：仅振动（连续短音模拟；振动关闭则完全静默）
      if (!this.settings.vibration) return
      const id = setInterval(() => audio.keypad(), 300)
      this.ringStop = () => clearInterval(id)
    } else if (p === 2) {
      // 会议：铃声单遍，不循环
      this.playRingtone(false, 0.6)
    } else if (p === 3) {
      // 户外：最大声循环 + 振动短音
      this.playRingtone(true, 1)
      if (this.settings.vibration) {
        const id = setInterval(() => audio.keypad(), 450)
        const prev = this.ringStop
        this.ringStop = () => { prev?.(); clearInterval(id) }
      }
    } else if (p === 4) {
      // 寻呼机：短促渐强循环
      const id = setInterval(() => audio.melody([[69, 0.4], [72, 0.4], [76, 0.8]], 220), 1100)
      this.ringStop = () => clearInterval(id)
    } else {
      // 标准：选定铃声循环
      this.playRingtone(true, 0.8)
    }
  }

  /** 播放选定来电铃声（0=Nokia tune OGG，其余合成旋律），音量按铃声音量设置缩放 */
  private playRingtone(loop: boolean, vol: number) {
    const idx = this.settings.ringtone
    const v = Math.min(1, vol * (this.settings.ringVolume / 10))
    const r = RINGTONE_NAMES[idx]
    if (idx === 0 && this.deps.audio.hasFile('nokia_tune')) {
      this.ringStop = this.deps.audio.playFile('nokia_tune', { loop, volume: v })
    } else if (r.synth) {
      this.ringStop = this.deps.audio.playMelody(r.synth, 150, { loop, volume: v })
    }
  }

  private ringingKey(key: DeviceKey) {
    if (key === 'soft1' || key === 'ok') this.answerCall()
    else if (key === 'soft2' || key === 'back') this.rejectCall()
  }

  private answerCall() {
    this.stopRinging()
    this.callSecs = 0
    this.callMute = false
    this.callSpeaker = false
    this.callHold = false
    this.callOptsOpen = false
    this.state = 'incall'
    this.t = 0
    this.timers.push(
      setInterval(() => {
        if (this.state === 'incall' && !this.callHold) this.callSecs++
      }, 1000),
    )
  }

  private rejectCall() {
    const inc = this.incoming
    this.stopRinging()
    if (inc) {
      void this.recordCall({ tel: inc.tel, name: inc.name ?? '', dir: 'in', dur: 0, missed: true })
    }
    this.incoming = null
    this.enterIdle()
  }

  private endInCall() {
    const inc = this.incoming
    for (const t of this.timers.splice(0)) clearTimeout(t)
    if (inc) {
      void this.recordCall({
        tel: inc.tel, name: inc.name ?? '', dir: 'in',
        dur: this.callSecs, missed: false,
      })
    }
    this.incoming = null
    this.state = 'callend'
    this.t = 0
    this.timers.push(setTimeout(() => { if (this.state === 'callend') this.enterIdle() }, 700))
  }

  private stopRinging() {
    if (this.ringStop) { this.ringStop(); this.ringStop = null }
    if (this.missTimer) { clearTimeout(this.missTimer); this.missTimer = null }
  }

  /** 短信提示音：受情景模式（无声=静默，会议=单短音）与信息提示音设置控制 */
  private smsAlertSound() {
    const p = this.settings.profile
    if (p === 1 || !this.settings.msgTone) return
    this.deps.audio.unlock()
    if (p === 2) this.deps.audio.keypad()
    else this.deps.audio.melody(SMS_ALERT_NOTES, 260)
  }

  /** 来短信：追加收件箱 + 提示音 */
  injectSms(from: string, text: string) {
    void this.deliverIncoming(from, text)
  }

  private async deliverIncoming(from: string, text: string) {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    inbox.push({ id: Date.now(), from, text, ts: Date.now(), read: false, mine: false })
    await this.deps.store.set('messages:inbox', inbox)
    this.unread = true
    if (this.powered && this.state !== 'off' && this.state !== 'boot') this.smsAlertSound()
  }

  private async recordCall(e: Omit<CallEntry, 'id' | 'ts'>) {
    const log = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    log.push({ ...e, id: Date.now(), ts: Date.now() })
    while (log.length > 30) log.shift()
    await this.deps.store.set('calllog', log)
  }

  private async recordEvent(e: Omit<LogEvent, 'id' | 'ts'>) {
    // 独立键 logevents：避免与 ScenarioScheduler 的设备键 events（情景事件）碰撞
    const log = (await this.deps.store.get<LogEvent[]>('logevents')) ?? []
    log.push({ ...e, id: Date.now(), ts: Date.now() })
    while (log.length > 50) log.shift()
    await this.deps.store.set('logevents', log)
  }

  private drawDial() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    s.text(16, 60, 'Tel', { size: 11, color: C.GRAY })
    // 号码（大字）+ 闪烁光标
    s.text(16, 90, this.dialNum || '', { size: 24, color: C.INK })
    if (Math.floor(this.t * 2) % 2 === 0) {
      const w = s.measure(this.dialNum, { size: 24 })
      s.fillRect(20 + w, 92, 3, 24, C.BLUE)
    }
    this.darkSoftBar(this.dialNum ? str.dialCall : '', str.dialClear)
    s.render()
  }

  private drawCalling() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    const target = this.callTarget()
    s.textCenter(W / 2, 100, str.calling, { size: 16, color: C.INK })
    const dots = '.'.repeat(1 + (Math.floor(this.t * 2) % 3))
    s.textCenter(W / 2, 128, dots, { size: 12, color: C.GRAY })
    if (target.name) s.textCenter(W / 2, 156, target.name, { size: 14, color: C.BLUE })
    s.textCenter(W / 2, 184, target.tel, { size: 12, color: C.GRAY })
    // 回铃音：440+480Hz 双音频，每 1.2s 一声
    const ring = Math.floor(this.t / 1.2)
    if (ring !== this.lastRing) {
      this.lastRing = ring
      this.deps.audio.ringbackTone(0.4)
    }
    this.darkSoftBar('', str.endCall)
    s.render()
  }

  private drawCall() {
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    this.drawInCallContent(C.GREEN)
    s.render()
  }

  private drawCallEnd() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    s.textCenter(W / 2, 140, str.callEnded, { size: 14, color: C.GRAY })
    this.darkSoftBar('', '')
    s.render()
  }

  /** S60 来电屏：顶部蓝色来电条 + 姓名/号码 + 接听/挂断软键 + 铃声波纹 */
  private drawRinging() {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    const inc = this.incoming
    // 顶部来电条（蓝色）
    s.fillRect(0, STATUS_H, W, 40, C.BLUE)
    s.textCenter(W / 2, STATUS_H + 14, str.incomingCall, { size: 14, color: C.WHITE })
    // 来电人姓名 + 号码
    if (inc) {
      s.textCenter(W / 2, 120, inc.name ?? inc.tel, { size: 20, color: C.INK })
      if (inc.name) s.textCenter(W / 2, 150, inc.tel, { size: 14, color: C.GRAY })
    }
    // 中部铃声波纹动画
    if (Math.floor(this.t * 2) % 2 === 0) {
      for (let r = 18; r <= 42; r += 8)
        this.ringCircle(W / 2, 220, r)
    }
    s.textCenter(W / 2, 260, str.incomingCall, { size: 11, color: C.GRAY })
    this.darkSoftBar(str.incomingAnswer, str.incomingReject)
    s.render()
  }

  /** 来电接通后的通话屏（白底；内容与 drawCall 共用，顶条色区分来电=蓝） */
  private drawInCall() {
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, STATUS_H, W, H - STATUS_H - 26, C.WHITE)
    this.drawStatus()
    this.drawInCallContent(C.BLUE)
    s.render()
  }

  /**
   * 通话内容（白底）：顶部绿（去电）/蓝（来电）状态条——名称/mm:ss（保持时换文案），
   * 头像位 + 号码，静音/扬声器状态行；soft1 出选项（保持/静音/扬声器），soft2 结束。
   */
  private drawInCallContent(bar: number) {
    const s = this.deps.screen
    const str = s60Strings(this.deps.lang.get())
    const en = this.deps.lang.get() === 'en'
    const target = this.state === 'incall' ? this.incoming : this.callTarget()
    // 顶部彩色状态条
    const BAR_H = 46
    s.fillRect(0, STATUS_H, W, BAR_H, this.callHold ? C.GRAY : bar)
    if (this.callHold) {
      s.textCenter(W / 2, STATUS_H + 14, str.callHeld, { size: 15, color: C.WHITE })
    } else {
      const label = target?.name || str.inCall
      s.text(12, STATUS_H + 8, label, { size: 15, color: C.WHITE })
      if (target?.name)
        s.text(12, STATUS_H + 28, target.tel, { size: 10, color: C.PALE })
      const m = String(Math.floor(this.callSecs / 60)).padStart(2, '0')
      const sec = String(this.callSecs % 60).padStart(2, '0')
      s.textRight(W - 12, STATUS_H + 14, `${m}:${sec}`, { size: 18, color: C.WHITE })
    }
    // 头像位（灰圆 + 姓名首字）
    const cy = 132
    const init = (target?.name ?? '?').slice(0, 1)
    for (let dy = -24; dy <= 24; dy++)
      for (let dx = -24; dx <= 24; dx++)
        if (dx * dx + dy * dy <= 576)
          s.pset(W / 2 + dx, cy + dy, this.callMute ? C.GRAY : C.SKY)
    s.textCenter(W / 2, cy - 9, init, { size: 22, color: C.WHITE })
    s.textCenter(W / 2, 168, target?.tel ?? '', { size: 13, color: C.GRAY })
    // 静音 / 扬声器 状态行
    const y = 200
    s.text(44, y, this.callMute ? '🔇' : '🎤', { size: 14, color: this.callMute ? C.RED : C.GREEN })
    s.text(66, y + 2, this.callMute ? str.callMute : (en ? 'Mic on' : '麦克风开'),
      { size: 11, color: this.callMute ? C.RED : C.GRAY })
    s.text(138, y, '🔊', { size: 14, color: this.callSpeaker ? C.GREEN : C.GRAY })
    s.text(160, y + 2, this.callSpeaker ? str.callSpeaker : str.callEarpiece,
      { size: 11, color: this.callSpeaker ? C.GREEN : C.GRAY })
    s.textCenter(W / 2, 244, en ? 'Options: Hold · Mute · Speaker' : '选项：保持 · 静音 · 扬声器',
      { size: 10, color: C.GRAY })
    // 选项弹出层
    if (this.callOptsOpen) this.drawCallOptions()
    this.darkSoftBar(str.callOptions, str.endCall)
  }

  /** 通话选项弹层：白面板 + 实心蓝选中 */
  private drawCallOptions() {
    const s = this.deps.screen
    const labels = this.callOptLabels()
    const PANEL_W = 150
    const x = (W - PANEL_W) / 2
    const y = 96
    const h = labels.length * 26 + 12
    s.fillRect(x - 2, y - 2, PANEL_W + 4, h + 4, C.GRAY)
    s.fillRect(x, y, PANEL_W, h, C.WHITE)
    labels.forEach((lb, i) => {
      const ry = y + 6 + i * 26
      if (i === this.callOptsSel) s.fillRect(x + 5, ry, PANEL_W - 10, 23, C.BLUE)
      s.text(x + 14, ry + 6, lb,
        { size: 12, color: i === this.callOptsSel ? C.WHITE : C.INK })
    })
  }

  private ringCircle(cx: number, cy: number, r: number) {
    const s = this.deps.screen
    for (let t = 0; t < 360; t += 6) {
      const a = (t * Math.PI) / 180
      s.pset(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), C.SKY)
    }
  }

  /** 应用内状态栏（S60v3 浅蓝白横带，与待机同款） */
  private drawStatus() {
    this.statusBand(this.settings.profile === 5)
  }

  /** 深色软键栏 */
  private darkSoftBar(left: string, right: string) {
    const s = this.deps.screen
    s.fillRect(0, H - 26, W, 26, C.INK)
    if (left) s.text(10, H - 19, left, { size: 12, color: C.WHITE })
    if (right) s.textRight(W - 10, H - 19, right, { size: 12, color: C.WHITE })
  }

  // ---------- 短信生态 ----------

  private async seedMessages() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    const s = s60Strings(this.deps.lang.get())
    if (inbox) {
      // 原封种子（用户尚未收发短信）跟随语言重播；收发过则保留原语言
      const seedTexts: string[] = []
      for (const lang of ['zh', 'en'] as const) {
        seedTexts.push(s60Strings(lang).seedWelcome, s60Strings(lang).seedMom)
      }
      const pristine = inbox.length === 2 && inbox.every((m) => seedTexts.includes(m.text))
      if (!pristine) return
    }
    const now = Date.now()
    await this.deps.store.set('messages:inbox', [
      { id: now - 7200_000, from: s.serviceNum, text: s.seedWelcome, ts: now - 7200_000, read: false, mine: false },
      { id: now - 3600_000, from: s.recipient, text: s.seedMom, ts: now - 3600_000, read: false, mine: false },
    ] satisfies Msg[])
  }

  private scheduleReply() {
    const delay = 4500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.deliverReply(), delay))
  }

  private async deliverReply() {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    const s = s60Strings(this.deps.lang.get())
    inbox.push({
      id: Date.now(),
      from: s.recipient,
      text: s.replies[Math.floor(Math.random() * s.replies.length)]!,
      ts: Date.now(),
      read: false,
      mine: false,
    })
    await this.deps.store.set('messages:inbox', inbox)
    void this.recordEvent({ kind: 'sms', dir: 'in', text: `SMS ${s.recipient}` })
    this.smsAlertSound()
  }

  private async refreshUnread() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    this.unread = !!inbox?.some((m) => !m.read && !m.mine)
  }

  /** 日历插件：读日历应用（step6）写在设备键 'calendar:events' 的当日事项 */
  private async refreshToday() {
    type Ev = { ts: number; title: string }
    const evs = await this.deps.store.get<Ev[]>('calendar:events')
    const d = new Date()
    const hit = evs?.find((e) => {
      const ed = new Date(e.ts)
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate()
    })
    this.todayText = hit?.title ?? null
  }

  // ---------- 设置联动 ----------

  private async saveSettings() {
    await this.deps.store.set('settings:conf', this.settings)
  }

  /** 功能表光标记忆（真机重进菜单恢复位置），同步持久化 */
  setRootSel(v: number) {
    this.rootSel = v
    void this.deps.store.set('rootSel', v)
  }

  private async loadSettings() {
    const c = await this.deps.store.get<Partial<S60Conf>>('settings:conf')
    this.settings = {
      wallpaper: c?.wallpaper === 1 || c?.wallpaper === 2 ? c.wallpaper : 0,
      keyBeep: c?.keyBeep ?? true,
      ringtone: c?.ringtone ?? 0,
      profile: c?.profile ?? 0,
      activeStandby: c?.activeStandby ?? true,
      autoLock: c?.autoLock ?? false,
      ringVolume: clampNum(c?.ringVolume, 1, 10, 7),
      vibration: c?.vibration ?? true,
      msgTone: c?.msgTone ?? true,
      warnTone: c?.warnTone ?? true,
      hour24: c?.hour24 ?? true,
      brightness: clampNum(c?.brightness, 0, 3, 3),
      fontSize: clampNum(c?.fontSize, 0, 1, 0),
      callWaiting: c?.callWaiting ?? false,
      callForward: c?.callForward ?? false,
      sendId: c?.sendId ?? true,
      bluetooth: c?.bluetooth ?? false,
      pinReq: c?.pinReq ?? false,
    }
  }

  private watchStore() {
    const prefix = `${this.deps.profile.id}:`
    this.offs.push(
      this.deps.store.onChange((fk) => {
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}settings:`)) void this.loadSettings()
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}messages:`)) void this.refreshUnread()
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}calendar:`)) void this.refreshToday()
        if (fk === `${prefix}*` || fk.endsWith(':contacts'))
          void loadContacts(this.deps.store.get.bind(this.deps.store)).then((c) => (this.contacts = c))
      }),
    )
  }
}

// ---------- 功能表（宫格 / 列表 + 文件夹层级 + Options） ----------

interface MenuFrame { nodes: MenuNode[]; sel: number; title?: string }

class MenuUI {
  private stack: MenuFrame[]
  private listMode = false
  private optsOpen = false
  private optsSel = 0
  /** 居中信息框（多行文本），非 null 时优先处理 */
  private note: string[] | null = null

  constructor(private os: S60OS, atId?: string) {
    if (atId) {
      const built = this.buildTrail(atId)
      if (built) this.stack = built
      else this.stack = [{ nodes: MENU_TREE, sel: this.os.rootSel }]
    } else {
      this.stack = [{ nodes: MENU_TREE, sel: this.os.rootSel }]
    }
    this.draw()
  }

  private top(): MenuFrame { return this.stack[this.stack.length - 1]! }

  /** 直达节点：构造展开的层级栈 */
  private buildTrail(id: string): MenuFrame[] | null {
    const hit = findNode(id)
    if (!hit) return null
    const lang = this.os.deps.lang.get()
    const frames: MenuFrame[] = [{ nodes: MENU_TREE, sel: 0 }]
    let cur = MENU_TREE
    hit.trail.forEach((idx) => {
      const parent = cur[idx]!
      frames[frames.length - 1]!.sel = idx
      cur = parent.children!
      frames.push({ nodes: cur, sel: 0, title: lang === 'en' ? parent.en : parent.zh })
    })
    frames[frames.length - 1]!.sel = cur.findIndex((n) => n.id === id)
    return frames
  }

  input(key: DeviceKey) {
    if (this.note) {
      this.note = null
      this.draw()
      return
    }
    if (this.optsOpen) {
      this.optionsKey(key)
      return
    }
    const f = this.top()
    const n = f.nodes.length
    if (this.listMode) {
      switch (key) {
        case 'up':
          f.sel = (f.sel + n - 1) % n
          break
        case 'down':
          f.sel = (f.sel + 1) % n
          break
        case 'ok':
          this.openSelected()
          return
        case 'soft1':
          this.openOptions()
          return
        case 'soft2':
        case 'back':
          this.goBack()
          return
        default:
          return
      }
      this.draw()
      return
    }
    // 宫格：3 列
    switch (key) {
      case 'left':
        f.sel = (f.sel + n - 1) % n
        break
      case 'right':
        f.sel = (f.sel + 1) % n
        break
      case 'up':
        f.sel = (f.sel + n - 3) % n
        break
      case 'down':
        f.sel = (f.sel + 3) % n
        break
      case 'ok':
        this.openSelected()
        return
      case 'soft1':
        this.openOptions()
        return
      case 'soft2':
      case 'back':
        this.goBack()
        return
      default:
        return
    }
    this.draw()
  }

  /** 打开选中节点：文件夹入栈，应用启动 */
  private openSelected() {
    const f = this.top()
    const node = f.nodes[f.sel]!
    if (node.children) {
      const lang = this.os.deps.lang.get()
      this.stack.push({ nodes: node.children, sel: 0, title: lang === 'en' ? node.en : node.zh })
      this.draw()
    } else if (node.app) {
      this.os.setRootSel(this.stack[0]!.sel)
      this.os.launch(node.app, 'menu')
    }
  }

  /** 返回：文件夹弹栈，顶级回待机 */
  private goBack() {
    if (this.stack.length > 1) {
      this.stack.pop()
      this.draw()
    } else {
      this.os.setRootSel(this.stack[0]!.sel)
      this.os.enterIdle()
    }
  }

  // ----- Options 软键菜单 -----

  private openOptions() {
    this.optsOpen = true
    this.optsSel = 0
    this.draw()
  }

  private optionsLabels(): string[] {
    const s = s60Strings(this.os.deps.lang.get())
    return [s.optsOpen, s.optsChangeView, s.optsMemDetails, s.optsHelp, s.optsExit]
  }

  private optionsKey(key: DeviceKey) {
    const labels = this.optionsLabels()
    switch (key) {
      case 'up':
        this.optsSel = (this.optsSel + labels.length - 1) % labels.length
        break
      case 'down':
        this.optsSel = (this.optsSel + 1) % labels.length
        break
      case 'ok':
        this.runOption()
        return
      case 'back':
      case 'soft2':
        this.optsOpen = false
        break
      default:
        return
    }
    this.draw()
  }

  private runOption() {
    const s = s60Strings(this.os.deps.lang.get())
    const act = this.optsSel
    this.optsOpen = false
    if (act === 0) {
      this.openSelected()
      return
    }
    if (act === 1) {
      this.listMode = !this.listMode
    } else if (act === 2) {
      this.note = s.memDetailsText.split('\n')
    } else if (act === 3) {
      // 帮助文案按屏宽换行
      this.note = this.wrapHelp(s.helpText)
    } else {
      this.goBack()
      return
    }
    this.draw()
  }

  private wrapHelp(text: string): string[] {
    const lines: string[] = []
    let line = ''
    const s = this.os.deps.screen
    for (const ch of text) {
      if (s.measure(line + ch, { size: 12 }) > 180 && line) {
        lines.push(line)
        line = ch
      } else line += ch
    }
    lines.push(line)
    return lines
  }

  // ----- 绘制 -----

  draw() {
    const s = this.os.deps.screen
    const str = s60Strings(this.os.deps.lang.get())
    s.clear()
    s.blitBg(getWallpaper(this.os.conf.wallpaper), 0, 0, { w: W, h: H })
    const f = this.top()
    // 标题（顶级=功能表，文件夹=文件夹名）
    s.textCenter(W / 2, 7, f.title ?? str.menuTitle, { size: 15, color: C.WHITE })
    if (this.listMode) this.drawList(f)
    else this.drawGrid(f)
    if (this.optsOpen) this.drawOptions()
    if (this.note) this.drawNote()
    // 底部软键标签：真机功能表里是压印（emboss）淡字——深蓝底影 + 淡蓝字面，
    // 不是待机态的实心白字
    const optLabel = this.os.deps.lang.get() === 'en' ? 'Options' : '选项'
    s.text(10, H - 18, optLabel, { size: 12, color: C.BLUE })
    s.text(10, H - 19, optLabel, { size: 12, color: C.PALE })
    s.textRight(W - 10, H - 18, str.optsExit, { size: 12, color: C.BLUE })
    s.textRight(W - 10, H - 19, str.optsExit, { size: 12, color: C.PALE })
    s.render()
  }

  /** 宫格视图：3 个整行 + 下方半露的下一行（对齐真机固件），超出滚动 */
  private drawGrid(f: MenuFrame) {
    const s = this.os.deps.screen
    const GRID_TOP = 42
    const PITCH = 62
    const COLS = 3
    const totalRows = Math.ceil(f.nodes.length / 3)
    const selRow = Math.floor(f.sel / COLS)
    // 整行位 0..2 + 半露行 3；仅当越过半露行才整表上滚（含首尾循环）
    const maxOff = Math.max(0, totalRows - 4)
    const offRow = Math.max(0, Math.min(selRow - 3, maxOff))
    this.drawScrollbar(offRow, totalRows, Math.min(3, totalRows))
    const en = this.os.deps.lang.get() === 'en'
    const loop = totalRows > 3
    for (let r = 0; r <= 3; r++) {
      for (let col = 0; col < COLS; col++) {
        // 循环滚动：滚出下沿的行从顶部逻辑接回（真机首↔尾循环）
        const nodeRow = loop ? (offRow + r) % totalRows : offRow + r
        const i = nodeRow * COLS + col
        if (i >= f.nodes.length) continue
        if (!loop && (nodeRow < 0 || nodeRow >= totalRows)) continue
        const node = f.nodes[i]!
        const cx = col * 80 + 40
        const y = GRID_TOP + r * PITCH
        if (i === f.sel) {
          // 浅青选中块（圆角，仅围图标）
          s.fillRect(cx - 31, y - 3, 62, 49, C.CYAN)
          s.fillRect(cx - 29, y - 5, 58, 2, C.CYAN)
          s.fillRect(cx - 29, y + 46, 58, 2, C.CYAN)
          s.pset(cx - 31, y - 3, C.CYAN); s.pset(cx + 30, y - 3, C.CYAN)
          s.pset(cx - 31, y + 45, C.CYAN); s.pset(cx + 30, y + 45, C.CYAN)
        }
        drawIconSized(s, node.icon, cx - 21, y, 42)
        const name = en ? node.en : node.zh
        s.textCenter(cx, y + 46, this.clip(name, 72, 12), { size: 12, color: C.WHITE })
      }
    }
    // 软键标签在更下方（draw() 末尾画）：半露行只露到 y≈287，
    // 以下用索引 0（透明）擦除，露出壁纸而非压住软键
    // SOFT_H=26：软键标签在 y294 以下
    s.fillRect(0, 288, W, H - 288 - 26, 0)
  }

  /** 列表视图 */
  private drawList(f: MenuFrame) {
    const s = this.os.deps.screen
    const TOP = 42
    const PITCH = 36
    const visRows = 7
    const totalRows = f.nodes.length
    const offRow = totalRows > visRows ? Math.min(f.sel, totalRows - visRows) : 0
    this.drawScrollbar(offRow, totalRows, Math.min(visRows, totalRows))
    f.nodes.forEach((node, i) => {
      const r = i - offRow
      if (r < 0 || r >= visRows) return
      const y = TOP + r * PITCH
      const selRow = i === f.sel
      if (selRow) s.fillRect(8, y - 2, 216, 32, C.BLUE)
      drawIconSized(s, node.icon, 14, y + 1, 26)
      const name = (this.os.deps.lang.get() === 'en' ? node.en : node.zh)
      s.text(52, y + 8, this.clip(name, 160, 13), { size: 13, color: selRow ? C.WHITE : C.INK })
    })
  }

  /** 右侧滚动条 */
  private drawScrollbar(offRow: number, totalRows: number, visRows: number) {
    const s = this.os.deps.screen
    const x = 229
    const y = 40
    const h = 246
    s.fillRect(x, y, 3, h, C.PALE)
    const th = Math.max(14, Math.round((visRows / totalRows) * h))
    const ty = y + Math.round((offRow / totalRows) * h)
    s.fillRect(x, ty, 3, Math.min(th, y + h - ty), C.WHITE)
  }

  /** Options 弹层（居中白色面板） */
  private drawOptions() {
    const s = this.os.deps.screen
    const labels = this.optionsLabels()
    const ph = labels.length * 24 + 14
    const py = 70
    s.fillRect(40, py, 160, ph, C.WHITE)
    s.fillRect(38, py + 2, 2, ph - 4, C.WHITE); s.fillRect(200, py + 2, 2, ph - 4, C.WHITE)
    s.fillRect(42, py - 2, 156, 2, C.WHITE); s.fillRect(42, py + ph, 156, 2, C.WHITE)
    labels.forEach((label, i) => {
      const selRow = i === this.optsSel
      if (selRow) s.fillRect(46, py + 7 + i * 24, 148, 22, C.BLUE)
      s.text(56, py + 14 + i * 24, label, { size: 12, color: selRow ? C.WHITE : C.INK })
    })
  }

  /** 信息框（帮助/存储详情） */
  private drawNote() {
    const s = this.os.deps.screen
    const lines = this.note!
    const bh = lines.length * 18 + 26
    const by = (H - bh) / 2
    s.fillRect(24, by, 192, bh, C.WHITE)
    s.fillRect(22, by + 2, 2, bh - 4, C.WHITE); s.fillRect(216, by + 2, 2, bh - 4, C.WHITE)
    s.fillRect(26, by - 2, 188, 2, C.WHITE); s.fillRect(26, by + bh, 188, 2, C.WHITE)
    lines.forEach((ln, i) => s.text(34, by + 15 + i * 18, ln, { size: 12, color: C.INK }))
  }

  private clip(text: string, maxW: number, size: number): string {
    const s = this.os.deps.screen
    let out = ''
    for (const ch of text) {
      if (s.measure(out + ch, { size }) > maxW) break
      out += ch
    }
    return out
  }
}

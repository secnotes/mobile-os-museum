import type { Bridge, MiniAppFactory, PhotoMeta, SmsThread } from './apps/common'
import type { Contact, CallEntry } from '../../scenario/data'
import { SEED_CONTACTS } from '../../scenario/data'
import type { MiniApp, OSDeps, PhoneOS, PhoneOSFactory } from '../../kernel/types'
import { AppRuntime } from '../../kernel/runtime'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rr, rrGrad, rrStroke, disc, scrim } from './graphics'
import { drawPhotoArt } from './apps/photo-art'
import { statusBar, clockString } from './statusbar'
import {
  drawSpringboard, springboardHit, GRID_X, GRID_Y, DOCK_X, DOCK_Y,
  type AppEntry, type PressedHit,
} from './springboard'
import { LockScreen } from './lockscreen'
import { drawBoot, BOOT_TOTAL } from './boot'
import { RINGTONES, SMS_TONE } from './ringtones'
import { assets } from './assets'
import { ipStrings, type IpStrings } from './strings'
import {
  iconText, iconCalendar, iconPhotos, iconCamera, iconYoutube, iconStocks,
  iconMaps, iconWeather, iconClock, iconCalculator, iconNotes, iconSettings,
  iconPhone, iconMail, iconSafari, iconIpod,
} from './icons'
import { messagesFactory } from './apps/messages'
import { calendarFactory } from './apps/calendar'
import { photosFactory } from './apps/photos'
import { cameraFactory } from './apps/camera'
import { youtubeFactory } from './apps/youtube'
import { stocksFactory } from './apps/stocks'
import { mapsFactory } from './apps/maps'
import { weatherFactory } from './apps/weather'
import { clockFactory } from './apps/clock'
import { calcFactory } from './apps/calculator'
import { notesFactory } from './apps/notes'
import { settingsFactory } from './apps/settings'
import { phoneFactory } from './apps/phone'
import { mailFactory } from './apps/mail'
import { safariFactory } from './apps/safari'
import { ipodFactory } from './apps/ipod'

const W = 320
const H = 480

const GRID_IDS = [
  'sms', 'calendar', 'photos', 'camera',
  'youtube', 'stocks', 'maps', 'weather',
  'clock', 'calc', 'notes', 'settings',
] as const
const DOCK_IDS = ['phone', 'mail', 'safari', 'ipod'] as const

const FACTORIES: Record<string, MiniAppFactory> = {
  sms: messagesFactory, calendar: calendarFactory, photos: photosFactory, camera: cameraFactory,
  youtube: youtubeFactory, stocks: stocksFactory, maps: mapsFactory, weather: weatherFactory,
  clock: clockFactory, calc: calcFactory, notes: notesFactory, settings: settingsFactory,
  phone: phoneFactory, mail: mailFactory, safari: safariFactory, ipod: ipodFactory,
}

/** 首启种子：妈妈一条未读短信（与邮件、照片共同构成首屏角标） */
function seedThreads(now: number): SmsThread[] {
  return [
    {
      tel: '13912345678', name: '妈妈', unread: 1,
      msgs: [{ dir: 'in', text: '儿子，这周末回家吃饭吗？', ts: now - 3600_000 }],
    },
  ]
}

/** 首启种子：4 张示例照片（相机胶卷可见全部，照片图库除最新一张外） */
function seedPhotos(now: number): PhotoMeta[] {
  return [29062007, 9012007, 11072007, 4072008].map((seed, i) => ({
    id: i + 1, seed, ts: now - (3 - i) * 86400_000,
  }))
}

type State = 'off' | 'boot' | 'lock' | 'home' | 'app' | 'ringing' | 'incall' | 'sleep' | 'poweroff' | 'zoom'

interface Pending { tel: string; name: string | undefined }

/** 模态提醒（真机 1.0 蓝黑玻璃弹窗）：新短信 / 闹钟 */
type Alert =
  | { kind: 'sms'; from: string; name: string; text: string }
  | { kind: 'alarm'; h: number; m: number }

const AL_MIN = [1, 2, 3, 4, 0]

/**
 * iPhone OS 1.0（iPhone 2G）：
 * 关机/开机(Apple logo) → 锁屏(滑动来解锁) → Springboard → 应用；
 * 来电（锁屏滑动接听 / 使用中接听·挂断）、去电（回铃音→接通）、短信与角标；
 * 短按电源睡眠/唤醒、长按电源 slide to power off、自动锁定、闹钟与新短信弹窗。
 */
class IPhoneOS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private runtime: AppRuntime
  private tSecs = 0
  private bootT = 0

  // 系统级数据缓存（bridge 同步读，写入异步落盘）
  private contactsArr: Contact[] = []
  private threadsArr: SmsThread[] = []
  private callLogArr: CallEntry[] = []
  private photosArr: PhotoMeta[] = []
  private ringIdxVal = 0
  private mailUnreadN = 1
  private missedN = 0
  private pending: Pending | null = null
  private wallpaperId = 0
  /** 设置应用存档的镜像（状态栏飞行/蓝牙/Wi-Fi、自动锁定） */
  private setFlags = { airplane: false, bluetooth: false, wifiOn: true, autoLockMin: 2 }
  /** 闹钟应用存档的镜像（OS 到点触发） */
  private alarmConf = { on: false, h: 7, m: 0 }
  private alarmLast = ''
  private alert: Alert | null = null
  private lastAct = 0

  private locker = new LockScreen()
  private answerLocker = new LockScreen()
  private powerLocker = new LockScreen()
  private bridge: Bridge

  // 应用打开/关闭 zoom 过渡
  private static readonly ZOOM_DUR = 0.3
  private zoomSnap: HTMLCanvasElement | null = null
  private zoomDir: 'open' | 'close' = 'open'
  private zoomT = 0
  private zoomRect = { x: 131, y: 211, u: 57 }
  /** open 完成后待启动的 app id（过渡期间不启动，避免 app 帧覆盖过渡画面） */
  private zoomLaunchId: string | null = null
  private appCache = new Map<string, MiniApp>()
  private appQuiet = false
  /** 主屏当前按下的图标（按下变暗，松手启动——真机 1.0 手感） */
  private pressedHit: PressedHit | null = null

  // 通话状态
  private callNum = ''
  private callName = ''
  private callDir: 'in' | 'out' = 'out'
  private callUI: 'lock' | 'open' = 'open'
  private callSecs = 0
  private ringStop: (() => void) | null = null
  private muteOn = false
  private spkOn = false
  private holdOn = false
  private callOverlay: null | 'keys' | 'contacts' = null

  constructor(private deps: OSDeps) {
    this.runtime = new AppRuntime(deps, (snapshot, app) => this.onAppExit(snapshot, app))
    this.bridge = this.makeBridge()
  }

  start() {
    void this.init()
  }

  stop() {
    this.state = 'off'
    this.powered = false
    this.alert = null
    this.ringStop?.()
    this.ringStop = null
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const off of this.offs.splice(0)) off()
    this.runtime.close()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 初始化 ----------

  private async init() {
    await this.deps.battery.init()
    // 预加载真机 PNG 资源（开机 Apple logo / app 图标）；缺图静默回落程序化绘制
    void assets.loadAll()
    this.contactsArr = (await this.deps.store.get<Contact[]>('contacts')) ?? [...SEED_CONTACTS]
    this.threadsArr = (await this.deps.store.get<SmsThread[]>('sms:threads')) ?? seedThreads(Date.now())
    this.callLogArr = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    this.photosArr = (await this.deps.store.get<PhotoMeta[]>('camera:photos')) ?? seedPhotos(Date.now())
    this.ringIdxVal = (await this.deps.store.get<number>('ringtone:idx')) ?? 0
    this.wallpaperId = (await this.deps.store.get<number>('wallpaper')) ?? 0
    this.missedN = (await this.deps.store.get<number>('phone:missed')) ?? 0
    await this.loadSetFlags()
    this.alarmConf = {
      on: false, h: 7, m: 0,
      ...(await this.deps.store.get<{ on: boolean; h: number; m: number }>('clock:alarm')),
    }
    await this.refreshMailUnread()

    this.offs.push(this.deps.input.subscribe((k, r) => this.onInput(k, r)))
    this.offs.push(this.deps.input.subscribeTap((x, y) => this.onTap(x, y)))
    this.offs.push(this.deps.input.subscribeTapUp(() => this.onTapUp()))
    this.offs.push(this.deps.input.subscribeDrag((x, y, sx) => this.onDrag(x, y, sx)))
    this.offs.push(this.deps.input.subscribeDragEnd((moved) => this.onDragEnd(moved)))
    this.offs.push(this.deps.frames.add((dt) => this.frame(dt)))
    this.offs.push(this.deps.lang.onChange(() => this.draw()))
    this.offs.push(
      this.deps.store.onChange((fk) => {
        if (fk.endsWith(':mail:mails')) {
          void this.refreshMailUnread().then(() => {
            if (this.state === 'home') this.draw()
          })
        } else if (fk.endsWith(':settings:settings')) {
          void this.loadSetFlags().then(() => {
            if (this.state === 'home' || this.state === 'lock') this.draw()
          })
        } else if (fk.endsWith(':clock:alarm')) {
          void this.deps.store
            .get<{ on: boolean; h: number; m: number }>('clock:alarm')
            .then((v) => { if (v) this.alarmConf = v })
        }
      }),
    )
    this.drawOff()
  }

  /** 读取设置应用存档（AppStore 键空间 settings:*），映射到状态栏/自动锁定 */
  private async loadSetFlags() {
    const v = await this.deps.store.get<{
      airplane?: boolean; bluetooth?: boolean; wifiOn?: boolean; autoLock?: number
    }>('settings:settings')
    if (!v) return
    this.setFlags = {
      airplane: !!v.airplane,
      bluetooth: !!v.bluetooth,
      wifiOn: v.wifiOn !== false,
      autoLockMin: AL_MIN[v.autoLock ?? 1] ?? 2,
    }
  }

  // ---------- 开机 / 关机 ----------

  private boot() {
    this.deps.audio.unlock()
    this.powered = true
    this.state = 'boot'
    this.bootT = 0
    this.draw()
  }

  private shutdown() {
    this.ringStop?.()
    this.ringStop = null
    this.alert = null
    for (const t of this.timers.splice(0)) clearTimeout(t)
    if (this.state === 'app') {
      this.appQuiet = true
      this.runtime.close()
      this.appQuiet = false
    }
    this.powered = false
    this.state = 'off'
    this.drawOff()
  }

  /** 短按电源：睡眠（真机 sleep/wake——屏幕熄灭但保持开机，来电/闹钟照常） */
  private sleep() {
    if (this.state === 'app') this.closeAppQuiet()
    this.state = 'sleep'
    this.drawOff()
  }

  private frame(dt: number) {
    this.tSecs += dt
    // 应用打开/关闭 zoom 过渡（独占帧，不被自动锁定/闹钟打断）
    if (this.state === 'zoom') { this.stepZoom(dt); return }
    // 自动锁定（真机 Auto-Lock）：主屏/应用内无操作超时 → 睡眠
    if (
      this.setFlags.autoLockMin > 0 &&
      (this.state === 'home' || this.state === 'app') &&
      this.tSecs - this.lastAct > this.setFlags.autoLockMin * 60
    ) {
      this.lastAct = this.tSecs
      this.sleep()
      return
    }
    // 闹钟到点（通话/振铃中跳过该次，其余状态弹窗响铃）
    this.checkAlarm()
    if (this.state === 'boot') {
      this.bootT += dt
      const s = this.deps.screen
      drawBoot(s, this.bootT)
      s.render()
      if (this.bootT >= BOOT_TOTAL) {
        if (this.pending) {
          const p = this.pending
          this.pending = null
          this.enterIncoming(p.tel, p.name, true)
        } else {
          this.enterLock()
        }
      }
      return
    }
    if (this.state === 'lock' && this.locker.step(dt)) this.drawLock()
    if (this.state === 'ringing' && this.callUI === 'lock' && this.answerLocker.step(dt)) this.drawRinging()
    if (this.state === 'poweroff' && this.powerLocker.step(dt)) this.drawPowerOff()
  }

  /** 闹钟触发：整分匹配且本次未触发过；关机/开机/通话中跳过 */
  private checkAlarm() {
    const a = this.alarmConf
    if (!a.on || !this.powered) return
    const now = new Date()
    if (now.getHours() !== a.h || now.getMinutes() !== a.m) return
    const key = `${now.toDateString()} ${a.h}:${a.m}`
    if (this.alarmLast === key) return
    this.alarmLast = key
    if (this.state === 'off' || this.state === 'boot' || this.state === 'ringing' || this.state === 'incall') return
    if (this.alert) return
    if (this.state === 'app') {
      this.closeAppQuiet()
      this.state = 'home'
    } else if (this.state === 'sleep' || this.state === 'poweroff') {
      this.state = 'home'
    }
    this.deps.audio.unlock()
    this.ringStop?.()
    this.ringStop = this.deps.audio.playSequence(
      RINGTONES[this.ringIdxVal] ?? RINGTONES[0]!,
      { loop: true, volume: 0.7 },
    )
    this.alert = { kind: 'alarm', h: a.h, m: a.m }
    this.draw()
  }

  private dismissAlert() {
    this.ringStop?.()
    this.ringStop = null
    this.alert = null
    this.draw()
  }

  // ---------- 实体键 ----------

  private onInput(key: string, repeat = false) {
    this.lastAct = this.tSecs
    if (this.state === 'zoom') return
    if (key === 'power') {
      // 真机：长按电源 → slide to power off；短按 → 睡眠/唤醒
      if (repeat) {
        if (this.state !== 'off' && this.state !== 'boot' && this.state !== 'poweroff') this.enterPowerOff()
        return
      }
      if (this.state === 'off') this.boot()
      else if (this.state === 'sleep') this.enterLock()
      else if (this.state === 'lock' || this.state === 'home' || this.state === 'app') this.sleep()
      return
    }
    if (this.alert) {
      // 弹窗激活：任意键静音并关闭（真机按电源/ Home 静默提醒）
      this.dismissAlert()
      return
    }
    if (this.state === 'sleep') {
      if (key === 'home' || key === 'end' || key === 'call') this.enterLock()
      return
    }
    if (this.state === 'off') {
      if (key === 'home' || key === 'end' || key === 'call') this.boot()
      return
    }
    if (this.state === 'ringing') {
      if (this.callUI !== 'lock') {
        if (key === 'call') this.answer()
        else if (key === 'end' || key === 'back') this.hangupRinging()
      } else if (key === 'end') {
        this.hangupRinging()
      }
      return
    }
    if (this.state === 'incall') {
      if (key === 'end' || key === 'back') this.endCall()
      return
    }
    if (this.state === 'app' && key === 'home') this.runtime.close()
    // 桌面按 Home → 回锁屏（逐级返回：app→桌面→锁屏）
    if (this.state === 'home' && key === 'home') this.enterLock()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    this.lastAct = this.tSecs
    if (this.state === 'sleep' || this.state === 'off' || this.state === 'boot' || this.state === 'zoom') return
    if (this.state === 'poweroff') {
      // Cancel 按钮（滑条上方）
      if (x >= 110 && x < 210 && y >= 372 && y < 406) this.enterLock()
      return
    }
    if (this.alert) {
      this.tapAlert(x, y)
      return
    }
    if (this.state === 'home') {
      // 真机 1.0：按下图标 → 立即变暗反馈；松手（tapUp）才启动。
      // 拖拽越过阈值则取消（onDragEnd 清 armed），不启动。
      const hit = springboardHit(x, y)
      if (!hit) return
      const id = hit.kind === 'dock' ? DOCK_IDS[hit.i] : GRID_IDS[hit.i]
      if (!id) return
      this.pressedHit = hit
      this.deps.audio.keypad()
      this.drawHome()
      return
    }
    if (this.state === 'ringing' && this.callUI === 'open') {
      if (this.callDir === 'in') {
        // 真机：底部两个胶囊钮——红 Decline（左）/绿 Answer（右）
        if (y >= 392 && y < 456) {
          if (x >= 10 && x < 156) this.hangupRinging()
          else if (x >= 164 && x < 310) this.answer()
        }
      } else if (x >= 88 && x < 232 && y >= 392 && y < 456) {
        this.hangupRinging()
      }
      return
    }
    if (this.state === 'incall') {
      // 结束
      if (x >= 56 && x < 264 && y >= 392 && y < 452) {
        this.endCall()
        return
      }
      // 覆盖层关闭（Done）
      if (this.callOverlay && y >= 196 && y < 222 && x < 80) {
        this.callOverlay = null
        this.draw()
        return
      }
      if (this.callOverlay === 'keys') {
        const keys = ['1','2','3','4','5','6','7','8','9','*','0','#']
        const i = keys.findIndex((_, k) =>
          Math.abs(x - (60 + (k % 3) * 100)) <= 32 &&
          Math.abs(y - (232 + ((k / 3) | 0) * 50)) <= 19)
        if (i >= 0) {
          this.deps.audio.dtmf(keys[i]!)
          this.draw()
        }
        return
      }
      if (this.callOverlay === 'contacts') return
      // 六个功能按钮
      const cxs = [53, 160, 267]
      const cys = [224, 302]
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          const bi = r * 3 + c
          if (Math.abs(x - cxs[c]!) <= 46 && Math.abs(y - cys[r]!) <= 30) {
            if (bi === 0) this.muteOn = !this.muteOn
            else if (bi === 1) this.callOverlay = 'keys'
            else if (bi === 2) this.spkOn = !this.spkOn
            else if (bi === 3 || bi === 5) this.callOverlay = 'contacts'
            else if (bi === 4) this.holdOn = !this.holdOn
            this.draw()
          }
        }
    }
  }

  /** 抬手且未拖拽：执行主屏按下的图标启动（真机松手启动语义） */
  private onTapUp() {
    if (this.state !== 'home' || !this.pressedHit) return
    const hit = this.pressedHit
    this.pressedHit = null
    const id = hit.kind === 'dock' ? DOCK_IDS[hit.i] : GRID_IDS[hit.i]
    if (id) this.launchApp(id)
  }

  private onDrag(x: number, y: number, sx: number) {
    this.lastAct = this.tSecs
    if (this.state === 'lock') {
      this.locker.onDrag(x, y, sx)
      this.drawLock()
    } else if (this.state === 'ringing' && this.callUI === 'lock') {
      this.answerLocker.onDrag(x, y, sx)
      this.drawRinging()
    } else if (this.state === 'poweroff') {
      this.powerLocker.onDrag(x, y, sx)
      this.drawPowerOff()
    }
  }

  private onDragEnd(moved: boolean) {
    // 主屏按下图标后发生真正拖拽 → 取消启动，恢复亮态；
    // 注意 tapUp 紧随 dragEnd 派发，仅 moved=true 才取消（否则 tapUp 仍会启动）
    if (moved && this.state === 'home' && this.pressedHit) {
      this.pressedHit = null
      this.drawHome()
    }
    if (this.state === 'lock') {
      if (this.locker.onEnd() === 'open') this.unlock()
      else this.drawLock()
    } else if (this.state === 'ringing' && this.callUI === 'lock') {
      if (this.answerLocker.onEnd() === 'open') this.answer()
      else this.drawRinging()
    } else if (this.state === 'poweroff') {
      if (this.powerLocker.onEnd() === 'open') this.shutdown()
      else this.drawPowerOff()
    }
  }

  /** 长按电源：slide to power off 画面（滑动关机 / 点 Cancel 回锁屏） */
  private enterPowerOff() {
    if (this.state === 'app') this.closeAppQuiet()
    this.powerLocker = new LockScreen()
    this.state = 'poweroff'
    this.drawPowerOff()
  }

  // ---------- 界面切换 ----------

  private enterLock() {
    this.state = 'lock'
    this.locker = new LockScreen()
    this.drawLock()
  }

  private unlock() {
    this.deps.audio.unlock()
    this.deps.audio.unlockSound()
    this.enterHome()
  }

  private enterHome() {
    this.state = 'home'
    this.draw()
  }

  private onAppExit(snapshot?: HTMLCanvasElement, app?: MiniApp) {
    if (this.appQuiet) return
    // 关闭 zoom：app 末帧快照从全屏缩回图标位置，再回 Springboard
    if (snapshot && app?.id) {
      this.zoomSnap = snapshot
      this.zoomDir = 'close'
      this.zoomT = 0
      this.zoomRect = this.iconRectFor(app.id)
      this.zoomLaunchId = null
      this.state = 'zoom'
      return
    }
    this.enterHome()
  }

  private appOf(id: string) {
    let a = this.appCache.get(id)
    if (!a) {
      a = FACTORIES[id]!(this.bridge)
      this.appCache.set(id, a)
    }
    return a
  }

  /** app id → 其 Springboard 图标矩形（zoom 过渡的起/终点） */
  private iconRectFor(id: string): { x: number; y: number; u: number } {
    const gi = GRID_IDS.indexOf(id as (typeof GRID_IDS)[number])
    if (gi >= 0) return { x: GRID_X[gi % 4]!, y: GRID_Y[(gi / 4) | 0]!, u: 57 }
    const di = DOCK_IDS.indexOf(id as (typeof DOCK_IDS)[number])
    if (di >= 0) return { x: DOCK_X[di]!, y: DOCK_Y, u: 50 }
    return { x: 131, y: 211, u: 57 }
  }

  private launchApp(id: string) {
    // 打开 zoom：先截当前 Springboard 帧，从图标位置缩放到全屏，完成后再启动 app
    this.zoomSnap = this.deps.screen.snapshot()
    this.zoomDir = 'open'
    this.zoomT = 0
    this.zoomRect = this.iconRectFor(id)
    this.zoomLaunchId = id
    this.state = 'zoom'
    this.drawZoom()
  }

  /** zoom 过渡一帧推进 */
  private stepZoom(dt: number) {
    this.zoomT += dt
    const p = Math.min(1, this.zoomT / IPhoneOS.ZOOM_DUR)
    if (p < 1) {
      this.drawZoom(p)
      return
    }
    // 完成：直接切到目标态并渲染其首帧，跳过缩放到图标尺寸的末帧（避免多余帧/闪烁）
    const id = this.zoomLaunchId
    this.zoomSnap = null
    this.zoomLaunchId = null
    if (this.zoomDir === 'open' && id) {
      this.state = 'app'
      this.runtime.launch(this.appOf(id), {})
      this.deps.screen.render()
    } else {
      this.enterHome()
    }
  }

  /**
   * 绘制 zoom 过渡：快照从全屏缩向图标位置（ease 1→0）。
   * open/close 都用同一方向——快照（open=Springboard、close=应用末帧）从当前
   * 全屏状态缩入被点图标，黑底天然补四周边缘，首帧 ease=1 即全屏=当前画面，无突跳。
   */
  private drawZoom(p = 0) {
    const s = this.deps.screen
    const ease = 1 - p * p // 1(全屏) → 0(图标)，ease-out 快速缩入后收敛
    const r = this.zoomRect
    const icx = r.x + r.u / 2, icy = r.y + r.u / 2
    const fcx = W / 2, fcy = H / 2
    const cx = icx + (fcx - icx) * ease
    const cy = icy + (fcy - icy) * ease
    const w = r.u + (W - r.u) * ease
    const h = r.u + (H - r.u) * ease
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    if (this.zoomSnap) s.blit(this.zoomSnap, Math.round(cx - w / 2), Math.round(cy - h / 2), { w: Math.round(w), h: Math.round(h), smooth: true })
    s.render()
  }

  /** 从应用中静默切走（来电/去电/跳短信）：onExit 不回 Springboard */
  private closeAppQuiet() {
    this.appQuiet = true
    this.runtime.close()
    this.appQuiet = false
  }

  // ---------- 通话 ----------

  incomingCall(tel: string, name?: string) {
    const n = name ?? this.contactsArr.find((c) => c.tel === tel)?.name
    if (!this.powered || this.state === 'off' || this.state === 'boot') {
      this.pending = { tel, name: n }
      return
    }
    this.enterIncoming(tel, n, false)
  }

  private enterIncoming(tel: string, name: string | undefined, fromBoot = false) {
    if (this.state === 'app') this.closeAppQuiet()
    this.callNum = tel
    this.callName = name ?? tel
    this.callDir = 'in'
    this.callSecs = 0
    this.callUI = this.state === 'lock' || this.state === 'sleep' || fromBoot ? 'lock' : 'open'
    this.answerLocker = new LockScreen()
    this.state = 'ringing'
    this.deps.audio.unlock()
    this.ringStop?.()
    this.ringStop = this.deps.audio.playSequence(
      RINGTONES[this.ringIdxVal] ?? RINGTONES[0]!,
      { loop: true, volume: 0.7 },
    )
    // 标签闪烁重绘 + 25s 未接自动挂断
    this.timers.push(setInterval(() => {
      if (this.state === 'ringing') this.draw()
    }, 600))
    this.timers.push(setTimeout(() => {
      if (this.state === 'ringing' && this.callDir === 'in') this.hangupRinging()
    }, 25000))
    this.draw()
  }

  /** Bridge.startCall：应用内发起去电 */
  private beginOutgoing(num: string, name: string) {
    this.closeAppQuiet()
    this.callNum = num
    this.callName = name
    this.callDir = 'out'
    this.callSecs = 0
    this.callUI = 'open'
    this.state = 'ringing'
    this.deps.audio.unlock()
    this.deps.audio.ringbackTone(0.5)
    this.timers.push(setInterval(() => this.deps.audio.ringbackTone(0.5), 2800))
    // 3.6s 接通
    this.timers.push(setTimeout(() => {
      if (this.state === 'ringing' && this.callDir === 'out') this.answer()
    }, 3600))
    this.draw()
  }

  private answer() {
    this.ringStop?.()
    this.ringStop = null
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.muteOn = false
    this.spkOn = false
    this.holdOn = false
    this.callOverlay = null
    this.state = 'incall'
    this.callSecs = 0
    this.timers.push(setInterval(() => {
      if (this.state !== 'incall') return
      this.callSecs++
      this.draw()
    }, 1000))
    this.draw()
  }

  /** 振铃阶段挂断：来电记未接，去电记 0 秒外拨 */
  private hangupRinging() {
    this.ringStop?.()
    this.ringStop = null
    for (const t of this.timers.splice(0)) clearTimeout(t)
    const backToLock = this.callUI === 'lock'
    this.recordCall({
      tel: this.callNum, name: this.callName,
      dir: this.callDir, dur: 0,
      missed: this.callDir === 'in',
    })
    this.callNum = ''
    if (backToLock) this.enterLock()
    else this.enterHome()
  }

  private endCall() {
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.recordCall({
      tel: this.callNum, name: this.callName,
      dir: this.callDir, dur: this.callSecs, missed: false,
    })
    this.callNum = ''
    this.enterHome()
  }

  private recordCall(e: Omit<CallEntry, 'id' | 'ts'>) {
    this.callLogArr.push({ ...e, id: Date.now(), ts: Date.now() })
    while (this.callLogArr.length > 30) this.callLogArr.shift()
    void this.deps.store.set('calllog', this.callLogArr)
    // 真机 1.0：未接来电在 Phone 图标挂角标
    if (e.missed) {
      this.missedN++
      void this.deps.store.set('phone:missed', this.missedN)
      if (this.state === 'home') this.draw()
    }
  }

  // ---------- 短信 ----------

  injectSms(from: string, text: string) {
    void this.deliverIncoming(from, text)
  }

  private async deliverIncoming(from: string, text: string) {
    let t = this.threadsArr.find((x) => x.tel === from)
    if (!t) {
      t = {
        tel: from,
        name: this.contactsArr.find((c) => c.tel === from)?.name ?? from,
        msgs: [], unread: 0,
      }
      this.threadsArr.push(t)
    }
    t.msgs.push({ dir: 'in', text, ts: Date.now() })
    t.unread = (t.unread ?? 0) + 1
    await this.deps.store.set('sms:threads', this.threadsArr)
    if (this.powered && this.state !== 'off' && this.state !== 'boot') {
      this.deps.audio.unlock()
      this.deps.audio.playSequence(SMS_TONE, { volume: 0.5 })
      // 真机 1.0：主屏/锁屏/睡眠时弹「New Text Message」模态框（应用内只响铃+角标）
      if (!this.alert && (this.state === 'home' || this.state === 'lock' || this.state === 'sleep')) {
        if (this.state === 'sleep') this.state = 'home'
        this.alert = { kind: 'sms', from, name: t.name, text }
        this.draw()
      } else if (this.state === 'home') {
        this.draw()
      }
    }
  }

  private sendSms(tel: string, text: string) {
    let t = this.threadsArr.find((x) => x.tel === tel)
    if (!t) {
      t = {
        tel,
        name: this.contactsArr.find((c) => c.tel === tel)?.name ?? tel,
        msgs: [], unread: 0,
      }
      this.threadsArr.push(t)
    }
    t.msgs.push({ dir: 'out', text, ts: Date.now() })
    void this.deps.store.set('sms:threads', this.threadsArr)
    // 自动回复（真机运营商/联系人行为的博物馆简化）
    this.timers.push(
      setTimeout(() => {
        const replies =
          tel === '13912345678'
            ? ['好，妈妈等你。', '路上小心。', '下班了吗？']
            : ['收到。', '好的。', '等会儿说。']
        void this.deliverIncoming(tel, replies[Math.floor(Math.random() * replies.length)]!)
      }, 5000 + Math.random() * 3000),
    )
  }

  private totalUnread(): number {
    return this.threadsArr.reduce((n, t) => n + (t.unread ?? 0), 0)
  }

  private async refreshMailUnread() {
    const mails = await this.deps.store.get<Array<{ box: string; read: boolean }>>('mail:mails')
    this.mailUnreadN = mails
      ? mails.filter((m) => m.box === 'inbox' && !m.read).length
      : 1 // Mail 种子：妈妈的邮件未读
  }

  // ---------- Bridge ----------

  private makeBridge(): Bridge {
    return {
      now: () => new Date(),
      batteryPct: () => this.deps.battery.percent,
      contacts: () => this.contactsArr,
      saveContacts: (c) => {
        this.contactsArr = [...c]
        void this.deps.store.set('contacts', this.contactsArr)
      },
      callLog: () => this.callLogArr,
      clearRecents: () => {
        this.callLogArr = []
        void this.deps.store.set('calllog', this.callLogArr)
      },
      clearMissed: () => {
        if (!this.missedN) return
        this.missedN = 0
        void this.deps.store.set('phone:missed', 0)
      },
      startCall: (num, name) =>
        this.beginOutgoing(num, name ?? this.contactsArr.find((c) => c.tel === num)?.name ?? num),
      getThreads: () => this.threadsArr,
      threadOf: (tel, name) => {
        let t = this.threadsArr.find((x) => x.tel === tel)
        if (!t) {
          t = {
            tel,
            name: name ?? this.contactsArr.find((c) => c.tel === tel)?.name ?? tel,
            msgs: [], unread: 0,
          }
          this.threadsArr.push(t)
          void this.deps.store.set('sms:threads', this.threadsArr)
        }
        this.closeAppQuiet()
        this.bridge.pendingThreadTel = tel
        this.launchApp('sms')
      },
      sendSms: (tel, text) => this.sendSms(tel, text),
      markThreadRead: (tel) => {
        const t = this.threadsArr.find((x) => x.tel === tel)
        if (t && t.unread) {
          t.unread = 0
          void this.deps.store.set('sms:threads', this.threadsArr)
        }
      },
      unreadCount: () => this.totalUnread(),
      ringIdx: () => this.ringIdxVal,
      setRingIdx: (i) => {
        this.ringIdxVal = i
        void this.deps.store.set('ringtone:idx', i)
      },
      setLang: (l) => this.deps.lang.set?.(l),
      photos: () => this.photosArr,
      addPhoto: () => {
        const p: PhotoMeta = {
          id: Date.now(),
          seed: 29062007 + this.photosArr.length * 7919,
          ts: Date.now(),
        }
        this.photosArr.push(p)
        void this.deps.store.set('camera:photos', this.photosArr)
        return p
      },
      setWallpaper: (i) => {
        this.wallpaperId = i
        void this.deps.store.set('wallpaper', i)
        if (this.state === 'lock') this.drawLock()
      },
      pendingThreadTel: null,
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    switch (this.state) {
      case 'off': this.drawOff(); break
      case 'sleep': this.drawOff(); break
      case 'lock': this.drawLock(); break
      case 'home': this.drawHome(); break
      case 'ringing': this.drawRinging(); break
      case 'incall': this.drawInCall(); break
      case 'poweroff': this.drawPowerOff(); break
      case 'zoom': break
      case 'app': break
    }
    // 模态提醒（新短信/闹钟）覆盖在主屏或锁屏之上
    if (this.alert && (this.state === 'home' || this.state === 'lock')) {
      this.drawAlert(this.deps.screen)
      this.deps.screen.render()
    }
  }

  /** 关机画面：黑底 + slide to power off 滑条 + Cancel */
  private drawPowerOff() {
    const s = this.deps.screen
    s.clearOverlays()
    const str = ipStrings(this.deps.lang.get())
    this.powerLocker.draw(s, {
      now: new Date(), t: this.tSecs, mode: 'unlock',
      lang: this.deps.lang.get(), str, batteryPct: this.deps.battery.percent,
      wallpaper: 2, label: str.slideOff, noClock: true,
    })
    rrStroke(s, 110, 372, 100, 34, 17, C.GRAY4)
    s.textCenter(160, 380, str.cancel, { size: 15, font: F_REG(15), color: C.WHITE })
    s.render()
  }

  /** 真机 1.0 玻璃弹窗：压暗底 + 深色面板 + 标题/正文 + 按钮 */
  private drawAlert(s: import('../../hal/screen').Screen) {
    const a = this.alert
    if (!a) return
    const str = ipStrings(this.deps.lang.get())
    scrim(s, 0, 0, W, H, C.BLACK, 2)
    rr(s, 28, 168, 264, 168, 14, C.GLASS)
    rrStroke(s, 28, 168, 264, 168, 14, C.GRAY4)
    if (a.kind === 'sms') {
      s.textCenter(160, 188, str.newMessageAlert, { size: 18, font: F_BOLD(18), color: C.WHITE })
      s.textCenter(160, 218, a.name, { size: 15, font: F_BOLD(15), color: C.GRAY5 })
      s.textCenter(160, 244, a.text, { size: 14, font: F_REG(14), color: C.GRAY4, maxWidth: 236 })
      // Close（左灰）/ View（右蓝）
      rr(s, 44, 286, 110, 36, 8, C.GRAY3)
      s.textCenter(99, 295, str.close, { size: 15, font: F_BOLD(15), color: C.WHITE })
      rrGrad(s, 166, 286, 110, 36, 8, R.BLUE_BTN)
      s.textCenter(221, 295, str.view, { size: 15, font: F_BOLD(15), color: C.WHITE })
    } else {
      s.textCenter(160, 188, str.alarms, { size: 18, font: F_BOLD(18), color: C.WHITE })
      const mm = String(a.m).padStart(2, '0')
      s.textCenter(160, 222, `${a.h}:${mm}`, { size: 30, font: F_BOLD(30), color: C.WHITE })
      rrGrad(s, 85, 286, 150, 36, 8, R.BLUE_BTN)
      s.textCenter(160, 295, str.ok, { size: 15, font: F_BOLD(15), color: C.WHITE })
    }
  }

  private tapAlert(x: number, y: number) {
    const a = this.alert
    if (!a) return
    if (y < 286 || y >= 322) return
    if (a.kind === 'sms') {
      if (x >= 44 && x < 154) this.dismissAlert()
      else if (x >= 166 && x < 276) {
        const from = a.from
        this.ringStop?.()
        this.ringStop = null
        this.alert = null
        this.bridge.threadOf(from)
      }
    } else if (x >= 85 && x < 235) {
      this.dismissAlert()
    }
  }

  private drawOff() {
    const s = this.deps.screen
    s.clear()
    s.render()
  }

  /** 状态栏标志：跟随设置存档（飞行模式/蓝牙/Wi-Fi 关 → E） */
  private sbFlags() {
    return {
      airplane: this.setFlags.airplane,
      bluetooth: this.setFlags.bluetooth,
      wifi: this.setFlags.wifiOn,
    }
  }

  private drawLock() {
    const s = this.deps.screen
    s.clearOverlays()
    const str = ipStrings(this.deps.lang.get())
    this.locker.draw(s, {
      now: new Date(), t: this.tSecs, mode: 'unlock',
      lang: this.deps.lang.get(), str, batteryPct: this.deps.battery.percent,
      wallpaper: this.wallpaperId, sb: this.sbFlags(),
    })
    s.render()
  }

  private drawHome() {
    const s = this.deps.screen
    s.clearOverlays()
    const str = ipStrings(this.deps.lang.get())
    drawSpringboard(s, this.gridEntries(str.apps), this.dockEntries(str.apps), this.pressedHit)
    statusBar(s, {
      dark: true, batteryPct: this.deps.battery.percent,
      clock: clockString(new Date()), ...this.sbFlags(),
    })
    s.render()
  }

  private gridEntries(names: ReturnType<typeof ipStrings>['apps']): AppEntry[] {
    const icons = [
      iconText, iconCalendar, iconPhotos, iconCamera,
      iconYoutube, iconStocks, iconMaps, iconWeather,
      iconClock, iconCalculator, iconNotes, iconSettings,
    ]
    const labels = [
      names.text, names.calendar, names.photos, names.camera,
      names.youtube, names.stocks, names.maps, names.weather,
      names.clock, names.calculator, names.notes, names.settings,
    ]
    return icons.map((icon, i) => ({
      id: GRID_IDS[i]!, name: labels[i]!, icon, iconPng: GRID_IDS[i],
      badge: i === 0 ? () => this.totalUnread() : undefined,
    }))
  }

  private dockEntries(names: ReturnType<typeof ipStrings>['apps']): AppEntry[] {
    const icons = [iconPhone, iconMail, iconSafari, iconIpod]
    const labels = [names.phone, names.mail, names.safari, names.ipod]
    return icons.map((icon, i) => ({
      id: DOCK_IDS[i]!, name: labels[i]!, icon, iconPng: DOCK_IDS[i],
      badge: i === 0 ? () => this.missedN : i === 1 ? () => this.mailUnreadN : undefined,
    }))
  }

  private drawRinging() {
    const s = this.deps.screen
    s.clearOverlays()
    const str = ipStrings(this.deps.lang.get())
    if (this.callUI === 'lock') {
      this.answerLocker.draw(s, {
        now: new Date(), t: this.tSecs, mode: 'answer',
        name: this.callName, lang: this.deps.lang.get(), str,
        batteryPct: this.deps.battery.percent, wallpaper: this.wallpaperId,
        sb: this.sbFlags(),
      })
      s.render()
      return
    }
    // 真机 1.0：联系人照片全屏背景 + 压暗
    drawPhotoArt(s, 0, 0, W, H, seedOf(this.callNum))
    scrim(s, 0, 0, W, H, C.BLACK, 2)
    statusBar(s, {
      dark: true, batteryPct: this.deps.battery.percent,
      clock: clockString(new Date()), ...this.sbFlags(),
    })
    if (this.callDir === 'in') {
      s.textCenter(160, 138, this.callName, { size: 38, font: F_BOLD(38), color: C.WHITE })
      s.textCenter(160, 196, 'mobile', { size: 16, font: F_REG(16), color: C.GRAY4 })
      // 红 Decline 胶囊
      rrGrad(s, 12, 396, 140, 58, 29, R.RED_BTN)
      handsetIcon(s, 82, 425, C.WHITE)
      // 绿 Answer 胶囊
      rrGrad(s, 168, 396, 140, 58, 29, R.GREEN_BTN)
      handsetIcon(s, 238, 425, C.WHITE)
    } else {
      s.textCenter(160, 150, this.callName, { size: 36, font: F_BOLD(36), color: C.WHITE })
      s.textCenter(160, 206, str.calling + '…', { size: 17, font: F_REG(17), color: C.GRAY4 })
      rrGrad(s, 92, 396, 136, 58, 29, R.RED_BTN)
      handsetIcon(s, 160, 425, C.WHITE)
    }
    s.render()
  }

  private drawInCall() {
    const s = this.deps.screen
    s.clearOverlays()
    const str = ipStrings(this.deps.lang.get())
    s.fillRect(0, 0, W, H, C.BLACK)
    statusBar(s, {
      dark: true, batteryPct: this.deps.battery.percent,
      clock: clockString(new Date()), ...this.sbFlags(),
    })
    s.textCenter(160, 92, this.callName, { size: 34, font: F_BOLD(34), color: C.WHITE })
    const mm = (this.callSecs / 60) | 0
    const ss = this.callSecs % 60
    s.textCenter(
      160, 146,
      `${mm}:${ss.toString().padStart(2, '0')}`,
      { size: 22, font: F_REG(22), color: C.GREEN },
    )
    if (this.callOverlay === 'keys') this.drawCallKeypad(s)
    else if (this.callOverlay === 'contacts') this.drawCallContacts(s)
    else this.drawCallButtons(s, str)
    // 红色结束条
    rrGrad(s, 56, 392, 208, 60, 30, R.RED_BTN)
    s.textCenter(160, 411, str.decline, { size: 22, font: F_BOLD(22), color: C.WHITE })
    s.render()
  }

  /** 六按钮：mute/keypad/speaker，add call/hold/contacts */
  private drawCallButtons(s: import('../../hal/screen').Screen, str: IpStrings) {
    const cxs = [53, 160, 267]
    const cys = [224, 302]
    const kinds = ['mute', 'keys', 'spk', 'add', 'hold', 'contacts'] as const
    const labels = [
      str.mute, str.keypad, str.speaker,
      str.addCall, this.holdOn ? str.resume : str.hold, str.contacts,
    ]
    const active = [this.muteOn, false, this.spkOn, false, this.holdOn, false]
    kinds.forEach((g, i) => {
      const cx = cxs[i % 3]!, cy = cys[(i / 3) | 0]!
      const on = active[i]!
      const fg = on ? C.BLUE : C.WHITE
      rr(s, cx - 46, cy - 30, 92, 60, 10, C.GLASS)
      callGlyph(s, g, cx, cy - 12, fg)
      s.textCenter(cx, cy + 11, labels[i]!, {
        size: 11, font: F_REG(11), color: on ? C.BLUE : C.LABEL_GRAY, maxWidth: 90,
      })
    })
  }

  /** 通话中拨号键盘（DTMF） */
  private drawCallKeypad(s: import('../../hal/screen').Screen) {
    this.overlayDone(s)
    const keys = ['1','2','3','4','5','6','7','8','9','*','0','#']
    const subs = ['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+','']
    keys.forEach((k, i) => {
      const cx = 60 + (i % 3) * 100
      const cy = 232 + ((i / 3) | 0) * 50
      rr(s, cx - 32, cy - 19, 64, 38, 7, C.GLASS)
      s.text(cx - 20, cy - 12, k, { size: 19, font: F_BOLD(19), color: C.WHITE })
      if (subs[i]) s.text(cx + 2, cy - 8, subs[i], { size: 9, font: F_BOLD(9), color: C.LABEL_GRAY })
    })
  }

  /** 通话中通讯录浏览 */
  private drawCallContacts(s: import('../../hal/screen').Screen) {
    this.overlayDone(s)
    s.fillRect(8, 230, 304, 152, C.GLASS)
    this.contactsArr.slice(0, 4).forEach((c, i) => {
      const y = 238 + i * 36
      s.text(20, y + 4, c.name, { size: 16, font: F_BOLD(16), color: C.WHITE })
      s.text(20, y + 22, c.tel, { size: 12, font: F_REG(12), color: C.LABEL_GRAY })
      s.fillRect(20, y + 34, 280, 1, C.GRAY2)
    })
  }

  private overlayDone(s: import('../../hal/screen').Screen) {
    rrStroke(s, 8, 196, 72, 26, 6, C.WHITE)
    s.textCenter(44, 202, ipStrings(this.deps.lang.get()).done, { size: 13, font: F_REG(13), color: C.WHITE })
  }
}

/** 号码 → 确定性照片种子 */
function seedOf(tel: string): number {
  let h = 0
  for (const ch of tel) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/** 通话六按钮白色线稿图标 */
function callGlyph(
  s: import('../../hal/screen').Screen,
  kind: 'mute' | 'keys' | 'spk' | 'add' | 'hold' | 'contacts',
  cx: number, cy: number, v: number,
) {
  if (kind === 'mute') {
    // 话筒：竖向胶囊 + 底座
    rr(s, cx - 3, cy - 8, 6, 12, 3, v)
    s.fillRect(cx - 7, cy + 6, 14, 2, v)
    s.fillRect(cx - 1, cy + 2, 2, 4, v)
  } else if (kind === 'keys') {
    // 3×3 点阵
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) s.fillRect(cx - 6 + c * 6, cy - 6 + r * 6, 3, 3, v)
  } else if (kind === 'spk') {
    // 喇叭：方块 + 三角扩口 + 两道声波
    s.fillRect(cx - 10, cy - 3, 5, 6, v)
    for (let i = 0; i < 8; i++) s.fillRect(cx - 5, cy - 8 + i * 2, i + 1, 2, v)
    s.pset(cx + 6, cy - 5, v); s.pset(cx + 6, cy + 4, v)
    s.pset(cx + 9, cy - 8, v); s.pset(cx + 9, cy + 7, v)
  } else if (kind === 'add') {
    // 小人 + 十字
    disc(s, cx - 6, cy - 5, 3, v)
    rr(s, cx - 11, cy, 12, 7, 3, v)
    s.fillRect(cx + 4, cy - 7, 2, 8, v)
    s.fillRect(cx + 1, cy - 4, 8, 2, v)
  } else if (kind === 'hold') {
    // 两条竖杠
    s.fillRect(cx - 4, cy - 8, 4, 16, v)
    s.fillRect(cx + 2, cy - 8, 4, 16, v)
  } else {
    // contacts：大头像 + 肩
    disc(s, cx, cy - 4, 4, v)
    rr(s, cx - 8, cy + 2, 16, 7, 3, v)
  }
}

/** 胶囊钮上的白色小话筒（斜向听筒 + 两端圆点） */
function handsetIcon(s: import('../../hal/screen').Screen, cx: number, cy: number, v: number) {
  for (let i = -8; i <= 8; i++) s.fillRect(cx + i - 2, cy - i - 2, 4, 4, v)
  disc(s, cx - 8, cy + 8, 4, v)
  disc(s, cx + 8, cy - 8, 4, v)
}

export default {
  create(deps: OSDeps): PhoneOS {
    return new IPhoneOS(deps)
  },
} satisfies PhoneOSFactory

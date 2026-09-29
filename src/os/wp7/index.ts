import type { PhoneOS, PhoneOSFactory, OSDeps, MiniApp } from '../../kernel/types'
import { AppRuntime } from '../../kernel/runtime'
import type { DeviceKey } from '../../hal/input'
import { setPendingDial, phoneApp } from './apps/phone'
import { messagingApp, setPendingThread, type WMsg } from './apps/messaging'
import { peopleApp } from './apps/people'
import { cameraApp } from './apps/camera'
import { alarmApp } from './apps/alarm'
import { settingsApp } from './apps/settings'
import { calculatorApp } from './apps/calculator'
import { notesApp } from './apps/notes'
import { calendarApp } from './apps/calendar'
import { ieApp } from './apps/ie'
import { picturesApp, photoToCanvas } from './apps/pictures'
import type { WPhoto } from './apps/camera'
import { searchApp } from './apps/search'
import { musicApp } from './apps/music'
import { marketplaceApp } from './apps/marketplace'
import { gamesApp } from './apps/games'
import { wpStrings } from './strings'
import { C, ACCENTS } from './palette'
import { assets } from './assets'
import { loadStockBitmaps } from '../stockPhotos'
import { RINGTONES, SMS_SOUNDS, ALARM_SOUNDS, UNLOCK_CLICK, playSound, flipWhoosh } from './ringtones'
import { loadContacts, type Contact, type CallEntry } from '../../scenario/data'
import {
  W, H, TRAY_H, F_LIGHT, F_REG, F_SEMI, tray, trayExpandedStrip,
  peekTray, onTrayChange, trayShown,
  glyphPhone, glyphMessage, glyphPerson, glyphCamera, glyphAlarm, glyphSettings, glyphHeadphones,
} from './ui'
import { maskArrow } from './glyphBitmaps'
import { Fx, morphOpen, morphClose, slideOpen, slideClose, unlockRise, type Rect } from './anim'
import { getWallpaper } from './wallpaper'

/** 预装应用（应用列表按字母分组展示） */
const APPS: MiniApp[] = [
  phoneApp, messagingApp, peopleApp, cameraApp, alarmApp, settingsApp,
  calculatorApp, notesApp, calendarApp, ieApp, picturesApp, searchApp,
  musicApp, marketplaceApp, gamesApp,
]
const APP_BY_ID = new Map(APPS.map((a) => [a.id, a]))

/**
 * 开始屏真机几何（WVGA 480 宽）：
 * 左缘 24，方贴 173，列缝 12，宽贴 358；右侧 98px 黑槽放圆形箭头。
 * 托盘下留约 60px 黑场，第一行贴顶 y≈92。
 */
const LEFT = 24
const SQUARE = 173
const GUTTER = 12
const WIDE_W = SQUARE * 2 + GUTTER // 358
const TILES_TOP = 92
/** 右侧黑槽圆心 */
const ARROW = { x: LEFT + WIDE_W + (W - LEFT - WIDE_W) / 2, y: TILES_TOP + 22, r: 21 } // r 仅用于点按命中（位图 41×41）

/** 应用列表行：图标 62，行高 74，分组标题 52 */
const LIST_TOP = TRAY_H + 8
const ICON = 62
const ROW_H = 74
const GROUP_H = 52
const NAME_X = LEFT + ICON + 16

/** 开机时序：NOKIA 闪屏 1.8s → Windows 旗帜逐格点亮 + Windows Phone */
const BOOT_NOKIA_S = 1.8
const BOOT_TOTAL_S = 4.2

interface TileDef {
  app: MiniApp
  wide: boolean
}
interface PlacedTile extends TileDef {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 默认固定到开始屏的瓷贴（仿真机 Lumia 800 布局）：
 * 真机 WP7.5 中方贴统一 173²，宽贴仅限微软/OEM 枢纽 —— 图片、音乐+视频是宽贴，
 * 日历是方贴。Phone/People · Messaging/IE · Calendar · Pictures 宽 · Music+Videos 宽 · Games · Alarms/Settings。
 */
const DEFAULT_PINS: Array<{ id: string; wide?: boolean }> = [
  { id: 'phone' },
  { id: 'contacts' },
  { id: 'messages' },
  { id: 'ie' },
  { id: 'calendar' },
  { id: 'pictures', wide: true },
  { id: 'music', wide: true },
  { id: 'games' },
  { id: 'clock' },
  { id: 'settings' },
]

/** 瓷贴正面字形（居中白图标；bg 供需要"缺口透出底色"的徽标用，如 Xbox 球的 X） */
function tileGlyph(s: import('../../hal/screen').Screen, app: MiniApp, cx: number, cy: number, u: number, bg: number = C.BLACK) {
  switch (app.id) {
    case 'phone': glyphPhone(s, cx, cy, u, C.WHITE); break
    case 'messages': glyphMessage(s, cx, cy, u, C.WHITE, bg); break
    case 'contacts': glyphPerson(s, cx, cy, u, C.WHITE); break
    case 'camera': glyphCamera(s, cx, cy, u, C.WHITE, bg); break
    case 'clock': glyphAlarm(s, cx, cy, u, C.WHITE, bg); break
    case 'settings': glyphSettings(s, cx, cy, u, C.WHITE); break
    case 'calculator':
      s.textCenterV(cx, cy, '=', { size: Math.round(u * 0.8), font: F_SEMI(Math.round(u * 0.8)), color: C.WHITE })
      break
    case 'notes':
      for (let i = -1; i <= 1; i++)
        s.fillRect(cx - u * 0.22, cy + i * u * 0.16 - 3, u * 0.44, 5, C.WHITE)
      break
    case 'calendar':
      s.textCenterV(cx, cy, String(new Date().getDate()), {
        size: Math.round(u * 0.62), font: F_SEMI(Math.round(u * 0.62)), color: C.WHITE,
      })
      break
    case 'ie':
      // 真机 IE 瓷贴为环形 e
      s.textCenterV(cx, cy, 'e', { size: Math.round(u * 0.9), font: F_SEMI(Math.round(u * 0.9)), color: C.WHITE })
      break
    case 'pictures': {
      // 风景照标：圆日 + 双山峰折线
      const sr = Math.round(u * 0.09)
      for (let dy = -sr; dy <= sr; dy++)
        for (let dx = -sr; dx <= sr; dx++)
          if (dx * dx + dy * dy <= sr * sr) s.pset(cx - Math.round(u * 0.16) + dx, cy - Math.round(u * 0.16) + dy, C.WHITE)
      const px = (f: number) => Math.round(cx + f * u)
      const py = (f: number) => Math.round(cy + f * u)
      s.line(px(-0.34), py(0.24), px(-0.12), py(-0.08), C.WHITE)
      s.line(px(-0.12), py(-0.08), px(0.02), py(0.08), C.WHITE)
      s.line(px(0.02), py(0.08), px(0.16), py(-0.18), C.WHITE)
      s.line(px(0.16), py(-0.18), px(0.34), py(0.24), C.WHITE)
      break
    }
    case 'search':
      s.textCenterV(cx, cy, '⌕', { size: Math.round(u * 0.95), font: F_LIGHT(Math.round(u * 0.95)), color: C.WHITE })
      break
    case 'music':
      // 真机音乐+视频 hub 为白色耳机标
      glyphHeadphones(s, cx, cy, u, C.WHITE)
      break
    case 'marketplace':
      // 购物袋：方袋 + 提手
      s.fillRect(cx - u * 0.24, cy - u * 0.1, u * 0.48, u * 0.34, C.WHITE)
      // 提手（开口环：两竖 + 顶）
      s.fillRect(cx - u * 0.13, cy - u * 0.26, 4, u * 0.16, C.WHITE)
      s.fillRect(cx + u * 0.11, cy - u * 0.26, 4, u * 0.16, C.WHITE)
      s.fillRect(cx - u * 0.13, cy - u * 0.26, u * 0.26, 4, C.WHITE)
      break
    case 'games': {
      // Xbox 球徽（真机游戏枢纽贴）：绿圆球 + X 缺口（缺口透出底色）
      const r = Math.round(u * 0.34)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, C.GREEN)
      const t = Math.max(4, Math.round(u * 0.13))
      const half = Math.round(r * 0.58)
      for (let i = -half; i <= half; i++) {
        s.fillRect(cx + i - (t >> 1), cy + i - (t >> 1), t, t, bg)
        s.fillRect(cx + i - (t >> 1), cy - i - (t >> 1), t, t, bg)
      }
      break
    }
  }
}

/** 应用列表字母分组（zh 用拼音首字母，en 用应用名首字母） */
function appLetter(app: MiniApp, lang: 'zh' | 'en'): string {
  if (lang === 'en') return (app.nameEn ?? app.name)[0]!.toUpperCase()
  const map: Record<string, string> = {
    phone: 'D', messages: 'X', contacts: 'R', camera: 'X', clock: 'N', settings: 'S',
    calculator: 'J', notes: 'B', calendar: 'R', ie: 'I', pictures: 'T',
    search: 'S', music: 'Y', marketplace: 'S', games: 'Y',
  }
  return map[app.id] ?? app.name[0]!
}

export default {
  create(deps: OSDeps): PhoneOS {
    return new WP7OS(deps)
  },
} satisfies PhoneOSFactory

type State =
  | 'off' | 'boot' | 'shutdown' | 'lock' | 'home' | 'list'
  | 'app' | 'ringing' | 'incall' | 'alarm'

class WP7OS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  /** 未读短信（锁屏提示 + 信息瓷贴计数） */
  private unreadCount = 0
  /** 主题强调色（ACCENTS 序号） */
  private accentIdx = 0
  /** 锁屏壁纸序号 */
  private wallpaperIdx = 0
  /** 锁屏 PIN（开关 + 四位码，默认 1234）/ PIN 输入态 / 已输码 */
  private pinOn = false
  private pinCode = '1234'
  private pinStage = false
  private pinBuf = ''
  private pinError = false
  /** 闹钟（到点系统级响铃） */
  private alarm: { on: boolean; h: number; m: number } | null = null
  private alarmRing = false
  private alarmRangMin = -1
  private alarmTimers: Array<ReturnType<typeof setInterval>> = []
  /** 通讯录缓存（来电号码→姓名反查） */
  private contacts: Contact[] = []
  /** 来电信息 / 暂存来电 / 接通计秒 */
  private incoming: { tel: string; name?: string } | null = null
  private pendingIncoming: { tel: string; name?: string } | null = null
  private incomingRing = false
  private ringStop: (() => void) | null = null
  private incomingIntervals: Array<ReturnType<typeof setInterval>> = []
  private incomingTimeouts: Array<ReturnType<typeof setTimeout>> = []
  private callSecs = 0

  /** 日历事项缓存（瓷贴背面取下一个） */
  private calEvents: Array<{ y: number; m: number; d: number; h: number; min: number }> = []
  /** 锁屏照片（null 时用程序壁纸） */
  private lockPhoto: HTMLCanvasElement | null = null

  /** 下一个未来事项（按今天起算），无则 null */
  private nextEvent() {
    const now = new Date()
    const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let best: (typeof this.calEvents)[number] | null = null
    let bestDays = Infinity
    for (const e of this.calEvents) {
      const ed = new Date(e.y, e.m, e.d)
      const days = Math.round((ed.getTime() - cur.getTime()) / 86400_000)
      if (days < 0) continue
      if (days < bestDays || (days === bestDays && (!best || e.h < best.h))) {
        best = e
        bestDays = days
      }
    }
    return best
  }

  /** 开始屏瓷贴（含版式坐标）/ 纵向滚动 / 翻转到背面的瓷贴 / 管理（卸载固定）模式 */
  private pins: PlacedTile[] = []
  private homeScroll = 0
  private flipped = new Set<string>()
  private pinMode = false
  /** 长按计时器（点下 550ms 进管理模式，滑动则取消） */
  private holdTimer: ReturnType<typeof setTimeout> | null = null
  /** 按下时命中的瓷贴（抬起时若未触发长按/滑动才启动） */
  private downTile: PlacedTile | null = null
  /** 系统托盘展开（Mango：点状态栏展开/收起） */
  private trayExpanded = false
  /** 应用来源（从列表启动时，返回到列表）/ Start 键强制回开始屏 */
  private launchFrom: 'home' | 'list' = 'home'
  private forceHome = false
  /** 锁屏上按电源熄屏（真机短按电源键的行为；任意键/再按电源亮屏回锁屏） */
  private screenOff = false

  private runtime: AppRuntime
  private fx: Fx
  readonly deps: OSDeps

  constructor(deps: OSDeps) {
    this.deps = deps
    this.runtime = new AppRuntime(deps, (snap, app) => this.onAppExit(snap, app))
    this.fx = new Fx(deps.frames, deps.screen)
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    await this.loadState()
    await this.seedMessages()
    await this.refreshUnread()
    this.contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    void assets.loadAll(this.deps.audio).then(() => {
      if (this.state !== 'off' && this.state !== 'boot') this.draw()
    })
    // 预加载相册素材照片（首启即可用，避免相册打开时黑图）
    void loadStockBitmaps().then(() => {
      if (this.state !== 'off' && this.state !== 'boot') this.draw()
    })
    this.watchStore()
    this.offs.push(this.deps.input.subscribe((k, rep) => this.onInput(k, rep)))
    this.offs.push(this.deps.input.subscribeTap((x, y) => this.onTap(x, y)))
    this.offs.push(this.deps.input.subscribeTapUp((x, y) => this.onTapUp(x, y)))
    this.offs.push(this.deps.input.subscribeSwipe((dir) => this.onSwipe(dir)))
    // 鼠标滚轮：桌面/应用列表滚动（真机为触屏上下滑动）
    this.offs.push(this.deps.input.subscribeWheel((dy) => this.onWheel(dy)))
    this.offs.push(this.deps.lang.onChange(() => this.draw()))
    // 托盘唤出/自动收回时重绘系统界面（应用自行注册 onTrayChange）
    this.offs.push(onTrayChange(() => {
      if (this.state !== 'app') this.draw()
    }))
    this.drawOff()
    this.scheduleTileFlips()
  }

  // ---------- 状态加载 / 持久化 ----------

  private async loadState() {
    this.accentIdx = (await this.deps.store.get<number>('settings:accent')) ?? 0
    const a = await this.deps.store.get<{ on: boolean; h: number; m: number }>('clock:alarm')
    this.alarm = a ? { on: !!a.on, h: a.h % 24, m: a.m % 60 } : null
    this.wallpaperIdx = (await this.deps.store.get<number>('lock:wallpaper')) ?? 0
    this.pinOn = (await this.deps.store.get<boolean>('settings:pin')) ?? false
    this.pinCode = (await this.deps.store.get<string>('settings:pincode')) ?? '1234'
    await this.loadPins()
    this.calEvents = (await this.deps.store.get<typeof this.calEvents>('calendar:events')) ?? []
    // 锁屏照片：按保存的照片 id 从相机相册重建
    const photoId = await this.deps.store.get<number | null>('lock:photoid')
    this.lockPhoto = null
    if (photoId != null) {
      const photos = (await this.deps.store.get<WPhoto[]>('camera:photos')) ?? []
      const p = photos.find((x) => x.id === photoId)
      if (p) this.lockPhoto = photoToCanvas(p)
    }
  }

  private async loadPins() {
    const saved = await this.deps.store.get<Array<{ id: string; wide?: boolean }>>('start:pins')
    const defs = (saved ?? DEFAULT_PINS)
      .map((p) => ({ app: APP_BY_ID.get(p.id), wide: !!p.wide }))
      .filter((p): p is TileDef => !!p.app)
    this.pins = this.placeTiles(defs.length ? defs : this.defaultTileDefs())
    this.clampHomeScroll()
  }

  private defaultTileDefs(): TileDef[] {
    return DEFAULT_PINS.map((p) => ({ app: APP_BY_ID.get(p.id)!, wide: !!p.wide }))
  }

  /** 按两列网格放置：宽贴占整行；奇数位置的方贴独占一行 */
  private placeTiles(defs: TileDef[]): PlacedTile[] {
    const out: PlacedTile[] = []
    let y = TILES_TOP
    let pending: TileDef | null = null
    const flushPending = () => {
      if (!pending) return
      out.push({ ...pending, x: LEFT, y, w: SQUARE, h: SQUARE })
      pending = null
      y += SQUARE + GUTTER
    }
    for (const d of defs) {
      if (d.wide) {
        flushPending()
        out.push({ ...d, x: LEFT, y, w: WIDE_W, h: SQUARE })
        y += SQUARE + GUTTER
        continue
      }
      if (!pending) {
        pending = d
      } else {
        out.push({ ...pending, x: LEFT, y, w: SQUARE, h: SQUARE })
        out.push({ ...d, x: LEFT + SQUARE + GUTTER, y, w: SQUARE, h: SQUARE })
        pending = null
        y += SQUARE + GUTTER
      }
    }
    flushPending()
    y -= GUTTER
    this.contentH = y
    return out
  }
  private contentH = H

  private async savePins() {
    await this.deps.store.set('start:pins', this.pins.map((p) => ({ id: p.app.id, wide: p.wide })))
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.alarmRing = false
    this.stopIncomingRing()
    this.fx.cancelAll()
    if (this.holdTimer) clearTimeout(this.holdTimer)
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    for (const off of this.offs.splice(0)) off()
    this.runtime.close()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 电源 / 按键 ----------

  private onInput(key: DeviceKey, rep = false) {
    if (key === 'power') {
      // 真机 Lumia 800：短按电源键 = 锁屏（锁屏上再按 = 熄屏/亮屏），按住不放（键重复）才关机
      if (!this.powered) this.boot()
      else if (rep) this.shutdown()
      else if (this.state === 'shutdown') return
      else if (this.screenOff) this.wakeScreen()
      else if (this.state === 'lock') this.sleepScreen()
      else if (this.state === 'app') {
        this.state = 'lock'
        this.runtime.close()
      } else this.enterLock()
      return
    }
    // 熄屏时任意键只亮屏回锁屏，不触发动作
    if (this.screenOff) {
      this.wakeScreen()
      return
    }
    // 关机时按挂断/开始键唤醒（与 G1 的红色挂断键唤醒同理，方便键盘操作）
    if (!this.powered) {
      if (key === 'end' || key === 'home') this.boot()
      return
    }
    if (this.alarmRing) {
      this.stopAlarmRing()
      return
    }
    if (this.incomingRing) {
      if (key === 'call' || key === 'ok') this.answerCall()
      else if (key === 'end' || key === 'back') this.rejectCall()
      return
    }
    if (this.state === 'incall') {
      if (key === 'end' || key === 'back') this.endInCall()
      return
    }
    if (this.state === 'app' || this.state === 'boot' || this.state === 'shutdown') {
      // Start 键在任何应用内按下都回到开始屏（真机 Windows 键行为）
      if (key === 'home' && this.state === 'app') {
        this.forceHome = true
        this.runtime.close()
      }
      return
    }
    this.uiInput(key)
  }

  /** 系统层 UI（锁屏/开始屏/应用列表）的按键分发 */
  private uiInput(key: DeviceKey) {
    switch (this.state) {
      case 'lock':
        if (this.pinStage) {
          if (key >= '0' && key <= '9') this.pinDigit(key)
          else if (key === 'back' || key === 'clear') this.pinBackspace()
          return
        }
        if (key === 'ok' || key === 'menu') this.unlock()
        return
      case 'home':
        // 真机：开始屏按返回键退到锁屏
        if (key === 'back') this.enterLock()
        else if (key === 'ok' || key === 'menu') this.openList()
        return
      case 'list':
        if (this.jumpOpen && (key === 'back' || key === 'ok' || key === 'menu')) {
          this.jumpOpen = false
          this.draw()
          return
        }
        if (key === 'back' || key === 'ok' || key === 'menu') this.closeList()
        else if (key === 'down' || key === 'up') {
          this.listScroll += key === 'up' ? -ROW_H * 3 : ROW_H * 3
          this.clampListScroll()
          this.draw()
        }
        return
      default:
        return
    }
  }

  /** 触屏滑动：锁屏上滑解锁；开始屏左滑进列表；列表/开始屏纵向滚动 */
  private onSwipe(dir: 'up' | 'down' | 'left' | 'right') {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer)
      this.holdTimer = null
    }
    this.downTile = null
    this.trayExpanded = false
    if (this.screenOff) { this.wakeScreen(); return }
    if (!this.powered || this.alarmRing || this.incomingRing || this.fx.busy) return
    if (this.state === 'lock' && dir === 'up') {
      this.unlock()
      return
    }
    if (this.state === 'home') {
      if (dir === 'left') this.openList()
      else if (dir === 'up' || dir === 'down') {
        this.homeScroll += dir === 'up' ? 300 : -300
        this.clampHomeScroll()
        this.draw()
      }
      return
    }
    if (this.state === 'list') {
      if (this.jumpOpen) {
        this.jumpOpen = false
        this.draw()
        return
      }
      if (dir === 'right') this.closeList()
      else if (dir === 'up' || dir === 'down') {
        this.listScroll += dir === 'up' ? -300 : 300
        this.clampListScroll()
        this.draw()
      }
    }
  }

  /** 鼠标滚轮：桌面/应用列表翻页滚动（方向与触屏滑动一致：下滚=内容上移） */
  private onWheel(dy: number) {
    if (this.screenOff) { this.wakeScreen(); return }
    if (!this.powered || this.alarmRing || this.incomingRing || this.fx.busy) return
    if (this.state === 'home') {
      this.homeScroll += dy > 0 ? 300 : -300
      this.clampHomeScroll()
      this.draw()
    } else if (this.state === 'list') {
      this.listScroll += dy > 0 ? 300 : -300
      this.clampListScroll()
      this.draw()
    }
  }

  /** 触屏点按（系统层界面；应用内的点按由应用处理） */
  private onTap(x: number, y: number) {
    if (this.screenOff) { this.wakeScreen(); return }
    if (!this.powered || this.fx.busy) return
    if (this.alarmRing) {
      // 点“关闭闹钟”条
      if (y > H - 180 && y < H - 110) this.stopAlarmRing()
      return
    }
    if (this.incomingRing) {
      this.onRingingTap(x, y)
      return
    }
    if (this.state === 'incall') {
      if (y > H - 170 && y < H - 100) this.endInCall()
      return
    }
    // 真机 Mango：应用内点顶部边缘同样唤出托盘（应用经 onTrayChange 自绘）
    if (this.state === 'app' && y < TRAY_H) {
      peekTray()
      return
    }
    // 真机 Mango：托盘默认隐藏，点顶部边缘唤出；已唤出时再点展开/收起详情行
    if ((this.state === 'home' || this.state === 'list') && y < TRAY_H) {
      if (trayShown()) this.trayExpanded = !this.trayExpanded
      peekTray()
      this.draw()
      return
    }
    switch (this.state) {
      case 'lock':
        if (this.pinStage) {
          const k = this.pinKeyAt(x, y)
          if (k === 'X') this.pinBackspace()
          else if (k) this.pinDigit(k)
        }
        return // 真机：锁屏必须上滑解锁；PIN 时点数字盘
      case 'home':
        this.homeTap(x, y)
        return
      case 'list':
        if (this.jumpOpen) this.jumpTap(x, y)
        else this.listTap(x, y)
        return
      default:
        return
    }
  }

  // ---------- 开始屏点按 / 长按 / 管理模式 ----------

  private homeTap(x: number, y: number) {
    this.trayExpanded = false // 点托盘之外：收起
    // 圆形箭头 → 应用列表
    const dx = x - ARROW.x
    const dy = y - ARROW.y
    if (dx * dx + dy * dy <= ARROW.r * ARROW.r) {
      this.openList()
      return
    }
    const hit = this.tileAt(x, y)
    if (!hit) {
      if (this.pinMode) this.exitPinMode()
      return
    }
    if (this.pinMode) {
      this.unpin(hit)
      return
    }
    // 按下：武装长按计时器；真正启动在抬起（短按）时
    this.downTile = hit
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null
      this.pinMode = true
      this.draw()
    }, 550)
  }

  /** 抬起：若按下命中的瓷贴仍在、且未触发长按，则启动 */
  private onTapUp(_x: number, _y: number) {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer)
      this.holdTimer = null
    }
    const t = this.downTile
    this.downTile = null
    if (t && !this.pinMode && this.state === 'home') this.launch(t.app, 'home', t)
  }

  private tileAt(x: number, y: number): PlacedTile | null {
    const sy = y + this.homeScroll
    for (const t of this.pins)
      if (x >= t.x && x < t.x + t.w && sy >= t.y && sy < t.y + t.h) return t
    return null
  }

  private unpin(t: PlacedTile) {
    this.flipped.delete(t.app.id)
    const defs = this.pins.filter((p) => p !== t).map((p) => ({ app: p.app, wide: p.wide }))
    this.pins = this.placeTiles(defs)
    this.clampHomeScroll()
    void this.savePins()
    this.draw()
  }

  private exitPinMode() {
    this.pinMode = false
    this.draw()
  }

  private clampHomeScroll() {
    const max = Math.max(0, this.contentH - H)
    this.homeScroll = Math.max(0, Math.min(this.homeScroll, max))
  }

  // ---------- 应用列表（字母分组 + 滚动） ----------

  private listScroll = 0

  /** 分组后的行序列：{ type:'group',letter } / { type:'app',app } */
  private listRows(): Array<{ type: 'group'; letter: string } | { type: 'app'; app: MiniApp }> {
    const lang = this.deps.lang.get()
    const sorted = [...APPS].sort(
      (a, b) => appLetter(a, lang).localeCompare(appLetter(b, lang)) || a.name.localeCompare(b.name),
    )
    const rows: ReturnType<WP7OS['listRows']> = []
    let last = ''
    for (const app of sorted) {
      const letter = appLetter(app, lang)
      if (letter !== last) {
        last = letter
        rows.push({ type: 'group', letter })
      }
      rows.push({ type: 'app', app })
    }
    return rows
  }

  private listContentH(): number {
    let h = LIST_TOP
    for (const r of this.listRows()) h += r.type === 'group' ? GROUP_H : ROW_H
    return h
  }

  private clampListScroll() {
    const max = Math.max(0, this.listContentH() - H)
    this.listScroll = Math.max(0, Math.min(this.listScroll, max))
  }

  private listTap(x: number, y: number) {
    this.trayExpanded = false // 点托盘之外：收起
    let ry = LIST_TOP - this.listScroll
    for (const r of this.listRows()) {
      if (r.type === 'group') {
        // 点分组大字母 → A–Z 跳转网格（真机 Mango 行为）
        if (y >= ry && y < ry + GROUP_H && x >= LEFT && x <= W / 2 + 40) {
          this.jumpOpen = true
          this.draw()
          return
        }
        ry += GROUP_H
        continue
      }
      if (y >= ry && y < ry + ROW_H && x >= LEFT) {
        const rect: Rect = { x: LEFT, y: ry, w: ICON, h: ICON }
        this.launch(r.app, 'list', rect)
        return
      }
      ry += ROW_H
    }
  }

  /** 字母跳转网格（真机：半透明黑层 + 浅灰大写字母） */
  private jumpOpen = false
  private jumpLetters(): string[] {
    return this.listRows().filter((r) => r.type === 'group').map((r) => (r as { letter: string }).letter)
  }

  private jumpTap(x: number, y: number) {
    const present = new Set(this.jumpLetters())
    const cols = 6
    const cw = 80
    const ch = 92
    const ox = (W - cw * cols) / 2
    const oy = 150
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')
    for (let i = 0; i < letters.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = ox + col * cw
      const cy = oy + row * ch
      if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) {
        const l = letters[i]!
        if (present.has(l)) this.jumpTo(l)
        else this.jumpOpen = false
        this.draw()
        return
      }
    }
    this.jumpOpen = false
    this.draw()
  }

  private jumpTo(letter: string) {
    this.jumpOpen = false
    let h = 0
    let target = -1
    for (const r of this.listRows()) {
      if (r.type === 'group') {
        if ((r as { letter: string }).letter === letter) {
          target = h
          break
        }
        h += GROUP_H
      } else h += ROW_H
    }
    if (target >= 0) {
      this.listScroll = Math.max(0, LIST_TOP + target - LIST_TOP)
      this.clampListScroll()
    }
  }

  private openList() {
    if (this.state !== 'home') return
    const s = this.deps.screen
    const before = s.snapshot()
    this.state = 'list'
    this.listScroll = 0
    this.draw()
    const after = s.snapshot()
    slideOpen(this.fx, s, W, H, before, after, () => this.finishTransition())
  }

  private closeList() {
    if (this.state !== 'list') return
    const s = this.deps.screen
    const before = s.snapshot()
    this.state = 'home'
    this.draw()
    const after = s.snapshot()
    slideClose(this.fx, s, W, H, before, after, () => this.finishTransition())
  }

  /** 转场结束：清掉叠加层，回到缓冲真实画面 */
  private finishTransition() {
    this.deps.screen.clearOverlays()
    this.draw()
  }

  // ---------- 开机 / 关机 ----------

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.alarmRangMin = -1
    this.timers.push(setInterval(() => this.checkAlarm(), 2000))
    this.deps.screen.clear()
    let t = 0
    const off = this.deps.frames.add((dt) => {
      if (this.state !== 'boot') {
        off()
        return
      }
      t += dt
      this.drawBoot(t)
    })
    this.timers.push(
      setTimeout(() => {
        off()
        if (this.state === 'boot') this.enterLock()
      }, BOOT_TOTAL_S * 1000),
    )
  }

  private shutdown() {
    if (this.state === 'shutdown' || this.state === 'off') return
    this.state = 'shutdown'
    this.alarmRing = false
    this.stopIncomingRing()
    this.fx.cancelAll()
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.runtime.close()
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    s.render()
    this.timers.push(setTimeout(() => {
      this.powered = false
      this.state = 'off'
      this.drawOff()
    }, 600))
  }

  private drawOff() {
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 状态切换 ----------

  private enterLock() {
    this.state = 'lock'
    this.screenOff = false
    this.draw()
  }

  /** 熄屏：锁屏状态下短按电源键（真机行为） */
  private sleepScreen() {
    this.screenOff = true
    const s = this.deps.screen
    s.clear()
    s.render()
  }

  /** 亮屏：回锁屏界面 */
  private wakeScreen() {
    this.screenOff = false
    this.enterLock()
  }

  /** 上滑后：设了 PIN 先进密码输入，否则直接解锁 */
  private unlock() {
    this.deps.audio.unlock()
    if (this.pinOn) {
      this.pinStage = true
      this.pinBuf = ''
      this.pinError = false
      this.draw()
      return
    }
    this.doUnlock()
  }

  private doUnlock() {
    const s = this.deps.screen
    this.deps.audio.melody(UNLOCK_CLICK, 90)
    const before = s.snapshot()
    this.state = 'home'
    this.pinStage = false
    this.draw()
    const after = s.snapshot()
    unlockRise(this.fx, s, W, H, before, after, () => this.finishTransition())
  }

  /** PIN 数字输入（触屏与按键共用） */
  private pinDigit(d: string) {
    if (this.pinBuf.length >= 4 || this.fx.busy) return
    this.pinError = false
    this.pinBuf += d
    this.ctxAudio()
    if (this.pinBuf.length === 4) {
      if (this.pinBuf === this.pinCode) this.doUnlock()
      else {
        this.pinError = true
        setTimeout(() => {
          this.pinBuf = ''
          this.pinError = false
          this.draw()
        }, 700)
      }
    }
    this.draw()
  }
  private ctxAudio() {
    this.deps.audio.melody([[90, 0.05]], 200)
  }

  private pinBackspace() {
    this.pinBuf = this.pinBuf.slice(0, -1)
    this.pinError = false
    this.draw()
  }

  /** PIN 数字盘键心（3 列 × 4 行） */
  private static PIN_KEYS: Array<[number, number, string]> = [
    [120, 450, '1'], [240, 450, '2'], [360, 450, '3'],
    [120, 540, '4'], [240, 540, '5'], [360, 540, '6'],
    [120, 630, '7'], [240, 630, '8'], [360, 630, '9'],
    [360, 720, 'X'], [240, 720, '0'],
  ]

  private pinKeyAt(x: number, y: number): string | null {
    for (const [cx, cy, k] of WP7OS.PIN_KEYS)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 46 ** 2) return k
    return null
  }

  enterHome() {
    this.state = 'home'
    this.draw()
    if (this.pendingIncoming) {
      const p = this.pendingIncoming
      this.pendingIncoming = null
      this.enterRinging(p.tel, p.name)
    }
  }

  launch(app: MiniApp, from: 'home' | 'list' = 'home', tileRect?: Rect) {
    const s = this.deps.screen
    const before = s.snapshot()
    this.state = 'app'
    this.launchFrom = from
    this.forceHome = false
    this.runtime.launch(app, {
      messageSent: () => this.scheduleReply(),
      dial: (num) => {
        setPendingDial(num)
        this.launch(phoneApp, 'home')
      },
      dialMsg: (tel) => {
        setPendingThread(tel)
        this.launch(messagingApp, 'home')
      },
      getContacts: async () => loadContacts(this.deps.store.get.bind(this.deps.store)),
      getAccent: () => ACCENTS[this.accentIdx]?.idx ?? C.BLUE,
      setAccent: (i) => {
        this.accentIdx = i
        void this.deps.store.set('settings:accent', i)
      },
      setRingtone: (i) => {
        void this.deps.store.set('settings:ringtone', i)
      },
      getRingtoneIndex: async () => (await this.deps.store.get<number>('settings:ringtone')) ?? 0,
      getCallLog: async () => (await this.deps.store.get<CallEntry[]>('calllog')) ?? [],
      recordCall: (e) => void this.recordCall(e),
      setLang: (l) => this.deps.lang.set?.(l),
      fx: this.fx,
      setLockWallpaper: (i) => void this.deps.store.set('lock:wallpaper', i),
      setLockPhoto: (cv, id) => {
        this.lockPhoto = cv
        void this.deps.store.set('lock:photoid', id ?? null)
      },
    })
    s.render()
    const after = s.snapshot()
    const rect = tileRect ?? this.tileRectOf(app)
    if (from === 'home') morphOpen(this.fx, s, W, H, before, after, rect, () => this.finishTransition())
    else slideOpen(this.fx, s, W, H, before, after, () => this.finishTransition())
  }

  /** 应用对应瓷贴的矩形（返回时收缩目标）；不在开始屏则用屏幕矩形 */
  private tileRectOf(app: MiniApp): Rect {
    const t = this.pins.find((p) => p.app.id === app.id)
    if (!t) return { x: 0, y: 0, w: W, h: H }
    return { x: t.x, y: t.y - this.homeScroll, w: t.w, h: t.h }
  }

  private onAppExit(snap?: HTMLCanvasElement, app?: MiniApp) {
    if (this.state !== 'app') {
      // 来电/闹钟/关机主动关闭应用：不做转场，按当前状态重绘
      if (this.state !== 'shutdown') this.draw()
      return
    }
    const target: 'home' | 'list' = this.forceHome ? 'home' : this.launchFrom
    this.forceHome = false
    const s = this.deps.screen
    this.state = target
    this.draw()
    if (!snap || !app) return
    const after = s.snapshot()
    if (target === 'home') {
      morphClose(this.fx, s, W, H, snap, after, this.tileRectOf(app), () => this.finishTransition())
    } else {
      slideClose(this.fx, s, W, H, snap, after, () => this.finishTransition())
    }
  }

  // ---------- 短信生态 ----------

  private async seedMessages() {
    const inbox = await this.deps.store.get<WMsg[]>('messages:inbox')
    const s = wpStrings(this.deps.lang.get())
    if (inbox) {
      const seedTexts = [
        ...Object.values(wpStrings('zh')),
        ...Object.values(wpStrings('en')),
      ].flatMap((v) => (typeof v === 'string' ? [v] : []))
      const pristine = inbox.length === 2 && inbox.every((m) => seedTexts.includes(m.text))
      if (!pristine) return
    }
    const now = Date.now()
    await this.deps.store.set('messages:inbox', [
      { id: now - 7200_000, from: s.carrier, text: s.seedWelcome, ts: now - 7200_000, read: false, mine: false },
      { id: now - 3600_000, from: s.recipient, text: s.seedMom, ts: now - 3600_000, read: false, mine: false },
    ] satisfies WMsg[])
  }

  private scheduleReply() {
    const delay = 4500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.deliverReply(), delay))
  }

  private async deliverReply() {
    const inbox = (await this.deps.store.get<WMsg[]>('messages:inbox')) ?? []
    const s = wpStrings(this.deps.lang.get())
    const lastMine = [...inbox].reverse().find((m) => m.mine)
    inbox.push({
      id: Date.now(),
      from: lastMine?.from ?? s.recipient,
      text: s.replies[Math.floor(Math.random() * s.replies.length)]!,
      ts: Date.now(),
      read: false,
      mine: false,
    })
    await this.deps.store.set('messages:inbox', inbox)
    this.deps.audio.unlock()
    const idx = (await this.deps.store.get<number>('settings:smsound')) ?? 0
    playSound(this.deps.audio, SMS_SOUNDS[idx] ?? SMS_SOUNDS[0]!, { volume: 0.6 })
  }

  private async refreshUnread() {
    const inbox = await this.deps.store.get<WMsg[]>('messages:inbox')
    this.unreadCount = inbox?.filter((m) => !m.read && !m.mine).length ?? 0
  }

  private watchStore() {
    const prefix = `${this.deps.profile.id}:`
    this.offs.push(
      this.deps.store.onChange((fk) => {
        if (fk === `${prefix}*`) return
        if (fk.startsWith(`${prefix}messages:`)) {
          void this.refreshUnread().then(() => {
            if (this.state !== 'app' && this.state !== 'off' && this.state !== 'boot') this.draw()
          })
        }
        if (fk === `${prefix}settings:accent`) {
          void this.loadState().then(() => {
            if (this.state !== 'app' && this.state !== 'off' && this.state !== 'boot') this.draw()
          })
        }
        if (fk === `${prefix}settings:pin`) {
          void this.deps.store.get<boolean>('settings:pin').then((v) => {
            this.pinOn = !!v
            if (!v) this.pinStage = false
            if (this.state === 'lock') this.draw()
          })
        }
        if (fk === `${prefix}settings:pincode`) {
          void this.deps.store.get<string>('settings:pincode').then((v) => {
            if (v) this.pinCode = v
          })
        }
        if (fk === `${prefix}lock:wallpaper`) {
          void this.deps.store.get<number>('lock:wallpaper').then((i) => {
            this.wallpaperIdx = i ?? 0
            if (this.state === 'lock') this.draw()
          })
        }
        if (fk === `${prefix}clock:alarm`) {
          void this.loadState().then(() => {
            if (this.alarmRing && !this.alarm?.on) this.stopAlarmRing()
          })
        }
        if (fk.endsWith(':contacts')) {
          void loadContacts(this.deps.store.get.bind(this.deps.store)).then((c) => (this.contacts = c))
        }
        if (fk === `${prefix}calendar:events`) {
          void this.deps.store.get<typeof this.calEvents>('calendar:events').then((e) => {
            this.calEvents = e ?? []
          })
        }
      }),
    )
  }

  // ---------- 动态磁贴：定时翻转 ----------

  private scheduleTileFlips() {
    const tick = () => {
      this.timers.push(setTimeout(tick, 9000 + Math.random() * 6000))
      if (!this.powered || this.state !== 'home' || this.fx.busy || this.pinMode) return
      // 有内容背面的贴：通信类（计数/下一项）+ 图片（照片轮播）+ 游戏（Xbox 资料卡）
      const candidates = this.pins.filter((t) =>
        ['messages', 'phone', 'clock', 'contacts', 'calendar', 'pictures', 'games'].includes(t.app.id))
      const t = candidates[Math.floor(Math.random() * candidates.length)]
      if (t) void this.flipTile(t)
    }
    this.timers.push(setTimeout(tick, 7000))
  }

  private async flipTile(t: PlacedTile) {
    const s = this.deps.screen
    flipWhoosh(this.deps.audio)
    s.render()
    const before = s.snapshot()
    if (this.flipped.has(t.app.id)) this.flipped.delete(t.app.id)
    else this.flipped.add(t.app.id)
    this.draw()
    s.render()
    const after = s.snapshot()
    const r: Rect = { x: t.x, y: t.y - this.homeScroll, w: t.w, h: t.h }
    // 前半：横向收缩
    this.fx.run(130, (p) => {
      s.clearOverlays()
      const w = Math.round(t.w * (1 - p))
      s.blit(before, r.x + Math.round((t.w - w) / 2), r.y, {
        w, h: t.h, sx: t.x, sy: t.y, sw: t.w, sh: t.h,
      })
    }, () => {
      // 后半：新面展开
      this.fx.run(130, (p) => {
        s.clearOverlays()
        const w = Math.round(t.w * p)
        s.blit(after, r.x + Math.round((t.w - w) / 2), r.y, {
          w, h: t.h, sx: t.x, sy: t.y, sw: t.w, sh: t.h,
        })
        if (p >= 1) this.finishTransition()
      })
    })
  }

  // ---------- 闹钟（系统级，到点覆盖任何界面） ----------

  private checkAlarm() {
    if (!this.powered || this.alarmRing || this.incomingRing || !this.alarm?.on) return
    if (this.state === 'boot' || this.state === 'shutdown' || this.state === 'off') return
    const d = new Date()
    if (d.getHours() === this.alarm.h && d.getMinutes() === this.alarm.m) {
      const minOfDay = d.getHours() * 60 + d.getMinutes()
      if (this.alarmRangMin === minOfDay) return
      this.alarmRangMin = minOfDay
      this.startAlarmRing()
    }
  }

  private startAlarmRing() {
    this.alarmRing = true
    if (this.state === 'app') this.runtime.close()
    if (this.state !== 'boot' && this.state !== 'shutdown') this.state = 'alarm'
    // 闹铃声：闹钟专用声音（设置里选定），循环播放
    void this.deps.store.get<number>('settings:alarmsound').then((idx) => {
      const def = ALARM_SOUNDS[idx ?? 0] ?? ALARM_SOUNDS[0]!
      this.deps.audio.unlock()
      this.ringStop?.()
      this.ringStop = playSound(this.deps.audio, def, { loop: true, volume: 0.6 })
    })
    this.alarmTimers.push(setInterval(() => {
      if (this.alarmRing && this.state === 'alarm') this.draw()
    }, 500))
    this.draw()
  }

  private stopAlarmRing() {
    this.alarmRing = false
    this.ringStop?.()
    this.ringStop = null
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    if (this.state === 'alarm') this.enterHome()
    else this.draw()
  }

  // ---------- 来电 / 来短信（情景编排触发） ----------

  /** 来电：解锁后任何系统界面直接弹全屏来电；关机/开机/锁屏暂存待回主屏触发 */
  incomingCall(tel: string, name?: string) {
    const n = name ?? this.contacts.find((c) => c.tel === tel)?.name
    if (!this.powered || this.state === 'off' || this.state === 'boot' || this.state === 'shutdown' || this.state === 'lock') {
      this.pendingIncoming = { tel, name: n }
      return
    }
    this.enterRinging(tel, n)
  }

  /** Mango 来电页：大字姓名 + 底部接听（强调色）/忽略（暗灰）两条按钮 */
  private enterRinging(tel: string, name?: string) {
    this.incoming = { tel, name }
    this.incomingRing = true
    if (this.state === 'app') this.runtime.close()
    if (this.state !== 'boot' && this.state !== 'shutdown') this.state = 'ringing'
    // 来电铃声：设置里选定的声音循环播放
    void this.deps.store.get<number>('settings:ringtone').then((idx) => {
      const def = RINGTONES[idx ?? 0] ?? RINGTONES[0]!
      this.deps.audio.unlock()
      this.ringStop?.()
      this.ringStop = playSound(this.deps.audio, def, { loop: true, volume: 0.7 })
    })
    this.incomingIntervals.push(setInterval(() => {
      if (this.incomingRing && this.state === 'ringing') this.draw()
    }, 500))
    this.incomingTimeouts.push(setTimeout(() => {
      if (this.incomingRing) this.rejectCall()
    }, 15000))
    this.draw()
  }

  private onRingingTap(_x: number, y: number) {
    // 接听 / 忽略 两条按钮（与 drawRinging 布局一致）
    if (y > H - 230 && y < H - 160) this.answerCall()
    else if (y > H - 140 && y < H - 70) this.rejectCall()
  }

  private answerCall() {
    this.stopIncomingRing()
    this.callSecs = 0
    this.state = 'incall'
    this.incomingIntervals.push(
      setInterval(() => {
        if (this.state === 'incall') {
          this.callSecs++
          this.draw()
        }
      }, 1000),
    )
    this.draw()
  }

  private rejectCall() {
    const inc = this.incoming
    this.stopIncomingRing()
    if (inc) {
      void this.recordCall({ tel: inc.tel, name: inc.name ?? '', dir: 'in', dur: 0, missed: true })
    }
    this.incoming = null
    this.enterHome()
  }

  private endInCall() {
    const inc = this.incoming
    for (const t of this.incomingIntervals.splice(0)) clearInterval(t)
    for (const t of this.incomingTimeouts.splice(0)) clearTimeout(t)
    this.ringStop?.()
    this.ringStop = null
    if (inc) {
      void this.recordCall({ tel: inc.tel, name: inc.name ?? '', dir: 'in', dur: this.callSecs, missed: false })
    }
    this.incoming = null
    this.enterHome()
  }

  private stopIncomingRing() {
    this.incomingRing = false
    for (const t of this.incomingIntervals.splice(0)) clearInterval(t)
    for (const t of this.incomingTimeouts.splice(0)) clearTimeout(t)
    this.ringStop?.()
    this.ringStop = null
  }

  /** 来短信：追加收件箱 + 轻柔提示音（仿自动回复到达路径） */
  injectSms(from: string, text: string) {
    void this.deliverIncoming(from, text)
  }

  private async deliverIncoming(from: string, text: string) {
    const inbox = (await this.deps.store.get<WMsg[]>('messages:inbox')) ?? []
    inbox.push({ id: Date.now(), from, text, ts: Date.now(), read: false, mine: false })
    await this.deps.store.set('messages:inbox', inbox)
    this.unreadCount++
    if (this.powered && this.state !== 'off' && this.state !== 'boot') {
      this.deps.audio.unlock()
      const idx = (await this.deps.store.get<number>('settings:smsound')) ?? 0
      playSound(this.deps.audio, SMS_SOUNDS[idx] ?? SMS_SOUNDS[0]!, { volume: 0.6 })
    }
  }

  private async recordCall(e: Omit<CallEntry, 'id' | 'ts'>) {
    const log = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    log.push({ ...e, id: Date.now(), ts: Date.now() })
    while (log.length > 30) log.shift()
    await this.deps.store.set('calllog', log)
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.screenOff) return // 熄屏中：保持黑屏，亮屏时由 wakeScreen 重绘
    const s = this.deps.screen
    switch (this.state) {
      case 'off':
        this.drawOff()
        return
      case 'boot':
        return // 开机动画由 boot() 的帧回调自绘
      case 'lock':
        this.drawLock()
        return
      case 'alarm':
        this.drawAlarm()
        return
      case 'ringing':
        this.drawRinging()
        return
      case 'incall':
        this.drawInCall()
        return
      case 'list':
        this.drawList()
        return
      case 'home':
        this.drawHome()
        return
      case 'app':
      case 'shutdown':
        return
    }
    s.render()
  }

  private accent(): number {
    return ACCENTS[this.accentIdx]?.idx ?? C.BLUE
  }

  private clockStr(): string {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  /**
   * Lumia 800 开机动画：
   * 0–1.8s 黑底白字 NOKIA → 之后 Windows 旗帜四格逐一点亮，
   * 全亮后出现「Windows Phone」细体字标。
   */
  private drawBoot(t: number) {
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    if (t < BOOT_NOKIA_S) {
      s.textCenter(W / 2, 340, 'NOKIA', { size: 56, font: F_LIGHT(56), color: C.WHITE })
      s.render()
      return
    }
    const bt = t - BOOT_NOKIA_S
    // Windows 旗帜：2×2 方格逐一点亮（每格 0.3s）
    const sq = 34
    const gap = 8
    const ox = W / 2 - sq - gap / 2
    const oy = 320
    const lit = Math.floor(bt / 0.3)
    for (let k = 0; k < 4; k++) {
      const x = ox + (k % 2) * (sq + gap)
      const y = oy + Math.floor(k / 2) * (sq + gap)
      s.fillRect(x, y, sq, sq, k < lit ? C.WHITE : C.DIM)
    }
    if (bt > 1.4) {
      s.textCenter(W / 2, 430, 'Windows Phone', { size: 34, font: F_LIGHT(34), color: C.WHITE })
    }
    s.render()
  }

  /** 开始屏：黑底 + 两列强调色瓷贴（宽贴占整行）+ 右侧槽圆形箭头 */
  private drawHome() {
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, { unread: this.unreadCount > 0, batteryPct: this.deps.battery.percent, charging: this.deps.battery.charging, clock: this.clockStr() })
    const lang = this.deps.lang.get()
    for (const t of this.pins) this.drawTile(t, lang)
    this.drawArrow()
    if (this.trayExpanded && trayShown()) {
      const str = wpStrings(this.deps.lang.get())
      trayExpandedStrip(s, { carrier: str.carrier, dataNet: str.dataNet })
    }
    s.render()
  }

  /** 右侧槽：圆圈 + 右箭头（Mango 开始屏进入应用列表入口）。
   *  直接用真机字形位图（~/a.png 提取的 41×41 掩码，见 glyphBitmaps.ts）。 */
  private drawArrow() {
    maskArrow(this.deps.screen, ARROW.x, ARROW.y, C.WHITE)
  }

  private drawTile(t: PlacedTile, lang: 'zh' | 'en') {
    const s = this.deps.screen
    const x = t.x
    const y = t.y - this.homeScroll
    if (y + t.h < 0 || y > H) return
    // Xbox LIVE 游戏贴真机是黑底绿徽，其余用强调色
    const darkTile = t.app.id === 'games'
    s.fillRect(x, y, t.w, t.h, darkTile ? C.BLACK : this.accent())
    if (this.flipped.has(t.app.id)) {
      this.drawTileBack(t, x, y)
    } else {
      // 真机 WP7 方贴正面只有居中的白图标，没有应用名；宽贴（图片/音乐+视频枢纽）左下角才有小字名称
      if (t.wide) {
        const name = (lang === 'en' ? t.app.nameEn : undefined) ?? t.app.name
        s.text(x + 12, y + t.h - 34, name, { size: 22, font: F_LIGHT(22), color: C.WHITE, maxWidth: t.w - 24 })
        tileGlyph(s, t.app, x + t.w / 2, y + t.h / 2 - 10, Math.min(96, t.w * 0.55), darkTile ? C.BLACK : this.accent())
      } else {
        tileGlyph(s, t.app, x + t.w / 2, y + t.h / 2, Math.min(96, t.w * 0.55), darkTile ? C.BLACK : this.accent())
      }
    }
    // 管理模式：右上角卸载圆 + 暗角
    if (this.pinMode) {
      const ux = x + t.w - 20
      const uy = y + 4
      for (let dy = 0; dy < 17; dy++)
        for (let dx = 0; dx < 17; dx++) {
          if (dx * dx + dy * dy <= 72) s.pset(ux + dx - 8, uy + dy, C.BLACK)
        }
      for (const [dx, dy] of [[-5, -2], [-2, -5], [1, -2], [-2, 1], [-5, 2], [2, -5], [5, -2], [2, 1], [-2, 5], [1, 2], [-5, -1], [-1, -5]] as const)
        s.pset(ux + dx, uy + dy, C.WHITE)
    }
  }

  /** 瓷贴背面：标题行 + 居中摘要（计数/时间）；图片贴背面为照片本身，游戏贴为 Xbox 资料卡 */
  private drawTileBack(t: PlacedTile, x: number, y: number) {
    const s = this.deps.screen
    const str = wpStrings(this.deps.lang.get())
    if (t.app.id === 'pictures') {
      // 真机图片贴背面轮播照片：裁切填满瓷贴，无文字
      const img = this.lockPhoto ?? getWallpaper(this.wallpaperIdx)
      const scale = Math.max(t.w / img.width, t.h / img.height)
      const sw = Math.round(t.w / scale)
      const sh = Math.round(t.h / scale)
      s.blit(img, x, y, {
        w: t.w, h: t.h,
        sx: Math.max(0, Math.round((img.width - sw) / 2)),
        sy: Math.max(0, Math.round((img.height - sh) / 2)),
        sw: Math.min(sw, img.width), sh: Math.min(sh, img.height),
      })
      return
    }
    let title = (this.deps.lang.get() === 'en' ? t.app.nameEn : undefined) ?? t.app.name
    let big = ''
    let numeric = false
    if (t.app.id === 'messages') {
      big = this.unreadCount > 0 ? String(this.unreadCount) : '0'
      numeric = true
    } else if (t.app.id === 'phone') {
      big = str.tileBackCall
    } else if (t.app.id === 'clock') {
      big = this.alarm?.on
        ? `${String(this.alarm.h).padStart(2, '0')}:${String(this.alarm.m).padStart(2, '0')}`
        : str.tileBackOff
    } else if (t.app.id === 'contacts') {
      big = str.tileBackPeople
    } else if (t.app.id === 'calendar') {
      const ev = this.nextEvent()
      big = ev
        ? `${String(ev.h).padStart(2, '0')}:${String(ev.min).padStart(2, '0')}`
        : str.tileBackCall
    } else if (t.app.id === 'games') {
      // Xbox LIVE 资料卡：玩家代号 + 游戏分
      title = 'Xbox LIVE'
      big = 'Player1 · 1250G'
    }
    s.text(x + 12, y + 14, title, { size: 18, font: F_REG(18), color: C.WHITE, maxWidth: t.w - 24 })
    // 文字类背面统一字号（"无未接"/"最近更新"等一致）；数字类（计数/时间）放大
    const maxW = t.w - 28
    let size = numeric ? (t.wide ? 72 : 58) : (t.wide ? 40 : 34)
    while (size > 18 && s.measure(big, { size, font: F_LIGHT(size) }) > maxW) size -= 4
    s.textCenter(x + t.w / 2, y + t.h / 2 + 6, big, { size, font: F_LIGHT(size), color: C.WHITE, maxWidth: t.w - 24 })
  }

  /** 应用列表：字母分组大标题 + 62 图标行（无大标题，滚动时即真机形态） */
  private drawList() {
    const s = this.deps.screen
    const lang = this.deps.lang.get()
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, { unread: this.unreadCount > 0, batteryPct: this.deps.battery.percent, charging: this.deps.battery.charging, clock: this.clockStr() })
    const accent = this.accent()
    let ry = LIST_TOP - this.listScroll
    for (const r of this.listRows()) {
      if (r.type === 'group') {
        if (ry > TRAY_H && ry < H)
          s.text(LEFT, ry + 2, r.letter, { size: 32, font: F_LIGHT(32), color: C.WHITE })
        ry += GROUP_H
        continue
      }
      if (ry > TRAY_H - ROW_H && ry < H) {
        s.fillRect(LEFT, ry + (ROW_H - ICON) / 2, ICON, ICON, accent)
        tileGlyph(s, r.app, LEFT + ICON / 2, ry + ROW_H / 2 - 2, ICON * 0.72, accent)
        const name = (lang === 'en' ? r.app.nameEn : undefined) ?? r.app.name
        s.text(NAME_X, ry + ROW_H / 2 - 14, name, { size: 28, font: F_LIGHT(28), color: C.WHITE, maxWidth: W - NAME_X - LEFT })
      }
      ry += ROW_H
    }
    if (this.trayExpanded && trayShown()) {
      const str = wpStrings(this.deps.lang.get())
      trayExpandedStrip(s, { carrier: str.carrier, dataNet: str.dataNet })
    }
    if (this.jumpOpen) this.drawJumpGrid()
    s.render()
  }

  /** 跳转网格覆盖：半透明黑层 + A–Z 字母（与遮罩合成在同一 overlay 层，
   *  否则字母画进调色板会被遮罩整体压暗） */
  private drawJumpGrid() {
    const s = this.deps.screen
    let dim = WP7OS.dimCanvas
    if (!dim) {
      dim = document.createElement('canvas')
      dim.width = W
      dim.height = H
      const c = dim.getContext('2d')!
      c.fillStyle = 'rgba(0,0,0,0.78)'
      c.fillRect(0, 0, W, H)
      WP7OS.dimCanvas = dim
    }
    const grid = document.createElement('canvas')
    grid.width = W
    grid.height = H
    const g = grid.getContext('2d')!
    g.drawImage(dim, 0, 0)
    const present = new Set(this.jumpLetters())
    const cols = 6
    const cw = 80
    const ch = 92
    const ox = (W - cw * cols) / 2
    const oy = 150
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = F_LIGHT(40)
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')
    letters.forEach((l, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      g.fillStyle = present.has(l) ? '#ffffff' : '#2a2a2a'
      g.fillText(l, ox + col * cw + cw / 2, oy + row * ch + 4)
    })
    s.clearOverlays()
    s.blit(grid, 0, 0)
  }
  private static dimCanvas: HTMLCanvasElement | null = null

  /** 锁屏：大号细体时钟 + 日期 + 上滑解锁提示 */
  private drawLock() {
    const s = this.deps.screen
    const str = wpStrings(this.deps.lang.get())
    s.clear()
    // 壁纸全彩背景层（bg 索引透明处透出）
    s.blitBg(this.lockPhoto ?? getWallpaper(this.wallpaperIdx), 0, 0, { w: W, h: H })
    tray(s, { unread: this.unreadCount > 0, batteryPct: this.deps.battery.percent, charging: this.deps.battery.charging, clock: this.clockStr(), force: true })
    const d = new Date()
    s.textCenter(W / 2, 120, this.clockStr(), { size: 110, font: F_LIGHT(110), color: C.WHITE })
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const dayName = this.deps.lang.get() === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!
      : days[d.getDay()]!
    s.textCenter(W / 2, 260, `${d.getMonth() + 1}月${d.getDate()}日 ${dayName}`, { size: 30, font: F_LIGHT(30), color: C.GRAY })
    // 未读计数提示
    if (this.unreadCount > 0) {
      s.textCenter(W / 2, 330, `${this.unreadCount} ${str.msgTitle}`, { size: 24, font: F_REG(24), color: C.GRAY })
    }
    if (this.pinStage) {
      this.drawPinPad()
      s.render()
      return
    }
    // 上滑解锁提示（底部 + 上指三角 ▲）
    const blink = Math.floor(Date.now() / 800) % 2 === 0
    s.textCenter(W / 2, H - 84, str.lockHint, { size: 24, font: F_LIGHT(24), color: blink ? C.WHITE : C.GRAY })
    for (let i = 0; i < 12; i++) {
      const w = 4 + i * 2
      s.fillRect(W / 2 - w / 2, H - 132 + i, w, 2, C.WHITE)
    }
    s.render()
  }

  /** PIN 盘：半透明黑层 + 四点密码指示 + 浅色大数字键。
   *  全部合成在同一张全彩 overlay（否则标题/圆点/数字都会被遮罩压暗） */
  private drawPinPad() {
    let dim = WP7OS.pinDim
    if (!dim) {
      dim = document.createElement('canvas')
      dim.width = W
      dim.height = H
      const c = dim.getContext('2d')!
      c.fillStyle = 'rgba(0,0,0,0.6)'
      c.fillRect(0, 0, W, H)
      WP7OS.pinDim = dim
    }
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    g.drawImage(dim, 0, 0)
    const str = wpStrings(this.deps.lang.get())
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = F_REG(26)
    g.fillStyle = '#ffffff'
    g.fillText(str.pinTitle, W / 2, 300)
    // 四个圆点
    for (let i = 0; i < 4; i++) {
      const filled = i < this.pinBuf.length
      const x = W / 2 - 72 + i * 48
      if (filled) {
        g.fillStyle = '#ffffff'
        g.beginPath(); g.arc(x, 360, 13, 0, Math.PI * 2); g.fill()
      } else {
        g.strokeStyle = '#8a8a8a'; g.lineWidth = 2
        g.beginPath(); g.arc(x, 360, 12, 0, Math.PI * 2); g.stroke()
      }
    }
    if (this.pinError) {
      g.font = F_REG(22)
      g.fillStyle = '#e51400'
      g.fillText(str.pinError, W / 2, 408)
    }
    for (const [cx, cy, k] of WP7OS.PIN_KEYS) {
      if (k === 'X') {
        // 退格：左指箭头字形
        g.fillStyle = '#ffffff'
        for (let i = 0; i < 16; i++)
          g.fillRect(cx - 14 + i, cy - 12 + i, 3, 24 - i * 2)
      } else {
        g.font = F_LIGHT(44)
        g.fillStyle = '#ffffff'
        g.fillText(k, cx, cy - 12)
      }
    }
    this.deps.screen.blit(cv, 0, 0)
  }
  private static pinDim: HTMLCanvasElement | null = null

  /** 闹钟响铃：大字当前时间 + 关闭条 */
  private drawAlarm() {
    const s = this.deps.screen
    const str = wpStrings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    const accent = this.accent()
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.textCenter(W / 2, 170, `${two(d.getHours())}:${two(d.getMinutes())}`, { size: 110, font: F_LIGHT(110), color: C.WHITE })
    s.textCenter(W / 2, 330, str.alarmTitle, { size: 36, font: F_LIGHT(36), color: C.GRAY })
    s.fillRect(W / 2 - 60, H - 230, 120, 4, C.GRAY)
    s.fillRect(W - 140 - 24, H - 180, 280, 70, accent)
    s.textCenter(W / 2, H - 155, str.alarmDismiss, { size: 30, font: F_SEMI(30), color: C.WHITE })
    s.render()
  }

  /** 来电页：大字姓名 + 号码 + 底部接听/忽略两条按钮 */
  private drawRinging() {
    const s = this.deps.screen
    const str = wpStrings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    const accent = this.accent()
    const blink = Math.floor(Date.now() / 500) % 2 === 0
    if (blink) s.textCenter(W / 2, 90, str.incomingCall, { size: 30, font: F_REG(30), color: C.GRAY })
    const inc = this.incoming
    if (inc) {
      s.textCenter(W / 2, 160, inc.name ?? inc.tel, { size: 52, font: F_LIGHT(52), color: C.WHITE })
      if (inc.name) s.textCenter(W / 2, 240, inc.tel, { size: 28, font: F_REG(28), color: C.GRAY })
    }
    // 大头像剪影（无照片时的深灰人形）
    const cy = 430
    for (let dy = -70; dy <= 70; dy++)
      for (let dx = -70; dx <= 70; dx++)
        if (dx * dx + dy * dy <= 70 * 70) s.pset(W / 2 + dx, cy + dy, C.DIM)
    glyphPerson(s, W / 2, cy + 8, 90, C.GRAY)
    // 接听（强调色）/ 忽略（暗灰）
    s.fillRect(24, H - 230, W - 48, 70, accent)
    s.textCenter(W / 2, H - 205, str.incomingAnswer, { size: 32, font: F_SEMI(32), color: C.WHITE })
    s.fillRect(24, H - 140, W - 48, 70, C.DIM)
    s.textCenter(W / 2, H - 115, str.incomingIgnore, { size: 32, font: F_SEMI(32), color: C.WHITE })
    s.render()
  }

  /** 通话中：姓名 + 计时 + 挂断条 */
  private drawInCall() {
    const s = this.deps.screen
    const str = wpStrings(this.deps.lang.get())
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    const inc = this.incoming
    if (inc) {
      s.textCenter(W / 2, 200, inc.name ?? inc.tel, { size: 52, font: F_LIGHT(52), color: C.WHITE })
      if (inc.name) s.textCenter(W / 2, 280, inc.tel, { size: 28, font: F_REG(28), color: C.GRAY })
    }
    const two = (x: number) => String(x).padStart(2, '0')
    const accent = this.accent()
    s.textCenter(W / 2, 380, `${two(Math.floor(this.callSecs / 60))}:${two(this.callSecs % 60)}`, { size: 64, font: F_LIGHT(64), color: accent })
    s.textCenter(W / 2, 470, str.phoneInCall, { size: 26, font: F_REG(26), color: C.GRAY })
    s.fillRect(W / 2 - 140, H - 170, 280, 70, C.RED)
    s.textCenter(W / 2, H - 145, str.phoneEndCall, { size: 32, font: F_SEMI(32), color: C.WHITE })
    s.render()
  }
}

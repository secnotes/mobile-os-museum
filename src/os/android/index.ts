import type { PhoneOS, PhoneOSFactory, OSDeps, MiniApp } from '../../kernel/types'
import { AppRuntime } from '../../kernel/runtime'
import type { DeviceKey } from '../../hal/input'
import type { Screen } from '../../hal/screen'
import { dialerApp, setPendingDial } from './apps/dialer'
import { messagesApp, type AMsg } from './apps/messages'
import { settingsApp } from './apps/settings'
import type { APhoto } from './apps/camera'
import { APPS } from './apps/registry'
import { browserApp, setPendingQuery } from './apps/browser'
import { marketApp } from './apps/market'
import { dayBit, type AAlarm } from './apps/clock'
import { androidStrings } from './strings'
import { C } from './palette'
import { assets, RINGTONE_NAMES, ALARM_NAMES, NOTIFY_FILES } from './assets'
import { RINGTONES } from './ringtones'
import { loadContacts, type Contact, type CallEntry } from '../../scenario/data'
import { W, H, STATUS_H, statusBar, roundRect, clipToWidth, time12 } from './ui'
import { Fx, easeOutCubic } from './anim'
import { InCallControls } from './incall'

/** 应用 id → 真机图标资源名（无映射的应用使用各自的程序图标） */
const DRAWER_ICON_MAP: Record<string, string> = {
  clock: 'AlarmClock',
  amazon: 'Amazon',
  browser: 'Browser',
  calculator: 'Calculator',
  calendar: 'Calendar',
  camera: 'Camera',
  contacts: 'Contacts',
  dialer: 'Dialer',
  gmail: 'Gmail',
  im: 'IM',
  maps: 'Maps',
  market: 'Market',
  messages: 'Messaging',
  music: 'Music',
  settings: 'Settings',
  youtube: 'YouTube',
}

/** 抽屉网格：4 列 × 5 行，行高 88dp（真机） */
const DRAWER_COLS = 4
const DRAWER_ROW_H = 88
const GRIP_W = 158
const GRIP_H = 32
const SHADE_MAX = 320
/** MENU 图标网格：贴底面板，单元 3 列 ×（图标+标签） */
const MENU_GRID_H = 196
const MENU_CELL_H = 84
/** 搜索对话框：贴状态栏下方 */
const SEARCH_SHEET_TOP = STATUS_H + 6
const SEARCH_SHEET_H = 96

/** 短信到达提示（回落合成音） */
const SMS_ALERT: ReadonlyArray<readonly [number, number]> = [
  [95, 0.5], [0, 0.25], [95, 0.5], [0, 0.25], [95, 1],
]

/** 解锁提示音（短双击） */
const UNLOCK_CLICK: ReadonlyArray<readonly [number, number]> = [
  [95, 0.06], [0, 0.03], [95, 0.06],
]

/** 开机时序：T-Mobile 闪屏 1.1s → ANDROID 扫光字标 2.8s */
const BOOT_SPLASH_S = 1.1
const BOOT_TOTAL_S = 3.9

/** 主屏条目（应用图标/快捷方式/小部件，按三屏持久化） */
interface HomeItem {
  id: number
  page: number
  gx: number; gy: number; gw: number; gh: number
  kind: 'app' | 'clock' | 'search' | 'frame' | 'contact'
  ref?: string
}

/** 通知条目 */
interface Notif {
  id: string
  kind: 'sms' | 'mms' | 'missed' | 'chat' | 'download'
  title: string
  text: string
  ts: number
}

type Gesture = 'workspace' | 'drawer' | 'shade'

export default {
  create(deps: OSDeps): PhoneOS {
    return new AndroidOS(deps)
  },
} satisfies PhoneOSFactory

type State =
  | 'off' | 'boot' | 'lock' | 'home' | 'shade' | 'dialog'
  | 'menu' | 'search'
  | 'alarm' | 'ringing' | 'incall' | 'app' | 'shutdown'

/** 主屏可放置网格的行中心（4×4 格；默认时钟占上方两行中央） */
const ROW_CENTERS = [STATUS_H + 44, STATUS_H + 140, STATUS_H + 236, STATUS_H + 332]

class AndroidOS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private wallpaper = 0
  private silent = false
  /** 24 小时制（设置 → 日期和时间；状态栏/锁屏时钟联动） */
  private h24 = false
  // ---- Launcher ----
  private page = 1
  private items: HomeItem[] = []
  private gesture: Gesture | null = null
  private dragOX = 0
  // ---- 抽屉 ----
  private drawerP = 0
  private drawerSel = 0
  private drawerScroll = 0
  private shadeP = 0
  // ---- 通知 ----
  private notifs: Notif[] = []
  // ---- 对话框 ----
  private dlgStack: Array<{ title: string; items: DlgItem[] }> = []
  private dlgSel = 0
  // ---- MENU 图标网格（真机 1.0 主屏菜单） ----
  private menuSel = 0
  // ---- 搜索对话框 ----
  private searchText = ''
  /** 未读短信（状态栏信封 + 通知条目） */
  private unread = false
  // ---- 闹钟 ----
  private alarms: AAlarm[] = []
  private alarmRing = false
  /** 当前正在响的闹钟（含 Snooze 期间保留） */
  private ringingAlarm: AAlarm | null = null
  /** 已触发去重：alarmId × 10000 + 当日分钟 */
  private rangKeys = new Set<number>()
  private snoozeTimer: ReturnType<typeof setTimeout> | null = null
  private alarmAudioStop: (() => void) | null = null
  private alarmTimers: Array<ReturnType<typeof setInterval>> = []
  // ---- 来电 ----
  private contacts: Contact[] = []
  private incoming: { tel: string; name?: string } | null = null
  private pendingIncoming: { tel: string; name?: string } | null = null
  private incomingRing = false
  private ringStop: (() => void) | null = null
  private ringtoneIdx = 1 // 真机出厂 = Classic_02（RINGTONE_NAMES 索引 1）
  private incomingIntervals: Array<ReturnType<typeof setInterval>> = []
  private incomingTimeouts: Array<ReturnType<typeof setTimeout>> = []
  private callSecs = 0
  // 长按硬件键去抖
  private homeLPFired = false
  private endLPFired = false
  private homeCloseTimer: ReturnType<typeof setTimeout> | null = null

  private runtime: AppRuntime
  private fx: Fx
  private ic: InCallControls
  readonly deps: OSDeps

  constructor(deps: OSDeps) {
    this.deps = deps
    this.runtime = new AppRuntime(deps, () => this.onAppExit())
    this.fx = new Fx(deps.frames, deps.screen)
    this.ic = new InCallControls(deps.audio)
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    await this.loadState()
    await this.seedMessages()
    await this.refreshUnread()
    await this.rebuildNotifs()
    this.contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    void assets.loadAll(this.deps.audio).then(() => {
      if (this.state !== 'off' && this.state !== 'boot') this.draw()
    })
    this.watchStore()
    // InputBus 不分发异常隔离：系统回调必须自己兜底，否则一个回调抛错会饿死后续订阅者与应用
    this.offs.push(
      this.deps.input.subscribe((k, rep) => {
        try {
          this.onInput(k, rep)
        } catch (e) {
          console.error('[android] input error', e)
        }
      }),
    )
    this.offs.push(
      this.deps.input.subscribeTap((x, y) => {
        try {
          this.onTap(x, y)
        } catch (e) {
          console.error('[android] tap error', e)
        }
      }),
    )
    this.offs.push(
      this.deps.input.subscribeDrag((x, y, sx, sy) => {
        try {
          this.onDrag(x, y, sx, sy)
        } catch (e) {
          console.error('[android] drag error', e)
        }
      }),
    )
    this.offs.push(
      this.deps.input.subscribeDragEnd(() => {
        try {
          this.onDragEnd()
        } catch (e) {
          console.error('[android] dragend error', e)
        }
      }),
    )
    this.offs.push(
      this.deps.input.subscribeLongPress((x, y) => {
        try {
          this.onLongPress(x, y)
        } catch (e) {
          console.error('[android] longpress error', e)
        }
      }),
    )
    this.offs.push(this.deps.lang.onChange(() => this.draw()))
    this.drawOff()
  }

  private async loadState() {
    this.wallpaper = (await this.deps.store.get<number>('settings:wallpaper')) ?? 0
    this.silent = (await this.deps.store.get<boolean>('settings:silent')) ?? false
    this.h24 = (await this.deps.store.get<boolean>('settings:h24')) ?? false
    this.ringtoneIdx = (await this.deps.store.get<number>('settings:ringtone')) ?? 1
    const list = await this.deps.store.get<AAlarm[]>('clock:alarms')
    if (list && list.length) {
      this.alarms = list.map((a) => ({
        id: a.id, on: !!a.on, h: a.h % 24, m: a.m % 60,
        days: a.days & 0x7f, label: a.label, snd: a.snd,
      }))
    } else {
      // 旧版单闹钟迁移
      const old = await this.deps.store.get<{ on: boolean; h: number; m: number }>('clock:alarm')
      this.alarms = old
        ? [{ id: 1, on: !!old.on, h: old.h % 24, m: old.m % 60, days: 0x1f, label: '', snd: 4 }]
        : []
    }
    // Launcher：三屏条目（首次启动种入真机 1.0 默认布局：中屏 MALMO 表盘 +
    // 底部一排 Dialer/Contacts/Browser/Maps 快捷方式——搜索挂件是 1.5 才有的）
    this.page = (await this.deps.store.get<number>('launcher:page')) ?? 1
    const saved = await this.deps.store.get<HomeItem[]>('launcher:items')
    // 旧存档若仍是旧默认（时钟+搜索挂件两件），按新默认重种
    const isOldDefault =
      saved?.length === 2 && saved[0]?.kind === 'clock' && saved[1]?.kind === 'search'
    if (saved && saved.length && !isOldDefault) {
      this.items = saved
    } else {
      this.items = [
        { id: 1, page: 1, gx: 1, gy: 0, gw: 2, gh: 2, kind: 'clock' },
        { id: 2, page: 1, gx: 0, gy: 3, gw: 1, gh: 1, kind: 'app', ref: 'dialer' },
        { id: 3, page: 1, gx: 1, gy: 3, gw: 1, gh: 1, kind: 'app', ref: 'contacts' },
        { id: 4, page: 1, gx: 2, gy: 3, gw: 1, gh: 1, kind: 'app', ref: 'browser' },
        { id: 5, page: 1, gx: 3, gy: 3, gw: 1, gh: 1, kind: 'app', ref: 'maps' },
      ]
      await this.deps.store.set('launcher:items', this.items)
    }
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.alarmRing = false
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
    this.alarmAudioStop?.()
    this.alarmAudioStop = null
    if (this.homeCloseTimer) {
      clearTimeout(this.homeCloseTimer)
      this.homeCloseTimer = null
    }
    this.fx.cancelAll()
    this.ringStop?.()
    this.ringStop = null
    this.stopIncomingRing()
    this.ic.dispose()
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    for (const off of this.offs.splice(0)) off()
    this.runtime.close()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 按键 ----------

  private onInput(key: DeviceKey, repeat: boolean) {
    if (!repeat) {
      this.homeLPFired = false
      this.endLPFired = false
    }
    if (key === 'power') {
      if (!this.powered) this.boot()
      else if (repeat && !this.endLPFired) {
        this.endLPFired = true
        this.openActions()
      }
      return
    }
    if (!this.powered) {
      // G1 真机：关机时按红色挂断键唤醒
      if (key === 'end') this.boot()
      return
    }
    // 红色挂断/电源键长按 → Global actions
    if (key === 'end' && repeat && !this.endLPFired && this.state !== 'incall') {
      this.endLPFired = true
      this.openActions()
      return
    }
    // HOME 键长按 → Recent apps（含应用内）
    if (key === 'home' && repeat && !this.homeLPFired) {
      this.homeLPFired = true
      this.openRecent()
      return
    }
    if (this.alarmRing) {
      if (repeat) return
      // 真机 AlarmAlert：绿色接听键 = Snooze；红键/返回 = Dismiss
      if (key === 'call') this.snoozeAlarm()
      else this.stopAlarmRing()
      return
    }
    if (this.incomingRing) {
      if (!repeat) {
        if (key === 'call' || key === 'ok') this.answerCall()
        else if (key === 'end' || key === 'back') this.rejectCall(false)
      }
      return
    }
    if (this.state === 'boot' || this.state === 'shutdown') return
    if (this.state === 'app') {
      // HOME 键：长按（450ms repeat 先到）→ Recent；短按 → 延迟 500ms 回主屏。
      // 不能立即 close：runtime 的 releaseAll 会取消 HOME 键自动重复，长按就再也触发不了
      if (key === 'home' && !repeat && !this.homeCloseTimer) {
        this.homeCloseTimer = setTimeout(() => {
          this.homeCloseTimer = null
          if (this.state === 'app' && !this.homeLPFired) this.runtime.close()
        }, 500)
      }
      return
    }
    if (this.fx.busy) return
    if (this.state === 'incall') {
      if (key === 'end' && !repeat) this.endInCall()
      else if (this.ic.key(key, repeat)) this.draw()
      return
    }
    this.uiInput(key)
  }

  /** 系统层 UI 的按键分发 */
  private uiInput(key: DeviceKey) {
    switch (this.state) {
      case 'lock':
        if (key === 'menu') {
          this.lockStage++
          if (this.lockStage >= 2) {
            void this.deps.store.get<boolean>('settings:unlocksnd').then((on) => {
              if (on !== false) {
                this.deps.audio.unlock()
                this.deps.audio.melody(UNLOCK_CLICK, 90)
              }
            })
            this.enterHome()
          } else this.draw()
        }
        return
      case 'home':
        this.homeKey(key)
        return
      case 'shade':
        if (key === 'back' || key === 'menu' || key === 'home') this.closeShade()
        return
      case 'dialog':
        this.dialogKey(key)
        return
      case 'menu':
        this.menuKey(key)
        return
      case 'search':
        this.searchKey(key)
        return
      default:
        return
    }
  }

  private homeKey(key: DeviceKey) {
    if (this.drawerP === 1) {
      this.drawerInput(key)
      return
    }
    switch (key) {
      case 'menu':
        this.openHomeMenu()
        return
      case 'ok':
      case 'down':
        this.openDrawer()
        return
      case 'up':
        this.openShade()
        return
      case 'left':
        if (this.page > 0) this.gotoPage(this.page - 1)
        return
      case 'right':
        if (this.page < 2) this.gotoPage(this.page + 1)
        return
      case 'call':
        this.launch(dialerApp)
        return
      case 'search':
        this.openSearchSheet()
        return
      case 'back':
        if (this.drawerP > 0) this.closeDrawer()
        return
      default:
        return
    }
  }

  // ---------- 连续手势 ----------

  private onDrag(x: number, y: number, sx: number, sy: number) {
    if (!this.powered || this.fx.busy) return
    if (this.state !== 'home' && this.state !== 'shade') return
    if (this.alarmRing || this.incomingRing) return
    const dx = x - sx
    const dy = y - sy
    if (!this.gesture) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return
      if (this.state === 'shade') {
        this.gesture = 'shade'
      } else if (Math.abs(dx) > Math.abs(dy)) {
        this.gesture = 'workspace'
      } else if (dy > 0 && sy <= STATUS_H + 6) {
        this.gesture = 'shade'
        this.state = 'shade'
        this.shadeP = 0
      } else if (dy < 0 && sy >= H - GRIP_H - 4) {
        this.gesture = 'drawer'
      } else if (dy < 0 && this.drawerP === 1 && sy <= STATUS_H + GRIP_H + 6) {
        // 从顶部握把下拖关闭抽屉
        this.gesture = 'drawer'
      } else return
    }
    if (this.gesture === 'workspace') {
      // ox<0：向左拖、拉来右侧下一屏；ox>0：向右拖、拉回左侧上一屏
      const min = this.page < 2 ? -W : 0
      const max = this.page > 0 ? W : 0
      this.dragOX = Math.max(min, Math.min(max, dx))
      this.draw()
    } else if (this.gesture === 'drawer') {
      const travel = H - STATUS_H - GRIP_H
      this.drawerP = Math.max(0, Math.min(1, this.drawerP - dy / travel))
      this.draw()
    } else {
      this.shadeP = Math.max(0, Math.min(1, this.shadeP + dy / SHADE_MAX))
      this.draw()
    }
  }

  private onDragEnd() {
    const g = this.gesture
    this.gesture = null
    if (!g) return
    if (g === 'workspace') {
      const ox = this.dragOX
      if (ox <= -W * 0.32 && this.page < 2) {
        this.animateOX(-W, () => {
          this.page++
          this.dragOX = 0
          void this.deps.store.set('launcher:page', this.page)
        })
      } else if (ox >= W * 0.32 && this.page > 0) {
        this.animateOX(W, () => {
          this.page--
          this.dragOX = 0
          void this.deps.store.set('launcher:page', this.page)
        })
      } else this.animateOX(0)
    } else if (g === 'drawer') {
      if (this.drawerP > 0.5) this.openDrawer()
      else this.closeDrawer()
    } else if (this.shadeP > 0.45) {
      this.fx.run(180, (p) => {
        this.shadeP = p
        this.draw()
      })
    } else this.closeShade()
  }

  private animateOX(target: number, done?: () => void) {
    const from = this.dragOX
    this.fx.run(190, (p) => {
      this.dragOX = from + (target - from) * p
      this.draw()
    }, () => {
      this.dragOX = 0
      done?.()
      this.draw()
    })
  }

  // ---------- 点按 ----------

  private onTap(x: number, y: number) {
    if (!this.powered || this.fx.busy) return
    if (this.alarmRing) {
      // 几何须与 drawAlarm 两按钮一致：左绿 Snooze / 右红 Dismiss
      if (y >= H - 96 && y <= H - 32) {
        if (x > 20 && x < 150) this.snoozeAlarm()
        else if (x > 170 && x < 300) this.stopAlarmRing()
      }
      return
    }
    if (this.incomingRing) {
      this.onRingingTap(x, y)
      return
    }
    if (this.state === 'app' || this.state === 'boot' || this.state === 'shutdown') return
    if (this.state === 'incall') {
      this.onInCallTap(x, y)
      return
    }
    switch (this.state) {
      case 'lock':
        return // 真机：锁屏必须 MENU 键解锁
      case 'home':
        this.homeTap(x, y)
        return
      case 'shade':
        this.shadeTap(x, y)
        return
      case 'dialog':
        this.dialogTap(x, y)
        return
      case 'menu':
        this.menuTap(x, y)
        return
      case 'search':
        this.searchTap(x, y)
        return
      default:
        return
    }
  }

  private homeTap(x: number, y: number) {
    // 抽屉打开时：网格点按 / 握把关闭
    if (this.drawerP === 1) {
      if (y >= STATUS_H && y < STATUS_H + GRIP_H + 4) {
        this.closeDrawer()
        return
      }
      const cell = this.drawerCellAt(x, y)
      if (cell >= 0 && cell < APPS.length) {
        this.drawerSel = cell
        this.launch(APPS[cell]!)
      }
      return
    }
    if (y <= STATUS_H) {
      this.openShade()
      return
    }
    if (y >= H - GRIP_H - 2) {
      this.openDrawer()
      return
    }
    const hit = this.itemAt(x, y)
    if (!hit) return
    if (hit.kind === 'app') {
      const app = APPS.find((a) => a.id === hit.ref)
      if (app) this.launch(app)
    } else if (hit.kind === 'contact') {
      const c = this.contacts.find((c) => c.tel === hit.ref)
      if (c) {
        setPendingDial(c.tel)
        this.launch(dialerApp)
      }
    } else if (hit.kind === 'search') {
      this.launch(browserApp)
    }
  }

  /** 长按空白主屏：真机「Add to Home」底部对话框（点在条目/状态栏/握把上不触发） */
  private onLongPress(x: number, y: number) {
    if (this.state !== 'home' || this.drawerP !== 0) return
    if (y <= STATUS_H || y >= H - GRIP_H - 2) return
    if (this.itemAt(x, y)) return
    this.openAddRoot()
  }

  // ---------- 电源时序 ----------

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.lockStage = 0
    this.rangKeys.clear()
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
    if (this.homeCloseTimer) {
      clearTimeout(this.homeCloseTimer)
      this.homeCloseTimer = null
    }
    this.fx.cancelAll()
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    for (const t of this.timers.splice(0)) clearTimeout(t)
    this.runtime.close()
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.BAR)
    s.render()
    this.timers.push(setTimeout(() => {
      this.powered = false
      this.state = 'off'
      this.drawOff()
    }, 1500))
  }

  private drawOff() {
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 状态切换 ----------

  private lockStage = 0

  enterLock() {
    this.state = 'lock'
    this.lockStage = 0
    this.draw()
  }

  enterHome() {
    this.state = 'home'
    this.drawerSel = 0
    this.draw()
    if (this.pendingIncoming) {
      const p = this.pendingIncoming
      this.pendingIncoming = null
      this.enterRinging(p.tel, p.name)
    }
  }

  launch(app: MiniApp) {
    this.pushRecent(app.id)
    this.state = 'app'
    // 从抽屉启动时抽屉必须归位：否则应用退出后抽屉会重新盖回，
    // 甚至遮住 Recent/Global actions 对话框（drawHomeBase 的 drawerP>0 分支）
    this.drawerP = 0
    this.drawerScroll = 0
    this.drawerSel = 0
    this.runtime.launch(app, {
      messageSent: () => this.scheduleReply(),
      dial: (num) => {
        setPendingDial(num)
        this.launch(dialerApp)
      },
      getPhotos: () => this.deps.store.get<APhoto[]>('camera:photos'),
      deletePhoto: async (id) => {
        const photos = (await this.deps.store.get<APhoto[]>('camera:photos')) ?? []
        await this.deps.store.set('camera:photos', photos.filter((p) => p.id !== id))
      },
      setLockPhoto: (cv, id) => {
        this.lockPhoto = cv
        void this.deps.store.set('lock:photoid', id ?? null)
      },
      getPurchasedTracks: () => this.deps.store.get('amazon:downloaded'),
      getRingtoneIndex: async () =>
        (await this.deps.store.get<number>('settings:ringtone')) ?? 1,
      getCallLog: async () => (await this.deps.store.get<CallEntry[]>('calllog')) ?? [],
      recordCall: (e) => void this.recordCall(e),
      getContacts: () => loadContacts(this.deps.store.get.bind(this.deps.store)),
      getInstalledApps: async () => {
        const list = (await this.deps.store.get<number[]>('market:installed')) ?? []
        const s = androidStrings(this.deps.lang.get())
        return list.map((i) => s.marketItems[i]?.name).filter((x): x is string => !!x)
      },
      uninstallApp: async (name) => {
        const s = androidStrings(this.deps.lang.get())
        const i = s.marketItems.findIndex((m) => m.name === name)
        if (i < 0) return
        const list = (await this.deps.store.get<number[]>('market:installed')) ?? []
        await this.deps.store.set('market:installed', list.filter((x) => x !== i))
      },
      pushNotif: (n) => void this.pushExtraNotif(n),
    })
  }

  /** 应用追加/更新一条持久通知（Market 下载开始/完成） */
  private async pushExtraNotif(n: { id?: string; kind: 'download' | 'chat'; title: string; text: string }) {
    const extra = (await this.deps.store.get<Notif[]>('notif:extra')) ?? []
    const id = n.id ?? `${n.kind}-${Date.now()}`
    const next = extra.filter((e) => e.id !== id)
    next.push({ id, kind: n.kind, title: n.title, text: n.text, ts: Date.now() })
    await this.deps.store.set('notif:extra', next)
    await this.rebuildNotifs()
    if (this.state === 'shade' || this.state === 'home' || this.state === 'dialog') this.draw()
  }

  private onAppExit() {
    if (this.state === 'app' || this.state === 'shutdown') this.enterHome()
  }

  // ---------- Recent apps ----------

  private recentApps: string[] = []

  private pushRecent(id: string) {
    this.recentApps = [id, ...this.recentApps.filter((a) => a !== id)].slice(0, 8)
  }

  private openRecent() {
    if (this.homeCloseTimer) {
      clearTimeout(this.homeCloseTimer)
      this.homeCloseTimer = null
    }
    if (this.state === 'app') this.runtime.close()
    const str = androidStrings(this.deps.lang.get())
    const en = this.deps.lang.get() === 'en'
    const items: DlgItem[] = this.recentApps.length
      ? this.recentApps.map((id) => {
          const app = APPS.find((a) => a.id === id)
          return {
            label: app ? (en ? app.nameEn ?? app.name : app.name) : id,
            action: () => {
              if (app) this.launch(app)
            },
          }
        })
      : [{ label: str.recentEmpty, action: () => {} }]
    this.dlgStack = [{ title: str.recentTitle, items }]
    this.dlgSel = 0
    this.state = 'dialog'
    this.draw()
  }

  // ---------- Global actions ----------

  private openActions() {
    const str = androidStrings(this.deps.lang.get())
    const items: DlgItem[] = [
      {
        label: `${str.silentMode}: ${this.silent ? str.settingsOn : str.settingsOff}`,
        // 真机：点按即时切换并关闭手机选项表
        action: () => {
          void this.toggleSilent().then(() => {
            this.dlgStack = []
            this.state = 'home'
            this.draw()
          })
        },
      },
      { label: str.powerOff, action: () => this.shutdown() },
    ]
    if (this.state === 'app') this.runtime.close()
    this.dlgStack = [{ title: str.actionsTitle, items }]
    this.dlgSel = 0
    this.state = 'dialog'
    this.draw()
  }

  private async toggleSilent() {
    this.silent = !this.silent
    await this.deps.store.set('settings:silent', this.silent)
    this.draw()
  }

  // ---------- 对话框（底部真机工作表） ----------

  private openDialog(title: string, items: DlgItem[]) {
    this.dlgStack.push({ title, items })
    this.dlgSel = 0
    this.state = 'dialog'
    this.draw()
  }

  private dialogKey(key: DeviceKey) {
    const top = this.dlgStack[this.dlgStack.length - 1]
    if (!top) return
    const n = top.items.length
    if (key === 'up') this.dlgSel = (this.dlgSel + n - 1) % n
    else if (key === 'down') this.dlgSel = (this.dlgSel + 1) % n
    else if (key === 'ok') {
      const it = top.items[this.dlgSel]
      it?.action()
      return
    } else if (key === 'back' || key === 'menu') {
      this.dlgStack.pop()
      if (!this.dlgStack.length) {
        this.state = 'home'
        this.draw()
        return
      }
      this.dlgSel = 0
    } else return
    this.draw()
  }

  private dialogTap(_x: number, y: number) {
    const top = this.dlgStack[this.dlgStack.length - 1]
    if (!top) return
    const sheetH = Math.min(H - 80, 56 + top.items.length * 46 + 10)
    const sheetTop = H - sheetH
    if (y < sheetTop) {
      // 点遮罩关闭
      this.dlgStack = []
      this.state = 'home'
      this.draw()
      return
    }
    for (let i = 0; i < top.items.length; i++) {
      const iy = sheetTop + 46 + i * 46
      if (y >= iy - 6 && y < iy + 40) {
        this.dlgSel = i
        top.items[i]?.action()
        return
      }
    }
  }

  // ---------- Add to Home ----------

  private openAddRoot() {
    const str = androidStrings(this.deps.lang.get())
    this.dlgStack = [
      {
        title: str.addTitle,
        items: [
          { label: str.dApplication, action: () => this.pickApplication() },
          { label: str.dShortcut, action: () => this.pickShortcutKind() },
          { label: str.dWidget, action: () => this.pickWidget() },
          { label: str.dWallpaper, action: () => this.pickWallpaperKind() },
        ],
      },
    ]
    this.dlgSel = 0
    this.state = 'dialog'
    this.draw()
  }

  /** Application → 应用选择 → 图标放到当前屏（满则找别的屏） */
  private pickApplication() {
    const str = androidStrings(this.deps.lang.get())
    const en = this.deps.lang.get() === 'en'
    this.openDialog(
      str.dApplication,
      APPS.map((app) => ({
        label: en ? app.nameEn ?? app.name : app.name,
        action: () => {
          this.addItem({
            kind: 'app',
            ref: app.id,
          })
          this.dlgStack = []
          this.state = 'home'
          this.draw()
        },
      })),
    )
  }

  private pickShortcutKind() {
    const str = androidStrings(this.deps.lang.get())
    this.openDialog(str.dShortcut, [
      {
        label: str.dContact,
        action: () => {
          this.openDialog(
            str.dContact,
            this.contacts.map((c) => ({
              label: c.name,
              action: () => {
                this.addItem({ kind: 'contact', ref: c.tel })
                this.dlgStack = []
                this.state = 'home'
                this.draw()
              },
            })),
          )
        },
      },
    ])
  }

  private pickWidget() {
    const str = androidStrings(this.deps.lang.get())
    this.openDialog(str.dWidget, [
      {
        label: str.wClock,
        action: () => {
          this.addItem({ kind: 'clock' }, { gw: 2, gh: 2 })
          this.dlgStack = []
          this.state = 'home'
          this.draw()
        },
      },
      {
        label: str.wPictureFrame,
        action: () => void this.pickPictureForFrame(),
      },
      // 真机 1.0 无搜索挂件（1.5 Cupcake 才引入），不再提供添加入口；
      // 旧存档里已存在的搜索条目仍照常绘制（kind:'search' 分支保留）
    ])
  }

  /** 相框照片选择：相机照片优先；无照片时使用壁纸中心画面 */
  private async pickPictureForFrame() {
    const str = androidStrings(this.deps.lang.get())
    const photos = (await this.deps.store.get<APhoto[]>('camera:photos')) ?? []
    if (!photos.length) {
      this.addItem({ kind: 'frame', ref: 'wallpaper' }, { gw: 2, gh: 2 })
      this.dlgStack = []
      this.state = 'home'
      this.draw()
      return
    }
    this.openDialog(
      str.wPictureFrame,
      photos.map((p) => ({
        label: `${p.id}`.slice(-8),
        action: () => {
          this.addItem({ kind: 'frame', ref: String(p.id) }, { gw: 2, gh: 2 })
          this.dlgStack = []
          this.state = 'home'
          this.draw()
        },
      })),
    )
  }

  private pickWallpaperKind() {
    const str = androidStrings(this.deps.lang.get())
    this.openDialog(str.dWallpaper, [
      {
        label: str.wPictures,
        action: () => void this.pickWallpaperFromPhotos(),
      },
      {
        label: str.wPurchased,
        action: () => {
          // 无已购图片：回到上一级
          this.dlgStack.pop()
          this.dlgSel = 0
          this.draw()
        },
      },
      {
        label: str.wWallpaperGallery,
        action: () => this.pickWallpaperGallery(),
      },
    ])
  }

  private async pickWallpaperFromPhotos() {
    const str = androidStrings(this.deps.lang.get())
    const photos = (await this.deps.store.get<APhoto[]>('camera:photos')) ?? []
    this.openDialog(
      str.wPictures,
      (photos.length
        ? photos.map((p) => ({
            label: `${p.id}`.slice(-8),
            action: () => void this.setWallpaperPhoto(p),
          }))
        : [
            {
              label: str.picturesEmpty,
              action: () => {
                this.dlgStack.pop()
                this.dlgSel = 0
                this.draw()
              },
            },
          ]
      ),
    )
  }

  /** 壁纸库：真机默认壁纸 + 两个配色主题 */
  private pickWallpaperGallery() {
    const str = androidStrings(this.deps.lang.get())
    this.openDialog(
      str.wWallpaperGallery,
      str.wallpaperNames.map((name, i) => ({
        label: name,
        action: () => {
          this.wallpaper = i
          void this.deps.store.set('settings:wallpaper', i)
          this.dlgStack = []
          this.state = 'home'
          this.draw()
        },
      })),
    )
  }

  private async setWallpaperPhoto(p: APhoto) {
    // 用照片做壁纸：存其位图引用，drawWallpaper 读取
    await this.deps.store.set('settings:wallpaperPhoto', p.id)
    this.wallpaper = 3
    await this.deps.store.set('settings:wallpaper', 3)
    this.dlgStack = []
    this.state = 'home'
    this.draw()
  }

  /** 在当前屏找空位添加条目；当前屏满则自动找其他屏 */
  private addItem(partial: Pick<HomeItem, 'kind' | 'ref'>, size: { gw: number; gh: number } = { gw: 1, gh: 1 }) {
    const gw = partial.kind === 'app' || partial.kind === 'contact' ? 1 : size.gw
    const gh = partial.kind === 'app' || partial.kind === 'contact' ? 1 : size.gh
    const tryPages = [this.page, 0, 1, 2].filter((p, i, a) => a.indexOf(p) === i)
    for (const pg of tryPages) {
      const slot = this.freeSlot(pg, gw, gh)
      if (slot) {
        const item: HomeItem = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          page: pg,
          gx: slot.gx,
          gy: slot.gy,
          gw,
          gh,
          kind: partial.kind,
          ref: partial.ref,
        }
        this.items.push(item)
        if (pg !== this.page) this.page = pg
        void this.deps.store.set('launcher:items', this.items)
        void this.deps.store.set('launcher:page', this.page)
        return
      }
    }
  }

  /** 4×4 放置网格上空位的左上角（被占格跳过） */
  private freeSlot(page: number, gw: number, gh: number): { gx: number; gy: number } | null {
    const used = Array.from({ length: 4 }, () => Array<boolean>(4).fill(false))
    for (const it of this.items.filter((i) => i.page === page)) {
      for (let y = it.gy; y < it.gy + it.gh; y++)
        for (let x = it.gx; x < it.gx + it.gw; x++)
          if (y < 4 && x < 4) used[y]![x] = true
    }
    for (let gy = 0; gy + gh <= 4; gy++)
      for (let gx = 0; gx + gw <= 4; gx++) {
        let ok = true
        for (let y = gy; y < gy + gh && ok; y++)
          for (let x = gx; x < gx + gw; x++)
            if (used[y]![x]) {
              ok = false
              break
            }
        if (ok) return { gx, gy }
      }
    return null
  }

  // ---------- MENU 主屏菜单 ----------

  /** 真机 1.0 主屏 MENU：底部图标网格（3 列，大图标 + 白字，橙色聚焦框） */
  private openHomeMenu() {
    this.menuSel = 0
    this.state = 'menu'
    this.draw()
  }

  /** 网格项定义（几何须与 drawHomeMenu / menuTap 一致） */
  private menuItems(): Array<{ label: string; icon: (s: Screen, x: number, y: number) => void; action: () => void }> {
    const str = androidStrings(this.deps.lang.get())
    return [
      { label: str.menuAdd, icon: (s, x, y) => menuGlyph(s, x, y, 'add'), action: () => this.openAddRoot() },
      { label: str.menuWallpaper, icon: (s, x, y) => menuGlyph(s, x, y, 'wallpaper'), action: () => this.pickWallpaperKind() },
      { label: str.wSearch, icon: (s, x, y) => menuGlyph(s, x, y, 'search'), action: () => this.openSearchSheet() },
      { label: str.menuNotifications, icon: (s, x, y) => menuGlyph(s, x, y, 'bell'), action: () => this.openShade() },
      { label: str.menuSettings, icon: (s, x, y) => menuGlyph(s, x, y, 'gear'), action: () => this.launch(settingsApp) },
    ]
  }

  private menuKey(key: DeviceKey) {
    const n = this.menuItems().length // 5 项：第一行 3、第二行 2
    const col = this.menuSel % 3
    if (key === 'left') this.menuSel = col > 0 ? this.menuSel - 1 : this.menuSel
    else if (key === 'right') this.menuSel = col < 2 && this.menuSel + 1 < n ? this.menuSel + 1 : this.menuSel
    else if (key === 'up') this.menuSel = this.menuSel >= 3 ? this.menuSel - 3 : this.menuSel
    else if (key === 'down') this.menuSel = this.menuSel + 3 < n ? this.menuSel + 3 : this.menuSel
    else if (key === 'ok') {
      this.menuItems()[this.menuSel]?.action()
      return
    } else if (key === 'back' || key === 'menu') {
      this.state = 'home'
      this.draw()
      return
    } else return
    this.draw()
  }

  private menuTap(x: number, y: number) {
    const top = H - MENU_GRID_H
    if (y < top) {
      // 点遮罩关闭
      this.state = 'home'
      this.draw()
      return
    }
    const items = this.menuItems()
    for (let i = 0; i < items.length; i++) {
      const cx = (i % 3) * (W / 3)
      const cy = top + 14 + Math.floor(i / 3) * MENU_CELL_H
      if (x >= cx && x < cx + W / 3 && y >= cy - 6 && y < cy + MENU_CELL_H) {
        this.menuSel = i
        items[i]?.action()
        return
      }
    }
  }

  /** 真机 1.0 搜索键 / MENU-Search：顶部搜索对话框（Google g + 输入行） */
  private openSearchSheet() {
    this.searchText = ''
    this.state = 'search'
    this.draw()
  }

  private searchKey(key: DeviceKey) {
    if (key === 'back' || key === 'menu') {
      this.state = 'home'
      this.draw()
      return
    }
    if (key === 'clear') {
      if (this.searchText) {
        this.searchText = this.searchText.slice(0, -1)
        this.draw()
      }
      return
    }
    if (key === 'ok') {
      this.submitSearch()
      return
    }
    let ch: string | null = null
    if (/^[a-z0-9]$/.test(key)) ch = key
    else if (key === '.') ch = '.'
    else if (key === 'space') ch = ' '
    if (ch && this.searchText.length < 40) {
      this.searchText += ch
      this.draw()
    }
  }

  private searchTap(x: number, y: number) {
    // 几何须与 drawSearchSheet 一致：Go 按钮在输入行右端
    if (y >= SEARCH_SHEET_TOP + 40 && y <= SEARCH_SHEET_TOP + 78 && x >= W - 78) {
      this.submitSearch()
      return
    }
    if (y < SEARCH_SHEET_TOP || y > SEARCH_SHEET_TOP + SEARCH_SHEET_H) {
      // 点对话框外关闭
      this.state = 'home'
      this.draw()
    }
  }

  private submitSearch() {
    const q = this.searchText.trim()
    this.searchText = ''
    this.state = 'home'
    if (!q) {
      this.draw()
      return
    }
    setPendingQuery(q)
    this.launch(browserApp)
  }

  // ---------- 短信生态 ----------

  private async seedMessages() {
    const inbox = await this.deps.store.get<AMsg[]>('messages:inbox')
    const s = androidStrings(this.deps.lang.get())
    if (inbox) {
      const seedTexts = [
        ...Object.values(androidStrings('zh')),
        ...Object.values(androidStrings('en')),
      ].flatMap((v) => (typeof v === 'string' ? [v] : []))
      const pristine =
        inbox.length === 2 && inbox.every((m) => seedTexts.includes(m.text))
      if (!pristine) return
    }
    const now = Date.now()
    await this.deps.store.set('messages:inbox', [
      { id: now - 7200_000, from: s.carrier, text: s.seedWelcome, ts: now - 7200_000, read: false, mine: false },
      { id: now - 3600_000, from: s.recipient, text: s.seedMom, ts: now - 3600_000, read: false, mine: false },
    ] satisfies AMsg[])
  }

  private scheduleReply() {
    const delay = 4500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.deliverReply(), delay))
  }

  private async deliverReply() {
    const inbox = (await this.deps.store.get<AMsg[]>('messages:inbox')) ?? []
    const s = androidStrings(this.deps.lang.get())
    inbox.push({
      id: Date.now(),
      from: s.recipient,
      text: s.replies[Math.floor(Math.random() * s.replies.length)]!,
      ts: Date.now(),
      read: false,
      mine: false,
    })
    await this.deps.store.set('messages:inbox', inbox)
    await this.onInboxChanged()
    if (!this.silent) {
      this.deps.audio.unlock()
      if (this.deps.audio.hasFile(NOTIFY_FILES.sms)) {
        this.deps.audio.playFile(NOTIFY_FILES.sms, { volume: 0.5 })
      } else {
        this.deps.audio.melody(SMS_ALERT, 320)
      }
    }
  }

  /** 收件箱变化：未读状态 + 通知条目 */
  private async onInboxChanged() {
    await this.refreshUnread()
    await this.rebuildNotifs()
    if (this.state === 'shade' || this.state === 'home' || this.state === 'dialog') this.draw()
  }

  private async clearAllNotifications() {
    const inbox = (await this.deps.store.get<AMsg[]>('messages:inbox')) ?? []
    await this.deps.store.set('messages:inbox', inbox.map((m) => ({ ...m, read: true })))
    await this.deps.store.set('notif:extra', [])
    await this.rebuildNotifs()
    await this.refreshUnread()
  }

  private async refreshUnread() {
    const inbox = await this.deps.store.get<AMsg[]>('messages:inbox')
    this.unread = !!inbox?.some((m) => !m.read && !m.mine)
  }

  /** 重建通知列表 = 非短信持久条目 + 未读短信，按时间倒序 */
  private async rebuildNotifs() {
    const inbox = (await this.deps.store.get<AMsg[]>('messages:inbox')) ?? []
    const extra = (await this.deps.store.get<Notif[]>('notif:extra')) ?? []
    this.notifs = [
      ...extra,
      ...inbox
        .filter((m) => !m.read && !m.mine)
        .map((m) => ({
          id: `sms-${m.id}`,
          kind: 'sms' as const,
          title: m.from,
          text: m.text,
          ts: m.ts,
        })),
    ].sort((a, b) => b.ts - a.ts)
  }

  /** 状态栏/锁屏时钟：尊重「设置 → 日期和时间」的 24 小时制开关 */
  private clockStr(d: Date): string {
    if (this.h24)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return time12(d)
  }

  private watchStore() {
    const prefix = `${this.deps.profile.id}:`
    this.offs.push(
      this.deps.store.onChange((fk) => {
        if (fk === `${prefix}*`) {
          // 恢复出厂：内存中的壁纸/静音等全部回到默认并重绘主屏
          void this.loadState().then(() => {
            if (this.state !== 'off' && this.state !== 'boot') this.draw()
          })
          return
        }
        if (fk.startsWith(`${prefix}messages:`)) {
          void this.onInboxChanged()
        }
        if (fk === `${prefix}settings:h24`) {
          void this.loadState().then(() => {
            if (this.state !== 'app' && this.state !== 'off' && this.state !== 'boot') this.draw()
          })
        }
        if (fk.startsWith(`${prefix}settings:wallpaper`)) {
          void this.loadState().then(() => {
            if (this.state !== 'app' && this.state !== 'off' && this.state !== 'boot') this.draw()
          })
        }
        if (fk === `${prefix}clock:alarms`) {
          void this.loadState().then(() => {
            if (this.alarmRing && this.ringingAlarm && !this.alarms.find((a) => a.id === this.ringingAlarm!.id)?.on) {
              this.stopAlarmRing()
            }
          })
        }
        if (fk.endsWith(':contacts')) {
          void loadContacts(this.deps.store.get.bind(this.deps.store)).then((c) => (this.contacts = c))
        }
      }),
    )
  }

  // ---------- 闹钟 ----------

  /** 最近一个将要响的闹钟（锁屏显示用） */
  private nextAlarm(): AAlarm | null {
    const now = new Date()
    let best: { a: AAlarm; t: number } | null = null
    for (const a of this.alarms) {
      if (!a.on) continue
      const t = new Date()
      t.setHours(a.h, a.m, 0, 0)
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1)
      if (a.days === 0) continue // 仅一次且时间已过（正常已自动关闭）
      for (let i = 0; i < 8; i++) {
        if ((a.days & dayBit(t.getDay())) !== 0) break
        t.setDate(t.getDate() + 1)
      }
      if (!best || t.getTime() < best.t) best = { a, t: t.getTime() }
    }
    return best?.a ?? null
  }

  private checkAlarm() {
    if (!this.powered || this.alarmRing || this.snoozeTimer) return
    if (this.state === 'boot' || this.state === 'shutdown' || this.state === 'off') return
    const d = new Date()
    const minOfDay = d.getHours() * 60 + d.getMinutes()
    for (const a of this.alarms) {
      if (!a.on) continue
      if (a.h !== d.getHours() || a.m !== d.getMinutes()) continue
      const due = a.days === 0 || (a.days & dayBit(d.getDay())) !== 0
      if (!due) continue
      const key = a.id * 10000 + minOfDay
      if (this.rangKeys.has(key)) continue
      this.rangKeys.add(key)
      this.startAlarmRing(a)
      return
    }
  }

  private startAlarmRing(a: AAlarm) {
    this.alarmRing = true
    this.ringingAlarm = a
    if (this.state === 'app') this.runtime.close()
    if (this.state !== 'boot' && this.state !== 'shutdown') this.state = 'alarm'
    const play = () => {
      const name = ALARM_NAMES[a.snd]?.file ?? ALARM_NAMES[4]!.file
      this.deps.audio.unlock()
      this.alarmAudioStop?.()
      if (this.deps.audio.hasFile(name)) {
        this.alarmAudioStop = this.deps.audio.playFile(name, { loop: true, volume: 0.6 })
      } else {
        const rIdx = this.ringtoneIdx
        this.deps.audio.melody(RINGTONES[rIdx] ?? RINGTONES[1]!, 220)
      }
    }
    play()
    this.alarmTimers.push(setInterval(() => {
      if (this.alarmRing && this.state === 'alarm') this.draw()
    }, 500))
    this.draw()
  }

  /** 贪睡：停音 5 分钟后再响同一闹钟（真机 Snooze） */
  private snoozeAlarm() {
    const a = this.ringingAlarm
    this.alarmRing = false
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    this.alarmAudioStop?.()
    this.alarmAudioStop = null
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer)
    this.snoozeTimer = setTimeout(() => {
      this.snoozeTimer = null
      if (a && this.powered) this.startAlarmRing(a)
      else this.enterHome()
    }, 5 * 60 * 1000)
    if (this.state === 'alarm') this.enterHome()
  }

  private stopAlarmRing() {
    // 仅一次的闹钟在用户关闭时才置 off（真机行为）。不能在响铃瞬间置：
    // 那次写入会触发 watcher，watcher 见闹钟关闭反而会立刻停铃
    if (this.ringingAlarm?.days === 0) {
      this.ringingAlarm.on = false
      void this.deps.store.set('clock:alarms', this.alarms)
    }
    this.alarmRing = false
    this.ringingAlarm = null
    this.alarmAudioStop?.()
    this.alarmAudioStop = null
    for (const t of this.alarmTimers.splice(0)) clearInterval(t)
    if (this.state === 'alarm') this.enterHome()
    else this.draw()
  }

  // ---------- 来电 ----------

  incomingCall(tel: string, name?: string) {
    const n = name ?? this.contacts.find((c) => c.tel === tel)?.name
    if (!this.powered || this.state === 'off' || this.state === 'boot' || this.state === 'shutdown' || this.state === 'lock') {
      this.pendingIncoming = { tel, name: n }
      return
    }
    this.enterRinging(tel, n)
  }

  /** 全屏来电卡片：铃声使用设置中选定的真机 OGG（循环），静音模式振动提示 */
  private enterRinging(tel: string, name?: string) {
    this.incoming = { tel, name }
    this.incomingRing = true
    if (this.state === 'app') this.runtime.close()
    if (this.state !== 'boot' && this.state !== 'shutdown') this.state = 'ringing'
    this.deps.audio.unlock()
    if (this.silent) {
      // 振动提示：低频短 buzz 连串（真机静音来电）
      const buzz = setInterval(() => {
        this.deps.audio.tone(58, 0.16, { type: 'square', gain: 0.85 })
      }, 850)
      this.incomingIntervals.push(buzz)
    } else {
      const file = RINGTONE_NAMES[this.ringtoneIdx]?.file ?? RINGTONE_NAMES[1]!.file
      if (this.deps.audio.hasFile(file)) {
        this.ringStop = this.deps.audio.playFile(file, { loop: true, volume: 0.75 })
      } else {
        // 回落：合成铃声循环
        const tune = RINGTONES[this.ringtoneIdx] ?? RINGTONES[1]!
        const play = () => this.deps.audio.melody(tune, 200)
        play()
        this.incomingIntervals.push(setInterval(play, 2400))
      }
    }
    this.incomingIntervals.push(setInterval(() => {
      if (this.incomingRing && this.state === 'ringing') this.draw()
    }, 500))
    this.incomingTimeouts.push(setTimeout(() => {
      if (this.incomingRing) this.rejectCall(true)
    }, 15000))
    this.draw()
  }

  private onRingingTap(x: number, y: number) {
    if (y > H - 100 && y < H - 44) {
      if (x > 28 && x < 148) this.answerCall()
      else if (x > W - 148 && x < W - 28) this.rejectCall(false)
    }
  }

  private onInCallTap(x: number, y: number) {
    if (this.ic.tap(x, y)) return
    if (y > H - 100 && y < H - 44 && Math.abs(x - (W >> 1)) < 70) this.endInCall()
  }

  private answerCall() {
    this.stopIncomingRing()
    this.callSecs = 0
    this.ic.reset()
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

  /** 拒接/超时：timeout=true 播放漏接提示音 */
  private rejectCall(timeout: boolean) {
    const inc = this.incoming
    this.stopIncomingRing()
    if (inc) {
      void this.recordCall({ tel: inc.tel, name: inc.name ?? '', dir: 'in', dur: 0, missed: true })
      void this.addMissedNotif(inc, timeout)
    }
    this.incoming = null
    this.enterHome()
  }

  private endInCall() {
    const inc = this.incoming
    for (const t of this.incomingIntervals.splice(0)) clearInterval(t)
    for (const t of this.incomingTimeouts.splice(0)) clearTimeout(t)
    if (inc) {
      void this.recordCall({ tel: inc.tel, name: inc.name ?? '', dir: 'in', dur: this.callSecs, missed: false })
    }
    this.incoming = null
    this.ic.reset()
    this.enterHome()
  }

  /** 漏接通知：写入持久额外条目 + 超时自动响 F1_MissedCall */
  private async addMissedNotif(inc: { tel: string; name?: string }, playSound: boolean) {
    const extra = (await this.deps.store.get<Notif[]>('notif:extra')) ?? []
    extra.push({
      id: `missed-${Date.now()}`,
      kind: 'missed',
      title: inc.name ?? inc.tel,
      text: androidStrings(this.deps.lang.get()).shadeMissedCall,
      ts: Date.now(),
    })
    while (extra.length > 20) extra.shift()
    await this.deps.store.set('notif:extra', extra)
    await this.rebuildNotifs()
    if (playSound && !this.silent) {
      this.deps.audio.unlock()
      if (this.deps.audio.hasFile(NOTIFY_FILES.missedCall))
        this.deps.audio.playFile(NOTIFY_FILES.missedCall, { volume: 0.6 })
    }
  }

  private stopIncomingRing() {
    this.incomingRing = false
    this.ringStop?.()
    this.ringStop = null
    for (const t of this.incomingIntervals.splice(0)) clearInterval(t)
    for (const t of this.incomingTimeouts.splice(0)) clearTimeout(t)
  }

  injectSms(from: string, text: string) {
    void this.deliverIncoming(from, text)
  }

  private async deliverIncoming(from: string, text: string) {
    const inbox = (await this.deps.store.get<AMsg[]>('messages:inbox')) ?? []
    inbox.push({ id: Date.now(), from, text, ts: Date.now(), read: false, mine: false })
    await this.deps.store.set('messages:inbox', inbox)
    this.unread = true
    if (this.powered && this.state !== 'off' && this.state !== 'boot') {
      await this.rebuildNotifs()
      if (!this.silent) {
        this.deps.audio.unlock()
        if (this.deps.audio.hasFile(NOTIFY_FILES.sms)) {
          this.deps.audio.playFile(NOTIFY_FILES.sms, { volume: 0.5 })
        } else {
          this.deps.audio.melody(SMS_ALERT, 320)
        }
      }
      if (this.state !== 'app') this.draw()
    }
  }

  private async recordCall(e: Omit<CallEntry, 'id' | 'ts'>) {
    const log = (await this.deps.store.get<CallEntry[]>('calllog')) ?? []
    log.push({ ...e, id: Date.now(), ts: Date.now() })
    while (log.length > 30) log.shift()
    await this.deps.store.set('calllog', log)
  }

  // ---------- 抽屉几何 ----------

  private drawerArea() {
    const top = STATUS_H + GRIP_H + 6
    const avail = H - top - 6
    const content = Math.ceil(APPS.length / DRAWER_COLS) * DRAWER_ROW_H
    const maxScroll = Math.max(0, content - avail)
    return { top, avail, content, maxScroll }
  }

  private drawerCellAt(x: number, y: number): number {
    const { top, avail } = this.drawerArea()
    if (y < top || y > top + avail) return -1
    const col = Math.floor(x / (W / DRAWER_COLS))
    const localY = y - top + this.drawerScroll
    const row = Math.floor(localY / DRAWER_ROW_H)
    if (col < 0 || col >= DRAWER_COLS || row < 0) return -1
    const idx = row * DRAWER_COLS + col
    return idx < APPS.length ? idx : -1
  }

  private drawerInput(key: DeviceKey) {
    const n = APPS.length
    const rows = Math.ceil(n / DRAWER_COLS)
    let moved = false
    switch (key) {
      case 'left':
        this.drawerSel = (this.drawerSel + n - 1) % n
        moved = true
        break
      case 'right':
        this.drawerSel = (this.drawerSel + 1) % n
        moved = true
        break
      case 'up':
        this.drawerSel = (this.drawerSel + n - DRAWER_COLS) % n
        moved = true
        break
      case 'down':
        this.drawerSel = (this.drawerSel + DRAWER_COLS) % n
        moved = true
        break
      case 'ok':
        this.launch(APPS[this.drawerSel]!)
        return
      case 'back':
      case 'home':
        this.closeDrawer()
        return
      default:
        return
    }
    void rows
    if (moved) {
      this.ensureSelVisible()
      this.draw()
    }
  }

  /** 选中行滚出可视区时自动滚动 */
  private ensureSelVisible() {
    const { avail, maxScroll } = this.drawerArea()
    const row = Math.floor(this.drawerSel / DRAWER_COLS)
    const y0 = row * DRAWER_ROW_H
    const y1 = y0 + DRAWER_ROW_H
    if (y0 < this.drawerScroll) this.drawerScroll = y0
    else if (y1 > this.drawerScroll + avail)
      this.drawerScroll = Math.min(maxScroll, y1 - avail)
  }

  private openDrawer() {
    this.drawerSel = 0
    this.drawerScroll = 0
    const from = this.drawerP
    this.fx.run(220, (p) => {
      this.drawerP = from + (1 - from) * p
      this.draw()
    })
  }

  private closeDrawer() {
    const from = this.drawerP
    this.fx.run(200, (p) => {
      this.drawerP = from * (1 - p)
      this.draw()
    })
  }

  private openShade() {
    this.state = 'shade'
    this.shadeP = 0
    this.fx.run(200, (p) => {
      this.shadeP = p
      this.draw()
    })
  }

  private closeShade() {
    const from = this.shadeP
    this.fx.run(
      180,
      (p) => {
        this.shadeP = from * (1 - p)
        this.draw()
      },
      () => {
        this.shadeP = 0
        this.state = 'home'
        this.draw()
      },
    )
  }

  private gotoPage(p: number) {
    const dir = p > this.page ? -W : W
    this.fx.run(
      190,
      (q) => {
        this.dragOX = dir * q
        this.draw()
      },
      () => {
        this.page = p
        this.dragOX = 0
        void this.deps.store.set('launcher:page', p)
        this.draw()
      },
    )
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.deps.screen
    switch (this.state) {
      case 'off':
        this.drawOff()
        return
      case 'boot':
        return
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
      case 'shade':
        this.drawHomeBase(0, true)
        this.drawShadePanel()
        break
      case 'dialog':
        this.drawHomeBase(0, true)
        this.drawDialog()
        break
      case 'menu':
        this.drawHomeBase(0, true)
        this.drawHomeMenu()
        break
      case 'search':
        this.drawHomeBase(0, true)
        this.drawSearchSheet()
        break
      case 'home':
        this.drawHomeBase(this.dragOX)
        break
      case 'app':
      case 'shutdown':
        return
    }
    s.render()
  }

  /** 开机动画第二阶段的合成画布 */
  private bootCanvas: HTMLCanvasElement | null = null
  private bootAlpha: HTMLCanvasElement | null = null
  private bootShineCvs: HTMLCanvasElement | null = null

  private drawBoot(t: number) {
    const s = this.deps.screen
    s.clear()
    s.fillRect(0, 0, W, H, C.BAR)
    if (t < BOOT_SPLASH_S) {
      // 真机第一屏：黑底白色「T·Mobile」小字 + 大号几何「G1」logo，logo 由小放大
      const p = Math.min(1, t / 0.7)
      const scale = 0.55 + 0.45 * p
      const cx = W >> 1
      const cy = H >> 1
      const g1Size = Math.round(72 * scale)
      const subSize = Math.max(9, Math.round(15 * scale))
      const sub = 'T · Mobile'
      const subW = s.measure(sub, { size: subSize })
      const g1 = 'G1'
      const g1W = s.measure(g1, { size: g1Size })
      s.text(Math.round(cx - subW / 2), cy - g1Size - 4, sub, { size: subSize, color: C.WHITE })
      s.text(Math.round(cx - g1W / 2), cy, g1, { size: g1Size, color: C.WHITE })
      s.render()
      return
    }
    const bt = t - BOOT_SPLASH_S
    const mask = assets.fw('bootMask')
    const shine = assets.fw('bootShine')
    if (mask && shine) {
      const a = (this.bootAlpha ??= document.createElement('canvas'))
      if (a.width !== 256 || a.height !== 64) {
        a.width = 256
        a.height = 64
        const ag = a.getContext('2d')!
        ag.drawImage(mask, 0, 0, 256, 64)
        const img = ag.getImageData(0, 0, 256, 64)
        for (let i = 0; i < img.data.length; i += 4) {
          // 真机 mask 的字母是青色（红低、绿蓝满），取三色最大作亮度，
          // 不能只取红通道——否则字标被烘焙成 ~0.82 alpha，上屏发灰
          const lum = Math.max(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)
          img.data[i] = 255
          img.data[i + 1] = 255
          img.data[i + 2] = 255
          img.data[i + 3] = lum
        }
        ag.putImageData(img, 0, 0)
      }
      const c = (this.bootCanvas ??= document.createElement('canvas'))
      if (c.width !== 256 || c.height !== 64) {
        c.width = 256
        c.height = 64
      }
      const g = c.getContext('2d')!
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.clearRect(0, 0, 256, 64)
      g.globalAlpha = Math.min(1, bt / 0.4)
      g.drawImage(a, 0, 0)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      // 高光处理：真机 shine 是黑底斜白带、加性叠加。素材底色偏青，
      // 提取亮度作 alpha 的纯白图，仅让亮带在字标上扫过（source-over 不染色）
      const sc2 = (this.bootShineCvs ??= document.createElement('canvas'))
      const sb = shine as ImageBitmap
      if (sc2.width !== sb.width || sc2.height !== sb.height) {
        sc2.width = sb.width
        sc2.height = sb.height
        const sg = sc2.getContext('2d')!
        sg.drawImage(sb, 0, 0)
        const sim = sg.getImageData(0, 0, sc2.width, sc2.height)
        for (let i = 0; i < sim.data.length; i += 4) {
          const lum = Math.max(sim.data[i]!, sim.data[i + 1]!, sim.data[i + 2]!)
          // 压掉偏青底色（~110），仅亮带显形
          const a2 = Math.max(0, Math.min(255, ((lum - 150) / 105) * 255))
          sim.data[i] = 255
          sim.data[i + 1] = 255
          sim.data[i + 2] = 255
          sim.data[i + 3] = a2
        }
        sg.putImageData(sim, 0, 0)
      }
      const PERIOD = 1.7
      const p = (bt % PERIOD) / PERIOD
      const sxPos = -sc2.width / 2 + p * (sc2.width * 1.5)
      g.drawImage(sc2, sxPos, 0)
      s.blit(c, 32, 200, { w: 256, h: 64, smooth: true })
    } else {
      const word = 'ANDROID'
      const size = 34
      let x = (W >> 1) - 116
      const litFrom = bt / 0.18
      for (let i = 0; i < word.length; i++) {
        const ch = word[i]!
        s.text(x, (H >> 1) - 24, ch, { size, color: i < litFrom ? C.WHITE : C.GRAY })
        x += s.measure(ch, { size }) + 2
      }
      const cursorFrom = word.length * 0.18 + 0.2
      if (bt > cursorFrom && Math.floor((bt - cursorFrom) / 0.5) % 2 === 0) {
        s.fillRect(x + 6, (H >> 1) + 2, 22, 5, C.WHITE)
      }
    }
    s.render()
  }

  /** 壁纸：0 = 真机默认；1/2 = 配色主题；3 = 用户照片 */
  private drawWallpaper(s: Screen) {
    const wp = this.wallpaper
    const real = assets.fw('wallpaper')
    if (wp === 0 && real) {
      s.blitBg(real, 0, STATUS_H, { w: W, h: H - STATUS_H })
      return
    }
    if (wp === 3) {
      // 用户照片壁纸（异步位图由 drawWallpaperPhoto 缓存，此处回落默认壁纸）
      if (real) s.blitBg(real, 0, STATUS_H, { w: W, h: H - STATUS_H })
      return
    }
    const themes: Array<[number, number]> = [
      [C.NAVY, C.BLUE],
      [C.DGREEN, C.GREEN],
      [C.BAR, C.GRAY],
    ]
    const [base, stripe] = themes[wp] ?? themes[0]!
    s.fillRect(0, STATUS_H, W, H - STATUS_H, base)
    for (let y = STATUS_H + 36; y < H - 40; y += 56) {
      s.fillRect(0, y, W, 3, stripe)
      s.fillRect(0, y + 8, W, 1, stripe)
    }
  }

  /**
   * 主屏底子：状态栏 + 壁纸 + 三屏条目 + 页码 + 握把（drawerP>0 时叠加抽屉）。
   * ox = 工作区横向偏移（跟手拖拽 / 切页动画）。
   */
  private drawHomeBase(ox: number, hideStatus = false) {
    const s = this.deps.screen
    const d = new Date()
    const str = androidStrings(this.deps.lang.get())
    s.clear()
    if (hideStatus) {
      // 通知栏模式：状态栏图标是 overlay，会浮在面板之上——只画底色，面板自己带头
      s.fillRect(0, 0, W, STATUS_H, C.BAR)
    } else {
      statusBar(s, {
        unread: this.unread,
        batteryPct: this.deps.battery.percent,
        carrier: str.carrier,
        clock: this.clockStr(d),
        signalBars: 4,
        silent: this.silent,
      })
    }
    this.drawWallpaper(s)
    // 三屏内容（通知模式跳过：条目图标等全彩 overlay 会浮在面板之上；面板不透明，壁纸保留）
    if (!hideStatus) {
      for (let p = 0; p < 3; p++) {
        const px = (p - this.page) * W + ox
        if (px >= W || px <= -W) continue
        this.drawPage(p, px)
      }
    }
    // 抽屉
    if (this.drawerP > 0) {
      this.drawDrawerPanel()
      return
    }
    // 页码小点
    const dy = H - GRIP_H - 15
    for (let p = 0; p < 3; p++) {
      const on = p === this.page
      for (let dy2 = -2; dy2 <= 2; dy2++)
        for (let dx2 = -2; dx2 <= 2; dx2++)
          if (dx2 * dx2 + dy2 * dy2 <= 4)
            s.pset((W >> 1) - 12 + p * 12 + dx2, dy + dy2, on ? C.WHITE : C.METAL)
    }
    // 底部握把
    this.drawGrip(H - GRIP_H, false)
  }

  /** 画一屏的全部条目，px = 该屏左上角的横向坐标 */
  private drawPage(p: number, px: number) {
    for (const it of this.items.filter((i) => i.page === p)) {
      const cx = px + it.gx * 80 + it.gw * 40
      if (it.kind === 'clock') {
        // 2×2 大表盘挂件（默认件与新增件同法）；1×1 小表盘
        const big = it.gh === 2
        const cy = big
          ? STATUS_H + 110 + it.gy * 96
          : (ROW_CENTERS[Math.min(it.gy, 3)] ?? STATUS_H + 110)
        this.drawMalmo(cx, cy, big ? 46 : 30)
      } else if (it.kind === 'search') {
        this.drawSearchBar(px + 20, ROW_CENTERS[it.gy] ?? STATUS_H + 236)
      } else if (it.kind === 'frame') {
        this.drawPictureFrame(cx, ROW_CENTERS[it.gy] ?? STATUS_H + 200, it.ref)
      } else {
        const cy = ROW_CENTERS[it.gy] ?? STATUS_H + 44
        this.drawShortcutIcon(it, cx, cy)
      }
    }
  }

  /** MALMO 真机表盘（程序生成）：金属圈 + 白盘 + 阿拉伯数字 + 黑指针 + 秒针 */
  private drawMalmo(cx: number, cy: number, R: number) {
    const s = this.deps.screen
    // 金属圈（光来自左上：三档灰）+ 白盘
    for (let dy = -R - 6; dy <= R + 6; dy++)
      for (let dx = -R - 6; dx <= R + 6; dx++) {
        const r = Math.sqrt(dx * dx + dy * dy)
        if (r > R + 6) continue
        if (r <= R - 1) {
          if (r > R - 5) {
            // 内沿阴影
            s.pset(cx + dx, cy + dy, r > R - 3 ? C.PALE : C.WHITE)
          } else s.pset(cx + dx, cy + dy, C.WHITE)
        } else {
          // 金属圈：按法线与光源方向取亮度
          const nx = dx / r
          const ny = dy / r
          const lit = 0.55 - nx * 0.42 - ny * 0.5
          s.pset(cx + dx, cy + dy, lit > 0.72 ? C.PALE : lit > 0.4 ? C.GRAY : C.METAL)
        }
      }
    // 刻度
    for (let a = 0; a < 60; a++) {
      const ang = (a / 60) * Math.PI * 2
      const hour = a % 5 === 0
      const r1 = R - (hour ? 9 : 5)
      const r0 = R - 2
      const steps = Math.max(1, Math.round(r0 - r1))
      for (let t = 0; t <= steps; t++) {
        const rr = r1 + t
        const w = hour ? 2 : 1
        for (let ww = 0; ww < w; ww++) {
          const pxv = cx + Math.sin(ang) * rr + (ww - (w - 1) / 2) * Math.cos(ang)
          const pyv = cy - Math.cos(ang) * rr + (ww - (w - 1) / 2) * Math.sin(ang)
          s.pset(Math.round(pxv), Math.round(pyv), C.INK)
        }
      }
    }
    // 阿拉伯数字
    const nums = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    nums.forEach((n, i) => {
      const ang = (i / 12) * Math.PI * 2
      const rr = R - 20
      const t = String(n)
      const w = s.measure(t, { size: R > 40 ? 11 : 8 })
      const h = R > 40 ? 9 : 6
      s.text(
        Math.round(cx + Math.sin(ang) * rr - w / 2),
        Math.round(cy - Math.cos(ang) * rr - h / 2),
        t,
        { size: R > 40 ? 11 : 8, color: C.INK },
      )
    })
    // MALMO 小字（12 与 6 之间的真机字样）
    if (R > 40) s.textCenter(cx, cy + 11, 'MALMO', { size: 7, color: C.METAL })
    // 黑色锥形指针（真机 MALMO 样式；调色板内绘制，不用白色 hand PNG）
    const d = new Date()
    const min = d.getMinutes() + d.getSeconds() / 60
    const hr = (d.getHours() % 12) + min / 60
    taperedHand(s, cx, cy, (hr / 12) * Math.PI * 2, R * 0.56, R > 40 ? 4 : 3)
    taperedHand(s, cx, cy, (min / 60) * Math.PI * 2, R * 0.8, R > 40 ? 3 : 2)
    // 秒针 + 中心轴
    const sec = d.getSeconds()
    const sa = (sec / 60) * Math.PI * 2
    for (let t = -4; t <= R - 7; t++) {
      s.pset(Math.round(cx + Math.sin(sa) * t), Math.round(cy - Math.cos(sa) * t), C.INK)
    }
    s.fillRect(cx - 2, cy - 2, 5, 5, C.INK)
    s.pset(cx, cy, C.PALE)
  }

  /** Google 搜索挂件：白底圆角 + 彩色 g + 灰字 + 右侧 Search 按钮 */
  private drawSearchBar(x: number, cy: number) {
    const s = this.deps.screen
    const str = androidStrings(this.deps.lang.get())
    const w = W - 40
    const h = 38
    roundRect(s, x, cy - (h >> 1), w, h, 7, C.WHITE, C.PALE)
    s.blit(googleG(), x + 8, cy - 9, { w: 18, h: 18 })
    s.text(x + 32, cy - 5, clipToWidth(s, str.searchWidget.replace('Google', '').trim(), w - 100, 12), { size: 12, color: C.GRAY })
    // 右侧 Search 按钮
    roundRect(s, x + w - 62, cy - 11, 52, 22, 4, C.PALE, C.GRAY)
    s.textCenter(x + w - 36, cy - 5, str.dSearchBtn, { size: 10, color: C.INK })
  }

  /** 相框条目：边框 + 照片（相机照片 / 壁纸中心） */
  private drawPictureFrame(cx: number, cy: number, ref?: string) {
    const s = this.deps.screen
    const w = 150
    const h = 110
    roundRect(s, cx - (w >> 1) - 3, cy - (h >> 1) - 3, w + 6, h + 6, 6, C.GRAY, C.PALE)
    if (ref && ref !== 'wallpaper') {
      // 相机照片位图在 pictures 应用内管理，这里程序绘制占位
      s.fillRect(cx - (w >> 1), cy - (h >> 1), w, h, C.PANEL)
      s.textCenter(cx, cy - 4, '🖼', { size: 26, color: C.GRAY })
    } else {
      const wp = assets.fw('wallpaper')
      if (wp) {
        s.blit(wp, cx - (w >> 1), cy - (h >> 1), {
          w, h, sx: 80 + (480 - w) / 2, sy: (480 - h) / 2, sw: w, sh: h, smooth: true,
        })
      } else s.fillRect(cx - (w >> 1), cy - (h >> 1), w, h, C.NAVY)
    }
  }

  /** 桌面快捷图标（真机：图标 + 深色半透明标签胶囊） */
  private drawShortcutIcon(it: HomeItem, cx: number, cy: number) {
    const s = this.deps.screen
    const en = this.deps.lang.get() === 'en'
    let label = ''
    if (it.kind === 'app') {
      const app = APPS.find((a) => a.id === it.ref)
      if (!app) return
      const aIcon = assets.icon(DRAWER_ICON_MAP[app.id] ?? '')
      const img = aIcon ?? assets.icon(app.nameEn ?? app.name)
      if (img) s.blit(img, cx - 24, cy - 32)
      else app.icon?.(s, cx - 14, cy - 14)
      label = en ? app.nameEn ?? app.name : app.name
    } else {
      const c = this.contacts.find((c) => c.tel === it.ref)
      if (!c) return
      // 联系人快捷：灰底人像圆 + 名称
      for (let dy = -22; dy <= 22; dy++)
        for (let dx = -22; dx <= 22; dx++)
          if (dx * dx + dy * dy <= 22 * 22) s.pset(cx + dx, cy - 10 + dy, C.GRAY)
      label = c.name
    }
    // 真机标签：直接白字（下衬黑阴影保证壁纸花时可读），无胶囊底
    const clipped = clipToWidth(s, label, 76, 11)
    s.textCenter(cx + 1, cy + 21, clipped, { size: 11, color: C.BG })
    s.textCenter(cx, cy + 20, clipped, { size: 11, color: C.WHITE })
  }

  /** 命中测试：当前页 (x,y) 是否落在某个条目上 */
  private itemAt(x: number, y: number): HomeItem | null {
    for (const it of this.items.filter((i) => i.page === this.page)) {
      const cx = it.gx * 80 + it.gw * 40
      if (it.kind === 'clock') {
        const big = it.gh === 2
        const cy = big
          ? STATUS_H + 110 + it.gy * 96
          : ROW_CENTERS[Math.min(it.gy, 3)]!
        const R = big ? 46 : 30
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= (R + 6) * (R + 6)) return it
      } else if (it.kind === 'search') {
        const cy = ROW_CENTERS[it.gy]!
        if (x >= 20 && x <= W - 20 && Math.abs(y - cy) <= 22) return it
      } else if (it.kind === 'frame') {
        const cy = ROW_CENTERS[it.gy]!
        if (Math.abs(x - cx) <= 78 && Math.abs(y - cy) <= 58) return it
      } else {
        const cy = ROW_CENTERS[it.gy]!
        if (Math.abs(x - cx) <= 36 && y >= cy - 34 && y <= cy + 36) return it
      }
    }
    return null
  }

  /** 握把（真机 1.0 灰色 tab：三道杠 + 中央三角箭头）；down=true 显示向下箭头 */
  private drawGrip(top: number, down: boolean) {
    const s = this.deps.screen
    const x0 = (W - GRIP_W) >> 1
    // 金属灰握把（与抽屉顶握把同款：金属填充 + 浅边描边）
    roundRect(s, x0, top, GRIP_W, GRIP_H, 7, C.METAL, C.PALE)
    // 左右各三道杠
    for (let i = 0; i < 3; i++) {
      s.fillRect(x0 + 14, top + 8 + i * 6, 13, 2, C.PALE)
      s.fillRect(x0 + GRIP_W - 27, top + 8 + i * 6, 13, 2, C.PALE)
    }
    // 中央三角箭头（真机握把无圆环，只有三角指示滑动方向）
    const cx = W >> 1
    const cy = top + (GRIP_H >> 1)
    if (down) {
      // 向下实心三角
      for (let yy = 0; yy <= 7; yy++) {
        const ww = 7 - yy
        s.fillRect(cx - ww, cy - 4 + yy, ww * 2 + 1, 2, C.GRAY)
      }
    } else {
      // 向上实心三角
      for (let yy = 0; yy <= 7; yy++) {
        const ww = yy
        s.fillRect(cx - ww, cy + 3 - yy, ww * 2 + 1, 2, C.GRAY)
      }
    }
  }

  /** 抽屉面板：碳纤维底 + 图标网格（随 drawerP 从底部滑入） */
  private drawDrawerPanel() {
    const s = this.deps.screen
    const panelTop = Math.round(H + this.drawerP * (STATUS_H - H))
    s.blit(carbonCanvas(), 0, panelTop, { w: W, h: H - STATUS_H })
    // 网格内容（面板本地坐标；panelTop 为面板上沿绝对坐标）
    const localGrid = GRIP_H + 6
    const { avail } = this.drawerArea()
    const en = this.deps.lang.get() === 'en'
    APPS.forEach((app, i) => {
      const col = i % DRAWER_COLS
      const row = Math.floor(i / DRAWER_COLS)
      const cx = col * (W / DRAWER_COLS) + W / DRAWER_COLS / 2
      const cyLocal = localGrid + row * DRAWER_ROW_H - this.drawerScroll + (DRAWER_ROW_H >> 1)
      const cy = panelTop + cyLocal
      if (cyLocal < localGrid - 40 || cyLocal > avail + 40) return
      const aIcon = assets.icon(DRAWER_ICON_MAP[app.id] ?? '')
      const img = aIcon ?? assets.icon(app.nameEn ?? app.name)
      if (img) {
        s.blit(img, Math.round(cx - 24), cy - 30)
      } else app.icon?.(s, Math.round(cx - 14), cy - 14)
    })
    // 前景 chrome（握把/聚焦框/标签/滚动条）必须与碳纤维同为全彩 overlay：
    // 调色板层在 overlay 之下，会被不透明的碳纤维盖住
    s.blit(this.buildDrawerChrome(panelTop, localGrid, avail, en), 0, 0, { w: W, h: H, smooth: true })
  }

  private drawerChromeCvs: HTMLCanvasElement | null = null
  /** 构建抽屉前景全彩画布（握把 + 橙色聚焦框 + 白字标签 + 滚动条） */
  private buildDrawerChrome(
    panelTop: number, localGrid: number, avail: number, en: boolean,
  ): HTMLCanvasElement {
    // 2× 超采样：握把/聚焦框/标签在高分画布上绘制，blit 时缩回逻辑尺寸，
    // 抵消最终 1.1 放大导致的白字发软（真机标签是实心纯白）
    const SS = 2
    const c = (this.drawerChromeCvs ??= document.createElement('canvas'))
    if (c.width !== W * SS || c.height !== H * SS) {
      c.width = W * SS
      c.height = H * SS
    }
    const g = c.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.scale(SS, SS)
    // ---- 握把（panelTop 处） ----
    const gx = (W - GRIP_W) >> 1
    rrPath(g, gx, panelTop, GRIP_W, GRIP_H, 7)
    g.fillStyle = '#6f6f6f'
    g.fill()
    g.strokeStyle = '#cccccc'
    g.lineWidth = 1
    g.stroke()
    g.fillStyle = '#cccccc'
    for (let i = 0; i < 3; i++) {
      g.fillRect(gx + 14, panelTop + 8 + i * 6, 13, 2)
      g.fillRect(gx + GRIP_W - 27, panelTop + 8 + i * 6, 13, 2)
    }
    const ccx = W >> 1
    const ccy = panelTop + (GRIP_H >> 1)
    g.beginPath()
    g.arc(ccx, ccy, 8.5, 0, Math.PI * 2)
    g.stroke()
    // 向下三角
    g.fillStyle = '#4a4a4a'
    g.beginPath()
    g.moveTo(ccx - 6, ccy - 3)
    g.lineTo(ccx + 6, ccy - 3)
    g.lineTo(ccx, ccy + 5)
    g.closePath()
    g.fill()
    // ---- 网格聚焦框 + 标签 ----
    const fam = this.deps.profile.screen.fontFamily ?? 'sans-serif'
    g.font = `13px ${fam}`
    g.textAlign = 'center'
    g.textBaseline = 'top'
    // 真机标签带细微深色投影（压在碳纤维上，字更清晰）
    g.shadowColor = 'rgba(0,0,0,0.7)'
    g.shadowBlur = 2
    g.shadowOffsetX = 1
    g.shadowOffsetY = 1
    APPS.forEach((app, i) => {
      const col = i % DRAWER_COLS
      const row = Math.floor(i / DRAWER_COLS)
      const cx = col * (W / DRAWER_COLS) + W / DRAWER_COLS / 2
      const cyLocal = localGrid + row * DRAWER_ROW_H - this.drawerScroll + (DRAWER_ROW_H >> 1)
      const cy = panelTop + cyLocal
      if (cyLocal < localGrid - 40 || cyLocal > avail + 40) return
      if (this.drawerP === 1 && i === this.drawerSel) {
        rrPath(g, Math.round(cx - 37), cy - 31, 74, 64, 10)
        g.strokeStyle = '#ff9b00'
        g.lineWidth = 2
        g.stroke()
      }
      const label = clipToWidth(this.deps.screen, en ? app.nameEn ?? app.name : app.name, 76, 13)
      g.fillStyle = '#ffffff'
      g.fillText(label, Math.round(cx), cy + 22)
    })
    g.shadowColor = 'transparent'
    g.shadowBlur = 0
    g.shadowOffsetX = 0
    g.shadowOffsetY = 0
    // ---- 滚动条 ----
    if (this.drawerP === 1) {
      const { maxScroll, content } = this.drawerArea()
      if (maxScroll > 0) {
        const thumbH = Math.max(24, Math.round((avail * avail) / content))
        const absTop = STATUS_H + localGrid
        const ty = absTop + Math.round((this.drawerScroll / maxScroll) * (avail - thumbH))
        g.fillStyle = '#ff9b00'
        g.fillRect(W - 5, ty, 3, thumbH)
      }
    }
    return c
  }

  /** 锁屏：深色圆角信息面板浮在暗底上（真机 1.0） */
  /** Pictures 设置的锁屏照片（仅内存，id 持久化在 lock:photoid） */
  private lockPhoto: HTMLCanvasElement | null = null

  private drawLock() {
    const s = this.deps.screen
    const str = androidStrings(this.deps.lang.get())
    const d = new Date()
    s.clear()
    statusBar(s, {
      unread: this.unread,
      batteryPct: this.deps.battery.percent,
      carrier: str.carrier,
      clock: this.clockStr(d),
      signalBars: 4,
      silent: this.silent,
    })
    // 调暗的桌面：锁屏照片（Pictures 设置）或纯色暗底
    if (this.lockPhoto)
      s.blit(this.lockPhoto, 0, STATUS_H, { w: W, h: H - STATUS_H, smooth: false })
    else s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    // 信息面板
    roundRect(s, 20, 116, W - 40, 218, 14, C.PANEL, C.METAL)
    s.textCenter(W >> 1, 134, str.carrier, { size: 14, color: C.WHITE })
    s.fillRect(40, 156, W - 80, 1, C.METAL)
    s.textCenter(W >> 1, 168, this.clockStr(d).replace(' AM', '').replace(' PM', ''), { size: 38, color: C.WHITE })
    s.textCenter(W >> 1, 224, str.lockDate(d), { size: 14, color: C.PALE })
    let ly = 254
    if (this.deps.battery.charging) {
      s.textCenter(W >> 1, ly, str.lockCharging, { size: 12, color: C.GREEN })
      ly += 22
    }
    const na = this.nextAlarm()
    if (na) {
      const t = `${String(na.h).padStart(2, '0')}:${String(na.m).padStart(2, '0')}`
      s.textCenter(W >> 1, ly, str.lockNextAlarm(t), { size: 12, color: C.AMBER })
    }
    roundRect(s, (W - 232) >> 1, H - 72, 232, 32, 9, C.PANEL, C.METAL)
    s.textCenter(W >> 1, H - 63, str.lockHint(this.lockStage), { size: 11, color: C.WHITE })
    s.render()
  }

  /** 通知面板（下拉；高度随 shadeP 跟手） */
  private drawShadePanel() {
    const s = this.deps.screen
    const str = androidStrings(this.deps.lang.get())
    const d = new Date()
    const ph = Math.round(this.shadeP * SHADE_MAX)
    if (ph < 8) return
    // 面板底（深灰）
    s.fillRect(0, 0, W, ph, C.PANEL)
    // 头部：完整日期 + 清除按钮
    s.fillRect(0, 0, W, 34, C.INK)
    s.text(8, 9, clipToWidth(s, str.shadeFullDate(d), W - 118, 11), { size: 11, color: C.WHITE })
    roundRect(s, W - 108, 5, 100, 24, 5, C.METAL, null)
    s.textCenter(W - 58, 10, str.shadeClearAll, { size: 10, color: C.WHITE })
    // Notifications 分区
    s.fillRect(0, 36, W, 22, C.INK)
    s.text(8, 41, str.shadeNotifications, { size: 11, color: C.PALE })
    if (this.notifs.length) {
      this.notifs.forEach((n, i) => {
        const y = 62 + i * 58
        if (y + 50 > ph) return
        // 图标
        if (n.kind === 'sms') {
          const img = assets.fw('notifySms')
          if (img) s.blit(img, 6, y - 4, { w: 24, h: 24 })
          else s.fillRect(8, y, 20, 16, C.GREEN)
        } else if (n.kind === 'download') {
          // 托盘 + 向下箭头
          roundRect(s, 8, y, 20, 17, 3, C.AMBER, null)
          s.fillRect(16, y + 4, 4, 7, C.INK)
          s.pset(17, y + 13, C.INK); s.pset(18, y + 12, C.INK); s.pset(19, y + 13, C.INK)
        } else {
          const img = assets.fw('notifyMissedCall')
          if (img) s.blit(img, 6, y - 4, { w: 24, h: 24 })
          else s.fillRect(8, y, 20, 16, C.BLUE)
        }
        s.text(36, y, clipToWidth(s, n.title, W - 80, 13), { size: 13, color: C.WHITE })
        s.textRight(W - 8, y + 1, agoStr(n.ts, this.deps.lang.get() === 'en'), { size: 9, color: C.GRAY })
        s.text(36, y + 22, clipToWidth(s, n.text, W - 44, 10), { size: 10, color: C.PALE })
        s.fillRect(8, y + 46, W - 16, 1, C.INK)
      })
    } else {
      s.textCenter(W >> 1, 110, str.shadeEmpty, { size: 13, color: C.GRAY })
    }
  }

  private shadeTap(x: number, y: number) {
    // 清除按钮
    if (y < 32 && x >= W - 110) {
      void this.clearAllNotifications().then(() => this.draw())
      return
    }
    // 通知条目
    for (let i = 0; i < this.notifs.length; i++) {
      const ry = 62 + i * 58
      if (y >= ry - 4 && y < ry + 46) {
        const n = this.notifs[i]!
        if (n.kind === 'sms') this.launch(messagesApp)
        else if (n.kind === 'download') this.launch(marketApp)
        else this.launch(dialerApp)
        return
      }
    }
    // 点面板外（手势已结束时不可能发生）；下拖关闭由手势处理
  }

  /** 对话框：暗遮罩 + 底部白色工作表（灰标题 + 橙色选中） */
  private drawDialog() {
    const s = this.deps.screen
    const top = this.dlgStack[this.dlgStack.length - 1]
    if (!top) return
    s.fillRect(0, 0, W, H, C.BAR)
    // 几何须与 dialogTap 的 sheetH 一致
    const sheetH = Math.min(H - 80, 56 + top.items.length * 46 + 10)
    const y0 = H - sheetH
    roundRect(s, 6, y0, W - 12, sheetH, 10, C.WHITE, C.GRAY)
    // 标题栏（真机灰底白字）
    roundRect(s, 6, y0, W - 12, 40, 10, C.METAL, null)
    s.fillRect(6, y0 + 24, W - 12, 16, C.METAL)
    s.text(16, y0 + 11, top.title, { size: 15, color: C.WHITE })
    top.items.forEach((it, i) => {
      const ry = y0 + 44 + i * 46
      if (i === this.dlgSel) {
        s.fillRect(10, ry - 2, W - 20, 40, C.ORANGE)
      }
      // 圆形单选点（Add 系列对话框）
      if (this.dlgStack.length === 1 || top.title.endsWith('…')) {
        const cy = ry + 16
        for (let dy = -7; dy <= 7; dy++)
          for (let dx = -7; dx <= 7; dx++) {
            const r = dx * dx + dy * dy
            if (r <= 49 && r >= 36)
              s.pset(20 + dx, cy + dy, i === this.dlgSel ? C.WHITE : C.GRAY)
          }
      }
      s.text(38, ry + 9, clipToWidth(s, it.label, W - 60, 13), {
        size: 13,
        color: i === this.dlgSel ? C.WHITE : C.INK,
      })
    })
  }

  /** 真机 1.0 主屏 MENU：底部深色面板 + 3 列大图标网格 + 白字标签，橙框聚焦 */
  private drawHomeMenu() {
    const s = this.deps.screen
    const items = this.menuItems()
    const top = H - MENU_GRID_H
    roundRect(s, 0, top, W, MENU_GRID_H, 12, C.PANEL, null)
    s.fillRect(0, top + 12, W, MENU_GRID_H - 12, C.PANEL)
    items.forEach((it, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const cx = Math.round(col * (W / 3) + W / 6)
      const cy = top + 14 + row * MENU_CELL_H
      if (i === this.menuSel) {
        roundRect(s, cx - 48, cy - 4, 96, MENU_CELL_H - 4, 8, C.ORANGE, null)
      }
      it.icon(s, cx - 19, cy + 4)
      s.textCenter(cx, cy + 48, clipToWidth(s, it.label, 92, 12), {
        size: 12,
        color: C.WHITE,
      })
    })
  }

  /** 真机 1.0 搜索对话框：标题 + Google g + 输入行 + Go */
  private drawSearchSheet() {
    const s = this.deps.screen
    const str = androidStrings(this.deps.lang.get())
    const top = SEARCH_SHEET_TOP
    roundRect(s, 6, top, W - 12, SEARCH_SHEET_H, 10, C.WHITE, C.GRAY)
    // 标题栏（真机灰底白字）
    roundRect(s, 6, top, W - 12, 26, 10, C.METAL, null)
    s.fillRect(6, top + 16, W - 12, 10, C.METAL)
    s.text(16, top + 6, str.searchHint, { size: 12, color: C.WHITE })
    // 输入行：Google g + 文本框 + Go
    const iy = top + 40
    roundRect(s, 14, iy, 30, 30, 6, C.BLUE, null)
    s.textCenter(29, iy + 7, 'g', { size: 16, color: C.WHITE })
    roundRect(s, 50, iy, W - 50 - 86, 30, 6, C.WHITE, C.GRAY)
    s.text(58, iy + 9, this.searchText || ' ', { size: 13, color: C.INK })
    if (this.searchText) {
      const w = s.measure(clipToWidth(s, this.searchText, W - 50 - 100, 13), { size: 13 })
      s.fillRect(58 + w, iy + 8, 2, 14, C.INK)
    }
    roundRect(s, W - 78, iy, 62, 30, 6, C.ORANGE, null)
    s.textCenter(W - 47, iy + 9, str.searchGo, { size: 13, color: C.WHITE })
  }

  /** 真机 AlarmAlert：深色屏 + 大时间 + 标签 + Snooze/Dismiss */
  private drawAlarm() {
    const s = this.deps.screen
    s.clear()
    const str = androidStrings(this.deps.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: this.unread,
      batteryPct: this.deps.battery.percent,
      carrier: str.carrier,
      clock: this.clockStr(d),
      signalBars: 4,
      silent: this.silent,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    const a = this.ringingAlarm
    const two = (x: number) => String(x).padStart(2, '0')
    const h = a?.h ?? d.getHours()
    const m = a?.m ?? d.getMinutes()
    s.textCenter(W >> 1, STATUS_H + 58, str.aAlertTitle, { size: 14, color: C.PALE })
    s.textCenter(W >> 1, STATUS_H + 96, `${two(h)}:${two(m)}`, { size: 54, color: C.WHITE })
    if (a?.label)
      s.textCenter(W >> 1, STATUS_H + 176, a.label, { size: 14, color: C.AMBER })
    // 左：贪睡（绿）；右：关闭（红）。几何须与 onTap 命中区一致
    roundRect(s, 28, H - 96, 120, 56, 12, C.DGREEN, null)
    s.textCenter(88, H - 62, str.aSnooze, { size: 17, color: C.WHITE })
    roundRect(s, W - 148, H - 96, 120, 56, 12, C.RED, null)
    s.textCenter(W - 88, H - 62, str.aDismiss, { size: 17, color: C.WHITE })
    s.render()
  }

  private drawRinging() {
    const s = this.deps.screen
    s.clear()
    const str = androidStrings(this.deps.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: this.unread,
      batteryPct: this.deps.battery.percent,
      carrier: str.carrier,
      clock: this.clockStr(d),
      signalBars: 4,
      silent: this.silent,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.INK)
    const cx = W >> 1
    const blink = Math.floor(Date.now() / 500) % 2 === 0
    if (blink) s.textCenter(cx, STATUS_H + 34, str.incomingCall, { size: 15, color: C.PALE })
    const cy = STATUS_H + 130
    for (let dy = -44; dy <= 44; dy++)
      for (let dx = -44; dx <= 44; dx++)
        if (dx * dx + dy * dy <= 44 * 44) s.pset(cx + dx, cy + dy, C.GRAY)
    roundRect(s, cx - 30, cy + 26, 60, 34, 10, C.GRAY, null)
    const inc = this.incoming
    if (inc) {
      s.textCenter(cx, cy + 100, inc.name ?? inc.tel, { size: 26, color: C.WHITE })
      if (inc.name) s.textCenter(cx, cy + 134, inc.tel, { size: 16, color: C.PALE })
    }
    roundRect(s, 28, H - 100, 120, 56, 12, C.DGREEN, null)
    s.textCenter(88, H - 74, str.incomingAnswer, { size: 17, color: C.WHITE })
    roundRect(s, W - 148, H - 100, 120, 56, 12, C.RED, null)
    s.textCenter(W - 88, H - 74, str.incomingReject, { size: 17, color: C.WHITE })
    s.render()
  }

  private drawInCall() {
    const s = this.deps.screen
    s.clear()
    const str = androidStrings(this.deps.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: this.unread,
      batteryPct: this.deps.battery.percent,
      carrier: str.carrier,
      clock: this.clockStr(d),
      signalBars: 4,
      silent: this.silent,
    })
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    const cx = W >> 1
    const cy = STATUS_H + 110
    for (let dy = -40; dy <= 40; dy++)
      for (let dx = -40; dx <= 40; dx++)
        if (dx * dx + dy * dy <= 40 * 40) s.pset(cx + dx, cy + dy, C.GRAY)
    roundRect(s, cx - 28, cy + 24, 56, 32, 10, C.GRAY, null)
    const inc = this.incoming
    if (inc) {
      s.textCenter(cx, cy + 96, inc.name ?? inc.tel, { size: 24, color: C.INK })
      if (inc.name) s.textCenter(cx, cy + 128, inc.tel, { size: 15, color: C.GRAY })
    }
    const m = String(Math.floor(this.callSecs / 60)).padStart(2, '0')
    const sec = String(this.callSecs % 60).padStart(2, '0')
    s.textCenter(cx, cy + 170, `${m}:${sec}`, { size: 22, color: C.INK })
    s.textCenter(cx, cy + 200, str.inCall, { size: 13, color: C.GRAY })
    this.ic.drawStateChips(s, str, cx, cy + 226)
    roundRect(s, (W >> 1) - 70, H - 100, 140, 56, 12, C.RED, null)
    s.textCenter(cx, H - 74, str.endCall, { size: 17, color: C.WHITE })
    this.ic.draw(s, str)
    s.render()
  }
}

type DlgItem = { label: string; action: () => void }

/** 锥形指针（MALMO 真机黑色时针/分针）：尾部窄、根部宽，向尖端收尖 */
function taperedHand(s: Screen, cx: number, cy: number, ang: number, len: number, baseW: number) {
  const ux = Math.sin(ang)
  const uy = -Math.cos(ang)
  const px = Math.cos(ang)
  const py = Math.sin(ang)
  for (let t = -7; t <= len; t++) {
    const w = Math.max(0, Math.round(baseW * (1 - t / len)))
    const bx = cx + ux * t
    const by = cy + uy * t
    for (let q = -w; q <= w; q++)
      s.pset(Math.round(bx + px * q), Math.round(by + py * q), C.INK)
  }
}

/** 相对时间标签（通知条目右侧） */
function agoStr(ts: number, en: boolean): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (en) return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`
  return m < 60 ? `${m}分钟` : `${Math.round(m / 60)}小时`
}

/** Canvas2D 圆角矩形路径（填充/描边由调用方决定） */
function rrPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

let carbon: HTMLCanvasElement | null = null
/** 碳纤维纹理（真机抽屉底；对角 2px 编织，程序生成一次） */
function carbonCanvas(): HTMLCanvasElement {
  const c = (carbon ??= document.createElement('canvas'))
  if (c.width === W) return c
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0b0b0b'
  g.fillRect(0, 0, W, H)
  const img = g.getImageData(0, 0, W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // 对角 twill：2×2 交错块
      const v = ((x >> 1) + (y >> 1)) & 1
      // 细微经丝高光
      const sheen = ((x + y) % 9) === 0 ? 10 : 0
      const base = v ? 26 : 14
      const k = (y * W + x) * 4
      img.data[k] = base + sheen
      img.data[k + 1] = base + sheen
      img.data[k + 2] = base + 2 + sheen
    }
  g.putImageData(img, 0, 0)
  return c
}

let gCvs: HTMLCanvasElement | null = null
/** Google 彩色小写 g（18×18 简化程序绘制） */
function googleG(): HTMLCanvasElement {
  const c = (gCvs ??= document.createElement('canvas'))
  if (c.width === 18) return c
  c.width = 18
  c.height = 18
  const g = c.getContext('2d')!
  g.lineWidth = 2.4
  // 蓝弧（上大半圆）
  g.strokeStyle = '#4285f4'
  g.beginPath()
  g.arc(9, 9, 6.2, Math.PI * 0.85, Math.PI * 2.1)
  g.stroke()
  // 绿（左下）
  g.strokeStyle = '#34a853'
  g.beginPath()
  g.arc(9, 9, 6.2, Math.PI * 0.55, Math.PI * 0.85)
  g.stroke()
  // 黄
  g.strokeStyle = '#fbbc05'
  g.beginPath()
  g.arc(9, 9, 6.2, Math.PI * 0.25, Math.PI * 0.55)
  g.stroke()
  // 红
  g.strokeStyle = '#ea4335'
  g.beginPath()
  g.arc(9, 9, 6.2, -Math.PI * 0.05, Math.PI * 0.25)
  g.stroke()
  // 蓝色横杠
  g.strokeStyle = '#4285f4'
  g.beginPath()
  g.moveTo(8.6, 9)
  g.lineTo(14.6, 9)
  g.stroke()
  return c
}

/** 主屏 MENU 网格图标：38×38 圆角底板 + 高光 + 白色图形（add/wallpaper/search/bell/gear） */
function menuGlyph(s: Screen, x: number, y: number, kind: 'add' | 'wallpaper' | 'search' | 'bell' | 'gear') {
  const base = kind === 'add' ? C.DGREEN : kind === 'search' ? C.BLUE : kind === 'gear' ? C.METAL : kind === 'bell' ? C.AMBER : C.DGREEN
  roundRect(s, x, y, 38, 38, 8, base, C.PALE)
  roundRect(s, x + 3, y + 3, 32, 14, 5, C.GRAY, null)
  const cx = x + 19
  const cy = y + 19
  if (kind === 'add') {
    s.fillRect(cx - 9, cy - 2, 18, 4, C.WHITE)
    s.fillRect(cx - 2, cy - 9, 4, 18, C.WHITE)
  } else if (kind === 'wallpaper') {
    // 山峰 + 太阳的风景画
    s.fillRect(x + 7, y + 24, 24, 7, C.WHITE)
    for (let i = 0; i < 8; i++) {
      s.fillRect(x + 7 + i, y + 24 - (i < 4 ? i : 7 - i), 1, 1, C.WHITE)
      s.fillRect(x + 17 + i, y + 24 - (i < 4 ? i : 7 - i), 1, 1, C.WHITE)
    }
    s.fillRect(x + 25, y + 9, 4, 4, C.WHITE)
  } else if (kind === 'search') {
    // 放大镜
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -7; dx <= 7; dx++) {
        const r = dx * dx + dy * dy
        if (r <= 49 && r >= 28) s.pset(cx - 2 + dx, cy - 3 + dy, C.WHITE)
      }
    for (let i = 0; i < 8; i++) s.fillRect(cx + 4 + (i >> 1), cy + 4 + i, 3, 2, C.WHITE)
  } else if (kind === 'bell') {
    s.fillRect(cx - 6, cy - 6, 12, 10, C.WHITE)
    s.fillRect(cx - 8, cy + 4, 16, 2, C.WHITE)
    s.fillRect(cx - 2, cy + 7, 4, 3, C.WHITE)
    s.fillRect(cx - 1, cy - 9, 2, 3, C.WHITE)
  } else {
    // 齿轮：中心圆 + 八齿
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const r = dx * dx + dy * dy
        if (r <= 36 && r >= 12) s.pset(cx + dx, cy + dy, C.WHITE)
      }
    for (let a = 0; a < 8; a++) {
      const rad = (a * Math.PI) / 4
      const tx = cx + Math.round(8 * Math.cos(rad))
      const ty = cy + Math.round(8 * Math.sin(rad))
      s.fillRect(tx - 2, ty - 2, 4, 4, C.WHITE)
    }
  }
}

// easeOutCubic 预留（后续 Activity 转场使用）
void easeOutCubic

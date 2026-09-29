import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C, ACCENTS } from '../palette'
import { RINGTONES, SMS_SOUNDS, ALARM_SOUNDS, playSound } from '../ringtones'
import { W, H, TRAY_H, tray, roundRect, F_LIGHT, F_REG , onTrayChange, checkbox } from '../ui'
import type { Row, PivotDef } from '../pivot'
import { WALLPAPERS, getWallpaper } from '../wallpaper'

const CONTENT_Y = TRAY_H + 66
const LEFT = 24
/** 纵向滚动步长（与 ListPivot 一致） */
const ROW_STEP = 240

/**
 * Windows Phone 7.5 设置：双 Pivot（system / applications）。
 * 设置应用 id 恰为 "settings"，故其 AppStore 键空间与设备级 settings:* 键重合，
 * 可直接经 ctx.store 读写全部系统设置；OS 经 watchStore 即时响应。
 */
export const settingsApp: MiniApp = {
  id: 'settings',
  name: '设置',
  nameEn: 'Settings',
  start(ctx: AppContext) {
    const ui = new SettingsUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Panel {
  title: string
  titleEn?: string
  rows: () => Row[]
}

class SettingsUI {
  private defs: PivotDef[] = []
  private panel: Panel | null = null
  private activePivot = 0
  private pivotScroll = 0
  private panelScroll = 0
  /** 按下时记录的动作，抬起（无滑动）才执行（见 onTap/firePending） */
  private pending: (() => void) | null = null
  /** 布尔开关缓存（key=settings 之后的短键） */
  private toggles: Record<string, boolean> = {}
  private ringIdx = 0
  private smsIdx = 0
  private alarmSndIdx = 0
  private brightIdx = 1
  private updateState: 'idle' | 'checking' | 'latest' = 'idle'
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    const c = this.ctx.store
    const keys = [
      'airplane', 'bluetooth', 'cellular', 'location', 'vibrate',
      'keysound', 'locksound', 'notifysound', 'clock24', 'autotime',
      'findphone', 'feedback', 'wifiOn', 'pin',
    ]
    for (const k of keys)
      this.toggles[k] = (await c.get<boolean>(k)) ?? false
    this.ringIdx = (await c.get<number>('ringtone')) ?? 0
    this.smsIdx = (await c.get<number>('smsound')) ?? 0
    this.alarmSndIdx = (await c.get<number>('alarmsound')) ?? 0
    this.brightIdx = (await c.get<number>('brightness')) ?? 1
    // 设置页自己接管按键/点按/滑动（含面板路由与 Pivot 切换）
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(this.ctx.onTapUp(() => this.firePending()))
    this.offs.push(this.ctx.onWheel((dy) => this.onWheel(dy)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => this.onSwipe(dir)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.buildDefs()
    this.draw()
  }

  // ---------- 双 Pivot 行模型 ----------

  private buildDefs() {
    const s = wpStrings(this.ctx.lang.get())
    this.defs = [
      {
        title: s.pivotSystem,
        rows: () => [
          this.navRow(s.setTheme, undefined, () => this.openPanel(this.themePanel())),
          this.navRow(s.setSounds, undefined, () => this.openPanel(this.soundsPanel())),
          this.toggleRow('airplane', s.setAirplane),
          this.navRow(s.setWifi, undefined, () => this.openPanel(this.wifiPanel())),
          this.toggleRow('bluetooth', s.setBluetooth),
          this.toggleRow('cellular', s.setCellular),
          this.toggleRow('location', s.setLocation),
          this.navRow(s.setBrightness, this.brightName(), () => this.openPanel(this.brightnessPanel())),
          this.navRow(s.setLock, undefined, () => this.openPanel(this.lockPanel())),
          this.navRow(s.setDateTime, undefined, () => this.openPanel(this.dateTimePanel())),
          { title: s.setKeyboard, sub: s.setKeyboardSub, control: 'chevron' },
          this.navRow(s.setRegion, this.langName(), () => this.openPanel(this.regionPanel())),
          this.toggleRow('findphone', s.setFindPhone),
          this.navRow(s.setUpdate, undefined, () => this.openPanel(this.updatePanel())),
          this.toggleRow('feedback', s.setFeedback),
          this.navRow(s.aboutTitle, undefined, () => this.openPanel(this.aboutPanel())),
        ],
      },
      {
        title: s.pivotApps,
        rows: () => [
          this.appToggleRow('messages', s.msgTitle),
          this.appToggleRow('phone', s.phoneTitle),
          this.appToggleRow('contacts', s.peopleTitle),
          this.appToggleRow('camera', '相机'),
          this.appToggleRow('clock', s.alarmTitle),
        ],
      },
    ]
  }

  private navRow(title: string, sub: string | undefined, open: () => void): Row {
    return { title, sub, control: 'chevron', tap: open }
  }

  private toggleRow(key: string, title: string): Row {
    return {
      title,
      control: 'toggle',
      on: !!this.toggles[key],
      tap: () => {
        const v = !this.toggles[key]
        this.toggles[key] = v
        void this.ctx.store.set(key, v)
        this.buildDefs()
        this.draw()
      },
    }
  }

  /** applications Pivot：应用通知开关（键 settings:notify:<appId>） */
  private appToggleRow(appId: string, title: string): Row {
    const key = `notify:${appId}`
    return {
      title,
      sub: wpStrings(this.ctx.lang.get()).setAppNotify,
      control: 'toggle',
      on: !!this.toggles[key],
      tap: () => {
        const v = !this.toggles[key]
        this.toggles[key] = v
        void this.ctx.store.set(key, v)
        this.buildDefs()
        this.draw()
      },
    }
  }

  private brightName(): string {
    const s = wpStrings(this.ctx.lang.get())
    return [s.brightLow, s.brightMid, s.brightHigh][this.brightIdx]!
  }

  private langName(): string {
    return this.ctx.lang.get() === 'en' ? 'English' : '中文'
  }

  // ---------- 面板 ----------

  private openPanel(p: Panel) {
    this.panel = p
    this.panelScroll = 0
    this.draw()
  }

  private closePanel() {
    this.panel = null
    this.buildDefs()
    this.draw()
  }

  /** 主题：Mango 十色强调色 2×5 网格 */
  private themePanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.setTheme,
      rows: () => [
        {
          h: 320,
          title: '',
          custom: (sc) => {
            const size = 76
            ACCENTS.forEach((a, i) => {
              const col = i % 5
              const row = Math.floor(i / 5)
              const x = LEFT + col * (size + 12)
              const y = 24 + row * (size + 12)
              roundRect(sc, x, y, size, size, 4, a.idx, null)
              if (this.ctx.host.getAccent?.() === a.idx)
                roundRect(sc, x - 5, y - 5, size + 10, size + 10, 7, -1, C.WHITE)
            })
          },
          tap: () => {
            // 网格点击由 tap 坐标分派
          },
        },
      ],
    }
  }

  private pickTheme(x: number, y: number) {
    const size = 76
    const col = Math.floor((x - LEFT) / (size + 12))
    const row = Math.floor((y - 24) / (size + 12))
    const i = row * 5 + col
    if (col < 0 || col > 4 || row < 0 || row > 1 || i >= ACCENTS.length) return
    this.ctx.host.setAccent?.(i)
    this.draw()
  }

  /** 铃声和声音：三个选择行 + 开关组 */
  private soundsPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    const picker = (title: string, name: string, fn: () => void): Row => ({
      title, sub: name, control: 'chevron', tap: fn,
    })
    return {
      title: s.setSounds,
      rows: () => [
        picker(s.pickRingtone, RINGTONES[this.ringIdx]!.zh, () => this.openPanel(this.ringtoneListPanel())),
        picker(s.pickSms, SMS_SOUNDS[this.smsIdx]!.zh, () => this.openPanel(this.smsListPanel())),
        picker(s.pickAlarmSnd, ALARM_SOUNDS[this.alarmSndIdx]!.zh, () => this.openPanel(this.alarmSndListPanel())),
        this.toggleRow('vibrate', s.setVibrate),
        this.toggleRow('keysound', s.setKeySound),
        this.toggleRow('locksound', s.setLockSound),
        this.toggleRow('notifysound', s.setNotifySound),
      ],
    }
  }

  /** 来电铃声选择：点按试听并选定 */
  private ringtoneListPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.pickRingtone,
      rows: () =>
        RINGTONES.map((d, i) => ({
          title: d.zh,
          control: i === this.ringIdx ? 'toggle' : 'chevron',
          on: i === this.ringIdx,
          tap: () => {
            this.ringIdx = i
            void this.ctx.store.set('ringtone', i)
            this.ctx.host.setRingtone?.(i)
            this.ctx.audio.unlock()
            playSound(this.ctx.audio, d, { volume: 0.6 })
            this.draw()
          },
        })),
    }
  }

  private smsListPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.pickSms,
      rows: () =>
        SMS_SOUNDS.map((d, i) => ({
          title: d.zh,
          control: i === this.smsIdx ? 'toggle' : 'chevron',
          on: i === this.smsIdx,
          tap: () => {
            this.smsIdx = i
            void this.ctx.store.set('smsound', i)
            this.ctx.audio.unlock()
            playSound(this.ctx.audio, d, { volume: 0.6 })
            this.draw()
          },
        })),
    }
  }

  private alarmSndListPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.pickAlarmSnd,
      rows: () =>
        ALARM_SOUNDS.map((d, i) => ({
          title: d.zh,
          control: i === this.alarmSndIdx ? 'toggle' : 'chevron',
          on: i === this.alarmSndIdx,
          tap: () => {
            this.alarmSndIdx = i
            void this.ctx.store.set('alarmsound', i)
            this.ctx.audio.unlock()
            playSound(this.ctx.audio, d, { volume: 0.6 })
            this.draw()
          },
        })),
    }
  }

  /** Wi-Fi：开关 + 假热点 */
  private wifiPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.setWifi,
      rows: () => [
        this.toggleRow('wifiOn', s.setWifi),
        ...(this.toggles.wifiOn
          ? (['CMCC-5G', 'ChinaMobile-201', 'TP-LINK_A09', s.wifiLocked] as string[]).map(
              (name): Row => ({
                title: name,
                sub: name === s.wifiLocked ? s.wifiLockedSub : s.wifiOpen,
                control: name === s.wifiLocked ? 'chevron' : undefined,
                tap: () => this.toast(s.wifiConnected(name)),
              }),
            )
          : []),
      ],
    }
  }

  /** 亮度：低/中/高 */
  private brightnessPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    const names = [s.brightLow, s.brightMid, s.brightHigh]
    return {
      title: s.setBrightness,
      rows: () =>
        names.map(
          (name, i): Row => ({
            title: name,
            control: i === this.brightIdx ? 'toggle' : 'chevron',
            on: i === this.brightIdx,
            tap: () => {
              this.brightIdx = i
              void this.ctx.store.set('brightness', i)
              this.draw()
            },
          }),
        ),
    }
  }

  /** 锁屏：壁纸 3×4 网格 + PIN + 超时 */
  private lockPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.setLock,
      rows: () => [
        {
          h: 380,
          title: '',
          custom: (sc) => {
            const tw = 132
            const th = 112
            WALLPAPERS.forEach((_, i) => {
              const col = i % 3
              const row = Math.floor(i / 3)
              const x = LEFT + col * (tw + 12)
              const y = 16 + row * (th + 12)
              sc.blit(getWallpaper(i), x, y, { w: tw, h: th })
            })
          },
        },
        this.toggleRow('pin', s.setPin),
        {
          title: s.lockTimeout, sub: s.lockTimeoutSub, control: 'chevron',
          tap: () => this.toast(s.lockTimeoutSub),
        },
      ],
    }
  }

  private pickWallpaper(x: number, y: number) {
    const tw = 132
    const th = 112
    const col = Math.floor((x - LEFT) / (tw + 12))
    const row = Math.floor((y - 16) / (th + 12))
    const i = row * 3 + col
    if (col < 0 || col > 2 || row < 0 || row > 3 || i >= WALLPAPERS.length) return
    // OS 读取的是 lock:wallpaper（设备级非 settings 键）
    void this.ctx.host.setLockWallpaper?.(i)
    this.draw()
  }

  /** 日期和时间：24 小时制 / 自动对时 */
  private dateTimePanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.setDateTime,
      rows: () => [
        this.toggleRow('clock24', s.set24Hour),
        this.toggleRow('autotime', s.setAutoTime),
        { title: s.setTimeZone, sub: s.setTimeZoneSub, control: 'chevron' },
      ],
    }
  }

  /** 区域和语言：中/英文切换 */
  private regionPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    const cur = this.ctx.lang.get()
    return {
      title: s.setRegion,
      rows: () => [
        {
          title: '中文', control: cur === 'zh' ? 'toggle' : 'chevron', on: cur === 'zh',
          tap: () => {
            this.ctx.host.setLang?.('zh')
            this.draw()
          },
        },
        {
          title: 'English', control: cur === 'en' ? 'toggle' : 'chevron', on: cur === 'en',
          tap: () => {
            this.ctx.host.setLang?.('en')
            this.draw()
          },
        },
      ],
    }
  }

  /** 手机更新：检查转圈 → 已是最新 */
  private updatePanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.setUpdate,
      rows: () => [
        {
          title: s.updateCheck,
          control: 'chevron',
          tap: () => {
            this.updateState = 'checking'
            this.draw()
            setTimeout(() => {
              this.updateState = 'latest'
              this.draw()
            }, 1600)
          },
        },
        ...(this.updateState === 'checking'
          ? [{ title: s.updateChecking, h: 90 }]
          : this.updateState === 'latest'
            ? [{ title: s.updateLatest, sub: '7.10.8862.144', h: 96 }]
            : []),
      ],
    }
  }

  /** 关于：真机信息 + 恢复出厂 */
  private aboutPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.aboutTitle,
      rows: () => [
        { title: s.aboutModel, h: 58 },
        { title: s.aboutOs, h: 58 },
        { title: s.aboutVersion, sub: '7.10.8862.144', h: 84 },
        { title: s.aboutCarrier, sub: '中国移动', h: 84 },
        { title: s.aboutStorage, sub: '14.6 GB / 16 GB', h: 84 },
        { title: s.aboutScreen, h: 58 },
        { title: s.aboutCamera, h: 58 },
        { title: s.aboutBattery(this.ctx.battery.percent), h: 58 },
        {
          title: s.aboutReset, control: 'chevron',
          tap: () => this.openPanel(this.confirmResetPanel()),
        },
      ],
    }
  }

  private confirmResetPanel(): Panel {
    const s = wpStrings(this.ctx.lang.get())
    return {
      title: s.aboutReset,
      rows: () => [
        { title: s.resetConfirm, h: 120 },
        {
          title: s.resetNow, control: 'chevron',
          tap: () => void this.doReset(),
        },
        { title: s.resetCancel, control: 'chevron', tap: () => this.closePanel() },
      ],
    }
  }

  private async doReset() {
    await this.ctx.store.clearAll()
    location.reload()
  }

  // ---------- Toast（顶部滑入通知条） ----------

  private toastText: string | null = null
  private toastAt = 0
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  private toast(text: string) {
    this.toastText = text
    this.toastAt = Date.now()
    this.ctx.audio.melody([[88, 0.06], [93, 0.12]], 200)
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastText = null
      this.draw()
    }, 4000)
    this.draw()
  }

  // ---------- 输入路由 ----------

  private onKey(k: DeviceKey) {
    if (this.panel) {
      if (k === 'back' || k === 'ok') this.closePanel()
      return
    }
    if (k === 'back') {
      this.ctx.exit()
      return
    }
    if (k === 'left') this.gotoPivot(this.activePivot - 1)
    else if (k === 'right') this.gotoPivot(this.activePivot + 1)
    else if (k === 'up' || k === 'down') this.scrollList(k === 'down' ? ROW_STEP : -ROW_STEP)
  }

  /** 切 Pivot（点击标题/左右键/左右滑）：回到顶部 */
  private gotoPivot(i: number) {
    if (i < 0 || i >= this.defs.length || i === this.activePivot) return
    this.activePivot = i
    this.pivotScroll = 0
    this.draw()
  }

  private listContentH(): number {
    let h = 0
    for (const r of this.defs[this.activePivot]!.rows()) h += r.h ?? (r.sub ? 82 : 64)
    return h
  }

  private scrollList(delta: number) {
    const max = Math.max(0, this.listContentH() - (H - CONTENT_Y))
    this.pivotScroll = Math.max(0, Math.min(this.pivotScroll + delta, max))
    this.draw()
  }

  private onSwipe(dir: 'up' | 'down' | 'left' | 'right') {
    if (this.panel) {
      if (dir === 'up' || dir === 'down') {
        this.panelScroll += dir === 'up' ? 240 : -240
        this.clampPanelScroll()
        this.draw()
      }
      return
    }
    if (dir === 'left') this.gotoPivot(this.activePivot + 1)
    else if (dir === 'right') this.gotoPivot(this.activePivot - 1)
    else this.scrollList(dir === 'up' ? ROW_STEP : -ROW_STEP)
  }

  /** 鼠标滚轮：下滚 = 看下方内容（与手指上滑同效果，与桌面瓷贴滚轮一致） */
  private onWheel(dy: number) {
    if (this.dead) return
    if (this.panel) {
      this.panelScroll += dy > 0 ? 240 : -240
      this.clampPanelScroll()
      this.draw()
    } else this.scrollList(dy > 0 ? ROW_STEP : -ROW_STEP)
  }

  private onTap(x: number, y: number) {
    // 只记录命中动作不立即执行：真机触屏上按住滑动是滚动，抬起才触发点按；
    // 总线 tap 在 pointerdown 即派发，若立即执行会导致"拖动=误开面板"
    this.pending = null
    if (this.panel) {
      // 面板内特殊网格
      if (this.panel.title === wpStrings(this.ctx.lang.get()).setTheme) {
        this.pending = () => this.pickTheme(x, y)
        return
      }
      if (this.panel.title === wpStrings(this.ctx.lang.get()).setLock && y < CONTENT_Y + 380) {
        this.pending = () => this.pickWallpaper(x, y)
        return
      }
      let ry = CONTENT_Y - this.panelScroll
      for (const r of this.panel.rows()) {
        const h = r.h ?? (r.sub ? 82 : 64)
        if (y >= ry && y < ry + h) {
          if (r.tap) this.pending = r.tap
          return
        }
        ry += h
      }
      return
    }
    this.pending = this.pivotHit(x, y)
  }

  /** 抬起时触发按下时记录的动作（发生过滑动则总线不发 tapUp，自然不会误触发） */
  private firePending() {
    const p = this.pending
    this.pending = null
    p?.()
  }

  /** 无面板时的点按命中（含标题切换），返回要执行的动作 */
  private pivotHit(x: number, y: number): (() => void) | null {
    if (y < CONTENT_Y - 10) {
      let tx = LEFT
      for (let i = 0; i < this.defs.length; i++) {
        const title = this.defs[i]!.title
        const tw = this.ctx.screen.measure(title, { size: 32, font: F_LIGHT(32) }) + 36
        if (x >= tx && x < tx + tw) {
          const gi = i
          return () => this.gotoPivot(gi)
        }
        tx += tw
      }
      return null
    }
    let ry = CONTENT_Y - this.pivotScroll
    for (const r of this.defs[this.activePivot]!.rows()) {
      const h = r.h ?? (r.sub ? 82 : 64)
      if (y >= ry && y < ry + h) return r.tap ?? null
      ry += h
    }
    return null
  }

  private panelContentH(): number {
    let h = CONTENT_Y
    if (this.panel) for (const r of this.panel.rows()) h += r.h ?? (r.sub ? 82 : 64)
    return h
  }

  private clampPanelScroll() {
    this.panelScroll = Math.max(
      0,
      Math.min(this.panelScroll, Math.max(0, this.panelContentH() - H)),
    )
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    this.buildDefs()
    const s = this.ctx.screen
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    if (this.panel) this.drawPanel()
    else this.drawPivots()
    this.drawToast()
    // 亮度遮罩：低亮度叠暗层（全彩 alpha 覆盖）
    if (this.brightIdx === 0) {
      let dim = SettingsUI.dim40
      if (!dim) {
        dim = document.createElement('canvas')
        dim.width = W
        dim.height = H
        const c = dim.getContext('2d')!
        c.fillStyle = 'rgba(0,0,0,0.4)'
        c.fillRect(0, 0, W, H)
        SettingsUI.dim40 = dim
      }
      s.blit(dim, 0, 0)
    }
    s.render()
  }
  private static dim40: HTMLCanvasElement | null = null

  private drawPivots() {
    const s = this.ctx.screen
    let ry = CONTENT_Y - this.pivotScroll
    for (const r of this.defs[this.activePivot]!.rows()) {
      const h = r.h ?? (r.sub ? 82 : 64)
      // 列表项可部分滑入标题区，先画再由标题带覆盖，实现粘性标题
      if (ry + h > 0 && ry < H) {
        if (r.custom) r.custom(s, LEFT, ry, W - LEFT * 2)
        else this.drawPlainRow(r, ry, h)
      }
      ry += h
    }
    this.drawHeader()
    let tx = LEFT
    this.defs.forEach((p, i) => {
      const selected = i === this.activePivot
      const w = s.measure(p.title, { size: 32, font: F_LIGHT(32) })
      s.text(tx, TRAY_H + 10, p.title, {
        size: 32, font: F_LIGHT(32), color: selected ? C.WHITE : C.GRAY,
      })
      tx += w + 36
    })
  }

  /**
   * 粘性标题带：列表滚动时会滑入标题区，故列表画完后用黑底重铺
   * [0, CONTENT_Y) 并重绘托盘，使标题/托盘恒显于顶层（真机 Pivot 头是固定的）。
   */
  private drawHeader() {
    const s = this.ctx.screen
    s.fillRect(0, 0, W, CONTENT_Y, C.BLACK)
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
  }

  private drawPlainRow(r: Row, ry: number, h: number) {
    const s = this.ctx.screen
    if (r.sub) {
      s.text(LEFT, ry, r.title, { size: 26, font: F_REG(26), color: C.WHITE })
      s.text(LEFT, ry + 34, r.sub, { size: 20, font: F_REG(20), color: C.GRAY })
    } else if (r.title) {
      s.text(LEFT, ry + 2, r.title, { size: 26, font: F_REG(26), color: C.WHITE })
    }
    s.fillRect(LEFT, ry + h - 2, W - LEFT * 2, 1, C.DIM)
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    if (r.control === 'chevron') {
      for (let i = 0; i < 14; i++)
        s.fillRect(W - 36 + i, ry + h / 2 - 12 + i, 3, 24 - i * 2, C.WHITE)
    } else if (r.control === 'toggle') {
      // WP7 是 checkbox（主题色底白 X），不是 WP8 的滑动开关
      checkbox(s, W - 74, ry + h / 2 - 19, !!r.on, accent)
    }
  }

  private drawPanel() {
    const s = this.ctx.screen
    const p = this.panel!
    let ry = CONTENT_Y - this.panelScroll
    for (const r of p.rows()) {
      const h = r.h ?? (r.sub ? 82 : 64)
      if (ry + h > 0 && ry < H) {
        if (r.custom) r.custom(s, LEFT, ry, W - LEFT * 2)
        else this.drawPlainRow(r, ry, h)
      }
      ry += h
    }
    // 粘性标题：面板标题恒显于顶层（同 drawPivots）
    this.drawHeader()
    s.text(LEFT, TRAY_H + 10, p.title, { size: 32, font: F_LIGHT(32), color: C.WHITE })
  }

  /** Toast：顶部强调色条 + 两行白字（下滑出现） */
  private drawToast() {
    if (!this.toastText) return
    const s = this.ctx.screen
    const age = Date.now() - this.toastAt
    const slide = Math.min(1, age / 200)
    const h = 92
    const y = TRAY_H - h + Math.round(h * slide)
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    s.fillRect(0, y, W, h, accent)
    s.text(LEFT, y + 12, this.toastText, { size: 24, font: F_REG(24), color: C.WHITE })
  }
}

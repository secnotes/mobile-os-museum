import type { AppContext, AppHost } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { CallEntry, Contact } from '../../../scenario/data'
import { C } from '../palette'
import { bbStrings, type BBStrings } from '../strings'

// ---------- 跨应用数据结构 ----------

export interface SmsMsg {
  dir: 'in' | 'out'
  text: string
  ts: number
}
export interface MsgThread {
  tel: string
  name: string
  kind: 'sms' | 'email'
  subject?: string
  unread: boolean
  msgs: SmsMsg[]
}
export interface BBMContact {
  id: number
  name: string
  status: string
  msgs: SmsMsg[]
}
export interface BBPhoto {
  id: number
  seed: number
  ts: number
}
export interface BBContact2 {
  name: string
  tel: string
  email?: string
}

/** BB 专有宿主回调 */
export interface BBHost extends AppHost {
  getThreads(): Promise<MsgThread[]>
  sendSms(tel: string, text: string): void
  markThreadRead(tel: string): void
  getBBM(): Promise<BBMContact[]>
  bbmSend(id: number, text: string): void
  getPhotos2(): Promise<BBPhoto[]>
  addPhoto(seed: number): BBPhoto
  deletePhoto2(id: number): Promise<void>
  unreadCount(): Promise<number>
  setVibe(v: boolean): Promise<void>
  getVibe(): Promise<boolean>
  saveAlarm(cfg: { on: boolean; h: number; m: number }): Promise<void>
  getAlarm(): Promise<{ on: boolean; h: number; m: number }>
  /** 搜索结果：直接打开某应用 */
  launchAppById(id: string): void
  // 以下把 AppHost 的可选方法收紧为必需（BB 全部实现）
  dial(number: string, name?: string): void
  dialMsg(tel: string, name?: string): void
  getCallLog(): Promise<CallEntry[]>
  deleteCallLog(kind: 'all' | 'missed' | 'received' | 'dialled'): Promise<void>
  getContacts(): Promise<Contact[]>
  saveContacts(list: Contact[]): Promise<void>
  setRingtone(idx: number): void
  getRingtoneIndex(): Promise<number>
  setLang(lang: 'zh' | 'en'): void
  factoryReset(): Promise<void>
}

export interface MenuCommand {
  label: string
  fn: () => void
}

/**
 * 黑莓应用基类：统一黑莓键菜单覆盖层 + 语种切换；列表导航由各应用自理。
 */
export abstract class BBApp {
  // 不能用字段初始化器访问参数属性（native class fields 先执行）
  protected str: BBStrings
  private disposers: Array<() => void> = []
  private cleanups: Array<() => void> = []
  private menuOpen = false
  private menuSel = 0
  private menuOff = 0

  constructor(protected ctx: AppContext) {
    this.str = bbStrings(ctx.lang.get())
  }

  /** 注册退出清理（如停旋律），随应用退出执行 */
  protected onCleanup(fn: () => void) {
    this.cleanups.push(fn)
  }

  start(): () => void {
    this.disposers.push(this.ctx.onKey((k, rep) => this.key(k, rep)))
    this.disposers.push(this.ctx.onTap((x, y) => this.pointerTap(x, y)))
    this.disposers.push(this.ctx.onDrag((x, y, sx, sy) => this.drag(x, y, sx, sy)))
    this.disposers.push(this.ctx.onDragEnd(() => this.dragEnd()))
    this.disposers.push(
      this.ctx.onLang(() => {
        this.str = bbStrings(this.ctx.lang.get())
        this.draw()
      }),
    )
    // 首帧：onStart 为 async 时等数据就绪再画（runtime 不负责绘制）
    const started = this.onStart()
    if (started && typeof (started as Promise<void>).then === 'function') {
      void (started as Promise<void>).then(() => this.draw())
    } else {
      this.draw()
    }
    return () => {
      for (const fn of this.cleanups.splice(0)) {
        try { fn() } catch { /* ignore */ }
      }
    }
  }

  protected get host(): BBHost {
    return this.ctx.host as BBHost
  }

  /** 当前语言下的应用名（缺省回落 id） */
  protected appName(id: string): string {
    return this.str.apps[id] ?? id
  }

  // ---- 子类钩子 ----
  protected onStart(): void | Promise<void> {}
  protected abstract draw(): void
  protected onKeyApp(_k: DeviceKey, _rep: boolean): void {}
  protected onTapApp(_x: number, _y: number): void {}
  protected drag(_x: number, _y: number, _sx: number, _sy: number): void {}
  protected dragEnd(): void {}
  /** 黑莓键菜单命令（缺省只有 Close） */
  protected menuItems(): MenuCommand[] {
    return []
  }

  protected redraw(): void {
    this.draw()
  }

  // ---- 输入 ----

  private key(k: DeviceKey, rep: boolean) {
    if (this.menuOpen) {
      this.menuKey(k)
      return
    }
    if (k === 'menu' && !rep) {
      this.openMenu()
      return
    }
    this.onKeyApp(k, rep)
  }

  private pointerTap(x: number, y: number) {
    if (this.menuOpen) {
      const cmds = this.allMenuItems()
      const i = Math.floor((y - 8 + this.menuOff) / 28)
      if (i >= 0 && i < cmds.length) cmds[i]!.fn()
      return
    }
    this.onTapApp(x, y)
  }

  // ---- 菜单覆盖层 ----

  private allMenuItems(): MenuCommand[] {
    return [...this.menuItems(), { label: this.str.close, fn: () => this.closeMenu() }]
  }

  private openMenu() {
    this.menuOpen = true
    this.menuSel = 0
    this.menuOff = 0
    this.drawMenu()
  }

  private closeMenu() {
    this.menuOpen = false
    this.draw()
  }

  private menuKey(k: DeviceKey) {
    const cmds = this.allMenuItems()
    const n = cmds.length
    if (k === 'up') {
      this.menuSel = (this.menuSel + n - 1) % n
    } else if (k === 'down') {
      this.menuSel = (this.menuSel + 1) % n
    } else if (k === 'ok') {
      cmds[this.menuSel]!.fn()
      return
    } else if (k === 'back' || k === 'menu') {
      this.closeMenu()
      return
    } else return
    this.ensureMenuVisible(cmds.length)
    this.drawMenu()
  }

  private ensureMenuVisible(n: number) {
    const y0 = this.menuSel * 28
    const y1 = y0 + 28
    const viewH = 304
    if (y0 < this.menuOff) this.menuOff = y0
    else if (y1 > this.menuOff + viewH) this.menuOff = Math.min(n * 28 - viewH, y1 - viewH)
  }

  /** 菜单全屏覆盖（真机黑莓菜单：白底、蓝选中行） */
  protected drawMenu() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    const cmds = this.allMenuItems()
    cmds.forEach((c, i) => {
      const y = 8 + i * 28 - this.menuOff
      if (y < -28 || y > 312) return
      if (i === this.menuSel) s.fillRect(0, y, 480, 28, C.SELECT)
      s.text(14, y + 6, c.label, {
        size: 17,
        color: i === this.menuSel ? C.WHITE : C.INK,
      })
    })
    s.render()
  }
}

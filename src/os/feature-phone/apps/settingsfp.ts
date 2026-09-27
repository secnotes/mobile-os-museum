import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../t9'
import { osStrings } from '../strings'

/**
 * 功能机设置类应用集合（每个 id 独立，conf 经 AppStore）：
 * timeset  时间设置（时钟/日期/自动更新）
 * callset  通话设置（自动重拨/呼叫等待/发送本机号）
 * phoneset 手机设置（问候语/小区信息/帮助文本/开机铃声）
 * clockconf 时钟设置（时制/日期格式/自动更新，3310）
 * factory  恢复出厂设置
 * sim      SIM 服务静态信息页
 */

// ---------- 通用开关/循环列表 ----------

type Row =
  | { t: 'tg'; label: string; val: boolean }
  | { t: 'cy'; label: string; val: number; names: string[] }
  | { t: 'go'; label: string; hint: string }

class SettingList {
  private sel = 0
  private top = 0
  private readonly rows: number
  /** 子编辑器（数字录入/T9）打开期间吞掉所有按键，避免双订阅串键 */
  private busy = false

  constructor(
    protected ctx: AppContext,
    private data: () => Row[],
    private onMutate: () => void,
    private onOpen: (i: number, close: () => void) => void,
  ) {
    this.rows = Math.floor((ctx.screen.h - 11) / 11)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => { if (!this.busy) this.draw() })
  }

  private get items(): Row[] {
    return this.data()
  }

  /** 打开子编辑器：返回关闭回调（编辑器退出时调用） */
  private begin(): () => void {
    this.busy = true
    return () => { this.busy = false }
  }

  private onKey(k: DeviceKey) {
    if (this.busy) return
    const items = this.items
    const n = items.length
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        this.clamp(); this.draw(); break
      case 'down':
        this.sel = (this.sel + 1) % n
        this.clamp(); this.draw(); break
      case 'ok':
      case 'soft1': {
        const r = items[this.sel]!
        if (r.t === 'tg') { r.val = !r.val; this.onMutate() }
        else if (r.t === 'cy') { r.val = (r.val + 1) % r.names.length; this.onMutate() }
        else {
          const release = this.begin()
          this.onOpen(this.sel, () => { release(); this.ctx.exit() })
        }
        this.draw(); break
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit()
    }
  }

  private clamp() {
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
    if (this.top < 0) this.top = 0
  }

  draw() {
    const s = this.ctx.screen
    const W = s.w
    const H = s.h
    s.clear()
    const items = this.items
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= items.length) break
      const row = items[i]!
      const y = r * 11
      s.text(2, y + 1, row.label, { size: 9 })
      const v = row.t === 'tg'
        ? (row.val ? osStrings(this.ctx.lang.get()).settingsOn : osStrings(this.ctx.lang.get()).settingsOff)
        : row.t === 'cy' ? row.names[row.val]! : row.hint
      s.textRight(W - 2, y + 1, v, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, 11)
    }
    if (items.length > this.rows) {
      s.fillRect(W - 1, Math.floor((this.top / items.length) * (H - 11)), 1,
        Math.max(2, Math.floor((this.rows / items.length) * (H - 11))))
    }
    s.textRight(W - 1, H - 10, osStrings(this.ctx.lang.get()).menuBack, { size: 9 })
  }
}

// ---------- 定长数字录入 ----------

class DigitEdit {
  private buf = ''

  constructor(
    private ctx: AppContext,
    private title: () => string,
    private len: number,
    private validate: (buf: string) => boolean,
    private onDone: (buf: string) => void,
    private close: () => void,
  ) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k) && this.buf.length < this.len) {
      this.buf += k
    } else if (k === 'clear') {
      if (this.buf) this.buf = this.buf.slice(0, -1)
      else this.close()
    } else if (k === 'back' || k === 'soft2') {
      this.close()
    } else if (k === 'ok' || k === 'soft1') {
      if (this.buf.length === this.len && this.validate(this.buf)) {
        this.onDone(this.buf)
        this.close()
      }
    }
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.textCenter(W >> 1, 8, this.title(), { size: 9 })
    let text = this.buf
    while (text.length < this.len) text += '_'
    s.textCenter(W >> 1, 22, text, { size: 14 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- T9 文本录入（问候语） ----------

class T9Edit {
  private draft: string
  private t9 = new T9()

  constructor(
    private ctx: AppContext,
    private title: () => string,
    initial: string,
    private onDone: (text: string) => void,
    private close: () => void,
  ) {
    this.draft = initial
    this.t9.setMode(ctx.lang.get() === 'en' ? 'en' : 'py')
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.every(100, () => {
      const out = this.t9.expire()
      if (out) this.draft += out
      this.draw()
    })
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else if (k === 'ok') {
      const out = this.t9.select()
      if (out) this.draft += out
    } else if (k === 'soft1') {
      this.onDone(this.draft.trim())
      this.close()
    } else if (k === 'back' || k === 'soft2' || k === 'clear') {
      this.close()
    }
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const W = s.w
    const H = s.h
    s.clear()
    s.text(2, 4, this.title(), { size: 9 })
    s.text(2, 20, this.draft || '_', { size: 12 })
    const str = osStrings(this.ctx.lang.get())
    s.text(1, H - 10, str.settingsConfirmYes, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

// ---------- timeset：时间设置 ----------

interface TimeConf { auto: boolean }

export const timesetApp: MiniApp = {
  id: 'timeset',
  name: '时间设置',
  nameEn: 'Time settings',
  start(ctx) {
    let conf: TimeConf = { auto: true }
    let list: SettingList | null = null
    const rows = (): Row[] => {
      const str = osStrings(ctx.lang.get())
      return [
        { t: 'go', label: str.tsClock, hint: '>' },
        { t: 'go', label: str.tsDate, hint: '>' },
        { t: 'tg', label: str.tsAuto, val: conf.auto },
      ]
    }
    void ctx.store.get<TimeConf>('conf').then((saved) => {
      if (saved) conf = saved
      list?.draw()
    })
    list = new SettingList(
      ctx, rows,
      () => void ctx.store.set('conf', conf),
      (i, close) => {
        const str = osStrings(ctx.lang.get())
        if (i === 0) {
          new DigitEdit(ctx, () => str.tsClock, 4,
            (b) => +b.slice(0, 2) <= 23 && +b.slice(2) <= 59,
            (b) => ctx.host.setClockTime?.(+b.slice(0, 2), +b.slice(2)), close)
        } else {
          new DigitEdit(ctx, () => str.tsDate, 6,
            (b) => +b.slice(2, 4) >= 1 && +b.slice(2, 4) <= 12 && +b.slice(0, 2) >= 1 && +b.slice(0, 2) <= 31,
            (b) => ctx.host.setClockDate?.(+b.slice(4), +b.slice(2, 4), +b.slice(0, 2)), close)
        }
      },
    )
  },
}

// ---------- callset：通话设置 ----------

interface CallConf { redial: boolean; waiting: boolean; callerId: boolean }
const DEFAULT_CALL: CallConf = { redial: false, waiting: true, callerId: true }

export const callsetApp: MiniApp = {
  id: 'callset',
  name: '通话设置',
  nameEn: 'Call settings',
  start(ctx) {
    let conf: CallConf = { ...DEFAULT_CALL }
    let list: SettingList | null = null
    const rows = (): Row[] => {
      const str = osStrings(ctx.lang.get())
      return [
        { t: 'tg', label: str.csRedial, val: conf.redial },
        { t: 'tg', label: str.csWaiting, val: conf.waiting },
        { t: 'tg', label: str.csCallerId, val: conf.callerId },
      ]
    }
    void ctx.store.get<CallConf>('conf').then((saved) => {
      if (saved) conf = { ...DEFAULT_CALL, ...saved }
      list?.draw()
    })
    list = new SettingList(ctx, rows, () => void ctx.store.set('conf', conf), () => {})
  },
}

// ---------- phoneset：手机设置 ----------

interface PhoneConf { cellInfo: boolean; help: boolean; startupTone: boolean }
const DEFAULT_PHONE: PhoneConf = { cellInfo: false, help: true, startupTone: true }

export const phonesetApp: MiniApp = {
  id: 'phoneset',
  name: '手机设置',
  nameEn: 'Phone settings',
  start(ctx) {
    let conf: PhoneConf = { ...DEFAULT_PHONE }
    let welcome = ''
    let list: SettingList | null = null
    const rows = (): Row[] => {
      const str = osStrings(ctx.lang.get())
      return [
        { t: 'go', label: str.psWelcome, hint: welcome ? '✎' : '>' },
        { t: 'tg', label: str.psCellInfo, val: conf.cellInfo },
        { t: 'tg', label: str.psHelp, val: conf.help },
        { t: 'tg', label: str.psStartupTone, val: conf.startupTone },
      ]
    }
    void ctx.store.get<PhoneConf>('conf').then((saved) => {
      if (saved) conf = { ...DEFAULT_PHONE, ...saved }
      list?.draw()
    })
    void ctx.store.get<string>('welcome').then((w) => {
      if (w !== undefined) welcome = w
      list?.draw()
    })
    list = new SettingList(
      ctx, rows,
      () => void ctx.store.set('conf', conf),
      (_i, close) => {
        const str = osStrings(ctx.lang.get())
        new T9Edit(ctx, () => str.psWelcome, welcome, (text) => {
          welcome = text
          void ctx.store.set('welcome', text)
        }, close)
      },
    )
  },
}

// ---------- clockconf：时钟设置（3310） ----------

interface ClockConf { fmt24: boolean; dateMDY: boolean; auto: boolean }
const DEFAULT_CLOCK: ClockConf = { fmt24: true, dateMDY: false, auto: true }

export const clockconfApp: MiniApp = {
  id: 'clockconf',
  name: '时钟设置',
  nameEn: 'Clock settings',
  start(ctx) {
    let conf: ClockConf = { ...DEFAULT_CLOCK }
    let list: SettingList | null = null
    const rows = (): Row[] => {
      const str = osStrings(ctx.lang.get())
      return [
        { t: 'cy', label: str.ccFormat, val: conf.fmt24 ? 1 : 0, names: ['12h', '24h'] },
        { t: 'cy', label: str.ccDate, val: conf.dateMDY ? 1 : 0, names: ['DD.MM', 'MM.DD'] },
        { t: 'tg', label: str.tsAuto, val: conf.auto },
      ]
    }
    void ctx.store.get<ClockConf>('conf').then((saved) => {
      if (saved) conf = { ...DEFAULT_CLOCK, ...saved }
      list?.draw()
    })
    list = new SettingList(
      ctx, rows,
      () => void ctx.store.set('conf', {
        fmt24: conf.fmt24, dateMDY: conf.dateMDY, auto: conf.auto,
      }),
      () => {},
    )
  },
}

// ---------- factory：恢复出厂 ----------

export const factoryApp: MiniApp = {
  id: 'factory',
  name: '恢复出厂设置',
  nameEn: 'Restore factory settings',
  start(ctx) {
    new FactoryUI(ctx)
  },
}

class FactoryUI {
  private view: 'confirm' | 'done' = 'confirm'
  private dead = false

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'done') return
    if (k === 'ok' || k === 'soft1') {
      void this.factoryReset()
    } else if (k === 'clear' || k === 'back' || k === 'soft2') {
      this.ctx.exit()
    }
  }

  private async factoryReset() {
    await this.ctx.host.factoryReset?.({})
    if (this.dead) return
    this.view = 'done'
    this.draw()
    setTimeout(() => { if (!this.dead) this.ctx.exit() }, 1400)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    if (this.view === 'done') {
      s.textCenter(s.w >> 1, 18, str.settingsDoneL1)
      s.textCenter(s.w >> 1, 32, str.settingsDoneL2)
      return
    }
    s.textCenter(s.w >> 1, 4, str.settingsConfirmTitle)
    s.text(6, 20, str.settingsConfirmL1, { size: 9 })
    s.text(6, 32, str.settingsConfirmL2, { size: 9 })
    s.text(1, s.h - 11, str.settingsConfirmYes, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.settingsConfirmNo, { size: 9 })
  }
}

// ---------- sim：SIM 服务静态页 ----------

export const simApp: MiniApp = {
  id: 'sim',
  name: 'SIM 服务',
  nameEn: 'SIM services',
  start(ctx) {
    new SimUI(ctx)
  },
}

class SimUI {
  constructor(private ctx: AppContext) {
    ctx.onKey((k) => { if (k !== 'power') ctx.exit() })
    ctx.onLang(() => this.draw())
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    s.clear()
    s.textCenter(W >> 1, 6, str.simTitle, { size: 9 })
    s.frameRect(6, 16, W - 12, 22)
    s.textCenter(W >> 1, 19, str.operator, { size: 9 })
    s.textCenter(W >> 1, 29, str.simToolkit, { size: 9 })
    s.text(4, 42, str.simInfo, { size: 9 })
  }
}

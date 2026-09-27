import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_SEMI, clipToWidth, onTrayChange } from '../ui'

/**
 * Windows Phone 7.5 计算器（Mango 预装）：
 * 顶部标题 + 右对齐大字显示，下方 5 行 4 列 Metro 键面：
 * 数字键暗灰、运算符强调色、等号强调色实心。
 */
export const calculatorApp: MiniApp = {
  id: 'calculator',
  name: '计算器',
  nameEn: 'Calculator',
  start(ctx: AppContext) {
    const ui = new CalcUI(ctx)
    return () => ui.dispose()
  },
}

const KEY_W = 99
const KEY_H = 82
const GAP = 12
const KEY_TOP = 336

/** 键面（5 行 × 4 列） */
const KEYS: ReadonlyArray<ReadonlyArray<{ k: string; label: string; op?: boolean; num?: boolean }>> = [
  [
    { k: 'c', label: 'C' }, { k: 'back', label: '⌫' },
    { k: '%', label: '%', op: true }, { k: '/', label: '÷', op: true },
  ],
  [
    { k: '7', label: '7', num: true }, { k: '8', label: '8', num: true },
    { k: '9', label: '9', num: true }, { k: '*', label: '×', op: true },
  ],
  [
    { k: '4', label: '4', num: true }, { k: '5', label: '5', num: true },
    { k: '6', label: '6', num: true }, { k: '-', label: '−', op: true },
  ],
  [
    { k: '1', label: '1', num: true }, { k: '2', label: '2', num: true },
    { k: '3', label: '3', num: true }, { k: '+', label: '+', op: true },
  ],
  [
    { k: '+/-', label: '±' }, { k: '0', label: '0', num: true },
    { k: '.', label: '.' }, { k: '=', label: '=', op: true },
  ],
]

class CalcUI {
  /** 当前输入 / 累计值 / 待算运算符 / 是否已算（下次按数字清空显示） */
  private entry = '0'
  private acc: number | null = null
  private op: string | null = null
  private fresh = false
  private dead = false
  private offTray: () => void

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onTap((x, y) => this.onTap(x, y))
    this.offTray = onTrayChange(() => this.draw())
    ctx.onLang(() => this.draw())
    this.draw()
  }

  dispose() {
    this.dead = true
    this.offTray()
  }

  private accent(): number {
    return this.ctx.host.getAccent?.() ?? C.BLUE
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      this.ctx.exit()
      return
    }
    if (k >= '0' && k <= '9') this.press(k)
    else if (k === 'clear') this.press('back')
    else if (k === '.') this.press('.')
    else if (k === 'ok') this.press('=')
    else if (k === '*' || k === '#' || k === 'space') this.press(k === '*' ? '*' : k === '#' ? '+' : '=')
    else if (k === '0') this.press('0')
  }

  private onTap(x: number, y: number) {
    for (let r = 0; r < KEYS.length; r++) {
      const row = KEYS[r]!
      const ky = KEY_TOP + r * (KEY_H + GAP)
      if (y < ky || y >= ky + KEY_H) continue
      const i = Math.floor((x - 24) / (KEY_W + GAP))
      const key = row[i]
      if (key) this.press(key.k)
    }
  }

  // ---------- 运算 ----------

  private press(k: string) {
    if (k >= '0' && k <= '9') {
      if (this.entry === '0' || this.fresh) this.entry = k
      else if (this.entry.replace(/[-.]/g, '').length < 12) this.entry += k
      this.fresh = false
    } else if (k === '.') {
      if (this.fresh) this.entry = '0'
      if (!this.entry.includes('.')) this.entry += '.'
      this.fresh = false
    } else if (k === 'c') {
      this.entry = '0'
      this.acc = null
      this.op = null
      this.fresh = false
    } else if (k === 'back') {
      if (this.fresh) this.entry = '0'
      else this.entry = this.entry.length > 1 ? this.entry.slice(0, -1) : '0'
    } else if (k === '+/-') {
      if (this.entry !== '0')
        this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : '-' + this.entry
    } else if (k === '%') {
      const v = parseFloat(this.entry) / 100
      this.entry = this.fmt(v)
    } else if (k === '=') {
      this.equals()
    } else {
      // 二元运算符
      this.applyOp()
      this.op = k
    }
    this.ctx.audio.keypad()
    this.draw()
  }

  private applyOp() {
    const v = parseFloat(this.entry)
    if (this.acc === null || this.fresh) {
      this.acc = v
    } else if (this.op) {
      this.acc = this.compute(this.acc, v, this.op)
      this.entry = this.fmt(this.acc)
    }
    this.fresh = true
  }

  private equals() {
    if (this.op && this.acc !== null) {
      const v = parseFloat(this.entry)
      this.entry = this.fmt(this.compute(this.acc, v, this.op))
      this.acc = null
      this.op = null
    }
    this.fresh = true
  }

  private compute(a: number, b: number, op: string): number {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b === 0 ? NaN : a / b
      default: return b
    }
  }

  /** 避免浮点尾巴；NaN → “无法除以 0” */
  private fmt(v: number): string {
    if (Number.isNaN(v)) return wpStrings(this.ctx.lang.get()).calcNaN
    if (!Number.isFinite(v)) return '∞'
    const rounded = Math.abs(v) < 1e-10 ? 0 : parseFloat(v.toPrecision(12))
    return String(rounded)
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
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
    s.text(24, TRAY_H + 18, str.calcTitle, { size: 40, font: F_LIGHT(40), color: C.WHITE })
    // 显示（右对齐，48px 细体）
    const shown = clipToWidth(s, this.entry, W - 48, 52, F_LIGHT(52))
    s.textRight(W - 24, 220, shown, { size: 52, font: F_LIGHT(52), color: C.WHITE })
    // 运算符指示
    if (this.op && !this.fresh)
      s.text(24, 230, this.opLabel(), { size: 30, font: F_SEMI(30), color: this.accent() })
    // 键面
    const accent = this.accent()
    for (let r = 0; r < KEYS.length; r++) {
      const ky = KEY_TOP + r * (KEY_H + GAP)
      KEYS[r]!.forEach((key, i) => {
        const x = 24 + i * (KEY_W + GAP)
        let fill: number = C.DIM
        if (key.op) fill = accent
        else if (key.num) fill = C.STEEL
        s.fillRect(x, ky, KEY_W, KEY_H, fill)
        s.textCenter(x + KEY_W / 2, ky + 16, key.label, {
          size: 34,
          font: key.op ? F_SEMI(34) : F_LIGHT(34),
          color: C.WHITE,
        })
      })
    }
    s.render()
  }

  private opLabel(): string {
    return { '+': '+', '-': '−', '*': '×', '/': '÷' }[this.op ?? ''] ?? ''
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile } from '../ui'

/**
 * Android 1.0 计算器：显示行 + 4×5 按钮网格。
 * 触屏点按按钮，或键盘：数字行 / .（小数点）/ * ÷ # / m=− p=+ / ok 等号 / clear 退格。
 */
export const calculatorApp: MiniApp = {
  id: 'calculator',
  name: '计算器',
  nameEn: 'Calculator',
  icon(s, x, y) {
    iconTile(s, x, y, C.GREEN, C.LGREEN)
    // 白色显示行 + 深色按键点（真机计算器为绿色调）
    s.fillRect(x + 5, y + 5, 18, 6, C.WHITE)
    s.fillRect(x + 5, y + 15, 3, 3, C.INK)
    s.fillRect(x + 10, y + 15, 3, 3, C.INK)
    s.fillRect(x + 15, y + 15, 3, 3, C.INK)
    s.fillRect(x + 20, y + 15, 3, 3, C.INK)
    s.fillRect(x + 5, y + 20, 8, 3, C.INK)
    s.fillRect(x + 15, y + 20, 8, 3, C.INK)
  },
  start(ctx: AppContext) {
    const ui = new CalcUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

/** 按钮表（4 列 × 5 行），与真机布局一致 */
const KEYS = [
  'C', '±', '.', '÷',
  '7', '8', '9', '×',
  '4', '5', '6', '−',
  '1', '2', '3', '+',
  '0', '',  '', '=',
] as const

class CalcUI {
  private dead = false
  private cur = '0'
  private acc: number | null = null
  private op: string | null = null
  private expr = ''

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) this.digit(k)
    else if (k === '.') this.dot()
    else if (k === '*') this.opKey('×')
    else if (k === '#') this.opKey('÷')
    else if (k === 'm') this.opKey('−')
    else if (k === 'p') this.opKey('+')
    else if (k === 'ok') this.equals()
    else if (k === 'clear') this.backspace()
    else if (k === 'back') {
      this.ctx.exit()
      return
    } else return
    this.draw()
  }

  private onTap(x: number, y: number) {
    const g = this.grid()
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 4; c++) {
        const b = g[r]![c]!
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          let k = KEYS[r * 4 + c]
          if (r === 4 && c === 1) k = '0' // 宽 0 键跨两列
          if (!k) return
          if (k === 'C') this.clearAll()
          else if (k === '±') this.cur = this.cur.startsWith('-') ? this.cur.slice(1) : '-' + this.cur
          else if (k === '.') this.dot()
          else if (k === '=') this.equals()
          else if (/[0-9]/.test(k)) this.digit(k)
          else this.opKey(k)
          this.draw()
          return
        }
      }
  }

  private digit(d: string) {
    // fresh：按过运算符/等号后，下一个数字另起一个数
    if (this.fresh) {
      this.cur = d
      this.fresh = false
    } else {
      this.cur = this.cur === '0' ? d : this.cur.length < 12 ? this.cur + d : this.cur
    }
  }

  private dot() {
    if (this.fresh) {
      this.cur = '0.'
      this.fresh = false
    } else if (!this.cur.includes('.')) this.cur += '.'
  }

  private backspace() {
    if (this.fresh) return
    this.cur = this.cur.length > 1 ? this.cur.slice(0, -1) : '0'
  }

  private clearAll() {
    this.cur = '0'
    this.acc = null
    this.op = null
    this.expr = ''
    this.fresh = false
  }

  private opKey(op: string) {
    if (this.acc !== null && this.op && !this.fresh) {
      // 连续运算：先算上一步
      this.acc = this.apply(this.acc, parseFloat(this.cur), this.op)
    } else {
      this.acc = parseFloat(this.cur)
    }
    this.op = op
    this.expr = `${this.fmt(this.acc)} ${op}`
    this.fresh = true
  }

  private fresh = false

  private equals() {
    if (this.acc === null || !this.op) return
    const r = this.apply(this.acc, parseFloat(this.cur), this.op)
    this.expr = `${this.fmt(this.acc)} ${this.op} ${this.cur} =`
    this.cur = this.fmt(r)
    this.acc = null
    this.op = null
    this.fresh = true
  }

  private apply(a: number, b: number, op: string): number {
    switch (op) {
      case '+': return a + b
      case '−': return a - b
      case '×': return a * b
      case '÷': return b === 0 ? NaN : a / b
      default: return b
    }
  }

  private fmt(n: number): string {
    if (!isFinite(n)) return '错误'
    const s = String(Math.round(n * 1e10) / 1e10)
    return s.length > 13 ? n.toExponential(6) : s
  }

  /** 按钮网格几何（显示行下方均分） */
  private grid() {
    const top = STATUS_H + 76
    const gw = W - 16
    const gh = H - top - 12
    const bw = (gw - 3 * 6) / 4
    const bh = (gh - 4 * 6) / 5
    const rows: Array<Array<{ x: number; y: number; w: number; h: number }>> = []
    for (let r = 0; r < 5; r++) {
      const row: Array<{ x: number; y: number; w: number; h: number }> = []
      for (let c = 0; c < 4; c++)
        row.push({ x: 8 + c * (bw + 6), y: top + r * (bh + 6), w: bw, h: bh })
      rows.push(row)
    }
    return rows
  }

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
    })
    // 真机：深灰机身
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.PANEL)
    // 黑色 LCD：表达式（灰）+ 当前数（绿色右对齐大字）
    s.fillRect(8, STATUS_H + 8, W - 16, 60, C.BAR)
    s.textRight(W - 18, STATUS_H + 14, this.expr, { size: 10, color: C.GRAY })
    s.textRight(W - 18, STATUS_H + 34, this.cur.slice(-12), { size: 26, color: C.GREEN })
    s.text(14, STATUS_H + 52, str.calcHint, { size: 8, color: C.GRAY })
    // 按钮网格：数字键深炭（与面板近色）、C 浅灰、运算/等号真机橙（白符号）
    const g = this.grid()
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 4; c++) {
        const k = KEYS[r * 4 + c]
        if (!k) continue
        const b = g[r]![c]!
        const isOp = '÷×−+='.includes(k)
        const isC = k === 'C'
        const bg = isOp ? C.ORANGE : isC ? C.PALE : C.PANEL
        roundRect(s, b.x, b.y, b.w, b.h, 6, bg, null)
        // 真机数字键与面板同为深炭色，靠一圈细暗缝分出按键
        if (!isOp && !isC) {
          s.fillRect(b.x, b.y, b.w, 1, C.BAR)
          s.fillRect(b.x, b.y + b.h - 1, b.w, 1, C.BAR)
          s.fillRect(b.x, b.y, 1, b.h, C.BAR)
          s.fillRect(b.x + b.w - 1, b.y, 1, b.h, C.BAR)
        }
        s.text(b.x + (b.w >> 1) - (k.length > 1 ? 8 : 5), b.y + (b.h >> 1) - 9, k, {
          size: 18,
          color: isOp ? C.WHITE : isC ? C.INK : C.WHITE,
        })
      }
    // 宽 0 键的右半（同色填充盖住接缝）
    const w0 = g[4]![1]!
    s.fillRect(w0.x - 3, w0.y, w0.w + 3, w0.h, C.PANEL)
    s.fillRect(w0.x - 3, w0.y + w0.h - 1, w0.w + 3, 1, C.BAR)
    s.render()
  }
}

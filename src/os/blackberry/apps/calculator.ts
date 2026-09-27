import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Calculator：键盘字母驱动运算（A+/S−/M×/D÷），Enter 求值。
 */
export class CalculatorApp extends BBApp {
  private entry = '0'
  private acc: number | null = null
  private op: Op | null = null
  private fresh = true

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, this.str.apps.calculator!, { size: 18, color: C.WHITE })

    // 显示
    rr(s, 20, 50, 440, 60, 8, C.FIELD_BG)
    s.textRight(448, 66, this.entry, { size: 34, color: C.INK })
    if (this.op) s.text(30, 60, opSymbol(this.op), { size: 18, color: C.G6 })

    // 键位提示网格（纯展示，点击无效，操作靠物理键盘）
    const keys: Array<[string, string]> = [
      ['A', '+'], ['S', '−'], ['M', '×'], ['D', '÷'],
      ['7', ''], ['8', ''], ['9', ''], ['Enter', '='],
      ['4', ''], ['5', ''], ['6', ''], ['C', 'CE'],
      ['1', ''], ['2', ''], ['3', ''], ['0', ''],
    ]
    keys.forEach(([k, v], i) => {
      const x = 20 + (i % 4) * 112, y = 126 + Math.floor(i / 4) * 46
      rr(s, x, y, 104, 40, 6, i < 4 ? C.FIELD_BG : C.G2)
      s.text(x + 10, y + 8, v || k, {
        size: 17, color: i < 4 ? C.SELECT : C.INK,
      })
      if (v) s.text(x + 10, y + 24, k, { size: 11, color: C.G5 })
    })
    s.render()
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (/^[0-9]$/.test(k)) this.digit(k)
    else if (k === '.' || k === ',') {
      if (this.fresh) { this.entry = '0.'; this.fresh = false }
      else if (!this.entry.includes('.')) this.entry += '.'
    } else if (k === 'a' || k === 's' || k === 'm' || k === 'd') {
      this.setOp(k)
    } else if (k === 'ok' || k === 'call') {
      this.equals()
    } else if (k === 'clear') {
      if (this.fresh || this.entry.length <= 1) { this.entry = '0'; this.fresh = true }
      else this.entry = this.entry.slice(0, -1)
    } else if (k === 'back') {
      this.entry = '0'; this.acc = null; this.op = null; this.fresh = true
    } else return
    this.draw()
  }

  private digit(d: string) {
    if (this.fresh) { this.entry = d; this.fresh = false }
    else this.entry = this.entry === '0' ? d : this.entry + d
  }

  private setOp(k: 'a' | 's' | 'm' | 'd') {
    const opMap = { a: 'add', s: 'sub', m: 'mul', d: 'div' } as const
    if (this.op !== null && !this.fresh) this.equals()
    this.acc = parseFloat(this.entry)
    this.op = opMap[k]
    this.fresh = true
  }

  private equals() {
    if (this.op === null || this.acc === null) return
    const b = parseFloat(this.entry)
    let r = this.acc
    switch (this.op) {
      case 'add': r += b; break
      case 'sub': r -= b; break
      case 'mul': r *= b; break
      case 'div': r = b === 0 ? NaN : r / b; break
    }
    this.entry = fmtNum(r)
    this.acc = null
    this.op = null
    this.fresh = true
  }

  protected menuItems(): MenuCommand[] {
    return []
  }
}

type Op = 'add' | 'sub' | 'mul' | 'div'
function opSymbol(op: Op): string {
  return { add: '+', sub: '−', mul: '×', div: '÷' }[op]
}
function fmtNum(n: number): string {
  if (Number.isNaN(n)) return 'Error'
  if (!Number.isFinite(n)) return 'Error'
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

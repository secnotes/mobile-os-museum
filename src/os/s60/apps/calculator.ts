import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, softBar, clearContent, frameRectC } from '../ui'

/**
 * S60 计算器（非触屏）：数字键直接录入，
 * 摇杆选中面板上的运算键，中键执行。
 */
export const calculatorApp: MiniApp = {
  id: 'calculator',
  name: '计算器',
  nameEn: 'Calculator',
  start(ctx) {
    const ui = new CalcUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

const KEYS: ReadonlyArray<readonly [string, string]> = [
  ['C', 'C'], ['±', '±'], ['%', '%'], ['÷', '/'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'],
  ['0', '0'], ['.', '.'], ['=', '='], ['', ''],
]

class CalcUI {
  private offs: Array<() => void> = []
  private sel = 18 // 默认聚焦 =
  private disp = '0'
  private acc: number | null = null
  private op: string | null = null
  private fresh = true // 下一次数字输入覆盖当前显示

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) { this.inputDigit(k); this.draw(); return }
    switch (k) {
      case '.': this.inputDigit('.'); break
      case 'clear': this.press('C'); break
      case 'up': this.move(0, -1); break
      case 'down': this.move(0, 1); break
      case 'left': this.move(-1, 0); break
      case 'right': this.move(1, 0); break
      case 'ok': this.press(KEYS[this.sel]![1]); break
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private move(dx: number, dy: number) {
    let c = this.sel % 4; let r = (this.sel / 4) | 0
    c = (c + dx + 4) % 4
    r = Math.max(0, Math.min(4, r + dy))
    this.sel = r * 4 + c
  }

  private inputDigit(d: string) {
    if (this.fresh) { this.disp = '0'; this.fresh = false }
    if (d === '.') {
      if (!this.disp.includes('.')) this.disp += '.'
    } else {
      this.disp = this.disp === '0' ? d : this.disp + d
    }
    if (this.disp.replace('.', '').length > 12) this.disp = this.disp.slice(0, -1)
  }

  private press(k: string) {
    if (!k) return
    if (/^[0-9.]$/.test(k)) { this.inputDigit(k); return }
    const cur = parseFloat(this.disp)
    if (k === 'C') { this.disp = '0'; this.acc = null; this.op = null; this.fresh = true; return }
    if (k === '±') { this.disp = String(-cur); return }
    if (k === '%') { this.disp = this.fmt((this.acc ?? 0) * cur / 100); this.fresh = true; return }
    if (k === '=') {
      if (this.op !== null && this.acc !== null) {
        this.disp = this.fmt(this.calc(this.acc, cur, this.op))
        this.acc = null; this.op = null
      }
      this.fresh = true
      return
    }
    // 运算键：+-*/
    if (this.op !== null && this.acc !== null && !this.fresh) {
      this.acc = this.calc(this.acc, cur, this.op)
      this.disp = this.fmt(this.acc)
    } else {
      this.acc = cur
    }
    this.op = k
    this.fresh = true
  }

  private calc(a: number, b: number, op: string): number {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b === 0 ? NaN : a / b
      default: return b
    }
  }

  private fmt(n: number): string {
    if (!isFinite(n)) return 'Error'
    let s = String(n)
    if (s.length > 14) s = n.toPrecision(10).replace(/\.?0+$/, '')
    return s
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    clearContent(s)
    // 显示区
    s.fillRect(8, CONTENT_TOP + 8, W - 16, 34, C.WHITE)
    frameRectC(s, 8, CONTENT_TOP + 8, W - 16, 34, C.GRAY)
    s.textRight(W - 14, CONTENT_TOP + 18, this.disp, { size: 20, color: C.INK })
    // 按键面板
    const TOP = CONTENT_TOP + 52
    const PW = 52; const PH = 36
    KEYS.forEach(([label], i) => {
      const c = i % 4; const r = (i / 4) | 0
      const x = 10 + c * PW; const y = TOP + r * PH
      const focused = i === this.sel
      if (focused) s.fillRect(x, y, PW - 4, PH - 4, C.BLUE)
      else frameRectC(s, x, y, PW - 4, PH - 4, C.GRAY)
      if (label)
        s.textCenter(x + (PW - 4) / 2, y + 9, label, { size: 14, color: focused ? C.WHITE : C.INK })
    })
    softBar(s, '', str.contactsBack)
  }
}

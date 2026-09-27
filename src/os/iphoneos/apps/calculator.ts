import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD } from '../fonts'
import { rrGrad } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconCalculator } from '../icons'

/**
 * Calculator（真机 1.0 肖像基础计算器）：
 * 黑色底、白色大数字显示；深灰数字键、浅灰功能键、橙色运算符（选中反白）。
 */
class CalcApp extends IphoneApp {
  private disp = '0'
  private entered = false
  private acc = 0
  private op: '+' | '−' | '×' | '÷' | null = null
  private opSel: '+' | '−' | '×' | '÷' | null = null

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.BLACK)
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })

    // 显示区
    const size = this.disp.length > 8 ? 34 : 52
    s.textRight(310, 74, this.disp, { size, font: F_BOLD(size), color: C.WHITE })
    s.fillRect(8, 131, 304, 1, C.GRAY2)

    // 键
    const labels: Array<[string, string]> = [
      ['clear', 'fn'], ['sign', 'fn'], ['pct', 'fn'], ['÷', 'op'],
      ['7', 'd'], ['8', 'd'], ['9', 'd'], ['×', 'op'],
      ['4', 'd'], ['5', 'd'], ['6', 'd'], ['−', 'op'],
      ['1', 'd'], ['2', 'd'], ['3', 'd'], ['+', 'op'],
    ]
    labels.forEach(([label, kind], i) => {
      const col = i % 4, row = (i / 4) | 0
      const text = label === 'clear' ? (this.entered || this.op ? 'C' : 'AC') : label === 'sign' ? '±' : label === 'pct' ? '%' : label
      this.key(s, 8 + col * 77, 139 + row * 67, 71, 61, text, kind as 'fn' | 'op' | 'd', label as '+' | '−' | '×' | '÷')
    })
    // 底行：0（宽，文字靠左居中位置）, ., =
    rrGrad(s, 8, 407, 148, 61, 30, R.CALC_DARKB)
    s.fillRect(8, 407, 148, 1, C.GRAY3)
    s.text(44, 426, '0', { size: 26, font: F_BOLD(26), color: C.WHITE })
    this.digitKey(s, 162, 407, 71, 61, '.')
    // = 橙色
    rrGrad(s, 239, 407, 71, 61, 30, R.CALC_ORANGE)
    s.textCenter(274, 426, '=', { size: 30, font: F_BOLD(30), color: C.WHITE })
  }

  private key(s: Screen, x: number, y: number, w: number, h: number, text: string, kind: 'fn' | 'op' | 'd', op?: '+'|'−'|'×'|'÷') {
    if (kind === 'd') this.digitKey(s, x, y, w, h, text)
    else if (kind === 'fn') {
      rrGrad(s, x, y, w, h, 30, R.CALC_DARKB)
      s.textCenter(x + (w >> 1), y + 18, text, { size: 26, font: F_BOLD(26), color: C.BLACK })
    } else {
      const selected = this.opSel === op
      if (selected) {
        rrGrad(s, x, y, w, h, 30, R.KEY)
        s.textCenter(x + (w >> 1), y + 18, text, { size: 30, font: F_BOLD(30), color: C.ORANGE })
      } else {
        rrGrad(s, x, y, w, h, 30, R.CALC_ORANGE)
        s.textCenter(x + (w >> 1), y + 18, text, { size: 30, font: F_BOLD(30), color: C.WHITE })
      }
    }
  }

  private digitKey(s: Screen, x: number, y: number, w: number, h: number, text: string) {
    rrGrad(s, x, y, w, h, 30, R.CALC_DARKB)
    s.fillRect(x, y, w, 1, C.GRAY3)
    s.textCenter(x + (w >> 1), y + 18, text, { size: 26, font: F_BOLD(26), color: C.WHITE })
  }

  protected tap(x: number, y: number) {
    if (y < 139) return
    const row = Math.floor((y - 139) / 67)
    if (row < 0 || row > 4) return
    this.click()
    if (row === 4) {
      if (x < 156) this.pressDigit('0')
      else if (x < 233) this.pressDigit('.')
      else this.pressEquals()
      this.draw()
      return
    }
    const col = Math.floor((x - 8) / 77)
    if (col < 0 || col > 3) return
    const grid = [
      ['clear', 'sign', 'pct', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '−'],
      ['1', '2', '3', '+'],
    ] as const
    const b = grid[row]![col]!
    if (/[0-9]/.test(b)) this.pressDigit(b)
    else if (b === 'clear') this.pressClear()
    else if (b === 'sign') this.disp = String(-parseFloat(this.disp))
    else if (b === 'pct') this.disp = String(parseFloat(this.disp) / 100)
    else if (b === '÷' || b === '×' || b === '−' || b === '+') this.pressOp(b)
    this.draw()
  }

  private pressDigit(d: string) {
    if (!this.entered) {
      this.disp = d === '.' ? '0.' : d
      this.entered = true
    } else {
      if (d === '.' && this.disp.includes('.')) return
      if (this.disp.replace(/[-.]/g, '').length >= 11) return
      this.disp += d
    }
    this.opSel = null
  }

  private pressClear() {
    if (this.entered) {
      this.disp = '0'
      this.entered = false
    } else {
      this.acc = 0
      this.op = null
      this.opSel = null
    }
  }

  private pressOp(o: '+' | '−' | '×' | '÷') {
    const v = parseFloat(this.disp)
    if (this.op && this.entered) this.compute(v)
    else this.acc = v
    this.op = o
    this.opSel = o
    this.entered = false
  }

  private pressEquals() {
    if (!this.op) return
    this.compute(parseFloat(this.disp))
    this.op = null
    this.opSel = null
    this.entered = false
  }

  private compute(v: number) {
    switch (this.op) {
      case '+': this.acc += v; break
      case '−': this.acc -= v; break
      case '×': this.acc *= v; break
      case '÷': this.acc = v === 0 ? NaN : this.acc / v; break
    }
    let out = String(Math.round(this.acc * 1e8) / 1e8)
    if (out.length > 11) out = this.acc.toExponential(5)
    this.disp = out
  }
}

export const calcFactory = miniApp('calc', 'Calculator', iconCalculator, (ctx, b) => new CalcApp(ctx, b))

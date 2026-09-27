import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

const OPS = ['+', '-', '×', '÷'] as const
type Op = (typeof OPS)[number]

export const calculatorApp: MiniApp = {
  id: 'calculator',
  name: '计算器',
  nameEn: 'Calc',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '########',
      '#......#',
      '#.####.#',
      '#......#',
      '#.####.#',
      '#......#',
      '########',
    ])
  },
  start(ctx: AppContext) {
    new Calculator(ctx)
  },
}

class Calculator {
  private acc: number | null = null
  private op: Op | null = null
  private cur = '0'
  private err = false

  constructor(private ctx: AppContext) {
    ctx.onKey((k, r) => this.onKey(k, r))
    ctx.onLang(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey, repeat: boolean) {
    if (/^[0-9]$/.test(k)) {
      if (this.err) this.resetEntry()
      if (this.cur.replace(/[-.]/g, '').length >= 8) return
      this.cur = this.cur === '0' ? k : this.cur + k
    } else if (k === '*') {
      if (this.err) return
      if (!this.cur.includes('.')) this.cur += '.'
    } else if (k === 'up' || k === 'down') {
      // 上/下循环选择运算符
      if (this.acc === null) {
        this.acc = parseFloat(this.cur)
        this.cur = '0'
      }
      const i = this.op ? OPS.indexOf(this.op) : -1
      const d = k === 'down' ? 1 : OPS.length - 1
      this.op = OPS[(i + d) % OPS.length]
    } else if (k === 'ok' || k === 'soft1') {
      this.equals()
    } else if (k === 'clear') {
      if (repeat) this.resetAll()
      else if (this.err) this.resetEntry()
      else if (this.cur.length > 1) this.cur = this.cur.slice(0, -1)
      else this.cur = '0'
    } else if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
      return
    } else {
      return
    }
    this.draw()
  }

  private equals() {
    if (this.op === null || this.acc === null) return
    const b = parseFloat(this.cur)
    let r: number
    switch (this.op) {
      case '+': r = this.acc + b; break
      case '-': r = this.acc - b; break
      case '×': r = this.acc * b; break
      case '÷':
        if (b === 0) {
          this.err = true
          this.op = null
          this.acc = null
          return
        }
        r = this.acc / b
        break
    }
    r = Math.round(r * 1e8) / 1e8
    this.cur = String(r).slice(0, 9)
    this.acc = null
    this.op = null
    this.ctx.audio.tone(880, 0.04, { gain: 0.035 })
  }

  private resetEntry() {
    this.err = false
    this.cur = '0'
  }

  private resetAll() {
    this.acc = null
    this.op = null
    this.cur = '0'
    this.err = false
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    s.textCenter(s.w >> 1, 1, str.calcTitle)
    s.invertRect(0, 0, s.w, 12)
    // 表达式行
    const expr = this.acc !== null ? `${fmt(this.acc)}${this.op ?? ''}` : ''
    s.textRight(s.w - 1, 14, expr)
    // 结果行（大字）
    if (this.err) {
      s.textRight(s.w - 1, 24, 'ERROR', { size: 14 })
    } else {
      s.textRight(s.w - 1, 24, this.cur.length > 8 ? this.cur.slice(0, 8) : this.cur, { size: 14 })
    }
    // 底部按键提示
    s.text(1, s.h - 10, str.calcHintLeft)
    s.textRight(s.w - 1, s.h - 10, str.calcHintRight)
  }
}

function fmt(n: number): string {
  return String(Math.round(n * 1e6) / 1e6)
}

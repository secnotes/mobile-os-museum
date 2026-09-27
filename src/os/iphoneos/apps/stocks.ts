import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconStocks } from '../icons'

interface Quote {
  sym: string
  price: number
  chg: number
  pct: number
  seed: number
}

/**
 * Stocks：顶部报价条（点击切换）→ 下方走势图 + 时段分段。
 */
class StocksApp extends IphoneApp {
  private sel = 0
  private span = 2
  private listOpen = false

  private quotes: Quote[] = [
    { sym: this.str.stockNames[0], price: 122.04, chg: 1.30, pct: 1.08, seed: 101 },
    { sym: this.str.stockNames[1], price: 510.05, chg: -4.12, pct: -0.80, seed: 202 },
    { sym: this.str.stockNames[2], price: 29.83, chg: 0.11, pct: 0.37, seed: 303 },
    { sym: this.str.stockNames[3], price: 27.66, chg: -0.58, pct: -2.05, seed: 404 },
    { sym: this.str.stockNames[4], price: 26.90, chg: 0.42, pct: 1.59, seed: 505 },
  ]

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.BLACK)
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.listOpen) this.drawList(s)
    else this.drawMain(s)
  }

  private drawMain(s: Screen) {
    const q = this.quotes[this.sel]
    // 报价条
    s.fillRect(0, 20, 320, 92, C.BLACK)
    s.text(16, 26, q.sym, { size: 22, font: F_BOLD(22), color: C.WHITE })
    s.textRight(304, 26, q.price.toFixed(2), { size: 22, font: F_BOLD(22), color: C.WHITE })
    const up = q.chg >= 0
    rr(s, 16, 56, 86, 28, 4, up ? C.GREEN : C.RED)
    s.textCenter(59, 63, (up ? '+' : '') + q.pct.toFixed(2) + '%', { size: 15, font: F_BOLD(15), color: C.WHITE })
    s.text(112, 65, (up ? '▲' : '▼') + Math.abs(q.chg).toFixed(2), { size: 13, font: F_REG(13), color: C.GRAY4 })
    // 列表按钮（价格下方右缘，真机样式）
    rr(s, 284, 88, 22, 22, 11, C.GRAY2)
    s.textCenter(295, 94, 'i', { size: 14, font: F_BOLD(14), color: C.WHITE })
    // 走势图
    this.drawChart(s, q)
    // 时段分段
    const spans = ['1d', '1w', '1mo', '3mo', '6mo', '1y']
    const labels = spans
    const w = Math.floor(304 / labels.length)
    labels.forEach((lb, i) => {
      const x = 8 + i * w
      if (i === this.span) rr(s, x + 1, 440, w - 2, 30, 4, C.GRAY3)
      s.textCenter(x + w / 2, 448, lb, { size: 12, font: i === this.span ? F_BOLD(12) : F_REG(12), color: C.WHITE })
    })
  }

  private drawChart(s: Screen, q: Quote) {
    const n = [20, 35, 60, 60, 80, 100][this.span]
    const series = walk(q.seed + this.span * 17, n, q.price, q.price * 0.06)
    const x0 = 12, y0 = 128, w = 296, h = 290
    let min = Infinity, max = -Infinity
    series.forEach((v) => { min = Math.min(min, v); max = Math.max(max, v) })
    const pad = (max - min) * 0.12 || 1
    min -= pad; max += pad
    // 水平网格
    for (let i = 0; i <= 4; i++) {
      const y = y0 + Math.round(h * i / 4)
      s.fillRect(x0, y, w, 1, C.GRAY2)
    }
    // 走势线
    let px = 0, py = 0
    series.forEach((v, i) => {
      const x = x0 + Math.round(w * i / (series.length - 1))
      const y = y0 + h - Math.round(h * (v - min) / (max - min))
      if (i) s.line(px, py, x, y, C.YELLOW)
      px = x; py = y
    })
  }

  private drawList(s: Screen) {
    // 股票管理列表（真机 Stocks 的列表页）
    this.quotes.forEach((q, i) => {
      const y = 30 + i * 50
      if (i === this.sel) s.fillRect(0, y, 320, 50, C.GRAY2)
      s.text(16, y + 16, q.sym, { size: 19, font: F_BOLD(19), color: C.WHITE })
      s.textRight(200, y + 16, q.price.toFixed(2), { size: 17, font: F_REG(17), color: C.GRAY4 })
      const up = q.chg >= 0
      rr(s, 228, y + 10, 60, 26, 4, up ? C.GREEN : C.RED)
      s.textCenter(258, y + 17, (up ? '+' : '') + q.pct.toFixed(1) + '%', { size: 13, font: F_BOLD(13), color: C.WHITE })
      s.text(296, y + 16, '≡', { size: 18, font: F_BOLD(18), color: C.GRAY4 })
    })
  }

  protected tap(x: number, y: number) {
    if (this.listOpen) {
      const i = Math.floor((y - 30) / 50)
      if (i >= 0 && i < this.quotes.length) {
        this.sel = i
        this.listOpen = false
        this.draw()
      }
      return
    }
    if (y >= 88 && y < 110 && x > 278) { this.listOpen = true; this.draw(); return }
    if (y >= 440) {
      const i = Math.floor((x - 8) / Math.floor(304 / 6))
      if (i >= 0 && i < 6) { this.span = i; this.draw() }
      return
    }
    if (y < 112) {
      // 点报价条左右半区切换股票
      this.sel = (this.sel + (x < 160 ? this.quotes.length - 1 : 1)) % this.quotes.length
      this.draw()
    }
  }
}

/** 确定性随机游走序列 */
function walk(seed: number, n: number, base: number, vol: number): number[] {
  let a = seed >>> 0
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out: number[] = []
  let v = base - vol * 0.4
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * vol * 0.25 + (base - v) * 0.01
    out.push(v)
  }
  return out
}

export const stocksFactory = miniApp('stocks', 'Stocks', iconStocks, (ctx, b) => new StocksApp(ctx, b))

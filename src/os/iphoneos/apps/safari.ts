import type { Screen } from '../../../hal/screen'
import { C, R as R_TAB } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad, rrStroke } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconSafari } from '../icons'
import { drawNavBarLight } from '../navbar'

type View = 'home' | 'results' | 'bookmarks'

/**
 * Safari：Google 主页 → 搜索结果（本地模拟渲染）；书签；底部工具栏。
 */
class SafariApp extends IphoneApp {
  private view: View = 'home'
  private query = ''
  private url = ''
  private urlEditing = false

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.WHITE)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'bookmarks') {
      drawNavBarLight(s, { title: this.str.bookmarks })
      s.fillRect(0, 44, 320, 392, C.WHITE)
      this.drawBookmarks(s)
      this.drawToolbar(s)
      return
    }
    this.drawUrlBar(s)
    if (this.view === 'home') this.drawHome(s)
    else this.drawResults(s)
    this.drawToolbar(s)
    this.drawKb()
  }

  private drawUrlBar(s: Screen) {
    s.fillRect(0, 20, 320, 52, C.KB_BG)
    // URL 框
    rr(s, 8, 28, 304, 32, 16, C.WHITE)
    rrStroke(s, 8, 28, 304, 32, 16, C.GRAY4)
    if (this.url) s.text(28, 37, this.url, { size: 14, font: F_REG(14), color: C.GRAY3, maxWidth: 270 })
    else s.textCenter(160, 37, this.urlEditing ? '' : 'http://', { size: 14, font: F_REG(14), color: C.GRAY3 })
    if (this.urlEditing && Math.floor(this.blink * 1.6) % 2 === 0) {
      const x = 28 + s.measure(this.url, { size: 14, font: F_REG(14) })
      s.fillRect(x, 32, 2, 17, C.INK)
    }
  }

  private drawHome(s: Screen) {
    // 彩色 Google
    const letters = [
      ['G', C.BLUE], ['o', C.RED], ['o', C.YELLOW], ['g', C.BLUE], ['l', C.GREEN], ['e', C.RED],
    ] as const
    let x = 78
    const y = 150
    letters.forEach(([ch, col]) => {
      s.text(x, y, ch, { size: 40, font: F_BOLD(40), color: col })
      x += s.measure(ch, { size: 40, font: F_BOLD(40) }) + 3
    })
    // 搜索框
    rr(s, 24, 218, 272, 34, 4, C.WHITE)
    rrStroke(s, 24, 218, 272, 34, 4, C.GRAY4)
    s.text(36, 226, this.query, { size: 16, font: F_REG(16), color: C.INK, maxWidth: 240 })
    if (!this.query && Math.floor(this.blink * 1.6) % 2 === 0) s.fillRect(36, 224, 2, 21, C.INK)
    // 两个按钮
    rr(s, 64, 268, 90, 34, 8, C.GRAY7)
    rrStroke(s, 64, 268, 90, 34, 8, C.GRAY5)
    s.textCenter(109, 277, this.str.google + ' ' + this.str.search, { size: 11, font: F_BOLD(11), color: C.GRAY3 })
    rr(s, 168, 268, 90, 34, 8, C.GRAY7)
    rrStroke(s, 168, 268, 90, 34, 8, C.GRAY5)
    s.textCenter(213, 277, 'I’m Feeling Lucky', { size: 9, font: F_BOLD(9), color: C.GRAY3 })
  }

  private drawResults(s: Screen) {
    // 结果条目
    for (let i = 0; i < 5; i++) {
      const y = 86 + i * 72
      s.text(12, y, `${this.query} — 结果 ${i + 1}`, { size: 16, font: F_BOLD(16), color: C.BLUE, maxWidth: 280 })
      s.text(12, y + 22, `www.example-${i}.com/${this.query}`, { size: 12, font: F_REG(12), color: C.GREEN_D, maxWidth: 290 })
      const snippet = '与您的搜索关键词相关的网页内容摘要，来自该网站的简介文字……'
      s.text(12, y + 40, snippet, { size: 12, font: F_REG(12), color: C.GRAY3, maxWidth: 296 })
      s.fillRect(12, y + 62, 296, 1, C.GRAY6)
    }
  }

  private drawBookmarks(s: Screen) {
    const marks = ['Apple', 'Google', 'Wikipedia', 'YouTube', 'Yahoo!']
    marks.forEach((m, i) => {
      const y = 54 + i * 48
      rr(s, 12, y + 6, 28, 28, 6, C.SEARCH_BG)
      s.textCenter(26, y + 14, m[0]!, { size: 15, font: F_BOLD(15), color: C.INK })
      s.text(52, y + 14, m, { size: 18, font: F_REG(18), color: C.INK })
    })
  }

  private drawToolbar(s: Screen) {
    // 黑色底部工具栏（真机渐变黑）
    rrGrad(s, 0, 436, 320, 44, 0, [R_TAB.TAB[0]!, 10])
    s.fillRect(0, 436, 320, 1, C.GRAY2)
    const items: Array<[number, string]> = [
      [40, '‹'], [104, '›'], [160, '📖'], [216, '+'], [280, '▢']
    ]
    items.forEach(([cx, t]) => {
      const active = (cx === 160 && this.view === 'bookmarks')
      s.textCenter(cx, 448, t, { size: 22, font: F_BOLD(22), color: active ? C.WHITE : C.GRAY4 })
    })
  }

  protected tap(x: number, y: number) {
    // 底部工具栏
    if (y >= 436) {
      if (Math.abs(x - 160) < 26) {
        this.view = this.view === 'bookmarks' ? 'home' : 'bookmarks'
        this.kbOn = false
        this.draw()
      }
      return
    }
    if (this.view === 'bookmarks') {
      const i = Math.floor((y - 54) / 48)
      if (i >= 0 && i < 5) {
        this.url = 'http://www.' + ['apple','google','wikipedia','youtube','yahoo'][i] + '.com'
        this.view = 'results'
        this.query = this.url
        this.draw()
      }
      return
    }
    // URL 框
    if (y >= 28 && y < 60) {
      this.urlEditing = true
      this.kbOn = true
      this.draw()
      if (y < 264) return
    }
    // 主页搜索框
    if (this.view === 'home' && y >= 218 && y < 252 && !this.kbOn) {
      this.kbOn = true
      this.draw()
      return
    }
    if (y >= 264) {
      const a = this.kb.tap(this.ctx.screen, x, y, this.ime)
      if (a) {
        this.click()
        if (a.type === 'ret') {
          if (this.urlEditing) { this.urlEditing = false; this.url = this.url || this.query }
          else this.search()
        } else this.kbAction(a)
      }
      this.draw()
    }
  }

  private search() {
    if (!this.query) return
    this.view = 'results'
  }

  protected insertText(t: string) {
    if (this.urlEditing) this.url += t
    else this.query += t
  }
  protected backspaceText() {
    if (this.urlEditing) this.url = this.url.slice(0, -1)
    else this.query = this.query.slice(0, -1)
  }
}

export const safariFactory = miniApp('safari', 'Safari', iconSafari, (ctx, b) => new SafariApp(ctx, b))

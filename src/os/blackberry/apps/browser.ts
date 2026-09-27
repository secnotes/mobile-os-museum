import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Browser：书签 → 加载动画 → 渲染简化网页。
 */

interface Bookmark {
  name: string
  url: string
}

type Mode = 'list' | 'loading' | 'page'

export class BrowserApp extends BBApp {
  private mode: Mode = 'list'
  private sel = 0
  private marks: Bookmark[] = []
  private pageOff = 0
  private loadAt = 0
  private tSec = 0

  protected onStart() {
    this.ctx.onFrame((dt) => {
      this.tSec += dt
      if (this.mode === 'loading') this.draw()
    })
    const zh = this.ctx.lang.get() === 'zh'
    this.marks = zh
      ? [
        { name: '莓友在线', url: 'http://www.bber.cn' },
        { name: '新浪新闻', url: 'http://news.sina.cn' },
        { name: '天气查询', url: 'http://weather.sina.cn' },
        { name: '掌上博物馆', url: 'http://museum.example' },
      ]
      : [
        { name: 'CrackBerry', url: 'http://crackberry.com' },
        { name: 'BBC News', url: 'http://news.bbc.co.uk' },
        { name: 'Weather', url: 'http://weather.example' },
        { name: 'Pocket Museum', url: 'http://museum.example' },
      ]
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'list') this.drawList()
    else if (this.mode === 'loading') this.drawLoading()
    else this.drawPage()
    s.render()
  }

  private drawList() {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 36, 0, [C.WP2, 3])
    s.text(12, 8, this.str.bookmarks, { size: 19, color: C.WHITE })
    this.marks.forEach((m, i) => {
      const y = 44 + i * 44
      if (i === this.sel) rr(s, 2, y, 476, 40, 5, C.FIELD_BG)
      // 小地球
      s.fillRect(12, y + 10, 18, 18, C.WHITE)
      s.fillRect(12, y + 10, 18, 18, C.SELECT)
      s.fillRect(20, y + 11, 2, 16, C.WHITE)
      s.text(40, y + 4, m.name, { size: 16, color: C.INK })
      s.text(40, y + 22, m.url, { size: 12, color: C.G5 })
    })
  }

  private drawLoading() {
    const s = this.ctx.screen
    const m = this.marks[this.sel]
    rrGrad(s, 0, 0, 480, 36, 0, [C.WP2, 3])
    s.text(12, 8, m!.url, { size: 15, color: C.WHITE })
    const p = Math.min(1, (this.tSec - this.loadAt) / 1.8)
    s.textCenter(240, 130, m!.name, { size: 22, color: C.INK })
    rr(s, 100, 180, 280, 8, 4, C.G3)
    rr(s, 100, 180, Math.round(280 * p), 8, 4, C.SELECT)
    if (p >= 1) this.mode = 'page'
  }

  private drawPage() {
    const s = this.ctx.screen
    const m = this.marks[this.sel]
    rrGrad(s, 0, 0, 480, 30, 0, [C.WP2, 3])
    s.text(10, 7, m!.url, { size: 13, color: C.WHITE })
    const zh = this.ctx.lang.get() === 'zh'
    // 简化网页：标题 + 段落灰线 + 蓝链接
    const y0 = 44 - this.pageOff
    s.text(16, y0, m!.name, { size: 24, color: C.INK })
    let y = y0 + 40
    for (let p = 0; p < 5; p++) {
      const link = p === 2
      for (let l = 0; l < 3; l++) {
        const w = 300 + ((p * 31 + l * 53) % 130)
        s.fillRect(16, y, Math.min(w, 448), 3, link ? C.SEL_L : C.G4)
        y += 10
      }
      if (link) {
        s.text(16, y - 4, zh ? '更多内容 »' : 'Read more »', { size: 13, color: C.LINK })
        y += 8
      }
      y += 12
    }
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'list') {
      const n = this.marks.length
      if (k === 'up') this.sel = (this.sel + n - 1) % n
      else if (k === 'down') this.sel = (this.sel + 1) % n
      else if (k === 'ok') { this.mode = 'loading'; this.loadAt = this.tSec }
      else return
    } else if (this.mode === 'page') {
      if (k === 'up') this.pageOff = Math.max(0, this.pageOff - 40)
      else if (k === 'down') this.pageOff += 40
      else if (k === 'back') this.mode = 'list'
      else return
    } else return
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    return this.mode === 'page'
      ? [{ label: this.str.back, fn: () => { this.mode = 'list'; this.pageOff = 0; this.draw() } }]
      : []
  }
}

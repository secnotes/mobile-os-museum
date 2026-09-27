import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent, clipToWidth, frameRectC } from '../ui'

/**
 * 服务（互联网）：书签 / 地址栏（T9 输入）+ 程序化离线页面
 * （百度式主页 / 新闻页 / Google 页 / 404）。
 */
export const webApp: MiniApp = {
  id: 'web',
  name: '服务',
  nameEn: 'Web',
  start(ctx) {
    const ui = new WebUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type PageId = 'baidu' | 'news' | 'google'

const BOOKMARKS: Array<{ zh: string; en: string; url: string; page: PageId }> = [
  { zh: '百度', en: 'Baidu', url: 'wap.baidu.com', page: 'baidu' },
  { zh: '新浪新闻', en: 'Sina News', url: 'sina.cn/news', page: 'news' },
  { zh: '谷歌', en: 'Google', url: 'google.com', page: 'google' },
]

type View = 'home' | 'browse' | 'addr'

class WebUI {
  private offs: Array<() => void> = []
  private view: View = 'home'
  private sel = 0
  private history: PageId[] = []
  private draft = ''
  private t9 = new T9()
  private browsePage: PageId = 'baidu'

  constructor(private ctx: AppContext) {}

  async init() {
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (this.view === 'addr') return this.addrKey(k)
    if (this.view === 'browse') {
      switch (k) {
        case 'soft2': case 'back':
          this.history.pop()
          if (this.history.length) this.browsePage = this.history[this.history.length - 1]!
          else this.view = 'home'
          break
        case 'soft1': this.openAddr(); return
        case 'ok':
          // 页面内“链接”：百度首页直接进新闻
          this.openPage('news')
          break
        default: return
      }
      this.draw()
      return
    }
    switch (k) {
      case 'up': this.sel = (this.sel + BOOKMARKS.length - 1) % BOOKMARKS.length; break
      case 'down': this.sel = (this.sel + 1) % BOOKMARKS.length; break
      case 'ok': this.openPage(BOOKMARKS[this.sel]!.page); break
      case 'soft1': this.openAddr(); return
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private openPage(p: PageId) {
    this.history.push(p)
    this.browsePage = p
    this.view = 'browse'
    this.ctx.host.recordEvent?.({ kind: 'data', dir: 'out', text: `GPRS ${p}` })
  }

  private openAddr() {
    this.view = 'addr'
    this.draft = ''
    this.t9.reset()
  }

  private addrKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else switch (k) {
      case 'ok': {
        const out = this.t9.select()
        if (out) this.draft += out
        break
      }
      case 'left': this.t9.cycleCand(-1); break
      case 'right': this.t9.cycleCand(1); break
      case 'clear':
        if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
        break
      case '#': this.t9.cycleMode(); break
      case 'soft1': this.resolveAddr(); return
      case 'soft2': case 'back': this.view = this.history.length ? 'browse' : 'home'; break
      default: return
    }
    this.draw()
  }

  /** 地址栏：匹配书签直达，其余 404 简化为百度（博物馆离线环境） */
  private resolveAddr() {
    const q = (this.draft + (this.t9.expire() ?? '')).toLowerCase()
    const hit = BOOKMARKS.find((b) => b.url.includes(q) || (b.en.toLowerCase() === q.trim()))
    this.openPage(hit?.page ?? 'baidu')
    this.draw()
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'home') {
      titleBar(s, en ? 'Web' : '服务')
      s.textCenter(W / 2, CONTENT_TOP + 16, en ? 'Bookmarks' : '书签', { size: 13, color: C.GRAY })
      BOOKMARKS.forEach((b, i) => {
        const y = CONTENT_TOP + 44 + i * 44
        const selRow = i === this.sel
        if (selRow) s.fillRect(8, y - 2, W - 16, 40, C.BLUE)
        s.text(18, y + 6, '🌐', { size: 15, color: selRow ? C.AMBER : C.BLUE })
        s.text(48, y + 6, en ? b.en : b.zh, { size: 14, color: selRow ? C.WHITE : C.INK })
        s.text(48, y + 23, b.url, { size: 10, color: selRow ? C.PALE : C.GRAY })
      })
      softBar(s, en ? 'Go to' : '转到', str.contactsBack)
    } else if (this.view === 'browse') {
      const bm = BOOKMARKS.find((b) => b.page === this.browsePage)!
      titleBar(s, bm.url)
      this.drawPage(this.browsePage, en)
      softBar(s, en ? 'Address' : '地址', str.contactsBack)
    } else {
      titleBar(s, en ? 'Go to address' : '输入地址')
      s.fillRect(10, CONTENT_TOP + 20, W - 20, 34, C.WHITE)
      frameRectC(s, 10, CONTENT_TOP + 20, W - 20, 34, C.GRAY)
      const hint = this.t9.hint()
      s.text(18, CONTENT_TOP + 30, (this.draft + hint) || 'http://',
        { size: 14, color: hint ? C.BLUE : C.INK })
      s.textCenter(W / 2, CONTENT_TOP + 72, en ? 'Enter address, press Go' : '输入网址后按转到',
        { size: 11, color: C.GRAY })
      softBar(s, en ? 'Go' : '转到', str.contactsBack)
    }
  }

  /** 程序化页面 */
  private drawPage(p: PageId, en: boolean) {
    const s = this.ctx.screen
    const TOP = CONTENT_TOP + 10
    if (p === 'baidu') {
      // 百度：蓝色“百”字方块 + 搜索框
      s.fillRect(W / 2 - 22, TOP + 6, 44, 44, C.BLUE)
      s.textCenter(W / 2, TOP + 18, en ? 'B' : '百', { size: 26, color: C.WHITE })
      s.fillRect(20, TOP + 62, W - 40, 28, C.WHITE)
      frameRectC(s, 20, TOP + 62, W - 40, 28, C.GRAY)
      s.text(28, TOP + 72, en ? 'Search…' : '搜索一下…', { size: 12, color: C.GRAY })
      const links = en
        ? ['News', 'Maps', 'Tieba', 'More »']
        : ['新闻', '地图', '贴吧', '更多»']
      links.forEach((l, i) => s.text(28 + i * 48, TOP + 104, l, { size: 11, color: C.BLUE }))
      s.textCenter(W / 2, TOP + 150, en ? '© Baidu (procedural)' : '© 百度（程序页）',
        { size: 9, color: C.GRAY })
    } else if (p === 'news') {
      const heads = en
        ? ['Tech fair opens in Beijing', 'New subway line starts', 'Weekend weather: clear',
          'Stocks close higher', 'City marathon Sunday']
        : ['科技展在北京开幕', '新地铁线路开通', '周末天气晴朗',
          '股市收涨', '城市马拉松周日开跑']
      s.text(14, TOP + 6, en ? 'Top stories' : '头条', { size: 14, color: C.RED })
      heads.forEach((h, i) => {
        const y = TOP + 34 + i * 34
        s.text(14, y + 3, '●', { size: 8, color: C.AMBER })
        s.text(28, y + 4, clipToWidth(s, h, 170, 12), { size: 12, color: C.INK })
        s.text(28, y + 19, en ? `${i + 1}h ago` : `${i + 1} 小时前`,
          { size: 9, color: C.GRAY })
      })
    } else {
      // Google 彩色字标 + 搜索框
      const letters: Array<[string, number]> = [['G', C.BLUE], ['o', C.RED], ['o', C.AMBER],
        ['g', C.BLUE], ['l', C.GREEN], ['e', C.RED]]
      let x = W / 2 - 48
      letters.forEach(([ch, col]) => {
        s.text(x, TOP + 14, ch, { size: 26, color: col })
        x += s.measure(ch, { size: 26 }) + 2
      })
      s.fillRect(20, TOP + 60, W - 40, 28, C.WHITE)
      frameRectC(s, 20, TOP + 60, W - 40, 28, C.GRAY)
      s.text(28, TOP + 70, en ? 'Search' : '搜索', { size: 12, color: C.GRAY })
    }
  }
}

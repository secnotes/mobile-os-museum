import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, wrapText, iconTile, clipToWidth } from '../ui'

/** 内置书签（点击 → 载入 → 文章页） */
const BUILTIN = ['Google', 'Wikipedia', 'Android.com']

/** 主屏搜索对话框提交的关键词（照 dialer 的 pendingNumber 模式） */
let pendingQuery: string | null = null
export function setPendingQuery(q: string) {
  pendingQuery = q
}

/**
 * Android 1.0 浏览器：无页面时为书签页（内置书签 + 自建书签持久化、
 * 新窗口）；地址栏/搜索框全键盘输入回车导航；Google 彩色主页；
 * 载入进度条 → 程序页。MENU：新窗口 / 添加书签 / 刷新。
 */
export const browserApp: MiniApp = {
  id: 'browser',
  name: '浏览器',
  nameEn: 'Browser',
  icon(s, x, y) {
    iconTile(s, x, y, C.BLUE, C.LBLUE)
    // 白色地球 + 经纬线
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const d = dx * dx + dy * dy
        if (d <= 81) s.pset(x + 14 + dx, y + 14 + dy, C.WHITE)
      }
    s.fillRect(x + 7, y + 13, 14, 2, C.BLUE)
    s.fillRect(x + 13, y + 7, 2, 14, C.BLUE)
    s.fillRect(x + 9, y + 9, 10, 10, C.BLUE)
    s.fillRect(x + 10, y + 10, 8, 8, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new BrowserUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type View = 'bmarks' | 'home' | 'loading' | 'article'
type Sheet = null | 'menu' | 'url' | 'query'

class BrowserUI {
  private view: View = 'bmarks'
  private sheet: Sheet = null
  private url = ''
  private input = ''
  private extra: string[] = []
  private loadP = 0
  private toastText = ''
  private toastUntil = 0
  private dead = false
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.extra = (await this.ctx.store.get<string[]>('bookmarks')) ?? []
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.view !== 'loading') return
      this.loadP += dt / 1.1
      if (this.loadP >= 1) this.view = 'article'
      this.draw()
    }))
    // 主屏搜索键 / 搜索对话框带来的查询：直接走 Google 搜索载入
    if (pendingQuery) {
      this.url = `google.com/search?q=${encodeURIComponent(pendingQuery)}`
      pendingQuery = null
      this.startLoad()
      return
    }
    this.draw()
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    if (this.sheet) {
      if (this.editorKey(k)) this.draw()
      return
    }
    if (this.view === 'loading') return
    if (k === 'menu') {
      this.sheet = 'menu'
      this.draw()
      return
    }
    if (this.view === 'article') {
      if (k === 'back' || k === 'ok') { this.view = 'bmarks'; this.draw() }
      return
    }
    if (this.view === 'home') {
      if (k === 'back') { this.view = 'bmarks'; this.draw() }
      return
    }
    // bmarks
    if (k === 'back') this.ctx.exit()
  }

  /** 输入弹层按键；返回是否需要重绘 */
  private editorKey(k: DeviceKey): boolean {
    if (k === 'back') {
      this.sheet = null
      return true
    }
    if (k === 'clear') {
      if (this.input) { this.input = this.input.slice(0, -1); return true }
      return false
    }
    if (k === 'ok') {
      this.submitInput()
      return true
    }
    let ch: string | null = null
    if (/^[a-z0-9]$/.test(k)) ch = k
    else if (k === '.') ch = '.'
    else if (k === 'space') ch = ' '
    if (ch && this.input.length < 40) {
      this.input += ch
      return true
    }
    return false
  }

  private submitInput() {
    const q = this.input.trim()
    this.input = ''
    this.sheet = null
    if (!q) return
    // 由弹层类型决定去处（lastSheetWasQuery 在 openEditor 时记录）
    if (this.lastSheetWasQuery) {
      this.url = `google.com/search?q=${encodeURIComponent(q)}`
      this.startLoad()
    } else {
      this.url = q.includes('.') ? q : `google.com/search?q=${encodeURIComponent(q)}`
      if (q.toLowerCase() === 'google') { this.view = 'home'; return }
      this.startLoad()
    }
  }

  private lastSheetWasQuery = false

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.sheet) {
      this.sheetTap(x, y)
      return
    }
    // 地址栏（任意页面）
    if (y >= STATUS_H + 4 && y <= STATUS_H + 32) {
      this.openEditor('url')
      return
    }
    if (this.view === 'loading') return
    if (this.view === 'bmarks') {
      const all = [...BUILTIN, ...this.extra]
      const y0 = STATUS_H + 64
      for (let i = 0; i < all.length; i++) {
        if (y >= y0 + i * 46 && y < y0 + (i + 1) * 46) {
          this.url = i === 0 ? 'google.com' : `${all[i]!.toLowerCase().replace(/\s/g, '')}.com`
          if (i === 0) { this.view = 'home'; this.draw(); return }
          this.startLoad()
          return
        }
      }
      // 新窗口行
      const nwy = y0 + all.length * 46 + 6
      if (y >= nwy && y < nwy + 42) this.showToast(androidStrings(this.ctx.lang.get()).brNewWindow)
      return
    }
    if (this.view === 'home') {
      // 搜索框
      const fy = 222
      if (y >= fy && y < fy + 36) {
        this.openEditor('query')
      }
    }
  }

  private sheetTap(x: number, y: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.sheet === 'menu') {
      const rows = [
        () => this.showToast(str.brNewWindow),
        () => void this.addBookmark(),
        () => this.refresh(),
      ]
      for (let i = 0; i < 3; i++) {
        const ry = STATUS_H + 60 + i * 52
        if (y >= ry && y < ry + 46 && x >= 12 && x <= W - 12) {
          rows[i]!()
          this.sheet = null
          this.draw()
          return
        }
      }
      this.sheet = null
      this.draw()
      return
    }
    // url / query：点卡片外关闭
    if (y < STATUS_H + 120 || y > H - 90) {
      this.sheet = null
      this.input = ''
      this.draw()
    }
  }

  private openEditor(kind: 'url' | 'query') {
    this.sheet = kind
    this.lastSheetWasQuery = kind === 'query'
    this.input = ''
    this.draw()
  }

  private startLoad() {
    this.view = 'loading'
    this.loadP = 0
    this.draw()
  }

  private refresh() {
    if (this.view === 'bmarks') return
    this.url = this.url || 'google.com'
    this.startLoad()
  }

  private async addBookmark() {
    const str = androidStrings(this.ctx.lang.get())
    const name = this.view === 'home' ? 'Google' : clipToWidth(this.ctx.screen, this.url || str.brBookmarks, 24, 10)
    if (!this.extra.includes(name)) {
      this.extra = [...this.extra, name].slice(-8)
      await this.ctx.store.set('bookmarks', this.extra)
    }
    this.showToast(str.brAdded)
  }

  private showToast(t: string) {
    this.toastText = t
    this.toastUntil = Date.now() + 2000
  }

  // ---------- 绘制 ----------

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
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    this.drawAddr(str)
    switch (this.view) {
      case 'bmarks': this.drawBmarks(str); break
      case 'home': this.drawHome(str); break
      case 'loading': this.drawLoading(str); break
      case 'article': this.drawArticle(str); break
    }
    if (this.sheet) this.drawSheet(str)
    if (Date.now() < this.toastUntil) {
      roundRect(s, 24, H - 100, W - 48, 32, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 90, this.toastText, { size: 11, color: C.WHITE })
    }
    s.render()
  }

  private drawAddr(str: ReturnType<typeof androidStrings>) {
    const loading = this.view === 'loading'
    roundRect(this.ctx.screen, 6, STATUS_H + 4, W - 12, 30, 6, loading ? C.MSGIN : C.PALE, C.GRAY)
    s_text(this.ctx.screen, 16, STATUS_H + 13, this.url || str.brAboutBlank, {
      size: 11,
      color: this.url ? C.INK : C.GRAY,
    })
    // 右缘星标
    starOutline(this.ctx.screen, W - 26, STATUS_H + 11, C.GRAY)
  }

  private drawBmarks(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.text(12, STATUS_H + 46, str.brBookmarks, { size: 12, color: C.GRAY })
    const all = [...BUILTIN, ...this.extra]
    const y0 = STATUS_H + 64
    all.forEach((name, i) => {
      const y = y0 + i * 46
      // 首条 Google 彩色圆块；其余蓝块 + 首字母
      if (i === 0) {
        roundRect(s, 12, y + 8, 30, 30, 6, C.BLUE, null)
        s.textCenter(27, y + 16, 'g', { size: 16, color: C.WHITE })
      } else {
        roundRect(s, 12, y + 8, 30, 30, 6, C.PALE, null)
        s.textCenter(27, y + 17, name[0]!, { size: 13, color: C.INK })
      }
      s.text(52, y + 17, clipToWidth(s, name, W - 70, 13), { size: 13, color: C.INK })
    })
    // 新窗口
    const nwy = y0 + all.length * 46 + 6
    roundRect(s, 12, nwy, W - 24, 42, 7, C.MSGIN, null)
    s.textCenter(W >> 1, nwy + 14, '+ ' + str.brNewWindow, { size: 12, color: C.BLUE })
  }

  private drawHome(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    // Google 彩色字标
    const colors = [C.BLUE, C.RED, C.AMBER, C.BLUE, C.GREEN, C.RED]
    let x = (W >> 1) - 66
    void ['G', 'o', 'o', 'g', 'l', 'e'].forEach((ch, i) => {
      x += s.text(x, 130, ch, { size: 34, color: colors[i] }) + 2
    })
    // 搜索框
    const fy = 222
    roundRect(s, 30, fy, W - 60, 36, 6, C.WHITE, C.BLUE)
    s.text(44, fy + 11, str.browserSearch, { size: 12, color: C.GRAY })
    // 右侧像素放大镜
    const mx = W - 40
    const my = fy + 18
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 >= 20 && d2 <= 38) s.pset(mx + dx, my + dy, C.BLUE)
      }
    for (let i = 0; i < 7; i++) s.fillRect(mx + 5 + (i >> 1), my + 5 + i, 2, 2, C.BLUE)
  }

  private drawLoading(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, (H >> 1) - 36, str.browserLoading, { size: 12, color: C.GRAY })
    s.fillRect(20, H >> 1, W - 40, 5, C.PALE)
    s.fillRect(20, H >> 1, Math.round((W - 40) * this.loadP), 5, C.GREEN)
    s.textCenter(W >> 1, (H >> 1) + 22, `${Math.round(this.loadP * 100)}%`, { size: 11, color: C.GRAY })
  }

  private drawArticle(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const body =
      this.ctx.lang.get() === 'zh'
        ? '2008 年 10 月 22 日，T-Mobile 与 Google 在纽约发布第一台 Android 手机 G1。' +
          '3.2 英寸触屏、侧滑全键盘、轨迹球——它没有 iPhone 那样光鲜，却把「开源」带进了每个人的口袋。' +
          '此后 Android 成了地球上用户最多的操作系统，而这一切都从这台带下巴的机器开始。'
        : 'On October 22, 2008, T-Mobile and Google unveiled the G1 in New York — the first Android phone. ' +
          'A 3.2-inch touchscreen, a slide-out keyboard, a trackball: less glamorous than the iPhone, ' +
          'it put open source into everyone\'s pocket. Android would become the most-used OS on Earth, ' +
          'and it all started with this chin-faced machine.'
    s.text(20, STATUS_H + 46, clipToWidth(s, str.browserResult2, W - 40, 15), { size: 15, color: C.INK })
    s.fillRect(20, STATUS_H + 68, W - 40, 1, C.PALE)
    wrapText(s, body, W - 40, 12).forEach((ln, i) =>
      s.text(20, STATUS_H + 84 + i * 17, ln, { size: 12, color: C.INK }))
    s.textCenter(W >> 1, H - 26, str.browserDone, { size: 9, color: C.GRAY })
  }

  /** MENU 操作表 / 输入卡 */
  private drawSheet(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    if (this.sheet === 'menu') {
      s.fillRect(0, STATUS_H + 40, W, H - STATUS_H - 40, C.PANEL)
      const labels = [str.brNewWindow, str.brAddBookmark, str.brRefresh]
      labels.forEach((label, i) => {
        const y = STATUS_H + 60 + i * 52
        roundRect(s, 18, y + 6, 24, 24, 6, i === 0 ? C.BLUE : i === 1 ? C.AMBER : C.GREEN, null)
        s.text(52, y + 15, label, { size: 13, color: C.WHITE })
      })
      return
    }
    // 输入卡
    s.fillRect(0, 0, W, H, C.BAR)
    roundRect(s, 16, STATUS_H + 120, W - 32, 96, 10, C.PANEL, null)
    const title = this.sheet === 'url' ? str.brUrlHint : str.browserSearch
    s.text(32, STATUS_H + 140, title, { size: 12, color: C.PALE })
    roundRect(s, 32, STATUS_H + 160, W - 64, 30, 6, C.INK, C.METAL)
    s.text(42, STATUS_H + 169, this.input || ' ', { size: 13, color: C.GREEN })
    if (this.input) {
      const w = s.measure(this.input, { size: 13 })
      s.fillRect(42 + w, STATUS_H + 168, 2, 14, C.GREEN)
    }
  }
}

// 小工具（避免与 Screen 命名混淆的本地别名）
function s_text(s: AppContext['screen'], x: number, y: number, t: string, opts: { size: number; color: number }) {
  s.text(x, y, t, opts)
}

function starOutline(s: AppContext['screen'], x: number, y: number, color: number) {
  s.fillRect(x + 3, y, 2, 1, color)
  s.fillRect(x + 1, y + 2, 1, 1, color)
  s.fillRect(x + 6, y + 2, 1, 1, color)
  s.fillRect(x, y + 4, 1, 1, color)
  s.fillRect(x + 7, y + 4, 1, 1, color)
  s.fillRect(x + 1, y + 6, 1, 1, color)
  s.fillRect(x + 6, y + 6, 1, 1, color)
}

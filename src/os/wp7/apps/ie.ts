import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, wrapText, clipToWidth } from '../ui'
import { MetroKb } from '../kb'
import { onTrayChange } from '../ui'

/**
 * Internet Explorer（Mango 预装，真机为 IE9 移动版）：
 * 地址栏 + 收藏页；页面全部离线绘制（Bing、人民网新闻、天气）。
 */
export const ieApp: MiniApp = {
  id: 'ie',
  name: 'Internet Explorer',
  nameEn: 'Internet Explorer',
  start(ctx: AppContext) {
    const ui = new IEUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type PageId = 'start' | 'bing' | 'news' | 'weather' | 'generic'

const KB_TOP = 470
const PAGE_TOP = 150

class IEUI {
  private page: PageId = 'start'
  private url = ''
  private kb!: MetroKb
  private edit = false
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    this.kb = new MetroKb(this.ctx, () => this.draw())
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.edit) this.edit = false
      else if (this.page !== 'start') this.page = 'start'
      else this.ctx.exit()
      this.draw()
      return
    }
    if (this.edit) {
      if (k === 'ok') this.navigate()
      else this.kb.key(k)
    }
  }

  private navigate() {
    const q = (this.kb.text + this.kb.ime.buf).trim()
    this.edit = false
    this.url = q
    const lower = q.toLowerCase()
    if (lower.includes('bing') || lower === '') this.page = 'bing'
    else if (lower.includes('news') || lower.includes('人民') || lower.includes('新闻')) this.page = 'news'
    else if (lower.includes('weather') || lower.includes('天气')) this.page = 'weather'
    else this.page = 'generic'
    this.draw()
  }

  private onTap(x: number, y: number) {
    const str = wpStrings(this.ctx.lang.get())
    if (this.edit) {
      this.kb.tap(x, y, KB_TOP)
      return
    }
    // 地址栏
    if (y >= 96 && y < 150) {
      this.edit = true
      this.kb.text = this.url
      this.kb.mode = 'en'
      this.kb.ime.reset()
      this.draw()
      return
    }
    if (this.page === 'start') {
      const items: Array<[PageId, string]> = [
        ['bing', str.ieBing], ['news', str.ieNews], ['weather', str.ieWeather],
      ]
      const r = Math.floor((y - PAGE_TOP - 46) / 80)
      if (r >= 0 && r < items.length) {
        this.page = items[r]![0]
        this.url = ''
        this.draw()
      }
      return
    }
    void str
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    s.text(24, TRAY_H + 16, str.ieTitle, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    // 地址栏（暗灰圆角条）
    const addr = this.edit ? this.kb.text : this.url || str.ieAddress
    for (let dy = 0; dy < 52; dy++)
      for (let dx = 0; dx < W - 48; dx++) {
        const r = Math.min(dx, dy, W - 49 - dx, 51 - dy)
        if (r >= 4) s.pset(24 + dx, 96 + dy, C.DIM)
      }
    s.text(44, 108, clipToWidth(s, addr, W - 90, 24, F_REG(24)), {
      size: 24, font: F_REG(24), color: this.url || this.edit ? C.WHITE : C.GRAY,
    })
    if (this.edit) {
      this.kb.onSend = () => this.navigate()
      this.kb.draw(s, KB_TOP)
      s.render()
      return
    }
    if (this.page === 'start') this.drawStart(str)
    else this.drawPage(str)
    s.render()
  }

  private drawStart(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    // 「收藏夹」栏目标签须在地址栏（96..148）之下；原 PAGE_TOP-36=114 与地址栏文字重合
    s.text(24, PAGE_TOP + 6, str.ieFav, { size: 22, font: F_REG(22), color: C.GRAY })
    const items = [str.ieBing, str.ieNews, str.ieWeather]
    items.forEach((name, i) => {
      const y = PAGE_TOP + 46 + i * 80
      s.text(24, y + 4, name, { size: 28, font: F_REG(28), color: C.WHITE })
      for (let k = 0; k < 14; k++)
        s.fillRect(W - 36 + k, y + 12 + k, 3, 24 - k * 2, C.WHITE)
      s.fillRect(24, y + 62, W - 48, 1, C.DIM)
    })
  }

  /** 各离线页内容（程序排版绘制） */
  private drawPage(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    if (this.page === 'bing') {
      // Bing：强调色 b 大字 + 搜索框
      const accent = this.ctx.host.getAccent?.() ?? C.BLUE
      s.textCenter(W / 2, 250, 'b', { size: 120, font: F_SEMI(120), color: accent })
      s.textCenter(W / 2, 330, 'Bing', { size: 30, font: F_LIGHT(30), color: C.GRAY })
      s.fillRect(60, 380, W - 120, 44, C.DIM)
      return
    }
    if (this.page === 'news') {
      s.fillRect(24, PAGE_TOP - 8, 6, 40, C.RED)
      s.text(44, PAGE_TOP, str.ieNews, { size: 30, font: F_SEMI(30), color: C.WHITE })
      const heads = str.ieNewsItems
      heads.forEach((h, i) => {
        const y = PAGE_TOP + 70 + i * 96
        if (y > H - 60) return
        s.fillRect(24, y, 90, 4, C.WHITE)
        const lines = wrapText(s, h, W - 48, 24, F_REG(24))
        lines.forEach((l, li) =>
          s.text(24, y + 18 + li * 30, clipToWidth(s, l, W - 48, 24, F_REG(24)), {
            size: 24, font: F_REG(24), color: C.WHITE,
          }))
      })
      return
    }
    if (this.page === 'weather') {
      s.text(24, PAGE_TOP, str.ieWeather, { size: 30, font: F_SEMI(30), color: C.WHITE })
      s.text(24, PAGE_TOP + 90, str.ieWeatherNow, { size: 64, font: F_LIGHT(64), color: C.WHITE })
      s.text(24, PAGE_TOP + 200, str.ieWeatherSub, { size: 24, font: F_REG(24), color: C.GRAY })
      return
    }
    // generic：“必应搜索结果”样式，回显查询词
    s.text(24, PAGE_TOP, str.ieResults, { size: 26, font: F_REG(26), color: C.GRAY })
    const q = this.url
    const lines = wrapText(s, q, W - 48, 28, F_SEMI(28))
    lines.forEach((l, i) =>
      s.text(24, PAGE_TOP + 50 + i * 36, l, { size: 28, font: F_SEMI(28), color: C.WHITE }))
    s.text(24, PAGE_TOP + 170, str.ieNoSignal, { size: 22, font: F_REG(22), color: C.GRAY })
  }
}

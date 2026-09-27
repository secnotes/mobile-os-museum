import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, clipToWidth , onTrayChange } from '../ui'

/**
 * Marketplace（Mango 的 Windows Phone Marketplace）：Panorama 风格分类 +
 * 应用详情 + 假下载进度；安装记录持久化，装完出 Toast。
 */
export const marketplaceApp: MiniApp = {
  id: 'marketplace',
  name: '商店',
  nameEn: 'Marketplace',
  start(ctx: AppContext) {
    const ui = new MarketUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Entry {
  id: string
  zh: string
  en: string
  pubZh: string
  pubEn: string
  stars: number
  color: string
  glyph: string
  free: boolean
}

const ENTRIES: Array<Entry & { cat: number }> = [
  { id: 'weibo', cat: 0, zh: '微博', en: 'Weibo', pubZh: '新浪', pubEn: 'Sina', stars: 4, color: '#e51400', glyph: '微', free: true },
  { id: 'qq', cat: 0, zh: '手机 QQ', en: 'Mobile QQ', pubZh: '腾讯', pubEn: 'Tencent', stars: 5, color: '#1ba1e2', glyph: 'Q', free: true },
  { id: 'weather', cat: 0, zh: '天气通', en: 'Weather Pro', pubZh: '墨迹', pubEn: 'Moji', stars: 4, color: '#00aba9', glyph: '☀', free: true },
  { id: 'map', cat: 0, zh: '诺基亚地图', en: 'Nokia Maps', pubZh: 'Nokia', pubEn: 'Nokia', stars: 5, color: '#339933', glyph: '⌖', free: true },
  { id: 'snake', cat: 1, zh: '贪吃蛇', en: 'Snake', pubZh: 'Xbox LIVE', pubEn: 'Xbox LIVE', stars: 4, color: '#339933', glyph: 'S', free: true },
  { id: 'mine', cat: 1, zh: '扫雷', en: 'Minesweeper', pubZh: 'Xbox LIVE', pubEn: 'Xbox LIVE', stars: 5, color: '#339933', glyph: 'M', free: true },
  { id: 'sudoku', cat: 1, zh: '数独', en: 'Sudoku', pubZh: 'Xbox LIVE', pubEn: 'Xbox LIVE', stars: 4, color: '#339933', glyph: '9', free: true },
  { id: 'angry', cat: 1, zh: '愤怒的小鸟', en: 'Angry Birds', pubZh: 'Rovio', pubEn: 'Rovio', stars: 5, color: '#e51400', glyph: 'A', free: false },
  { id: 'album', cat: 2, zh: '都市晨光（单曲）', en: 'City Morning', pubZh: '地铁乐队', pubEn: 'Metro Line', stars: 4, color: '#1ba1e2', glyph: '♪', free: true },
  { id: 'best', cat: 3, zh: '热门应用合集', en: 'App of the Week', pubZh: '编辑推荐', pubEn: 'Editors', stars: 5, color: '#f09609', glyph: '★', free: true },
]

class MarketUI {
  private cat = 0
  private detail: Entry | null = null
  private installed: string[] = []
  private progress = -1
  private installing: Entry | null = null
  private toastT = 0
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    this.installed = (await this.ctx.store.get<string[]>('installed')) ?? []
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.detail || this.progress >= 0) return
      if (dir === 'left') this.setCat(Math.min(3, this.cat + 1))
      else if (dir === 'right') this.setCat(Math.max(0, this.cat - 1))
    }))
    this.offs.push(this.ctx.onFrame((dt) => {
      let dirty = false
      if (this.progress >= 0) {
        this.progress += dt / 2.6 * 100
        if (this.progress >= 100) {
          this.progress = -1
          if (this.installing && !this.installed.includes(this.installing.id)) {
            this.installed.push(this.installing.id)
            void this.ctx.store.set('installed', this.installed)
          }
          this.toastT = 3
          this.installing = null
        }
        dirty = true
      }
      if (this.toastT > 0) {
        this.toastT -= dt
        dirty = true
      }
      if (dirty) this.draw()
    }))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.progress >= 0) return // 下载中不允许返回（真机可后台，这里简化）
      if (this.detail) this.detail = null
      else this.ctx.exit()
      this.draw()
    }
  }

  private setCat(c: number) {
    this.cat = c
    this.draw()
  }

  private onTap(x: number, y: number) {
    const str = wpStrings(this.ctx.lang.get())
    if (this.detail) {
      // 安装按钮区
      if (y >= H - 120 && y < H - 40 && x >= 24 && x < W - 24 && this.progress < 0) {
        if (this.installed.includes(this.detail.id)) {
          this.toastT = 2
        } else {
          this.installing = this.detail
          this.progress = 0
        }
        this.draw()
      }
      return
    }
    // 分类标题
    if (y >= TRAY_H && y < TRAY_H + 56) {
      const titles = str.marketCategories
      let xx = 24
      for (let i = 0; i < titles.length; i++) {
        const w = this.ctx.screen.measure(titles[i]!, { size: i === this.cat ? 30 : 24 }) + 30
        if (x >= xx && x < xx + w) {
          this.setCat(i)
          return
        }
        xx += w
      }
    }
    const list = ENTRIES.filter((e) => e.cat === this.cat)
    const TOP = TRAY_H + 80
    const r = Math.floor((y - TOP) / 92)
    if (r >= 0 && r < list.length) {
      this.detail = list[r]!
      this.draw()
    }
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
    if (this.detail) this.drawDetail(str)
    else {
      const titles = str.marketCategories
      let xx = 24
      titles.forEach((t, i) => {
        const active = i === this.cat
        s.text(xx, TRAY_H + 12, t, {
          size: active ? 30 : 24, font: F_LIGHT(active ? 30 : 24),
          color: active ? C.WHITE : C.GRAY,
        })
        xx += s.measure(t, { size: active ? 30 : 24 }) + 30
      })
      this.drawList()
    }
    if (this.toastT > 0) {
      const accent = this.ctx.host.getAccent?.() ?? C.BLUE
      s.fillRect(0, TRAY_H, W, 4, accent)
      const msg = this.detail
        ? str.marketInstalled
        : str.marketOpen
      s.text(24, TRAY_H + 46, msg, { size: 24, font: F_REG(24), color: C.WHITE })
    }
    s.render()
  }

  private drawList() {
    const s = this.ctx.screen
    const list = ENTRIES.filter((e) => e.cat === this.cat)
    const TOP = TRAY_H + 80
    list.forEach((e, i) => {
      const y = TOP + i * 92
      this.drawIcon(e, 24, y - 6, 60)
      const en = this.ctx.lang.get() === 'en'
      s.text(104, y, clipToWidth(s, en ? e.en : e.zh, W - 220, 28, F_SEMI(28)), {
        size: 28, font: F_SEMI(28), color: C.WHITE,
      })
      this.drawStars(e.stars, 104, y + 38)
      s.textRight(W - 24, y, e.free ? (en ? 'free' : '免费') : '¥6.00', {
        size: 22, font: F_REG(22), color: C.GRAY,
      })
      s.fillRect(24, y + 70, W - 48, 1, C.DIM)
    })
  }

  private drawStars(n: number, x: number, y: number) {
    const s = this.ctx.screen
    for (let i = 0; i < 5; i++)
      s.text(x + i * 30, y, '★', { size: 22, font: F_REG(22), color: i < n ? C.MANGO : C.DIM })
  }

  /** 图标：全彩方块 canvas overlay */
  private drawIcon(e: Entry, x: number, y: number, size: number) {
    const cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    const g = cv.getContext('2d')!
    g.fillStyle = e.color
    g.fillRect(0, 0, size, size)
    g.fillStyle = '#ffffff'
    g.font = `${size * 0.55}px "Open Sans", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(e.glyph, size / 2, size / 2 + 2)
    this.ctx.screen.blit(cv, x, y, { w: size, h: size })
  }

  private drawDetail(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const e = this.detail!
    const en = this.ctx.lang.get() === 'en'
    // 顶部大图标
    this.drawIcon(e, 24, TRAY_H + 24, 110)
    s.text(156, TRAY_H + 50, clipToWidth(s, en ? e.en : e.zh, W - 180, 34, F_SEMI(34)), {
      size: 34, font: F_SEMI(34), color: C.WHITE,
    })
    s.text(156, TRAY_H + 92, en ? e.pubEn : e.pubZh, {
      size: 22, font: F_REG(22), color: C.GRAY,
    })
    this.drawStars(e.stars, 156, TRAY_H + 116)
    // 截图带（用图标色铺三块假图）
    for (let i = 0; i < 3; i++) {
      const x = 24 + i * 152
      s.fillRect(x, 300, 140, 200, C.DIM)
      s.textCenter(x + 70, 400, e.glyph, { size: 50, font: F_LIGHT(50), color: C.GRAY })
    }
    // 底部按钮 / 进度
    if (this.progress >= 0) {
      s.fillRect(24, H - 100, W - 48, 40, C.DIM)
      s.fillRect(24, H - 100, (W - 48) * this.progress / 100, 40, this.ctx.host.getAccent?.() ?? C.BLUE)
      s.textCenter(W / 2, H - 126, str.marketInstalling, {
        size: 22, font: F_REG(22), color: C.WHITE,
      })
    } else {
      const isIn = this.installed.includes(e.id)
      s.fillRect(24, H - 120, W - 48, 76, this.ctx.host.getAccent?.() ?? C.BLUE)
      s.textCenter(W / 2, H - 90, isIn ? str.marketOpen : str.marketInstall, {
        size: 30, font: F_SEMI(30), color: C.WHITE,
      })
    }
  }
}

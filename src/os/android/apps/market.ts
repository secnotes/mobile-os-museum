import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Screen } from '../../../hal/screen'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, wrapText, iconTile, clipToWidth } from '../ui'

type PermKey = 'network' | 'storage' | 'location' | 'contacts'

/** 条目静态属性（与 strings.marketItems 同序） */
const CATS = ['app', 'app', 'game', 'game', 'app', 'game'] as const
const ICON_COLORS = [C.GREEN, C.AMBER, C.MAGENTA, C.LBLUE, C.BLUE, C.DGREEN]
const RATES = [4.5, 4.2, 4.0, 4.6, 4.3, 4.4]
const RATE_COUNTS = ['2,410', '1,860', '940', '3,120', '1,570', '2,030']
const PERMS: PermKey[][] = [
  ['network', 'storage'],
  ['storage', 'contacts'],
  ['network'],
  ['network', 'storage'],
  ['network', 'storage'],
  ['network'],
]

/**
 * Android Market 1.0（G1 预装，2008-10-22 上线）：深色 BETA 版——
 * 精选轮播 + 应用/游戏分类列表 → 详情（评分/介绍）→ 权限确认 →
 * 下载进度条 + 下载通知 + 安装 Toast；已装应用进「我的下载」与
 * 系统设置的 Manage applications（共享 market:installed）。
 */
export const marketApp: MiniApp = {
  id: 'market',
  name: 'Market',
  nameEn: 'Market',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 白色购物袋 + 提手 + 袋中探头的小绿机器人
    roundRect(s, x + 6, y + 10, 16, 15, 3, C.WHITE, C.GRAY)
    s.fillRect(x + 9, y + 7, 2, 5, C.GRAY)
    s.fillRect(x + 17, y + 7, 2, 5, C.GRAY)
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx / 1.6 + dy * dy <= 9) s.pset(x + 14 + dx, y + 13 + dy, C.GREEN)
    s.pset(x + 12, y + 12, C.WHITE)
    s.pset(x + 16, y + 12, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new MarketUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type View = 'home' | 'cat' | 'detail' | 'downloads'
type Phase = null | 'perm' | 'down' | 'installing'

class MarketUI {
  private view: View = 'home'
  private catKind: 'app' | 'game' = 'app'
  private sel = 0
  private featured = 0
  private installed: number[] = []
  private phase: Phase = null
  private prog = 0
  private listSel = 0
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
    this.installed = (await this.ctx.store.get<number[]>('installed')) ?? []
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.phase === 'down') {
        this.prog += dt / 2.6
        if (this.prog >= 1) void this.finishDownload()
        this.draw()
      } else if (this.phase === 'installing') {
        this.prog += dt
        if (this.prog >= 0.8) { this.phase = null; this.draw() }
        else this.draw()
      }
    }))
    this.draw()
  }

  private total(): number {
    return androidStrings(this.ctx.lang.get()).marketItems.length
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    if (this.phase === 'perm') {
      if (k === 'ok') this.startDownload()
      else if (k === 'back') this.phase = null
      else return
      this.draw()
      return
    }
    if (this.view === 'home') {
      switch (k) {
        case 'left':
          this.featured = (this.featured + this.total() - 1) % this.total()
          break
        case 'right':
          this.featured = (this.featured + 1) % this.total()
          break
        case 'up':
          this.listSel = (this.listSel + 2) % 3
          break
        case 'down':
          this.listSel = (this.listSel + 1) % 3
          break
        case 'ok':
          this.activateHomeRow(this.listSel)
          return
        case 'back':
          this.ctx.exit()
          return
        default:
          return
      }
      this.draw()
      return
    }
    if (this.view === 'cat') {
      const n = this.catIndices().length
      switch (k) {
        case 'up':
          this.listSel = (this.listSel + n - 1) % n
          break
        case 'down':
          this.listSel = (this.listSel + 1) % n
          break
        case 'ok':
          this.sel = this.catIndices()[this.listSel]!
          this.view = 'detail'
          break
        case 'back':
          this.view = 'home'
          break
        default:
          return
      }
      this.draw()
      return
    }
    if (this.view === 'downloads') {
      const n = this.installed.length
      switch (k) {
        case 'up':
          if (n) this.listSel = (this.listSel + n - 1) % n
          break
        case 'down':
          if (n) this.listSel = (this.listSel + 1) % n
          break
        case 'ok':
          if (n) { this.sel = this.installed[this.listSel]!; this.view = 'detail' }
          break
        case 'back':
          this.view = 'home'
          break
        default:
          return
      }
      this.draw()
      return
    }
    // detail
    if (k === 'back') {
      this.view = 'home' // 简化：返回主页
      this.phase = null
    } else if (k === 'ok') {
      if (!this.isInstalled()) this.phase = 'perm'
    } else return
    this.draw()
  }

  private activateHomeRow(row: number) {
    if (row === 0) {
      this.catKind = 'app'
      this.view = 'cat'
      this.listSel = 0
    } else if (row === 1) {
      this.catKind = 'game'
      this.view = 'cat'
      this.listSel = 0
    } else {
      this.view = 'downloads'
      this.listSel = 0
    }
    this.draw()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.phase === 'perm') {
      // 卡片内按钮（几何同 drawPerm）
      const cy = H / 2
      if (y >= cy + 58 && y <= cy + 96) {
        if (x >= 40 && x <= 150) { this.phase = null; this.draw() }
        else if (x >= 170 && x <= 280) this.startDownload()
      } else {
        this.phase = null; this.draw()
      }
      return
    }
    if (this.view === 'home') {
      // 精选箭头
      if (y >= 92 && y <= 172) {
        if (x <= 34) { this.featured = (this.featured + this.total() - 1) % this.total(); this.draw(); return }
        if (x >= 286) { this.featured = (this.featured + 1) % this.total(); this.draw(); return }
      }
      // 精选卡片
      if (y >= 72 && y < 190 && x >= 20 && x <= 300) {
        this.sel = this.featured
        this.view = 'detail'
        this.draw()
        return
      }
      // 精选指示点
      if (y >= 174 && y <= 188) {
        const dot0 = W / 2 - (this.total() * 12) / 2
        const d = Math.floor((x - dot0) / 12)
        if (d >= 0 && d < this.total()) { this.featured = d; this.draw() }
        return
      }
      // 三个入口行
      for (let i = 0; i < 3; i++) {
        const ry = 202 + i * 46
        if (y >= ry && y < ry + 44 && x >= 12 && x <= W - 12) {
          this.activateHomeRow(i)
          return
        }
      }
      return
    }
    if (this.view === 'cat') {
      const y0 = STATUS_H + 36
      const idx = this.catIndices()
      for (let i = 0; i < idx.length; i++) {
        if (y >= y0 + i * 56 && y < y0 + (i + 1) * 56) {
          this.sel = idx[i]!
          this.view = 'detail'
          this.draw()
          return
        }
      }
      return
    }
    if (this.view === 'downloads') {
      const y0 = STATUS_H + 36
      for (let i = 0; i < this.installed.length; i++) {
        if (y >= y0 + i * 50 && y < y0 + (i + 1) * 50) {
          this.sel = this.installed[i]!
          this.view = 'detail'
          this.draw()
          return
        }
      }
      return
    }
    // detail 按钮
    if (y >= 420 && y <= 466) {
      if (!this.isInstalled()) {
        if (x >= 80 && x <= 240) this.phase = 'perm'
      } else {
        if (x >= 24 && x <= 154) this.openApp()
        else if (x >= 166 && x <= 296) void this.uninstall()
      }
      this.draw()
    }
  }

  // ---------- 安装流程 ----------

  private startDownload() {
    this.phase = 'down'
    this.prog = 0
    const str = androidStrings(this.ctx.lang.get())
    const name = str.marketItems[this.sel]!.name
    this.ctx.host.pushNotif?.({
      id: `dl-${this.sel}`,
      kind: 'download',
      title: name,
      text: str.mkDownloading,
    })
    this.draw()
  }

  private async finishDownload() {
    this.phase = 'installing' // 先切态，防止下一帧重入
    this.prog = 0
    if (!this.installed.includes(this.sel)) {
      this.installed = [...this.installed, this.sel]
      await this.ctx.store.set('installed', this.installed)
    }
    const str = androidStrings(this.ctx.lang.get())
    this.ctx.host.pushNotif?.({
      id: `dl-${this.sel}`,
      kind: 'download',
      title: str.marketItems[this.sel]!.name,
      text: str.mkInstalledToast,
    })
    this.showToast(str.mkInstalledToast)
  }

  private async uninstall() {
    this.installed = this.installed.filter((x) => x !== this.sel)
    await this.ctx.store.set('installed', this.installed)
    this.draw()
  }

  private openApp() {
    // 演示条目不是真实 App：提示
    this.showToast(androidStrings(this.ctx.lang.get()).marketItems[this.sel]!.name)
  }

  private isInstalled() {
    return this.installed.includes(this.sel)
  }

  private catIndices(): number[] {
    return CATS.map((c, i) => ({ c, i }))
      .filter((e) => e.c === this.catKind)
      .map((e) => e.i)
  }

  private showToast(t: string) {
    this.toastText = t
    this.toastUntil = Date.now() + 2200
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
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.INK)
    if (this.view === 'home') this.drawHome(str)
    else if (this.view === 'cat') this.drawCat(str)
    else if (this.view === 'downloads') this.drawDownloads(str)
    else this.drawDetail(str)
    if (this.phase === 'perm') this.drawPerm(str)
    if (Date.now() < this.toastUntil) {
      roundRect(s, 24, H - 100, W - 48, 32, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 90, this.toastText, { size: 11, color: C.WHITE })
    }
    s.render()
  }

  private drawHeader(s: Screen, title: string, beta = false) {
    s.fillRect(0, STATUS_H, W, 32, C.BAR)
    s.text(12, STATUS_H + 9, title, { size: 14, color: C.WHITE })
    if (beta) {
      roundRect(s, W - 60, STATUS_H + 7, 48, 19, 4, C.DGREEN, null)
      s.textCenter(W - 36, STATUS_H + 10, androidStrings(this.ctx.lang.get()).mkBeta, { size: 9, color: C.WHITE })
    }
  }

  private drawHome(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    this.drawHeader(s, 'Android Market', true)
    // 精选
    s.text(20, 62, str.mkFeatured, { size: 10, color: C.GRAY })
    const it = str.marketItems[this.featured]!
    roundRect(s, 20, 72, 280, 102, 8, C.PANEL, null)
    this.appTile(s, 36, 82, 80, this.featured)
    s.text(128, 96, clipToWidth(s, it.name, 160, 14), { size: 14, color: C.WHITE })
    s.text(128, 118, clipToWidth(s, str.marketBy(it.dev), 160, 10), { size: 10, color: C.GRAY })
    s.text(128, 144, it.price, { size: 12, color: C.GREEN })
    // 箭头
    s.text(24, 126, '‹', { size: 22, color: C.GRAY })
    s.text(284, 126, '›', { size: 22, color: C.AMBER })
    // 指示点
    const dot0 = W / 2 - (this.total() * 12) / 2
    for (let i = 0; i < this.total(); i++) {
      s.fillRect(dot0 + i * 12, 180, 6, 4, i === this.featured ? C.AMBER : C.GRAY)
    }
    // 三行入口
    const rows = [str.mkAllApps, str.mkAllGames, str.mkDownloads]
    rows.forEach((label, i) => {
      const y = 202 + i * 46
      if (i === this.listSel) {
        s.fillRect(12, y, W - 24, 44, C.ORANGE)
        s.fillRect(12, y, 3, 44, C.AMBER)
      }
      roundRect(s, 22, y + 8, 28, 28, 5, i === this.listSel ? C.AMBER : C.BLUE, null)
      s.text(60, y + 15, label, { size: 13, color: i === this.listSel ? C.INK : C.WHITE })
      s.textRight(W - 20, y + 14, '›', { size: 18, color: i === this.listSel ? C.INK : C.GRAY })
    })
  }

  private drawCat(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const title = this.catKind === 'app' ? str.mkAllApps : str.mkAllGames
    this.drawHeader(s, title)
    const idx = this.catIndices()
    const y0 = STATUS_H + 36
    idx.forEach((gi, i) => {
      const y = y0 + i * 56
      if (i === this.listSel) s.fillRect(0, y, W, 54, C.ORANGE)
      this.appTile(s, 12, y + 6, 42, gi)
      const it = str.marketItems[gi]!
      const tc = i === this.listSel ? C.INK : C.WHITE
      const gc = i === this.listSel ? C.INK : C.GRAY
      s.text(64, y + 8, clipToWidth(s, it.name, W - 120, 13), { size: 13, color: tc })
      s.text(64, y + 26, clipToWidth(s, str.marketBy(it.dev), W - 120, 9), { size: 9, color: gc })
      for (let st = 0; st < 5; st++)
        miniStar(s, 64 + st * 9, y + 38, st < Math.round(RATES[gi]!) ? (i === this.listSel ? C.INK : C.AMBER) : gc)
      s.textRight(W - 12, y + 8, it.price, {
        size: 11,
        color: i === this.listSel ? C.INK : it.price === str.marketFree ? C.GREEN : C.WHITE,
      })
    })
  }

  private drawDownloads(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    this.drawHeader(s, str.mkDownloads)
    if (!this.installed.length) {
      s.textCenter(W >> 1, 140, str.shadeEmpty, { size: 12, color: C.GRAY })
      return
    }
    const y0 = STATUS_H + 36
    this.installed.forEach((gi, i) => {
      const y = y0 + i * 50
      if (i === this.listSel) s.fillRect(0, y, W, 48, C.ORANGE)
      this.appTile(s, 12, y + 5, 38, gi)
      const it = str.marketItems[gi]!
      s.text(60, y + 10, clipToWidth(s, it.name, W - 80, 13), {
        size: 13,
        color: i === this.listSel ? C.INK : C.WHITE,
      })
      s.text(60, y + 28, clipToWidth(s, str.marketBy(it.dev), W - 80, 9), {
        size: 9,
        color: i === this.listSel ? C.INK : C.GRAY,
      })
    })
  }

  private drawDetail(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const it = str.marketItems[this.sel]!
    this.appTile(s, 14, STATUS_H + 10, 44, this.sel)
    s.text(68, STATUS_H + 14, clipToWidth(s, it.name, W - 84, 15), { size: 15, color: C.WHITE })
    s.text(68, STATUS_H + 36, clipToWidth(s, str.marketBy(it.dev), W - 84, 10), { size: 10, color: C.GRAY })
    // 星级 + 评分数
    for (let i = 0; i < 5; i++)
      star(s, 68 + i * 16, STATUS_H + 52, i < Math.round(RATES[this.sel]!) ? C.AMBER : C.GRAY)
    s.text(152, STATUS_H + 52, `(${RATE_COUNTS[this.sel]})`, { size: 9, color: C.GRAY })
    // 介绍
    wrapText(s, it.desc, W - 28, 11).slice(0, 7).forEach((ln, i) =>
      s.text(14, STATUS_H + 86 + i * 16, ln, { size: 11, color: C.PALE }))

    // 底部按钮 / 下载进度
    if (this.phase === 'down' || this.phase === 'installing') {
      roundRect(s, 20, 408, W - 40, 76, 8, C.PANEL, null)
      const label = this.phase === 'down' ? str.mkDownloading : str.mkInstalling
      s.text(34, 424, label, { size: 11, color: C.WHITE })
      const pct = Math.min(99, Math.round(this.prog * 100))
      s.textRight(W - 34, 424, `${pct}%`, { size: 11, color: C.AMBER })
      s.fillRect(34, 446, W - 68, 7, C.INK)
      s.fillRect(34, 446, Math.round((W - 68) * Math.min(1, this.prog)), 7, C.AMBER)
    } else if (this.isInstalled()) {
      roundRect(s, 24, 420, 130, 46, 8, C.DGREEN, null)
      s.textCenter(89, 434, str.mkOpen, { size: 13, color: C.WHITE })
      roundRect(s, 166, 420, 130, 46, 8, C.DARKRED, null)
      s.textCenter(231, 434, str.mkUninstall, { size: 13, color: C.WHITE })
    } else {
      roundRect(s, 80, 420, 160, 46, 8, C.DGREEN, null)
      s.textCenter(160, 434, `${str.marketInstall} · ${it.price}`, { size: 13, color: C.WHITE })
    }
  }

  /** 权限确认卡 */
  private drawPerm(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, 0, W, H, C.BAR)
    const cy = H / 2
    const cardH = 46 + PERMS[this.sel]!.length * 26 + 62
    roundRect(s, 20, cy - cardH / 2, W - 40, cardH, 10, C.PANEL, null)
    s.text(36, cy - cardH / 2 + 18, str.mkPermTitle, { size: 12, color: C.WHITE })
    const permText: Record<PermKey, string> = {
      network: str.mkPermNetwork,
      storage: str.mkPermStorage,
      location: str.mkPermLocation,
      contacts: str.mkPermContacts,
    }
    PERMS[this.sel]!.forEach((p, i) => {
      const y = cy - cardH / 2 + 42 + i * 26
      roundRect(s, 34, y - 2, 6, 6, 2, C.AMBER, null)
      s.text(48, y, clipToWidth(s, permText[p], W - 84, 10), { size: 10, color: C.PALE })
    })
    roundRect(s, 40, cy + 58, 110, 38, 8, C.METAL, null)
    s.textCenter(95, cy + 71, str.mkCancel, { size: 12, color: C.WHITE })
    roundRect(s, 170, cy + 58, 110, 38, 8, C.DGREEN, null)
    s.textCenter(225, cy + 71, str.mkOk, { size: 12, color: C.WHITE })
  }

  /** 应用色块：圆角底 + 首字母 */
  private appTile(s: Screen, x: number, y: number, size: number, idx: number) {
    roundRect(s, x, y, size, size, 6, ICON_COLORS[idx]!, null)
    const ch = androidStrings(this.ctx.lang.get()).marketItems[idx]!.name[0]!
    s.textCenter(x + size / 2, y + size / 2 - (size > 50 ? 8 : 4), ch, {
      size: size > 50 ? 26 : 15,
      color: C.WHITE,
    })
  }
}

/** 像素五角星（大） */
function star(s: Screen, x: number, y: number, color: number) {
  s.fillRect(x + 3, y, 2, 2, color)
  s.fillRect(x + 1, y + 2, 6, 2, color)
  s.fillRect(x, y + 4, 8, 2, color)
  s.fillRect(x + 1, y + 6, 2, 2, color)
  s.fillRect(x + 5, y + 6, 2, 2, color)
}

/** 像素小星星 */
function miniStar(s: Screen, x: number, y: number, color: number) {
  s.fillRect(x + 1, y, 2, 2, color)
  s.fillRect(x, y + 2, 5, 2, color)
  s.fillRect(x + 1, y + 4, 1, 1, color)
  s.fillRect(x + 3, y + 4, 1, 1, color)
}

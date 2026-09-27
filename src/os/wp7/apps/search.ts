import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, wrapText, clipToWidth } from '../ui'
import { MetroKb } from '../kb'
import { onTrayChange } from '../ui'

/**
 * Search（真机搜索键直达 Bing）：全彩「每日图片」+ 搜索框 + 离线结果页。
 */
export const searchApp: MiniApp = {
  id: 'search',
  name: '搜索',
  nameEn: 'Search',
  start(ctx: AppContext) {
    const ui = new SearchUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const KB_TOP = 470

class SearchUI {
  private view: 'home' | 'input' | 'results' = 'home'
  private query = ''
  private kb!: MetroKb
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
      if (this.view === 'results') this.view = 'home'
      else if (this.view === 'input') this.view = 'home'
      else this.ctx.exit()
      this.draw()
      return
    }
    if (this.view === 'input') {
      if (k === 'ok') this.search()
      else this.kb.key(k)
    }
  }

  private search() {
    this.query = (this.kb.text + this.kb.ime.buf).trim()
    this.view = this.query ? 'results' : 'home'
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.view === 'input') {
      this.kb.tap(x, y, KB_TOP)
      return
    }
    if (this.view === 'home' && y >= 440 && y < 500) {
      this.view = 'input'
      this.kb.text = ''
      this.kb.mode = 'zh'
      this.kb.ime.reset()
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
    if (this.view === 'input') this.drawInput(str)
    else if (this.view === 'results') this.drawResults(str)
    else this.drawHome(str)
    s.render()
  }

  private drawHome(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    // 每日图片（全彩 overlay）
    s.blit(dailyImage(), 0, TRAY_H, { w: W, h: 560 })
    // 底部渐暗 + 标题
    s.text(24, 540, str.searchDaily, { size: 20, font: F_REG(20), color: C.WHITE })
    // 搜索框：白色半透明感的亮灰条
    s.fillRect(24, 440, W - 48, 60, C.WHITE)
    s.text(48, 456, str.searchHint, { size: 26, font: F_REG(26), color: C.GRAY })
    s.text(W - 60, 452, '⌕', { size: 36, font: F_LIGHT(36), color: C.GRAY })
  }

  private drawInput(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    s.text(24, TRAY_H + 18, 'Bing', { size: 36, font: F_LIGHT(36), color: C.WHITE })
    s.fillRect(24, 100, W - 48, 52, C.DIM)
    const shown = this.kb.text + (this.kb.mode === 'en' || !this.kb.ime.active ? '' : `〔${this.kb.ime.buf}〕`)
    s.text(44, 112, clipToWidth(s, shown || str.searchHint, W - 80, 26, F_REG(26)), {
      size: 26, font: F_REG(26), color: shown ? C.WHITE : C.GRAY,
    })
    this.kb.onSend = () => this.search()
    this.kb.draw(s, KB_TOP)
  }

  private drawResults(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    s.text(24, TRAY_H + 16, str.searchTitle, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    const lines = wrapText(s, this.query, W - 48, 30, F_SEMI(30))
    lines.forEach((l, i) =>
      s.text(24, 110 + i * 40, l, { size: 30, font: F_SEMI(30), color: C.WHITE }))
    const baseY = 110 + lines.length * 40 + 20
    for (let i = 0; i < 4; i++) {
      const y = baseY + i * 120
      if (y > H - 40) break
      const title = `${this.query} · ${i + 1}`
      s.text(24, y, clipToWidth(s, title, W - 48, 26, F_REG(26)), {
        size: 26, font: F_REG(26), color: C.BLUE,
      })
      const url = `www.example${i + 1}.com`
      s.text(24, y + 34, url, { size: 20, font: F_REG(20), color: C.GRAY })
      s.fillRect(24, y + 66, W - 48, 1, C.DIM)
    }
  }
}

let cached: HTMLCanvasElement | null = null

/** Bing 每日图片：星空 → 暮色 → 群山的全彩生成画 */
function dailyImage(): HTMLCanvasElement {
  if (cached) return cached
  const cv = document.createElement('canvas')
  cv.width = 480
  cv.height = 560
  const g = cv.getContext('2d')!
  // 天色渐变
  const sky = g.createLinearGradient(0, 0, 0, 420)
  sky.addColorStop(0, '#0c1b3a')
  sky.addColorStop(0.55, '#5a2a6a')
  sky.addColorStop(0.8, '#d85a4a')
  sky.addColorStop(1, '#f0a050')
  g.fillStyle = sky
  g.fillRect(0, 0, 480, 420)
  // 星
  g.fillStyle = '#ffffff'
  for (let i = 0; i < 60; i++) {
    const x = (i * 137.5) % 480
    const y = (i * 89.3) % 240
    g.globalAlpha = 0.3 + ((i * 31) % 7) / 10
    g.fillRect(x, y, 2, 2)
  }
  g.globalAlpha = 1
  // 落日
  const sun = g.createRadialGradient(240, 400, 8, 240, 400, 80)
  sun.addColorStop(0, '#fff2c0')
  sun.addColorStop(0.4, '#ffc060')
  sun.addColorStop(1, 'rgba(255,140,60,0)')
  g.fillStyle = sun
  g.beginPath()
  g.arc(240, 400, 80, 0, Math.PI * 2)
  g.fill()
  // 远/近山
  g.fillStyle = '#3a2050'
  g.beginPath()
  g.moveTo(0, 420)
  for (let x = 0; x <= 480; x += 40)
    g.lineTo(x, 380 + Math.sin(x / 50) * 30 + (x % 80 === 0 ? -30 : 0))
  g.lineTo(480, 560)
  g.lineTo(0, 560)
  g.fill()
  g.fillStyle = '#180e28'
  g.beginPath()
  g.moveTo(0, 460)
  for (let x = 0; x <= 480; x += 30) g.lineTo(x, 440 + ((x * 7) % 50))
  g.lineTo(480, 560)
  g.lineTo(0, 560)
  g.fill()
  cached = cv
  return cv
}

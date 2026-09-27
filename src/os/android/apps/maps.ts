import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth } from '../ui'

/**
 * Android 1.0 Google Maps：搜索框（搜索结果红 pin）、Map/Satellite
 * 图层（卫星为程序生成全彩纹理）、Traffic 路况（主干道红黄绿）、
 * My Location 蓝点；方向键/滑动平移、+− 缩放。
 */
export const mapsApp: MiniApp = {
  id: 'maps',
  name: '地图',
  nameEn: 'Maps',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 蓝色道路 + 绿色公园块 + 红色定位点
    s.fillRect(x + 4, y + 10, 20, 2, C.BLUE)
    s.fillRect(x + 12, y + 4, 2, 20, C.BLUE)
    s.fillRect(x + 5, y + 5, 6, 5, C.GREEN)
    s.fillRect(x + 18, y + 17, 6, 5, C.GREEN)
    s.fillRect(x + 20, y + 7, 5, 5, C.RED)
  },
  start(ctx: AppContext) {
    const ui = new MapsUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

/** 街区哈希：同坐标永远同结果 */
function blockHash(bx: number, by: number): number {
  let h = (bx * 374761393 + by * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

type Sheet = null | 'menu' | 'search'

class MapsUI {
  private ox = 0
  private oy = 0
  private zoom = 1 // 0/1/2 → 单元 16/24/36
  private sat = false
  private traffic = false
  private myLoc = false
  private query = ''
  private sheet: Sheet = null
  private input = ''
  private dead = false

  // 卫星离屏纹理
  private satCanvas: HTMLCanvasElement | null = null
  private satKey = ''

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onSwipe((d) => {
      const step = 56
      if (d === 'left') this.ox -= step
      else if (d === 'right') this.ox += step
      else if (d === 'up') this.oy -= step
      else this.oy += step
      this.draw()
    })
    this.ctx.onLang(() => this.draw())
    this.draw()
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    if (this.sheet) {
      if (this.editorKey(k)) this.draw()
      return
    }
    const step = 26
    switch (k) {
      case 'left':
        this.ox -= step
        break
      case 'right':
        this.ox += step
        break
      case 'up':
        this.oy -= step
        break
      case 'down':
        this.oy += step
        break
      case '*':
        this.setZoom(this.zoom - 1)
        return
      case '#':
        this.setZoom(this.zoom + 1)
        return
      case 'menu':
        this.sheet = 'menu'
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private editorKey(k: DeviceKey): boolean {
    if (k === 'back') { this.sheet = null; return true }
    if (k === 'clear') {
      if (this.input) { this.input = this.input.slice(0, -1); return true }
      return false
    }
    if (k === 'ok') {
      this.query = this.input.trim()
      this.input = ''
      this.sheet = null
      return true
    }
    let ch: string | null = null
    if (/^[a-z0-9]$/.test(k)) ch = k
    else if (k === 'space') ch = ' '
    if (ch && this.input.length < 24) {
      this.input += ch
      return true
    }
    return false
  }

  private setZoom(z: number) {
    this.zoom = Math.max(0, Math.min(2, z))
    this.draw()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.sheet) {
      this.sheetTap(x, y)
      return
    }
    // 搜索栏
    if (y >= STATUS_H + 4 && y <= STATUS_H + 40) {
      if (x >= W - 36) { this.sheet = 'menu' }
      else { this.sheet = 'search'; this.input = '' }
      this.draw()
      return
    }
    // 缩放按钮（右下）
    if (y > H - 60 && y < H - 20) {
      if (x > W - 56 && x < W - 26) this.setZoom(this.zoom + 1)
      else if (x > W - 100 && x < W - 70) this.setZoom(this.zoom - 1)
    }
  }

  private sheetTap(x: number, y: number) {
    if (this.sheet === 'menu') {
      const rows = [
        () => { this.sat = !this.sat },
        () => { this.traffic = !this.traffic },
        () => { this.myLoc = true; this.ox = this.oy = 0 },
      ]
      for (let i = 0; i < 3; i++) {
        const ry = STATUS_H + 56 + i * 50
        if (y >= ry && y < ry + 44 && x >= 12 && x <= W - 12) {
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
    // search：点卡片外关闭
    if (y < STATUS_H + 110 || y > H - 80) {
      this.sheet = null
      this.input = ''
      this.draw()
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    s.clear() // 每次重画重置缓冲与 bg/overlay（卫星底图逐帧重铺，防止弹层残留）
    const str = androidStrings(this.ctx.lang.get())
    const d = new Date()
    statusBar(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      carrier: str.carrier,
      clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      signalBars: 4,
    })
    if (this.sat) {
      this.drawSatellite()
      if (this.traffic) this.drawTrafficOnSat()
    } else this.drawMap()
    this.drawSearchBar(str)
    // 中心红 pin + 地名（我的位置蓝点优先于 pin）
    if (this.myLoc) this.drawBlueDot()
    else this.drawPin(str)
    // 缩放按钮
    roundRect(s, W - 100, H - 60, 30, 40, 6, C.WHITE, C.GRAY)
    s.textCenter(W - 85, H - 44, '−', { size: 16, color: C.INK })
    roundRect(s, W - 56, H - 60, 30, 40, 6, C.WHITE, C.GRAY)
    s.textCenter(W - 41, H - 44, '+', { size: 16, color: C.INK })
    s.text(10, H - 18, str.mapsHint, { size: 9, color: C.GRAY })
    if (this.sheet) this.drawSheet(str)
    s.render()
  }

  private drawSearchBar(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    roundRect(s, 6, STATUS_H + 4, W - 44, 36, 7, C.WHITE, C.GRAY)
    const label = this.query || str.mapsSearchHint
    s.text(20, STATUS_H + 15, clipToWidth(s, label, W - 80, 12), {
      size: 12,
      color: this.query ? C.INK : C.GRAY,
    })
    // MENU 热区
    roundRect(s, W - 34, STATUS_H + 6, 28, 32, 6, C.PANEL, null)
    s.fillRect(W - 28, STATUS_H + 13, 16, 2, C.WHITE)
    s.fillRect(W - 28, STATUS_H + 20, 16, 2, C.WHITE)
    s.fillRect(W - 28, STATUS_H + 27, 16, 2, C.WHITE)
  }

  private drawMap() {
    const s = this.ctx.screen
    const cell = [16, 24, 36][this.zoom]!
    // 世界坐标：屏幕中心 = 世界 (512+ox, 512+oy)
    const left = 512 + this.ox - (W >> 1)
    const top = 512 + this.oy - ((H - STATUS_H) >> 1)
    // 道路（白底）+ 街区
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    const x0b = Math.floor(left / cell) - 1
    const x1b = Math.floor((left + W) / cell) + 1
    const y0b = Math.floor(top / cell) - 1
    const y1b = Math.floor((top + H - STATUS_H) / cell) + 1
    for (let by = y0b; by <= y1b; by++)
      for (let bx = x0b; bx <= x1b; bx++) {
        const sx = bx * cell - left
        const sy = STATUS_H + by * cell - top
        const kind = blockHash(bx, by) % 10
        const fill = kind < 5 ? C.PALE : kind < 8 ? C.GREEN : C.BLUE
        s.fillRect(sx + 2, sy + 2, cell - 4, cell - 4, fill)
        if (kind < 3) s.fillRect(sx + 4, sy + 4, Math.max(2, cell - 10), Math.max(2, cell - 10), C.GRAY)
      }
    // 主干道（每 4 格一条）：黄线；Traffic 时按段红/黄/绿
    const roadWorld = (i: number) => i * cell * 4 - left
    for (let ri = Math.floor(left / (cell * 4)); ri <= Math.floor((left + W) / (cell * 4)); ri++) {
      const x = roadWorld(ri)
      s.fillRect(x, STATUS_H, 3, H - STATUS_H, this.traffic ? C.INK : C.AMBER)
      if (this.traffic)
        for (let seg = 0; seg < Math.ceil((H - STATUS_H) / 40); seg++) {
          const c = blockHash(ri, seg * 7 + 3) % 3
          s.fillRect(x, STATUS_H + seg * 40, 3, 40, c === 0 ? C.RED : c === 1 ? C.AMBER : C.GREEN)
        }
    }
    for (let ri = Math.floor(top / (cell * 4)); ri <= Math.floor((top + H - STATUS_H) / (cell * 4)); ri++) {
      const y = STATUS_H + ri * cell * 4 - top
      s.fillRect(0, y, W, 3, this.traffic ? C.INK : C.AMBER)
      if (this.traffic)
        for (let seg = 0; seg < Math.ceil(W / 40); seg++) {
          const c = blockHash(seg * 7 + 5, ri) % 3
          s.fillRect(seg * 40, y, 40, 3, c === 0 ? C.RED : c === 1 ? C.AMBER : C.GREEN)
        }
    }
  }

  /** 卫星图层：全彩离屏（深绿/棕地块 + 噪声 + 细路），随视图缓存 */
  private drawSatellite() {
    const cell = [16, 24, 36][this.zoom]!
    const key = `${this.ox},${this.oy},${this.zoom}`
    if (!this.satCanvas || this.satKey !== key) {
      this.satKey = key
      const cv = (this.satCanvas ??= document.createElement('canvas'))
      cv.width = W
      cv.height = H - STATUS_H
      const cx = cv.getContext('2d')!
      const img = cx.createImageData(W, cv.height)
      const left = 512 + this.ox - (W >> 1)
      const top = 512 + this.oy - (cv.height >> 1)
      for (let py = 0; py < cv.height; py++) {
        const wy = top + py
        for (let px = 0; px < W; px++) {
          const wx = left + px
          const bx = Math.floor(wx / cell)
          const by = Math.floor(wy / cell)
          const h = blockHash(bx, by)
          // 地块基色：深绿系/褐系/水体
          const kind = h % 10
          let r = 46; let g = 74; let b = 34
          if (kind >= 8) { r = 36; g = 70; b = 96 }
          else if (kind >= 5) { r = 58; g = 92; b = 42 }
          if (kind < 3) { r = 88; g = 74; b = 48 }
          // 细噪声
          const n = (blockHash(wx >> 2, wy >> 2) % 24) - 12
          // 道路缝（地块边缘）压暗
          const edge = (wx % cell < 2 || wy % cell < 2) ? -26 : 0
          const i = (py * W + px) * 4
          img.data[i] = clamp255(r + n + edge)
          img.data[i + 1] = clamp255(g + n + edge)
          img.data[i + 2] = clamp255(b + n + edge)
          img.data[i + 3] = 255
        }
      }
      cx.putImageData(img, 0, 0)
    }
    // 走 bgOverlays：卫星图先于调色板缓冲合成，搜索栏/pin/缩放等控件浮在图上
    this.ctx.screen.blitBg(this.satCanvas, 0, STATUS_H, { w: W, h: H - STATUS_H })
  }

  /** 卫星底图上的路况层：深色路床 + 红/黄/绿段（卫星纹理本身没有道路） */
  private drawTrafficOnSat() {
    const s = this.ctx.screen
    const cell = [16, 24, 36][this.zoom]!
    const left = 512 + this.ox - (W >> 1)
    const top = 512 + this.oy - ((H - STATUS_H) >> 1)
    const roadX = (i: number) => i * cell * 4 - left
    for (let ri = Math.floor(left / (cell * 4)); ri <= Math.floor((left + W) / (cell * 4)); ri++) {
      const x = roadX(ri)
      s.fillRect(x, STATUS_H, 3, H - STATUS_H, C.INK)
      for (let seg = 0; seg < Math.ceil((H - STATUS_H) / 40); seg++) {
        const c = blockHash(ri, seg * 7 + 3) % 3
        s.fillRect(x, STATUS_H + seg * 40, 3, 40, c === 0 ? C.RED : c === 1 ? C.AMBER : C.GREEN)
      }
    }
    const roadY = (i: number) => STATUS_H + i * cell * 4 - top
    for (let ri = Math.floor(top / (cell * 4)); ri <= Math.floor((top + H - STATUS_H) / (cell * 4)); ri++) {
      const y = roadY(ri)
      s.fillRect(0, y, W, 3, C.INK)
      for (let seg = 0; seg < Math.ceil(W / 40); seg++) {
        const c = blockHash(seg * 7 + 5, ri) % 3
        s.fillRect(seg * 40, y, 40, 3, c === 0 ? C.RED : c === 1 ? C.AMBER : C.GREEN)
      }
    }
  }

  private drawPin(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const px = W >> 1
    const py = (H + STATUS_H) >> 1
    for (let dy = -8; dy <= 0; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (Math.abs(dx) <= (8 + dy) / 3) s.pset(px + dx, py + dy, C.RED)
    s.fillRect(px - 1, py - 10, 2, 3, C.RED)
    const label = this.query || str.mapsPlace
    const w = Math.min(170, Math.max(72, s.measure(label, { size: 10 }) + 20))
    roundRect(s, px + 8, py - 18, w, 22, 5, C.INK, null)
    s.text(px + 16, py - 12, clipToWidth(s, label, w - 16, 10), { size: 10, color: C.WHITE })
  }

  /** 我的位置：浅蓝光晕 + 蓝点白心 */
  private drawBlueDot() {
    const s = this.ctx.screen
    const px = W >> 1
    const py = (H + STATUS_H) >> 1
    for (let dy = -10; dy <= 10; dy++)
      for (let dx = -10; dx <= 10; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 <= 100 && d2 > 25) s.pset(px + dx, py + dy, C.LBLUE)
      }
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dy * dy <= 16) s.pset(px + dx, py + dy, C.BLUE)
    s.pset(px, py, C.WHITE)
  }

  private drawSheet(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    if (this.sheet === 'menu') {
      s.fillRect(0, STATUS_H + 40, W, H - STATUS_H - 40, C.PANEL)
      const rows: Array<[string, number, boolean]> = [
        [str.mapsSatellite, C.LBLUE, this.sat],
        [str.mapsTraffic, C.AMBER, this.traffic],
        [str.mapsMyLocation, C.GREEN, this.myLoc],
      ]
      rows.forEach(([label, color, on], i) => {
        const y = STATUS_H + 56 + i * 50
        roundRect(s, 18, y + 6, 26, 26, 6, color, null)
        s.text(56, y + 15, label, { size: 13, color: C.WHITE })
        if (on) s.textRight(W - 20, y + 14, '✓', { size: 14, color: C.AMBER })
      })
      return
    }
    // search 输入卡
    s.fillRect(0, 0, W, H, C.BAR)
    roundRect(s, 16, STATUS_H + 110, W - 32, 96, 10, C.PANEL, null)
    s.text(32, STATUS_H + 130, str.mapsSearchHint, { size: 12, color: C.PALE })
    roundRect(s, 32, STATUS_H + 148, W - 64, 32, 6, C.INK, C.METAL)
    s.text(42, STATUS_H + 157, this.input || ' ', { size: 13, color: C.GREEN })
    if (this.input) {
      const w = s.measure(this.input, { size: 13 })
      s.fillRect(42 + w, STATUS_H + 156, 2, 14, C.GREEN)
    }
  }
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v))
}

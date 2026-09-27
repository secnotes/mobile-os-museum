import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, disc } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconMaps } from '../icons'

interface Pin {
  mx: number
  my: number
  title: string
}

const MAP_TOP = 64

/**
 * Maps：程序化街区图（道路/公园/水面）+ 红色大头针；搜索与定位。
 */
class MapsApp extends IphoneApp {
  private ox = -260
  private oy = -40
  private pin: Pin = { mx: 420, my: 200, title: '1 Infinite Loop' }
  private searching = false
  private query = ''
  private showCallout = true

  protected draw() {
    const s = this.ctx.screen
    this.drawMap(s)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    this.drawSearchBar(s)
    // 定位按钮
    rr(s, 270, 420, 42, 42, 8, C.WHITE)
    // 十字定位标
    s.fillRect(289, 428, 4, 26, C.BLUE)
    s.fillRect(278, 439, 26, 4, C.BLUE)
    disc(s, 291, 441, 5, C.WHITE)
    this.drawKb()
  }

  private drawMap(s: Screen) {
    // 地块底
    s.fillRect(0, MAP_TOP, 320, 480 - MAP_TOP, C.MAP_LAND)
    // 水面（海湾，随平移）
    rr(s, this.ox + 640, MAP_TOP + this.oy + 120, 360, 260, 20, C.MAP_WATER)
    // 公园
    rr(s, this.ox + 120, MAP_TOP + this.oy + 300, 220, 150, 10, C.MAP_PARK)
    rr(s, this.ox + 500, MAP_TOP + this.oy + 40, 140, 120, 10, C.MAP_PARK)
    // 道路网（横纵）
    for (let i = -1; i < 8; i++) {
      const y = MAP_TOP + ((i * 96 + this.oy) % 800)
      if (y > MAP_TOP && y < 480) {
        s.fillRect(0, y - 3, 320, 6, C.WHITE)
        s.fillRect(0, y - 3, 320, 1, C.GRAY5)
      }
      const x = (i * 120 + this.ox) % 900
      if (x > -10 && x < 320) {
        s.fillRect(x - 3, MAP_TOP, 6, 480 - MAP_TOP, C.WHITE)
        s.fillRect(x - 3, MAP_TOP, 1, 480 - MAP_TOP, C.GRAY5)
      }
    }
    // 高速路（黄）
    const hy = MAP_TOP + ((240 + this.oy) % 800 + 800) % 800 - 200
    s.fillRect(0, hy, 320, 8, C.MAP_HWY)
    // 标注
    this.mapLabel(s, 520, 360, 'Park')
    // 大头针
    const px = this.pin.mx + this.ox
    const py = MAP_TOP + this.pin.my + this.oy
    if (px > -40 && px < 360 && py > MAP_TOP - 40 && py < 480) {
      this.drawPin(s, px, py)
      if (this.showCallout) this.drawCallout(s, px, py)
    }
  }

  private mapLabel(s: Screen, mx: number, my: number, t: string) {
    const x = mx + this.ox, y = MAP_TOP + my + this.oy
    if (x > -60 && x < 320 && y > MAP_TOP && y < 480)
      s.text(x, y, t, { size: 11, font: F_REG(11), color: C.SET_GRAY })
  }

  private drawPin(s: Screen, x: number, y: number) {
    // 针身：上圆 + 下三角（扫描线）
    disc(s, x, y, 12, C.RED)
    for (let dy = 8; dy <= 26; dy++) {
      const w = Math.max(0, Math.round((26 - dy) * 0.42))
      s.fillRect(x - w, y + dy, w * 2, 1, C.RED)
    }
    disc(s, x, y, 5, C.WHITE)
  }

  private drawCallout(s: Screen, x: number, y: number) {
    const w = Math.min(200, Math.max(90, s.measure(this.pin.title, { size: 14, font: F_BOLD(14) }) + 24))
    const bx = Math.max(6, Math.min(320 - w - 6, x - w / 2))
    rr(s, bx, y - 52, w, 34, 8, C.WHITE)
    s.line(bx + w / 2 - 5, y - 18, bx + w / 2 + 5, y - 18, C.WHITE)
    s.text(bx + 12, y - 43, this.pin.title, { size: 14, font: F_BOLD(14), color: C.INK, maxWidth: w - 24 })
  }

  private drawSearchBar(s: Screen) {
    s.fillRect(0, 20, 320, 44, C.KB_BG)
    rr(s, 8, 28, 304, 30, 8, C.WHITE)
    s.text(20, 36, '🔍 ' + (this.query || this.str.mapsSearch), {
      size: 15, font: F_REG(15), color: this.query ? C.INK : C.GRAY3, maxWidth: 270,
    })
  }

  protected tap(x: number, y: number) {
    if (y >= 28 && y < 58 && !this.searching) {
      this.searching = true
      this.kbOn = true
      this.draw()
      return
    }
    // 定位按钮
    if (x >= 270 && y >= 420) {
      this.ox = 160 - this.pin.mx
      this.oy = 240 - this.pin.my
      this.draw()
      return
    }
    if (y >= 264 && this.searching) {
      const a = this.kb.tap(this.ctx.screen, x, y, this.ime)
      if (a) {
        this.click()
        if (a.type === 'ret') this.doSearch()
        else this.kbAction(a)
      }
      this.draw()
    }
  }

  private doSearch() {
    if (!this.query) return
    this.pin = { mx: 380 + (this.query.length % 5) * 40, my: 220 + (this.query.length % 4) * 30, title: this.query }
    this.ox = 160 - this.pin.mx
    this.oy = 240 - this.pin.my
    this.searching = false
    this.kbOn = false
    this.kb.reset()
    this.showCallout = true
  }

  protected drag(x: number, y: number, sx: number, sy: number) {
    if (this.kbOn) return
    this.ox += x - sx
    this.oy += y - sy
  }

  protected frame(_dt: number) {}

  protected insertText(t: string) {
    this.query += t
  }
  protected backspaceText() {
    this.query = this.query.slice(0, -1)
  }
}

export const mapsFactory = miniApp('maps', 'Maps', iconMaps, (ctx, b) => new MapsApp(ctx, b))

import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp, type PhotoMeta } from './common'
import { iconPhotos } from '../icons'
import { drawNavBar, navTap } from '../navbar'
import { drawPhotoArt } from './photo-art'

type View = 'albums' | 'grid' | 'viewer'

const TH = 75
const GX = [2, 81, 160, 239]

/**
 * Photos：相簿列表 → 缩略图网格 → 全屏查看（左右切换）。
 */
class PhotosApp extends IphoneApp {
  private view: View = 'albums'
  private album: 0 | 1 = 0
  private idx = 0
  private chrome = true

  private list(): PhotoMeta[] {
    const photos = this.bridge.photos()
    return this.album === 0 ? photos : photos.slice(0, Math.max(0, photos.length - 1))
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, this.view === 'viewer' ? C.BLACK : C.BLACK)
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.view === 'albums') this.drawAlbums(s)
    else if (this.view === 'grid') this.drawGrid(s)
    else this.drawViewer(s)
  }

  private drawAlbums(s: Screen) {
    drawNavBar(s, { title: this.str.photoLibrary })
    s.fillRect(0, 64, 320, 416, C.KB_BG)
    const albums: Array<[string, number]> = [
      [this.str.cameraRoll, this.bridge.photos().length],
      [this.str.photoLibrary, Math.max(0, this.bridge.photos().length - 1)],
    ]
    rr(s, 8, 84, 304, albums.length * 54, 10, C.WHITE)
    albums.forEach(([name, n], i) => {
      const y = 84 + i * 54
      s.text(20, y + 17, name, { size: 19, font: F_REG(19), color: C.INK })
      s.textRight(286, y + 17, String(n), { size: 17, font: F_REG(17), color: C.GRAY3 })
      if (i < albums.length - 1) s.fillRect(20, y + 53, 276, 1, C.GRAY6)
    })
  }

  private drawGrid(s: Screen) {
    const title = this.album === 0 ? this.str.cameraRoll : this.str.photoLibrary
    drawNavBar(s, { title, back: this.str.photoLibrary })
    s.fillRect(0, 64, 320, 416, C.WHITE)
    const photos = this.list()
    photos.forEach((p, i) => {
      const col = i % 4, row = Math.floor(i / 4)
      drawPhotoArt(s, GX[col]!, 66 + row * 79, TH, TH, p.seed, p.src)
    })
  }

  private drawViewer(s: Screen) {
    const photos = this.list()
    const p = photos[this.idx]
    if (p) {
      // 320×240 居中显示
      drawPhotoArt(s, 0, 120, 320, 240, p.seed, p.src)
    }
    if (this.chrome) {
      s.fillRect(0, 20, 320, 44, C.BLACK)
      s.text(12, 36, this.str.back, { size: 14, font: F_REG(14), color: C.WHITE })
      s.textCenter(160, 33, `${this.idx + 1} ${this.str.nPhotos}`, { size: 15, font: F_BOLD(15), color: C.WHITE })
      // 底部条
      s.fillRect(0, 436, 320, 44, C.BLACK)
      s.text(40, 448, '‹', { size: 24, font: F_BOLD(24), color: this.idx > 0 ? C.WHITE : C.GRAY2 })
      s.textRight(280, 448, '›', { size: 24, font: F_BOLD(24), color: this.idx < photos.length - 1 ? C.WHITE : C.GRAY2 })
    }
  }

  protected tap(x: number, y: number) {
    if (this.view === 'albums') {
      if (y >= 84 && y < 84 + 2 * 54) {
        this.album = y < 84 + 54 ? 0 : 1
        if (this.list().length) {
          this.view = 'grid'
        } else {
          // 空相簿：直接停留（真机不允许进空相簿）
          return
        }
        this.draw()
      }
      return
    }
    if (this.view === 'grid') {
      if (navTap(x, y) === 'back') { this.view = 'albums'; this.draw(); return }
      const i = Math.floor((y - 66) / 79) * 4 + GX.findIndex((gx) => Math.abs(x - gx - TH / 2) < TH / 2)
      const photos = this.list()
      if (i >= 0 && i < photos.length) {
        this.idx = i
        this.view = 'viewer'
        this.chrome = true
        this.draw()
      }
      return
    }
    // viewer
    if (this.chrome && y < 64 && x < 80) { this.view = 'grid'; this.draw(); return }
    if (this.chrome && y >= 436) {
      if (x < 160 && this.idx > 0) this.shift(-1)
      else if (x >= 160 && this.idx < this.list().length - 1) this.shift(1)
      return
    }
    this.chrome = !this.chrome
    this.draw()
  }

  private shift(d: number) {
    this.idx += d
    this.draw()
  }
}

export const photosFactory = miniApp('photos', 'Photos', iconPhotos, (ctx, b) => new PhotosApp(ctx, b))

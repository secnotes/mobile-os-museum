import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rr, rrGrad, disc } from '../graphics'
import { BBApp, type MenuCommand } from './common'
import { drawPhotoImage } from './photoimage'

/**
 * Camera：取景器 → 快门闪光 → 预览。200 万像素。
 */

type Mode = 'view' | 'flash' | 'preview'

export class CameraApp extends BBApp {
  private mode: Mode = 'view'
  private tSec = 0
  private lastSeed = 0

  protected onStart() {
    this.ctx.onFrame((dt) => {
      this.tSec += dt
      if (this.mode === 'flash' && this.tSec > this.flashEnd) this.mode = 'preview'
      if (this.mode === 'preview' && this.tSec > this.previewEnd) this.mode = 'view'
      if (this.mode !== 'view') this.draw()
    })
  }

  private flashEnd = 0
  private previewEnd = 0

  protected draw() {
    const s = this.ctx.screen
    if (this.mode === 'flash') {
      s.fillRect(0, 0, 480, 320, C.WHITE)
      s.render()
      return
    }
    if (this.mode === 'preview') {
      s.fillRect(0, 0, 480, 320, C.G8)
      drawPhotoImage(s, this.lastSeed, 20, 16, 440, 272)
      rrGrad(s, 0, 0, 480, 26, 0, [C.G6, 3])
      s.text(12, 6, '2 MP · 1600×1200', { size: 13, color: C.WHITE })
      s.render()
      return
    }
    this.drawView()
    s.render()
  }

  private drawView() {
    const s = this.ctx.screen
    // 取景：用时间做"动态"风景太昂贵，画暗底 + 网格 + 指示
    s.fillRect(0, 0, 480, 320, C.G8)
    rr(s, 14, 14, 452, 292, 4, C.G7)
    // 取景框角标
    for (const [cx, cy] of [[60, 70], [420, 70], [60, 250], [420, 250]] as const) {
      s.fillRect(cx - 10, cy - 10, 20, 3, C.GREEN)
      s.fillRect(cx - 10, cy - 10, 3, 20, C.GREEN)
    }
    // 中央对焦圈
    disc(s, 240, 160, 26, C.G8)
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2
      s.pset(240 + Math.round(Math.cos(ang) * 26), 160 + Math.round(Math.sin(ang) * 26), C.GREEN)
    }
    // 顶部信息
    s.text(20, 24, '2MP', { size: 12, color: C.WHITE })
    s.textRight(460, 24, '◉', { size: 12, color: C.RED })
    s.textCenter(240, 292, this.str.capture + ': OK', { size: 14, color: C.G3 })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'view' && k === 'ok') {
      this.capture()
    }
  }

  private capture() {
    this.ctx.audio.shutter()
    // 真随机种子
    this.lastSeed = (Math.random() * 2 ** 31) | 0
    this.host.addPhoto(this.lastSeed)
    this.mode = 'flash'
    this.flashEnd = this.tSec + 0.18
    this.previewEnd = this.tSec + 1.6
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    return []
  }
}

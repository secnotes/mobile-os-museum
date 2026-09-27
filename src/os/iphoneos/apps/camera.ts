import { C } from '../palette'
import { disc } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconCamera } from '../icons'
import { drawPhotoArt } from './photo-art'

/**
 * Camera：全屏取景器 + 底部快门；拍照 → 闪光动画 → bridge.addPhoto。
 */
class CameraApp extends IphoneApp {
  private flash = 0

  protected draw() {
    const s = this.ctx.screen
    // 取景器：随时间缓慢漂移的程序化风景
    const t = Math.floor(this.blink * 8) % 60
    drawPhotoArt(s, 0, 0, 320, 480, 29062007 + t)
    // 顶部状态栏（半透明近似：直接画）
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    // 底部黑色控制栏
    s.fillRect(0, 416, 320, 64, C.BLACK)
    // 快门按钮：外环 + 内圆
    disc(s, 160, 448, 26, C.GRAY3)
    disc(s, 160, 448, 22, C.WHITE)
    disc(s, 160, 448, 17, C.WHITE)
    // 最近照片缩略图
    const photos = this.bridge.photos()
    if (photos.length) {
      const last = photos[photos.length - 1]!
      drawPhotoArt(s, 12, 424, 48, 48, last.seed)
    }
    // 闪光
    if (this.flash > 0) {
      s.fillRect(0, 0, 320, 480, C.WHITE)
    }
  }

  protected tap(x: number, y: number) {
    if (y >= 416 && Math.abs(x - 160) < 30) {
      this.capture()
    }
  }

  private capture() {
    // 快门声：短促噪声（近似）
    this.ctx.audio.tone(180, 0.06, { type: 'square', gain: 0.18 })
    this.bridge.addPhoto()
    this.flash = 1
    this.draw()
  }

  protected frame(dt: number) {
    super.frame(dt)
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5)
      this.draw()
      return
    }
    // 取景器约 0.12s 刷新
    if (Math.floor(this.blink * 8) !== Math.floor((this.blink - dt) * 8)) this.draw()
  }
}

export const cameraFactory = miniApp('camera', 'Camera', iconCamera, (ctx, b) => new CameraApp(ctx, b))

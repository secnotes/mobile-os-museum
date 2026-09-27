import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad, rrStroke } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconYoutube } from '../icons'
import { drawNavBar, navTap } from '../navbar'
import { triRight } from './ipod'

type View = 'list' | 'play'

interface YtVideo {
  title: string
  views: string
  dur: number
}

/**
 * YouTube：精选列表 → 视频播放（进度条/播放暂停，本地模拟）。
 */
class YoutubeApp extends IphoneApp {
  private mode: 0 | 1 = 0
  private view: View = 'list'
  private sel: YtVideo | null = null
  private playing = false
  private prog = 0

  private videos: YtVideo[] = [
    { title: this.str.videos[0], views: '1,240,500', dur: 90 },
    { title: this.str.videos[1], views: '880,120', dur: 30 },
    { title: this.str.videos[2], views: '12,408', dur: 240 },
  ]

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.BLACK)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    drawNavBar(s, { title: 'YouTube', back: this.view === 'play' ? 'YouTube' : undefined, right: undefined })
    s.fillRect(0, 64, 320, 416, this.view === 'play' ? C.BLACK : C.WHITE)
    if (this.view === 'list') this.drawList(s)
    else this.drawPlay(s)
  }

  private drawList(s: Screen) {
    // 分段 Featured / Most Viewed
    rr(s, 53, 72, 214, 30, 6, C.WHITE)
    rrStroke(s, 53, 72, 214, 30, 6, C.GRAY4)
    s.fillRect(160 - 1, 76, 1, 22, C.GRAY5)
    s.textCenter(106, 80, this.str.featured, { size: 13, font: this.mode === 0 ? F_BOLD(13) : F_REG(13), color: this.mode === 0 ? C.INK : C.GRAY3 })
    s.textCenter(214, 80, this.str.mostViewed, { size: 13, font: this.mode === 1 ? F_BOLD(13) : F_REG(13), color: this.mode === 1 ? C.INK : C.GRAY3 })
    // 视频行
    this.videos.forEach((v, i) => {
      const y = 114 + i * 76
      // 缩略图
      rr(s, 12, y, 96, 64, 4, C.BLACK)
      triRight(s, 60, y + 32, 10, C.WHITE)
      s.text(120, y + 4, v.title, { size: 14, font: F_BOLD(14), color: C.INK, maxWidth: 190 })
      s.text(120, y + 34, v.views, { size: 12, font: F_REG(12), color: C.GRAY3 })
    })
  }

  private drawPlay(s: Screen) {
    // 视频区
    rrGrad(s, 0, 64, 320, 200, 0, R.LOCK_V)
    if (!this.playing) triRight(s, 160, 164, 22, C.WHITE)
    // 进度
    s.fillRect(12, 250, 296, 4, C.GRAY2)
    const pw = Math.round(296 * (this.prog / this.sel!.dur))
    s.fillRect(12, 250, pw, 4, C.WHITE)
    s.text(12, 262, `${Math.round(this.prog)}s`, { size: 12, font: F_REG(12), color: C.WHITE })
    s.textRight(308, 262, `${this.sel!.dur}s`, { size: 12, font: F_REG(12), color: C.GRAY4 })
    // 标题
    s.text(12, 306, this.sel!.title, { size: 17, font: F_BOLD(17), color: C.WHITE, maxWidth: 296 })
    s.text(12, 332, this.sel!.views + ' views', { size: 13, font: F_REG(13), color: C.GRAY4 })
  }

  protected tap(x: number, y: number) {
    if (navTap(x, y) === 'back' && this.view === 'play') {
      this.view = 'list'; this.playing = false; this.draw(); return
    }
    if (this.view === 'play') {
      if (y >= 64 && y < 264) {
        this.playing = !this.playing
        if (this.playing && this.prog >= this.sel!.dur) this.prog = 0
        this.draw()
      }
      return
    }
    if (y >= 72 && y < 102 && Math.abs(x - 160) < 110) {
      this.mode = x < 160 ? 0 : 1
      this.draw()
      return
    }
    const i = Math.floor((y - 114) / 76)
    if (i >= 0 && i < this.videos.length) {
      this.sel = this.videos[i]
      this.view = 'play'
      this.prog = 0
      this.playing = true
      this.draw()
    }
  }

  protected frame(dt: number) {
    super.frame(dt)
    if (this.playing && this.view === 'play') {
      this.prog += dt
      if (this.prog >= this.sel!.dur) { this.playing = false; this.prog = this.sel!.dur; this.draw(); return }
      if (Math.floor(this.blink * 2) !== Math.floor((this.blink - dt) * 2)) this.draw()
    }
  }
}

export const youtubeFactory = miniApp('youtube', 'YouTube', iconYoutube, (ctx, b) => new YoutubeApp(ctx, b))

import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad, rrStroke } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconIpod } from '../icons'
import { drawNavBar, navTap } from '../navbar'
import { drawTabBar, tabHit, type TabItem } from '../tabbar'

interface Track {
  name: string
  artist: string
  album: string
  dur: number
}

type View = 'list' | 'play'

/**
 * iPod：播放列表/表演者/歌曲标签 → 正在播放（专辑封面/进度/控制）。
 */
class IpodApp extends IphoneApp {
  private tab: 0 | 1 | 2 = 2
  private view: View = 'list'
  private track: Track | null = null
  private playing = false
  private prog = 0

  private tracks: Track[] = [
    { name: 'Beautiful Day', artist: 'U2', album: 'All That You Can’t Leave Behind', dur: 248 },
    { name: 'Hey Jude', artist: 'The Beatles', album: 'Piano Dreams', dur: 431 },
    { name: 'Mr. Tambourine Man', artist: 'Bob Dylan', album: 'Bringing It All Back', dur: 330 },
    { name: 'Scarborough Fair', artist: 'Simon & Garfunkel', album: 'Parsley Sage', dur: 199 },
  ]

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 320, 480, C.WHITE)
    statusBar(s, { dark: false, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    const titles = [this.str.playlists, this.str.artists, this.str.songs]
    drawNavBar(s, { title: this.view === 'play' ? this.str.nowPlaying : titles[this.tab], back: this.view === 'play' ? titles[this.tab] : undefined })
    s.fillRect(0, 64, 320, 367, C.WHITE)
    if (this.view === 'list') this.drawList(s)
    else this.drawPlay(s)
    if (this.view === 'list') drawTabBar(s, this.tabItems(), this.tab)
  }

  private drawList(s: Screen) {
    this.tracks.forEach((t, i) => {
      const y = 64 + i * 56
      s.text(12, y + 8, `${i + 1}`, { size: 14, font: F_REG(14), color: C.GRAY3 })
      s.text(40, y + 6, t.name, { size: 17, font: F_BOLD(17), color: C.INK, maxWidth: 220 })
      s.text(40, y + 30, t.artist, { size: 13, font: F_REG(13), color: C.GRAY3, maxWidth: 200 })
      s.textRight(308, y + 30, fmtDur(t.dur), { size: 13, font: F_REG(13), color: C.GRAY3 })
      s.fillRect(40, y + 55, 268, 1, C.GRAY6)
    })
  }

  private drawPlay(s: Screen) {
    const t = this.track!
    // 专辑封面（渐变占位 + 音符）
    rrGrad(s, 40, 82, 240, 200, 8, R.SKY)
    rrStroke(s, 40, 82, 240, 200, 8, C.GRAY4)
    s.textCenter(160, 158, '♪', { size: 80, font: F_BOLD(80), color: C.WHITE })
    // 曲名/专辑
    s.textCenter(160, 298, t.name, { size: 19, font: F_BOLD(19), color: C.INK })
    s.textCenter(160, 322, `${t.artist} — ${t.album}`, { size: 13, font: F_REG(13), color: C.GRAY3 })
    // 进度条
    const bx = 32, by = 346, bw = 256
    s.fillRect(bx, by + 4, bw, 2, C.GRAY5)
    s.fillRect(bx, by + 4, Math.round(bw * (this.prog / t.dur)), 2, C.WHITE)
    disc2(s, bx + Math.round(bw * (this.prog / t.dur)), by + 5, 3, C.WHITE)
    s.text(bx, by + 12, fmtDur(Math.round(this.prog)), { size: 11, font: F_REG(11), color: C.GRAY3 })
    s.textRight(bx + bw, by + 12, `-${fmtDur(Math.round(t.dur - this.prog))}`, { size: 11, font: F_REG(11), color: C.GRAY3 })
    // 控制：prev / play-pause / next（程序化三角形，避免字体缺字）
    triLeft(s, 100, 400, 8, C.INK)
    triLeft(s, 88, 400, 8, C.INK)
    if (this.playing) {
      s.fillRect(152, 386, 6, 26, C.INK)
      s.fillRect(162, 386, 6, 26, C.INK)
    } else triRight(s, 160, 400, 13, C.INK)
    triRight(s, 220, 400, 8, C.INK)
    triRight(s, 232, 400, 8, C.INK)
  }

  protected tap(x: number, y: number) {
    if (this.view === 'play') {
      // back via nav
      if (navTap(x, y) === 'back') { this.view = 'list'; this.playing = false; this.draw(); return }
      if (Math.abs(x - 160) < 26 && y >= 380) {
        this.playing = !this.playing
        if (!this.playing) this.prog = 0
        this.draw()
        return
      }
      if (Math.abs(x - 100) < 24 && y >= 380) this.seek(-1)
      if (Math.abs(x - 220) < 24 && y >= 380) this.seek(1)
      return
    }
    const ti = tabHit(x, y, 3)
    if (ti !== null) { this.tab = ti as 0 | 1 | 2; this.draw(); return }
    const i = Math.floor((y - 64) / 56)
    if (i >= 0 && i < this.tracks.length) {
      this.track = this.tracks[i]
      this.view = 'play'
      this.prog = 0
      this.playing = true
      this.draw()
    }
  }

  private seek(d: number) {
    const i = this.tracks.indexOf(this.track!)
    const ni = Math.max(0, Math.min(this.tracks.length - 1, i + d))
    this.track = this.tracks[ni]
    this.prog = 0
    this.draw()
  }

  protected frame(dt: number) {
    super.frame(dt)
    if (this.playing && this.view === 'play') {
      this.prog += dt
      if (this.prog >= this.track!.dur) {
        this.seek(1)
        this.playing = true
        return
      }
      // 每 0.5s 重绘进度
      if (Math.floor(this.blink * 2) !== Math.floor((this.blink - dt) * 2)) this.draw()
    }
  }

  private tabItems(): TabItem[] {
    return [
      { label: this.str.playlists, icon: (s, x, y, v) => listIcon(s, x, y, v) },
      { label: this.str.artists, icon: (s, x, y, v) => personIcon(s, x, y, v) },
      { label: this.str.songs, icon: (s, x, y, v) => noteIcon(s, x, y, v) },
    ]
  }
}

function disc2(s: Screen, cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) s.pset(cx + dx, cy + dy, v)
}
function listIcon(s: Screen, x: number, y: number, v: number) {
  for (let i = 0; i < 3; i++) {
    s.fillRect(x - 9, y + i * 6, 12, 2, v)
    s.fillRect(x + 5, y + i * 6, 4, 2, v)
  }
}
function personIcon(s: Screen, x: number, y: number, v: number) {
  disc2(s, x, y + 4, 4, v)
  rr(s, x - 6, y + 9, 12, 7, 3, v)
}
function noteIcon(s: Screen, x: number, y: number, v: number) {
  s.fillRect(x + 4, y - 2, 2, 14, v)
  s.fillRect(x - 4, y + 9, 10, 7, v)
  s.fillRect(x + 2, y, 2, 12, v)
}
function fmtDur(sec: number): string {
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`
}

/** 指向右的实心三角（播放/next） */
export function triRight(s: Screen, cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round((r - Math.abs(dy)) * 0.9)
    s.fillRect(cx, cy + dy, w, 1, v)
  }
}
/** 指向左 */
function triLeft(s: Screen, cx: number, cy: number, r: number, v: number) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round((r - Math.abs(dy)) * 0.9)
    s.fillRect(cx - w, cy + dy, w, 1, v)
  }
}

export const ipodFactory = miniApp('ipod', 'iPod', iconIpod, (ctx, b) => new IpodApp(ctx, b))

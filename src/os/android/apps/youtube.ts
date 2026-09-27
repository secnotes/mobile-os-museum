import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, wrapText, clipToWidth } from '../ui'

/** 播放器时长（秒，演示用） */
const VIDEO_SEC = 24

/** 条目元数据（与 strings.ytVideos 同序）：观看数 / 星级 */
const META = [
  { views: '56,000,000', rate: 4.5 },
  { views: '104,000,000', rate: 4.0 },
  { views: '92,000,000', rate: 5.0 },
]

const ROW_H = 92
const LIST_TOP = STATUS_H + 38

/**
 * YouTube（G1 预装首版）：深色列表（缩略图 + 标题/作者/星级/观看数）
 * → 缓冲条 → 像素「视频」播放器（红色进度条 + 暂停，跟帧平滑）。
 * 条目是 YouTube 史上最具代表性的三支视频。
 */
export const youtubeApp: MiniApp = {
  id: 'youtube',
  name: 'YouTube',
  nameEn: 'YouTube',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 红色圆角屏 + 白色播放三角
    roundRect(s, x + 5, y + 8, 18, 13, 3, C.RED, null)
    for (let i = 0; i < 5; i++) s.fillRect(x + 11, y + 10 + i, 1 + Math.min(i, 4 - i) * 2, 1, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new YouTubeUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type Scene = 'zoo' | 'dance' | 'kids'
type Phase = 'buf' | 'play' | 'paused' | 'end'

class YouTubeUI {
  private view: 'list' | 'player' = 'list'
  private sel = 0
  private phase: Phase = 'buf'
  private bufP = 0
  private t = 0
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
    this.offs.push(this.ctx.onFrame((dt) => this.frame(dt)))
    this.draw()
  }

  private frame(dt: number) {
    if (this.view !== 'player') return
    if (this.phase === 'buf') {
      this.bufP += dt / 1.4
      if (this.bufP >= 1) {
        this.phase = 'play'
        this.t = 0
      }
      this.draw()
    } else if (this.phase === 'play') {
      this.t += dt
      if (this.t >= VIDEO_SEC) {
        this.t = VIDEO_SEC
        this.phase = 'end'
      }
      this.draw()
    }
  }

  private onKey(k: DeviceKey) {
    const n = META.length
    if (this.view === 'list') {
      switch (k) {
        case 'up':
          this.sel = (this.sel + n - 1) % n
          break
        case 'down':
          this.sel = (this.sel + 1) % n
          break
        case 'ok':
          this.startPlay()
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
    // player
    if (k === 'back') {
      this.view = 'list'
    } else if (k === 'ok') {
      if (this.phase === 'play') this.phase = 'paused'
      else if (this.phase === 'paused') this.phase = 'play'
      else this.startPlay()
    } else return
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.view === 'list') {
      for (let i = 0; i < META.length; i++) {
        if (y >= LIST_TOP + i * ROW_H && y < LIST_TOP + (i + 1) * ROW_H) {
          this.sel = i
          this.startPlay()
          return
        }
      }
      return
    }
    // 点视频区：播放中→暂停；暂停/缓冲完/结束→播放或重播
    const vy0 = STATUS_H + 8
    if (y >= vy0 && y < vy0 + 176 && x >= 4 && x < W - 4) {
      if (this.phase === 'play') this.phase = 'paused'
      else if (this.phase === 'paused') this.phase = 'play'
      else if (this.phase === 'end') this.startPlay()
      this.draw()
    }
  }

  private startPlay() {
    this.view = 'player'
    this.phase = 'buf'
    this.bufP = 0
    this.t = 0
    this.draw()
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
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    if (this.view === 'list') this.drawList(str)
    else this.drawPlayer(str)
    s.render()
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    // 标题条
    s.fillRect(0, STATUS_H, W, 32, C.PANEL)
    s.text(12, STATUS_H + 9, str.ytTitle, { size: 14, color: C.WHITE })
    s.textRight(W - 12, STATUS_H + 10, '▶', { size: 12, color: C.RED })
    str.ytVideos.forEach((v, i) => {
      const y = LIST_TOP + i * ROW_H
      if (i === this.sel) {
        s.fillRect(0, y, W, ROW_H - 2, C.ORANGE)
        s.fillRect(0, y, 3, ROW_H - 2, C.AMBER)
      }
      const tc = i === this.sel ? C.INK : C.WHITE
      const gc = i === this.sel ? C.INK : C.GRAY
      // 缩略图
      roundRect(s, 10, y + 9, 104, 70, 5, C.INK, null)
      this.thumb(v.scene, 12, y + 11)
      // 文本
      s.text(124, y + 10, clipToWidth(s, v.title, W - 136, 12), { size: 12, color: tc })
      s.text(124, y + 30, clipToWidth(s, v.by, W - 136, 9), { size: 9, color: gc })
      for (let st = 0; st < 5; st++)
        miniStar(s, 124 + st * 9, y + 50, st < Math.round(META[i]!.rate) ? (i === this.sel ? C.INK : C.AMBER) : gc)
      s.text(176, y + 48, str.ytViews(META[i]!.views), { size: 9, color: gc })
    })
  }

  /** 列表缩略图：黑底彩条 + 白色音波点 */
  private thumb(scene: Scene, x: number, y: number) {
    const s = this.ctx.screen
    s.fillRect(x, y, 100, 70, C.INK)
    s.fillRect(x, y, 100, 18, scene === 'zoo' ? C.DGREEN : scene === 'dance' ? C.AMBER : C.PALE)
    for (let k = 0; k < 4; k++) s.fillRect(x + 10 + k * 4, y + 40 + k, 2, 18 - k * 4, C.WHITE)
  }

  private drawPlayer(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const v = str.ytVideos[this.sel]!
    // 视频区 16:9
    const vx = 4
    const vy = STATUS_H + 8
    const vw = W - 8
    const vh = 176
    s.fillRect(vx, vy, vw, vh, C.INK)
    if (this.phase === 'buf') {
      // 缓冲：中央百分比 + 底部缓冲条
      s.textCenter(W >> 1, vy + 70, str.ytBuf, { size: 13, color: C.WHITE })
      s.textCenter(W >> 1, vy + 94, `${Math.min(99, Math.round(this.bufP * 100))}%`, { size: 16, color: C.AMBER })
      s.fillRect(vx + 20, vy + vh - 14, vw - 40, 4, C.PANEL)
      s.fillRect(vx + 20, vy + vh - 14, Math.round((vw - 40) * this.bufP), 4, C.RED)
    } else {
      this.drawScene(v.scene, vx, vy)
      // 红色进度条 + 时间
      const p = this.t / VIDEO_SEC
      const by2 = vy + vh + 8
      s.fillRect(vx, by2, vw, 5, C.PANEL)
      s.fillRect(vx, by2, Math.round(vw * p), 5, C.RED)
      s.pset(vx + Math.round(vw * p), by2 + 2, C.WHITE)
      s.text(vx + 2, by2 + 12, fmtT(this.t), { size: 9, color: C.GRAY })
      s.textRight(vx + vw - 2, by2 + 12, fmtT(VIDEO_SEC), { size: 9, color: C.GRAY })
      if (this.phase === 'paused') {
        s.textCenter(W >> 1, vy + vh / 2, '❚❚', { size: 30, color: C.WHITE })
      } else if (this.phase === 'end') {
        roundRect(s, W / 2 - 52, vy + vh / 2 - 18, 104, 36, 8, C.DARKRED, null)
        s.textCenter(W >> 1, vy + vh / 2 - 6, str.ytReplay, { size: 12, color: C.WHITE })
      }
    }
    // 标题/作者
    const infoY = vy + vh + 34
    wrapText(s, v.title, W - 24, 12).slice(0, 2).forEach((ln, i) =>
      s.text(12, infoY + i * 16, ln, { size: 12, color: C.WHITE }))
    s.text(12, infoY + 34, clipToWidth(s, v.by, W - 24, 10), { size: 10, color: C.GRAY })
  }

  /** 8-bit 风格「视频」画面 */
  private drawScene(scene: Scene, vx: number, vy: number) {
    const s = this.ctx.screen
    if (scene === 'zoo') {
      // 动物园：绿地 + 灰色大象
      s.fillRect(vx, vy + 116, W - 8, 60, C.DGREEN)
      for (let dy = -18; dy <= 18; dy++)
        for (let dx = -26; dx <= 26; dx++)
          if (dx * dx / 3 + dy * dy <= 324) s.pset(vx + 110 + dx, vy + 70 + dy, C.GRAY)
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++)
          if (dx * dx + dy * dy <= 144) s.pset(vx + 140 + dx, vy + 54 + dy, C.GRAY)
      s.fillRect(vx + 150, vy + 54, 18, 6, C.GRAY)
      s.fillRect(vx + 96, vy + 86, 12, 26, C.GRAY)
      s.fillRect(vx + 118, vy + 86, 12, 26, C.GRAY)
    } else if (scene === 'dance') {
      // 舞台：琥珀地板 + 舞者剪影
      s.fillRect(vx, vy + 136, W - 8, 40, C.AMBER)
      s.fillRect(vx + 140, vy + 40, 8, 50, C.INK)
      s.fillRect(vx + 132, vy + 20, 24, 22, C.INK)
      s.fillRect(vx + 108, vy + 50, 32, 8, C.INK)
      s.fillRect(vx + 148, vy + 38, 32, 8, C.INK)
      s.fillRect(vx + 134, vy + 90, 10, 30, C.INK)
      s.fillRect(vx + 146, vy + 90, 10, 30, C.INK)
    } else {
      // 两个小孩：沙发上的经典一幕
      s.fillRect(vx, vy + 146, W - 8, 30, C.BLUE)
      for (const [fx, fy] of [[90, 90], [200, 90]] as const) {
        for (let dy = -16; dy <= 16; dy++)
          for (let dx = -14; dx <= 14; dx++)
            if (dx * dx + dy * dy <= 196) s.pset(vx + fx + dx, vy + fy + dy, C.PALE)
        s.pset(vx + fx - 5, vy + fy - 4, C.INK)
        s.pset(vx + fx + 5, vy + fy - 4, C.INK)
      }
    }
  }
}

function fmtT(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/** 像素小星星 */
function miniStar(s: { fillRect(x: number, y: number, w: number, h: number, v: number): void }, x: number, y: number, color: number) {
  s.fillRect(x + 1, y, 2, 2, color)
  s.fillRect(x, y + 2, 5, 2, color)
  s.fillRect(x + 1, y + 4, 1, 1, color)
  s.fillRect(x + 3, y + 4, 1, 1, color)
}

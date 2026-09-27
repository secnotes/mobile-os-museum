import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent, clipToWidth } from '../ui'

/**
 * RealPlayer：短片列表 + 像素动画播放（程序化短片），
 * 进度条 / 暂停 / 静音。
 */
export const realplayerApp: MiniApp = {
  id: 'realplayer',
  name: 'RealPlayer',
  nameEn: 'RealPlayer',
  start(ctx) {
    const ui = new RPUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

interface Clip { zh: string; en: string; dur: number; kind: 'ball' | 'bars' | 'sun' }

const CLIPS: Clip[] = [
  { zh: '弹球短片', en: 'Bouncing ball', dur: 6, kind: 'ball' },
  { zh: '音乐可视化', en: 'Visualizer', dur: 8, kind: 'bars' },
  { zh: '日落延时', en: 'Sunset timelapse', dur: 5, kind: 'sun' },
]

class RPUI {
  private offs: Array<() => void> = []
  private view: 'list' | 'play' = 'list'
  private sel = 0
  private playing = false
  private elapsed = 0
  private dur = 0
  private cur = 0

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.view === 'play' && this.playing) {
        this.elapsed += dt
        if (this.elapsed >= this.dur) {
          this.playing = false
          this.elapsed = this.dur
        }
        this.draw()
      }
    }))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (this.view === 'list') {
      const n = CLIPS.length
      switch (k) {
        case 'up': this.sel = (this.sel + n - 1) % n; break
        case 'down': this.sel = (this.sel + 1) % n; break
        case 'ok': case 'soft1': this.startPlay(); break
        case 'soft2': case 'back': this.ctx.exit(); return
        default: return
      }
      this.draw()
      return
    }
    switch (k) {
      case 'ok': this.playing = !this.playing; break
      case 'left': this.elapsed = Math.max(0, this.elapsed - 2); break
      case 'right': this.elapsed = Math.min(this.dur, this.elapsed + 2); break
      case 'soft2': case 'back': this.view = 'list'; break
      default: return
    }
    this.draw()
  }

  private startPlay() {
    this.cur = this.sel
    this.dur = CLIPS[this.cur]!.dur
    this.elapsed = 0
    this.playing = true
    this.view = 'play'
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'list') {
      titleBar(s, 'RealPlayer')
      CLIPS.forEach((c, i) => {
        const y = CONTENT_TOP + 12 + i * 44
        const selRow = i === this.sel
        if (selRow) s.fillRect(6, y - 2, W - 12, 40, C.BLUE)
        // 胶片图标
        s.fillRect(14, y + 4, 22, 26, selRow ? C.WHITE : C.INK)
        s.fillRect(17, y + 8, 16, 18, selRow ? C.BLUE : C.DARK)
        s.text(48, y + 8, clipToWidth(s, en ? c.en : c.zh, 130, 13),
          { size: 13, color: selRow ? C.WHITE : C.INK })
        s.text(48, y + 24, `${c.dur}s`, { size: 10, color: selRow ? C.PALE : C.GRAY })
      })
      softBar(s, en ? 'Play' : '播放', str.contactsBack)
      return
    }
    titleBar(s, en ? 'Now playing' : '正在播放')
    // 视频区
    const clip = CLIPS[this.cur]!
    s.fillRect(12, CONTENT_TOP + 6, W - 24, 150, C.INK)
    this.drawFrame(clip.kind, 24, CONTENT_TOP + 18, 192, 126)
    // 进度
    s.fillRect(12, CONTENT_TOP + 162, W - 24, 5, C.PALE)
    const px = (this.elapsed / this.dur) * (W - 24)
    s.fillRect(12, CONTENT_TOP + 162, Math.round(px), 5, C.RED)
    const t = Math.round(this.elapsed)
    s.text(12, CONTENT_TOP + 172, `${t}s`, { size: 10, color: C.GRAY })
    s.textRight(W - 12, CONTENT_TOP + 172, `${this.dur}s`, { size: 10, color: C.GRAY })
    s.textCenter(W / 2, CONTENT_TOP + 198,
      this.playing ? (en ? 'Playing… centre to pause' : '播放中… 中键暂停')
        : (en ? 'Paused' : '已暂停'),
      { size: 11, color: C.GRAY })
    softBar(s, '', str.contactsBack)
  }

  /** 程序化短片帧 */
  private drawFrame(kind: Clip['kind'], x0: number, y0: number, w: number, h: number) {
    const s = this.ctx.screen
    const t = this.elapsed
    if (kind === 'ball') {
      // 弹球（正弦上下）
      const bx = x0 + ((t * 40) % w)
      const by = y0 + h / 2 + Math.sin(t * 4) * (h / 2 - 12)
      s.fillRect(bx, by, 10, 10, C.AMBER)
      // 地面线
      s.line(x0, y0 + h - 4, x0 + w, y0 + h - 4, C.GRAY)
    } else if (kind === 'bars') {
      // 跳动频谱柱
      for (let i = 0; i < 16; i++) {
        const bh = 10 + Math.abs(Math.sin(t * 3 + i * 0.6)) * (h - 24)
        s.fillRect(x0 + 6 + i * 12, y0 + h - bh, 8, bh,
          i % 3 === 0 ? C.GREEN : i % 3 === 1 ? C.CYAN : C.AMBER)
      }
    } else {
      // 日落：下沉的圆 + 天色渐变（三层横条）
      s.fillRect(x0, y0, w, h * 0.55, C.NAVY)
      s.fillRect(x0, y0 + h * 0.55, w, h * 0.45, C.INK)
      const sy = y0 + 10 + (t / this.dur) * (h - 30)
      for (let dy = -18; dy <= 18; dy++)
        for (let dx = -18; dx <= 18; dx++)
          if (dx * dx + dy * dy <= 324 && y0 + sy + dy < y0 + h * 0.55 + 6)
            s.pset(x0 + w / 2 + dx, sy + dy, C.AMBER)
    }
  }
}

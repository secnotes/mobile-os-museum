import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { melodyDuration } from '../../../hal/audio'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent, clipToWidth } from '../ui'

/**
 * 音乐播放器：曲目列表 + Now playing（专辑位/进度/播放暂停/上下首）。
 * 旋律全部为合成，进度按 melodyDuration 对齐。
 */
export const musicApp: MiniApp = {
  id: 'music',
  name: '音乐播放器',
  nameEn: 'Music player',
  start(ctx) {
    const ui = new MusicUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

interface Track { zh: string; en: string; artist: string; bpm: number; notes: ReadonlyArray<readonly [number, number]> }

const TRACKS: Track[] = [
  {
    zh: 'Nokia 主题曲', en: 'Nokia tune', artist: 'F. Tárrega', bpm: 140,
    notes: [[76,.5],[74,.5],[66,1],[68,1],[73,.5],[71,.5],[62,1],[64,1],[71,.5],[69,.5],[61,1],[64,1],[69,2]],
  },
  {
    zh: '宇宙', en: 'Cosmic', artist: 'Synth', bpm: 160,
    notes: [[72,.5],[76,.5],[79,.5],[84,1],[79,.5],[76,.5],[74,1],[72,2]],
  },
  {
    zh: '小径', en: 'Trail', artist: 'Synth', bpm: 150,
    notes: [[67,1],[69,.5],[71,.5],[72,2],[71,.5],[69,.5],[67,2]],
  },
  {
    zh: '颤动', en: 'Tremor', artist: 'Synth', bpm: 130,
    notes: [[69,.25],[69,.25],[72,.5],[71,.25],[71,.25],[74,.5],[76,1],[72,1]],
  },
  {
    zh: '马林巴', en: 'Marimba', artist: 'Synth', bpm: 120,
    notes: [[60,.5],[64,.5],[67,.5],[72,1],[67,.5],[64,.5],[60,2]],
  },
  {
    zh: '夜曲', en: 'Nocturne', artist: 'Synth', bpm: 100,
    notes: [[81,1],[79,.5],[76,.5],[74,2],[76,.5],[79,.5],[81,2]],
  },
]

class MusicUI {
  private offs: Array<() => void> = []
  private view: 'list' | 'now' = 'list'
  private sel = 0
  private cur = 0
  private playing = false
  private elapsed = 0
  private dur = 0
  private stopFn: (() => void) | null = null
  private shuffle = false
  private repeat = false
  private optsOpen = false
  private optsSel = 0

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.view === 'now' && this.playing) {
        this.elapsed += dt
        if (this.elapsed >= this.dur) this.trackEnd()
        else this.draw()
      }
    }))
    this.draw()
  }

  dispose() {
    this.offs.forEach((off) => off())
    this.stopPlay()
  }

  private onKey(k: DeviceKey) {
    if (this.optsOpen) return this.optsKey(k)
    if (this.view === 'list') return this.listKey(k)
    switch (k) {
      case 'ok': this.toggle(); break
      case 'left': this.seek(-5); break
      case 'right': this.seek(5); break
      case 'up': this.prev(); break
      case 'down': this.next(); break
      case 'soft1': this.optsOpen = true; break
      case 'soft2': case 'back':
        this.stopPlay(); this.view = 'list'; break
      default: return
    }
    this.draw()
  }

  private listKey(k: DeviceKey) {
    const n = TRACKS.length
    switch (k) {
      case 'up': this.sel = (this.sel + n - 1) % n; break
      case 'down': this.sel = (this.sel + 1) % n; break
      case 'ok': case 'soft1': this.cur = this.sel; this.startPlay(); this.view = 'now'; break
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private optsLabels(): string[] {
    const en = this.ctx.lang.get() === 'en'
    return [
      this.shuffle ? (en ? 'Shuffle ON' : '随机播放 开') : (en ? 'Shuffle' : '随机播放'),
      this.repeat ? (en ? 'Repeat ON' : '重复 开') : (en ? 'Repeat' : '重复'),
    ]
  }

  private optsKey(k: DeviceKey) {
    switch (k) {
      case 'up': case 'down':
        // 两项切换
        break
      case 'ok':
        if (this.optsSel === 0) this.shuffle = !this.shuffle
        else this.repeat = !this.repeat
        this.optsOpen = false
        break
      case 'soft2': case 'back': this.optsOpen = false; break
      default: return
    }
    this.draw()
  }

  private startPlay() {
    const t = TRACKS[this.cur]!
    this.dur = melodyDuration(t.notes, t.bpm)
    this.elapsed = 0
    this.playing = true
    this.stopFn = this.ctx.audio.playMelody(t.notes, t.bpm, { loop: false, volume: 0.8 })
  }

  private stopPlay() {
    this.stopFn?.()
    this.stopFn = null
    this.playing = false
  }

  private toggle() {
    if (this.playing) {
      // 暂停：停掉旋律，记忆位置（合成无法暂停，重放从 0——简化为从头，仅更新态）
      this.stopPlay()
      this.playing = false
    } else {
      this.startPlay()
    }
  }

  private seek(d: number) {
    this.elapsed = Math.max(0, Math.min(this.dur, this.elapsed + d))
  }

  private prev() {
    this.stopPlay()
    this.cur = (this.cur + TRACKS.length - 1) % TRACKS.length
    this.startPlay()
  }

  private next() {
    this.stopPlay()
    this.cur = this.shuffle
      ? Math.floor(Math.random() * TRACKS.length)
      : (this.cur + 1) % TRACKS.length
    this.startPlay()
  }

  private trackEnd() {
    if (this.repeat) {
      this.stopPlay(); this.startPlay(); this.draw()
    } else if (this.shuffle || this.cur < TRACKS.length - 1) {
      this.next(); this.draw()
    } else {
      this.playing = false
      this.elapsed = this.dur
      this.draw()
    }
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'list') {
      titleBar(s, en ? 'Music player' : '音乐播放器')
      TRACKS.forEach((t, i) => {
        const y = CONTENT_TOP + 8 + i * 34
        const selRow = i === this.sel
        if (selRow) s.fillRect(6, y - 2, W - 12, 32, C.BLUE)
        // 迷你音符图标
        s.text(14, y + 7, '♪', { size: 15, color: selRow ? C.AMBER : C.BLUE })
        s.text(34, y + 6, clipToWidth(s, en ? t.en : t.zh, 130, 13),
          { size: 13, color: selRow ? C.WHITE : C.INK })
        s.text(34, y + 20, t.artist, { size: 9, color: selRow ? C.PALE : C.GRAY })
      })
      softBar(s, en ? 'Play' : '播放', str.contactsBack)
      return
    }
    // Now playing
    titleBar(s, en ? 'Now playing' : '正在播放')
    const t = TRACKS[this.cur]!
    // 专辑位（程序画的彩色方块）
    const colors = [C.BLUE, C.GREEN, C.RED, C.AMBER, C.SKY, C.NAVY]
    s.fillRect(50, 44, 140, 100, colors[this.cur]!)
    s.fillRect(56, 50, 128, 88, colors[(this.cur + 2) % colors.length]!)
    s.text(64, 84, '♪', { size: 40, color: C.WHITE })
    s.textCenter(W / 2, 158, clipToWidth(s, en ? t.en : t.zh, W - 30, 14),
      { size: 14, color: C.INK })
    s.textCenter(W / 2, 178, t.artist, { size: 10, color: C.GRAY })
    // 进度条
    s.fillRect(20, 200, W - 40, 6, C.PALE)
    const px = this.dur ? (this.elapsed / this.dur) * (W - 40) : 0
    s.fillRect(20, 200, Math.round(px), 6, C.BLUE)
    s.pset(20 + Math.round(px), 203, C.RED)
    const fmt = (x: number) => `${String((x / 60) | 0).padStart(2, '0')}:${String(x % 60 | 0).padStart(2, '0')}`
    s.text(20, 212, fmt(this.elapsed), { size: 9, color: C.GRAY })
    s.textRight(W - 20, 212, fmt(this.dur), { size: 9, color: C.GRAY })
    // 控制行
    s.text(28, 240, '⏮', { size: 14, color: C.INK })
    s.textCenter(W / 2, 238, this.playing ? '⏸' : '▶', { size: 20, color: C.BLUE })
    s.textRight(28, 240, '⏭', { size: 14, color: C.INK })
    s.textCenter(W / 2, 274, en ? 'Up/Down: tracks · centre: pause' : '上下：切歌 · 中键：暂停',
      { size: 10, color: C.GRAY })
    if (this.optsOpen) this.drawOpts()
    softBar(s, en ? 'Options' : '选项', str.contactsBack)
  }

  private drawOpts() {
    const s = this.ctx.screen
    const labels = this.optsLabels()
    const ph = labels.length * 24 + 12
    s.fillRect(60, 110, 120, ph, C.WHITE)
    labels.forEach((lb, i) => {
      if (i === this.optsSel) s.fillRect(66, 116 + i * 24, 108, 22, C.BLUE)
      s.text(74, 123 + i * 24, lb, { size: 11, color: i === this.optsSel ? C.WHITE : C.INK })
    })
  }
}

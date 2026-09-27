import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { SeqNote } from '../../../hal/audio'
import { midiFreq } from '../../../hal/audio'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, clipToWidth , onTrayChange } from '../ui'

/**
 * Music + Videos（Zune 血统）：三页 Pivot —— 音乐（合成曲目循环播放 +
 * Zune 风大封面/进度）、视频（示例片段）、FM 收音机（87.5–108 调谐 +
 * 3 个预设台，静场用白噪声带通）。
 */
export const musicApp: MiniApp = {
  id: 'music',
  name: '音乐 + 视频',
  nameEn: 'Music + Videos',
  start(ctx: AppContext) {
    const ui = new MusicUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Song {
  zh: string
  en: string
  artistZh: string
  artistEn: string
  dur: number
  seq: SeqNote[]
  color: string
}

const note = (m: number, d = 0.28, t: OscillatorType = 'triangle', g = 0.2): SeqNote =>
  ({ f: midiFreq(m), d, t, g, gap: d })

const SONGS: Song[] = [
  {
    zh: '都市晨光', en: 'City Morning', artistZh: '地铁乐队', artistEn: 'Metro Line',
    dur: 46, color: '#1ba1e2',
    seq: [60, 64, 67, 72, 67, 64].map((m) => note(m)),
  },
  {
    zh: '夜色温柔', en: 'Tender Night', artistZh: '林小雨', artistEn: 'Lin Xiaoyu',
    dur: 58, color: '#a200ff',
    seq: [69, 67, 65, 64, 65, 67].map((m) => note(m, 0.4, 'sine', 0.18)),
  },
  {
    zh: '芒果节拍', en: 'Mango Beat', artistZh: 'Zune 调频', artistEn: 'Zune FM',
    dur: 40, color: '#f09609',
    seq: [62, 62, 65, 67, 67, 65, 62, 59].map((m, i) => note(m, i % 2 ? 0.18 : 0.26, 'square', 0.1)),
  },
  {
    zh: '湖畔', en: 'Lakeside', artistZh: '青柠三重奏', artistEn: 'Lime Trio',
    dur: 64, color: '#00aba9',
    seq: [57, 60, 64, 69, 64, 60].map((m) => note(m, 0.45, 'triangle', 0.16)),
  },
]

const FM_PRESETS: Array<{ mhz: number; zh: string; en: string; seq: SeqNote[] }> = [
  { mhz: 88.7, zh: '音乐之声', en: 'Music Radio', seq: [60, 64, 67, 72].map((m) => note(m, 0.3)) },
  { mhz: 97.4, zh: '城市流行', en: 'City Pop', seq: [69, 68, 65, 64].map((m) => note(m, 0.25, 'square', 0.1)) },
  { mhz: 103.9, zh: '经典金曲', en: 'Golden Oldies', seq: [55, 59, 62, 67].map((m) => note(m, 0.36, 'sine', 0.18)) },
]

class MusicUI {
  private tab = 0
  private cur: Song | null = null
  private playing = false
  private pos = 0
  private stopSong: (() => void) | null = null
  private mhz = 88.7
  private fm: { stop: () => void; tune: (mhz: number) => void } | null = null
  private stopStation: (() => void) | null = null
  private videoT = 0
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.stopAllAudio()
    for (const off of this.offs.splice(0)) off()
  }

  private stopAllAudio() {
    this.stopSong?.()
    this.stopSong = null
    this.stopStation?.()
    this.stopStation = null
    this.fm?.stop()
    this.fm = null
  }

  async init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.cur) return
      if (dir === 'left') this.setTab(Math.min(2, this.tab + 1))
      else if (dir === 'right') this.setTab(Math.max(0, this.tab - 1))
    }))
    this.offs.push(this.ctx.onFrame((dt) => this.tick(dt)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private tick(dt: number) {
    let dirty = false
    if (this.playing && this.cur) {
      this.pos += dt
      if (this.pos >= this.cur.dur) {
        const idx = (SONGS.indexOf(this.cur) + 1) % SONGS.length
        this.playSong(SONGS[idx]!)
      }
      dirty = true
    }
    if (this.tab === 2) dirty = true
    if (this.videoT > 0) {
      this.videoT -= dt
      dirty = true
    }
    if (dirty) this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.cur) {
        this.cur = null
        this.draw()
      } else this.ctx.exit()
    }
  }

  private setTab(t: number) {
    if (t === this.tab) return
    this.tab = t
    // 离开 FM 关静场；进入 FM 开静场
    if (t !== 2) {
      this.stopStation?.()
      this.stopStation = null
      this.fm?.stop()
      this.fm = null
    }
    this.tune(this.mhz, true)
    this.draw()
  }

  private playSong(song: Song) {
    this.stopSong?.()
    this.cur = song
    this.pos = 0
    this.playing = true
    this.stopSong = this.ctx.audio.playSequence(song.seq, { loop: true, volume: 0.4 })
  }

  private togglePlay() {
    if (!this.cur) return
    if (this.playing) {
      this.playing = false
      this.stopSong?.()
      this.stopSong = null
    } else {
      this.playing = true
      this.stopSong = this.ctx.audio.playSequence(this.cur.seq, { loop: true, volume: 0.4 })
    }
    this.draw()
  }

  /** FM 调谐；enterTab=true 时首次进入建立静场 */
  private tune(mhz: number, enterTab = false) {
    this.mhz = mhz
    if (this.tab !== 2) return
    if (!this.fm) {
      if (!enterTab) return
      this.fm = this.ctx.audio.fmStatic(0.06)
    }
    this.fm.tune(mhz)
    const preset = FM_PRESETS.find((p) => Math.abs(p.mhz - mhz) < 0.06)
    this.stopStation?.()
    this.stopStation = preset
      ? this.ctx.audio.playSequence(preset.seq, { loop: true, volume: 0.3 })
      : null
    this.draw()
  }

  private onTap(x: number, y: number) {
    const str = wpStrings(this.ctx.lang.get())
    if (this.cur) {
      // 播放控制（y 640–720）
      if (y >= 620 && y <= 720) {
        if (x < 160) {
          const idx = (SONGS.indexOf(this.cur) + SONGS.length - 1) % SONGS.length
          this.playSong(SONGS[idx]!)
        } else if (x > W - 160) {
          const idx = (SONGS.indexOf(this.cur) + 1) % SONGS.length
          this.playSong(SONGS[idx]!)
        } else this.togglePlay()
      }
      return
    }
    // Pivot 标题
    if (y >= TRAY_H && y < TRAY_H + 56) {
      const titles = [str.musicSongs, str.musicVideos, str.musicFm]
      let xacc = 24
      for (let i = 0; i < titles.length; i++) {
        const w = this.ctx.screen.measure(titles[i]!, { size: i === this.tab ? 30 : 24 }) + 32
        if (x >= xacc && x < xacc + w) {
          this.setTab(i)
          return
        }
        xacc += w
      }
    }
    const TOP = TRAY_H + 70
    if (this.tab === 0) {
      const r = Math.floor((y - TOP) / 92)
      if (r >= 0 && r < SONGS.length) this.playSong(SONGS[r]!)
    } else if (this.tab === 2) {
      // ‹ › 步进 0.1MHz；点预设行直跳
      if (y >= 120 && y < 200) {
        if (x < 120) this.tune(Math.round((this.mhz - 0.1) * 10) / 10)
        else if (x > W - 120) this.tune(Math.round((this.mhz + 0.1) * 10) / 10)
      }
      FM_PRESETS.forEach((p, i) => {
        const y2 = 420 + i * 90
        if (y >= y2 && y < y2 + 70) this.tune(p.mhz)
      })
    } else if (this.tab === 1 && y >= TOP && y < TOP + 200) {
      this.videoT = 4
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    s.fillRect(0, 0, W, H, C.BLACK)
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    if (this.cur) {
      this.drawNowPlaying(str)
      s.render()
      return
    }
    // Pivot 标题（活动白色 30，其余灰 24）
    const titles = [str.musicSongs, str.musicVideos, str.musicFm]
    let x = 24
    titles.forEach((t, i) => {
      const active = i === this.tab
      s.text(x, TRAY_H + 12, t, {
        size: active ? 30 : 24, font: F_LIGHT(active ? 30 : 24),
        color: active ? C.WHITE : C.GRAY,
      })
      x += s.measure(t, { size: active ? 30 : 24 }) + 32
    })
    const TOP = TRAY_H + 70
    if (this.tab === 0) this.drawSongList(str, TOP)
    else if (this.tab === 1) this.drawVideos(str, TOP)
    else this.drawRadio(str)
    s.render()
  }

  private drawSongList(str: ReturnType<typeof wpStrings>, top: number) {
    const s = this.ctx.screen
    SONGS.forEach((song, i) => {
      const y = top + i * 92
      const name = this.ctx.lang.get() === 'en' ? song.en : song.zh
      const artist = this.ctx.lang.get() === 'en' ? song.artistEn : song.artistZh
      s.text(24, y, clipToWidth(s, name, W - 140, 28, F_SEMI(28)), {
        size: 28, font: F_SEMI(28), color: C.WHITE,
      })
      s.text(24, y + 38, clipToWidth(s, artist, W - 140, 22, F_REG(22)), {
        size: 22, font: F_REG(22), color: C.GRAY,
      })
      const mm = `${Math.floor(song.dur / 60)}:${two(song.dur % 60)}`
      s.textRight(W - 24, y, mm, { size: 22, font: F_REG(22), color: C.GRAY })
      s.fillRect(24, y + 76, W - 48, 1, C.DIM)
    })
    void str
  }

  private drawVideos(str: ReturnType<typeof wpStrings>, top: number) {
    const s = this.ctx.screen
    // 示例视频缩略（色块）
    s.fillRect(24, top, W - 48, 180, C.STEEL)
    s.textCenter(W / 2, top + 60, '▶', { size: 56, font: F_SEMI(56), color: C.WHITE })
    const name = this.ctx.lang.get() === 'en' ? 'Sample video' : '示例视频'
    s.text(24, top + 210, name, { size: 26, font: F_REG(26), color: C.WHITE })
    if (this.videoT > 0) {
      const p = 1 - this.videoT / 4
      s.fillRect(24, top + 186, (W - 48) * p, 4, this.ctx.host.getAccent?.() ?? C.BLUE)
    }
    void str
  }

  private drawRadio(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    // 频率大字
    s.textCenter(W / 2, 170, this.mhz.toFixed(1), { size: 110, font: F_LIGHT(110), color: C.WHITE })
    s.text(44, 150, '‹', { size: 50, font: F_LIGHT(50), color: C.WHITE })
    s.textRight(W - 44, 150, '›', { size: 50, font: F_LIGHT(50), color: C.WHITE })
    // 状态行
    const preset = FM_PRESETS.find((p) => Math.abs(p.mhz - this.mhz) < 0.06)
    const label = preset
      ? (this.ctx.lang.get() === 'en' ? preset.en : preset.zh)
      : str.fmNoSignal
    s.textCenter(W / 2, 250, label, { size: 24, font: F_REG(24), color: preset ? C.WHITE : C.GRAY })
    // 预设列表
    s.text(24, 390, str.fmPreset, { size: 22, font: F_REG(22), color: C.GRAY })
    FM_PRESETS.forEach((p, i) => {
      const y = 420 + i * 90
      const active = Math.abs(p.mhz - this.mhz) < 0.06
      if (active) s.fillRect(24, y - 6, 4, 60, this.ctx.host.getAccent?.() ?? C.BLUE)
      s.text(44, y, this.ctx.lang.get() === 'en' ? p.en : p.zh, {
        size: 26, font: active ? F_SEMI(26) : F_REG(26), color: C.WHITE,
      })
      s.textRight(W - 24, y, p.mhz.toFixed(1), { size: 24, font: F_REG(24), color: C.GRAY })
      s.fillRect(24, y + 56, W - 48, 1, C.DIM)
    })
  }

  private drawNowPlaying(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const song = this.cur!
    const en = this.ctx.lang.get() === 'en'
    // 大封面（纯色 canvas + 白色音波线）
    const cover = document.createElement('canvas')
    cover.width = 300
    cover.height = 300
    const g = cover.getContext('2d')!
    g.fillStyle = song.color
    g.fillRect(0, 0, 300, 300)
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.lineWidth = 6
    for (let i = 0; i < 5; i++) {
      g.beginPath()
      const bx = 60 + i * 45
      g.moveTo(bx, 210 - (i % 3) * 30)
      g.lineTo(bx, 210 + ((i + 1) % 3) * 20)
      g.stroke()
    }
    s.blit(cover, 90, 96, { w: 300, h: 300 })
    // 标题/艺术家
    s.textCenter(W / 2, 446, clipToWidth(s, en ? song.en : song.zh, W - 48, 32, F_SEMI(32)), {
      size: 32, font: F_SEMI(32), color: C.WHITE,
    })
    s.textCenter(W / 2, 486, clipToWidth(s, en ? song.artistEn : song.artistZh, W - 48, 22, F_REG(22)), {
      size: 22, font: F_REG(22), color: C.GRAY,
    })
    // 进度
    s.fillRect(24, 540, W - 48, 3, C.DIM)
    s.fillRect(24, 540, (W - 48) * Math.min(1, this.pos / song.dur), 3, C.WHITE)
    s.text(24, 560, fmtTime(this.pos), { size: 20, font: F_REG(20), color: C.GRAY })
    s.textRight(W - 24, 560, fmtTime(song.dur), { size: 20, font: F_REG(20), color: C.GRAY })
    // 控制：上一首 / 播放暂停 / 下一首
    s.text(70, 690, '⏮', { size: 44, font: F_SEMI(44), color: C.WHITE })
    s.text(W - 140, 690, '⏭', { size: 44, font: F_SEMI(44), color: C.WHITE })
    s.textCenter(W / 2, 690, this.playing ? '⏸' : '▶', { size: 52, font: F_SEMI(52), color: C.WHITE })
    void str
  }
}

function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${two(Math.floor(sec) % 60)}`
}

function two(n: number): string {
  return String(n).padStart(2, '0')
}

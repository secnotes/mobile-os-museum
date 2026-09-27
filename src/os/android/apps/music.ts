import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Screen } from '../../../hal/screen'
import { melodyDuration } from '../../../hal/audio'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth } from '../ui'

/** 曲目（2008 年随 G1 预装的演示曲风；Amazon MP3 购买的曲目追加在其后） */
export interface ATrack {
  title: string
  artist: string
  album: string
  melody?: ReadonlyArray<readonly [number, number]>
}

interface APlaylist {
  name: string
  /** 全局曲目序号 */
  tracks: number[]
}

const BPM = 160

/* Trackball Blues：小调蓝调，19 拍 ≈ 7.1s */
const M1: ReadonlyArray<readonly [number, number]> = [
  [69, 0.5], [72, 0.5], [76, 0.5], [72, 0.5], [69, 0.5], [67, 0.5], [64, 1],
  [65, 0.5], [69, 0.5], [72, 1], [74, 0.5], [72, 0.5],
  [74, 1], [77, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [69, 1],
  [67, 0.5], [69, 0.5], [72, 0.5], [67, 0.5], [64, 2],
  [69, 0.5], [72, 0.5], [76, 0.5], [72, 0.5], [69, 0.5], [67, 0.5], [64, 1],
]

/* Green Robot Boogie：大调布吉，20 拍 ≈ 7.5s */
const M2: ReadonlyArray<readonly [number, number]> = [
  [72, 0.5], [76, 0.5], [79, 0.5], [76, 0.5], [72, 0.5], [74, 0.5], [76, 1],
  [77, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [74, 0.5], [76, 0.5], [79, 1],
  [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5], [72, 1], [76, 1],
  [72, 0.5], [74, 0.5], [76, 0.5], [79, 0.5], [84, 2],
  [72, 0.5], [76, 0.5], [79, 0.5], [76, 0.5], [72, 0.5], [74, 0.5], [76, 1],
]

/* HVGA Dreams：缓拍梦幻，26 拍 ≈ 9.8s */
const M3: ReadonlyArray<readonly [number, number]> = [
  [76, 1], [81, 1], [83, 2], [81, 1], [76, 1],
  [74, 1], [78, 1], [81, 2], [78, 1], [74, 1],
  [72, 1], [76, 1], [79, 2], [76, 1], [72, 1],
  [74, 2], [71, 2], [72, 4],
]

const TRACKS: ATrack[] = [
  { title: 'Trackball Blues', artist: 'The Chin', album: 'Chrome Keys', melody: M1 },
  { title: 'Green Robot Boogie', artist: 'D. Vogel', album: 'Open Source Nights', melody: M2 },
  { title: 'HVGA Dreams', artist: 'Little Ampere', album: 'Pocket Skies', melody: M3 },
]

/** 无自带旋律曲目的回落旋律 */
const FALLBACK = M1

type ListKind = 'artists' | 'albums' | 'songs' | 'recent' | 'playlists' | 'playlist'
interface ListCtx {
  kind: ListKind
  title: string
  indices?: number[]
}

/**
 * Android 1.0 音乐：2×2 媒体库入口（艺术家/专辑/歌曲/播放列表），
 * 多级列表 → Now playing（大封面、进度寻址、上下首、随机、重复），
 * 播放进度与合成旋律实际时长对齐；播放列表持久化，Amazon MP3 曲目并入。
 */
export const musicApp: MiniApp = {
  id: 'music',
  name: '音乐',
  nameEn: 'Music',
  icon(s, x, y) {
    iconTile(s, x, y, C.AMBER, C.LAMBER)
    // 白色音符
    s.fillRect(x + 15, y + 6, 2, 14, C.WHITE)
    s.fillRect(x + 15, y + 6, 7, 2, C.WHITE)
    s.fillRect(x + 10, y + 18, 6, 4, C.WHITE)
    s.fillRect(x + 19, y + 16, 6, 4, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new MusicUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const BAND_H = 30
const ROW_H = 50
const GROUP_H = 46
const MINI_H = 42

class MusicUI {
  private view: 'root' | 'list' | 'now' = 'root'
  private listStack: ListCtx[] = []
  private sel = 0
  private tileSel = 0

  // 播放引擎
  private queue: number[] = []
  private qi = 0
  private playing = false
  private pos = 0
  private dur = 1
  private audioStop: (() => void) | null = null
  private shuffleOn = false
  private repeatMode = 0 // 0 关 / 1 全部 / 2 单曲

  // 曲库与播放列表
  private tracks: ATrack[] = TRACKS
  private playlists: APlaylist[] = []

  // 弹层
  private sheet: null | 'menu' | 'target' | 'name' = null
  private sheetSel = 0
  private nameInput = ''
  private toastText = ''
  private toastUntil = 0

  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
    // 离开应用不打断播放：真机音乐会继续；已排程的旋律自然播完
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    // Amazon MP3 购买的曲目并入曲库（跨应用只读）
    const bought = (await this.ctx.host.getPurchasedTracks?.()) as ATrack[] | undefined
    if (bought?.length) {
      this.tracks = [
        ...TRACKS,
        ...bought.map((b) => ({ ...b, album: b.album || 'Amazon MP3' })),
      ]
    }
    this.playlists = (await this.ctx.store.get<APlaylist[]>('playlists')) ?? []
    this.offs.push(this.ctx.onFrame((dt) => {
      if (!this.playing) return
      this.pos += dt
      if (this.pos >= this.dur) this.onEnd()
      this.draw()
    }))
    this.draw()
  }

  // ---------- 按键 ----------

  private onKey(k: DeviceKey) {
    if (this.sheet) {
      this.sheetKey(k)
      return
    }
    if (k === 'menu') {
      if (this.menuItems().length) {
        this.sheet = 'menu'
        this.sheetSel = 0
        this.draw()
      }
      return
    }
    if (this.view === 'root') this.rootKey(k)
    else if (this.view === 'list') this.listKey(k)
    else this.nowKey(k)
  }

  private rootKey(k: DeviceKey) {
    switch (k) {
      case 'up':
        this.tileSel = (this.tileSel + 2) % 4
        break
      case 'down':
        this.tileSel = (this.tileSel + 2) % 4
        break
      case 'left':
        this.tileSel = (this.tileSel + 3) % 4
        break
      case 'right':
        this.tileSel = (this.tileSel + 1) % 4
        break
      case 'ok':
        this.openTile(this.tileSel)
        return
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private listKey(k: DeviceKey) {
    const ctx = this.curList()
    const n = this.rowCount(ctx)
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'ok':
        this.activateListRow(ctx, this.sel)
        return
      case 'back':
        this.listStack.pop()
        this.sel = 0
        if (!this.listStack.length) this.view = 'root'
        break
      default:
        return
    }
    this.draw()
  }

  private nowKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
        this.togglePlay()
        return
      case 'up':
        this.seekBy(-5)
        return
      case 'down':
        this.seekBy(5)
        return
      case 'left':
        this.prevTrack()
        return
      case 'right':
        this.nextTrack(false)
        return
      case 'back':
        this.view = this.listStack.length ? 'list' : 'root'
        break
      default:
        return
    }
    this.draw()
  }

  private sheetKey(k: DeviceKey) {
    const n = this.sheetRows()
    if (this.sheet === 'name') {
      if (k === 'clear') this.nameInput = this.nameInput.slice(0, -1)
      else if (k === 'ok') this.confirmNewPlaylist()
      else if (k === 'back') this.sheet = null
      else {
        const ch = letterOf(k)
        if (ch && this.nameInput.length < 20) this.nameInput += ch
        else return
      }
      this.draw()
      return
    }
    switch (k) {
      case 'up':
        this.sheetSel = (this.sheetSel + n - 1) % n
        break
      case 'down':
        this.sheetSel = (this.sheetSel + 1) % n
        break
      case 'ok':
        this.runSheetRow(this.sheetSel)
        return
      case 'back':
        this.sheet = null
        break
      default:
        return
    }
    this.draw()
  }

  // ---------- 触屏 ----------

  private onTap(x: number, y: number) {
    if (this.sheet) {
      // 弹层点击：首行从 y=160 起（行高 40）
      if (y >= 160 && y < 160 + this.sheetRows() * 40) {
        const r = Math.floor((y - 160) / 40)
        this.runSheetRow(r)
      } else {
        this.sheet = null
        this.draw()
      }
      return
    }
    if (this.view === 'root') {
      // 迷你播放条
      if (this.queue.length && y >= H - MINI_H - 12 && y <= H - 12) {
        this.view = 'now'
        this.draw()
        return
      }
      // 2×2 磁贴
      const t = this.tileAt(x, y)
      if (t >= 0) this.openTile(t)
      return
    }
    if (this.view === 'list') {
      const ctx = this.curList()
      const y0 = STATUS_H + BAND_H
      const h = ctx.kind === 'artists' || ctx.kind === 'albums' || ctx.kind === 'playlists' ? GROUP_H : ROW_H
      if (y >= y0 && y < y0 + this.rowCount(ctx) * h) {
        this.sel = Math.floor((y - y0) / h)
        this.activateListRow(ctx, this.sel)
      }
      return
    }
    // now
    if (y >= 304 && y <= 356) {
      if (x >= 38 && x <= 90) this.prevTrack()
      else if (x >= 134 && x <= 186) this.togglePlay()
      else if (x >= 230 && x <= 282) this.nextTrack(false)
      return
    }
    // 随机 / 重复
    if (y >= 238 && y <= 262) {
      if (Math.abs(x - 40) <= 16) { this.shuffleOn = !this.shuffleOn; this.draw() }
      else if (Math.abs(x - 280) <= 16) {
        this.repeatMode = (this.repeatMode + 1) % 3
        this.draw()
      }
      return
    }
    // 进度条寻址
    if (y >= 260 && y <= 278) {
      const t = ((x - 20) / (W - 40)) * this.dur
      this.seekTo(Math.max(0, Math.min(this.dur, t)))
    }
  }

  private tileAt(x: number, y: number): number {
    const tiles = [
      [16, 96], [164, 96], [16, 246], [164, 246],
    ]
    for (let i = 0; i < 4; i++) {
      const [tx, ty] = tiles[i]!
      if (x >= tx && x < tx + 140 && y >= ty && y < ty + 120) return i
    }
    return -1
  }

  // ---------- 导航 ----------

  private openTile(t: number) {
    switch (t) {
      case 0:
        this.pushList({ kind: 'artists', title: androidStrings(this.ctx.lang.get()).muArtists })
        break
      case 1:
        this.pushList({ kind: 'albums', title: androidStrings(this.ctx.lang.get()).muAlbums })
        break
      case 2:
        this.pushList({ kind: 'songs', title: androidStrings(this.ctx.lang.get()).muAllSongs, indices: this.allIndices() })
        break
      case 3:
        this.pushList({ kind: 'playlists', title: androidStrings(this.ctx.lang.get()).muPlaylists })
        break
    }
  }

  private pushList(ctx: ListCtx) {
    this.listStack.push(ctx)
    this.sel = 0
    this.view = 'list'
    this.draw()
  }

  private activateListRow(ctx: ListCtx, row: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (ctx.kind === 'artists') {
      const name = this.groups('artist')[row]!
      this.pushList({ kind: 'songs', title: name, indices: this.indicesBy('artist', name) })
    } else if (ctx.kind === 'albums') {
      const name = this.groups('album')[row]!
      this.pushList({ kind: 'songs', title: name, indices: this.indicesBy('album', name) })
    } else if (ctx.kind === 'playlists') {
      if (row === 0) {
        this.pushList({ kind: 'recent', title: str.muRecentlyAdded, indices: this.allIndices() })
      } else {
        const pl = this.playlists[row - 1]!
        this.pushList({ kind: 'playlist', title: pl.name, indices: pl.tracks })
      }
    } else {
      const idx = ctx.indices![row]!
      this.playIndex(idx, ctx.indices!)
    }
  }

  // ---------- 播放引擎 ----------

  private playIndex(globalIdx: number, list: number[]) {
    this.queue = list.slice()
    this.qi = Math.max(0, this.queue.indexOf(globalIdx))
    this.pos = 0
    this.playing = true
    this.launchAudio()
    this.view = 'now'
    this.draw()
  }

  private launchAudio() {
    this.audioStop?.()
    const tr = this.curTrack()
    const m = tr.melody ?? FALLBACK
    this.dur = melodyDuration(m, BPM)
    this.ctx.audio.unlock()
    this.audioStop = this.ctx.audio.playMelody(m, BPM, { volume: 0.55, offset: this.pos })
  }

  private togglePlay() {
    if (this.playing) {
      this.audioStop?.()
      this.audioStop = null
      this.playing = false
    } else {
      this.playing = true
      this.launchAudio()
    }
    this.draw()
  }

  private nextTrack(auto: boolean) {
    if (this.shuffleOn && this.queue.length > 1) {
      let r = this.qi
      while (r === this.qi) r = Math.floor(Math.random() * this.queue.length)
      this.qi = r
      this.pos = 0
      this.launchAudio()
      this.draw()
      return
    }
    if (this.qi < this.queue.length - 1) {
      this.qi++
      this.pos = 0
      this.launchAudio()
      this.draw()
    } else if (this.repeatMode >= 1 || !auto) {
      this.qi = 0
      this.pos = 0
      this.launchAudio()
      this.draw()
    } else {
      // 播完停止
      this.audioStop?.()
      this.audioStop = null
      this.playing = false
      this.pos = 0
      this.draw()
    }
  }

  private prevTrack() {
    if (this.pos > 3) {
      this.seekTo(0)
      return
    }
    this.qi = this.qi > 0 ? this.qi - 1 : this.repeatMode >= 1 ? this.queue.length - 1 : 0
    this.pos = 0
    this.launchAudio()
    this.draw()
  }

  private onEnd() {
    if (this.repeatMode === 2) {
      this.pos = 0
      this.launchAudio()
    } else {
      this.nextTrack(true)
    }
  }

  private seekTo(t: number) {
    this.pos = t
    if (this.playing) this.launchAudio()
    this.draw()
  }

  private seekBy(d: number) {
    this.seekTo(Math.max(0, Math.min(this.dur, this.pos + d)))
  }

  private curTrack(): ATrack {
    return this.tracks[this.queue[this.qi] ?? 0]!
  }

  // ---------- 菜单 / 播放列表 ----------

  private menuItems(): string[] {
    const str = androidStrings(this.ctx.lang.get())
    if (this.view === 'list') {
      const k = this.curList().kind
      return k === 'songs' || k === 'recent' || k === 'playlist' ? [str.muAddToPlaylist] : []
    }
    if (this.view === 'now') {
      return [str.muAddToPlaylist, str.muPartyShuffle, str.muLibrary]
    }
    return []
  }

  private sheetRows(): number {
    if (this.sheet === 'menu') return this.menuItems().length
    if (this.sheet === 'target') return this.playlists.length + 1
    return 1
  }

  private runSheetRow(row: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.sheet === 'menu') {
      const item = this.menuItems()[row]
      if (item === str.muAddToPlaylist) {
        this.sheet = 'target'
        this.sheetSel = 0
        this.draw()
      } else if (item === str.muPartyShuffle) {
        const all = this.allIndices()
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[all[i], all[j]] = [all[j]!, all[i]!]
        }
        this.shuffleOn = true
        this.playIndex(all[0]!, all)
      } else if (item === str.muLibrary) {
        this.sheet = null
        this.listStack = []
        this.view = 'root'
        this.draw()
      }
      return
    }
    if (this.sheet === 'target') {
      const g = this.targetTrackGlobal()
      if (row === this.playlists.length) {
        this.sheet = 'name'
        this.nameInput = ''
        this.sheetSel = 0
      } else {
        this.addToPlaylist(row, g)
        this.sheet = null
      }
      this.draw()
      return
    }
    if (this.sheet === 'name') this.confirmNewPlaylist()
  }

  private targetTrackGlobal(): number {
    if (this.view === 'now') return this.queue[this.qi] ?? 0
    const ctx = this.curList()
    return ctx.indices?.[this.sel] ?? 0
  }

  private addToPlaylist(plIdx: number, globalTrack: number) {
    const pl = this.playlists[plIdx]!
    if (!pl.tracks.includes(globalTrack)) {
      pl.tracks.push(globalTrack)
      void this.storePlaylists()
    }
    this.showToast(androidStrings(this.ctx.lang.get()).muAdded)
  }

  private confirmNewPlaylist() {
    const name = this.nameInput.trim()
    if (!name) return
    const g = this.targetTrackGlobal()
    this.playlists.push({ name, tracks: [g] })
    void this.storePlaylists()
    this.sheet = null
    this.showToast(androidStrings(this.ctx.lang.get()).muAdded)
    this.draw()
  }

  private storePlaylists() {
    return this.ctx.store.set('playlists', this.playlists)
  }

  private showToast(t: string) {
    this.toastText = t
    this.toastUntil = Date.now() + 2200
  }

  // ---------- 曲库派生 ----------

  private allIndices(): number[] {
    return this.tracks.map((_, i) => i)
  }

  private groups(field: 'artist' | 'album'): string[] {
    const seen = new Set<string>()
    for (const t of this.tracks) seen.add(t[field])
    return [...seen].sort((a, b) => a.localeCompare(b))
  }

  private indicesBy(field: 'artist' | 'album', value: string): number[] {
    return this.tracks
      .map((t, i) => ({ t, i }))
      .filter((e) => e.t[field] === value)
      .sort((a, b) => a.t.title.localeCompare(b.t.title))
      .map((e) => e.i)
  }

  private rowCount(ctx: ListCtx): number {
    if (ctx.kind === 'artists') return this.groups('artist').length
    if (ctx.kind === 'albums') return this.groups('album').length
    if (ctx.kind === 'playlists') return this.playlists.length + 1
    return ctx.indices?.length ?? 0
  }

  private curList(): ListCtx {
    return this.listStack[this.listStack.length - 1]!
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
    // 深色播放器底色
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.INK)
    if (this.view === 'root') this.drawRoot(str)
    else if (this.view === 'list') this.drawList(str)
    else this.drawNow(str)
    if (this.sheet) this.drawSheet(str)
    if (Date.now() < this.toastUntil) {
      roundRect(s, 24, H - 100, W - 48, 32, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 90, this.toastText, { size: 11, color: C.WHITE })
    }
    s.render()
  }

  private drawRoot(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.textCenter(W >> 1, 58, str.musicTitle, { size: 13, color: C.GRAY })
    const defs: Array<{ label: string; kind: 'artist' | 'album' | 'note' | 'list' }> = [
      { label: str.muArtists, kind: 'artist' },
      { label: str.muAlbums, kind: 'album' },
      { label: str.muSongs, kind: 'note' },
      { label: str.muPlaylists, kind: 'list' },
    ]
    const pos = [
      [16, 96], [164, 96], [16, 246], [164, 246],
    ]
    defs.forEach((d, i) => {
      const [x, y] = pos[i]!
      roundRect(s, x, y, 140, 120, 10, i === this.tileSel ? C.BAR : C.PANEL, null)
      if (i === this.tileSel) s.frameRect(x + 2, y + 2, 136, 116)
      this.rootIcon(s, x + 70, y + 44, d.kind)
      s.textCenter(x + 70, y + 92, d.label, { size: 13, color: C.WHITE })
    })
    // 迷你播放条
    if (this.queue.length) {
      const y = H - MINI_H - 12
      roundRect(s, 12, y, W - 24, MINI_H, 8, C.BAR, null)
      s.fillRect(24, y + 13, 4, 16, this.playing ? C.AMBER : C.GRAY)
      s.fillRect(24, y + 13, 8, 4, this.playing ? C.AMBER : C.GRAY)
      s.text(42, y + 10, clipToWidth(s, this.curTrack().title, W - 110, 12), { size: 12, color: C.WHITE })
      s.text(42, y + 26, clipToWidth(s, this.curTrack().artist, W - 110, 9), { size: 9, color: C.GRAY })
      s.textRight(W - 24, y + 14, this.playing ? '❚❚' : '►', { size: 13, color: C.WHITE })
    }
  }

  private rootIcon(s: Screen, cx: number, cy: number, kind: string) {
    if (kind === 'note') {
      s.fillRect(cx - 1, cy - 12, 2, 20, C.AMBER)
      s.fillRect(cx - 1, cy - 12, 8, 2, C.AMBER)
      s.fillRect(cx - 7, cy + 5, 7, 5, C.AMBER)
    } else if (kind === 'album') {
      roundRect(s, cx - 13, cy - 11, 26, 22, 4, C.BLUE, null)
      s.pset(cx, cy, C.WHITE)
      s.pset(cx - 2, cy, C.LBLUE); s.pset(cx + 2, cy, C.LBLUE); s.pset(cx, cy - 2, C.LBLUE); s.pset(cx, cy + 2, C.LBLUE)
    } else if (kind === 'artist') {
      // 简化耳机：弧形 + 两耳塞
      roundRect(s, cx - 12, cy - 12, 24, 14, 7, C.LBLUE, null)
      s.fillRect(cx - 12, cy, 5, 12, C.LBLUE)
      s.fillRect(cx + 7, cy, 5, 12, C.LBLUE)
    } else {
      for (let i = 0; i < 3; i++) {
        s.fillRect(cx - 11, cy - 10 + i * 8, 22, 5, i === 1 ? C.GREEN : C.GRAY)
      }
    }
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const ctx = this.curList()
    // 标题带
    s.fillRect(0, STATUS_H, W, BAND_H, C.BAR)
    s.text(12, STATUS_H + 8, clipToWidth(s, ctx.title, W - 24, 14), { size: 14, color: C.WHITE })
    const grouped = ctx.kind === 'artists' || ctx.kind === 'albums' || ctx.kind === 'playlists'
    const h = grouped ? GROUP_H : ROW_H
    const y0 = STATUS_H + BAND_H
    for (let i = 0; i < this.rowCount(ctx); i++) {
      const y = y0 + i * h
      if (i === this.sel) {
        s.fillRect(0, y, W, h, C.ORANGE)
        s.fillRect(0, y, 3, h, C.AMBER)
      }
      if (ctx.kind === 'artists' || ctx.kind === 'albums') {
        const field = ctx.kind === 'artists' ? 'artist' : 'album'
        const name = this.groups(field)[i]!
        const count = this.tracks.filter((t) => t[field] === name).length
        s.text(14, y + 8, clipToWidth(s, name, W - 80, 13), { size: 13, color: i === this.sel ? C.INK : C.WHITE })
        s.textRight(W - 14, y + 10, `${count}`, { size: 11, color: i === this.sel ? C.INK : C.GRAY })
      } else if (ctx.kind === 'playlists') {
        if (i === 0) {
          s.text(14, y + 8, str.muRecentlyAdded, { size: 13, color: i === this.sel ? C.INK : C.WHITE })
          s.textRight(W - 14, y + 10, `${this.tracks.length}`, { size: 11, color: i === this.sel ? C.INK : C.GRAY })
        } else {
          const pl = this.playlists[i - 1]!
          s.text(14, y + 8, clipToWidth(s, pl.name, W - 80, 13), { size: 13, color: i === this.sel ? C.INK : C.WHITE })
          s.textRight(W - 14, y + 10, `${pl.tracks.length}`, { size: 11, color: i === this.sel ? C.INK : C.GRAY })
        }
      } else {
        const tr = this.tracks[ctx.indices![i]!]!
        s.text(14, y + 8, clipToWidth(s, tr.title, W - 30, 13), { size: 13, color: i === this.sel ? C.INK : C.WHITE })
        s.text(14, y + 28, clipToWidth(s, `${tr.artist} · ${tr.album}`, W - 30, 9), { size: 9, color: i === this.sel ? C.INK : C.GRAY })
      }
    }
  }

  private drawNow(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const tr = this.curTrack()
    // 大封面
    const art = 140
    const ax = (W - art) >> 1
    const ay = STATUS_H + 12
    this.drawArt(s, ax, ay, art, tr)
    s.textCenter(W >> 1, ay + art + 14, clipToWidth(s, tr.title, W - 20, 15), { size: 15, color: C.WHITE })
    s.textCenter(W >> 1, ay + art + 34, clipToWidth(s, tr.artist, W - 20, 11), { size: 11, color: C.GRAY })
    s.textCenter(W >> 1, ay + art + 52, clipToWidth(s, tr.album, W - 20, 9), { size: 9, color: C.GRAY })
    // 随机 / 重复
    this.drawShuffleIcon(28, 240, this.shuffleOn)
    this.drawRepeatIcon(268, 240, this.repeatMode, str)
    // 进度条
    const p = this.dur > 0 ? this.pos / this.dur : 0
    s.fillRect(20, 264, W - 40, 5, C.PANEL)
    s.fillRect(20, 264, Math.round((W - 40) * p), 5, C.AMBER)
    s.fillRect(18 + Math.round((W - 40) * p), 260, 3, 13, C.WHITE)
    s.text(20, 278, fmtTime(this.pos), { size: 9, color: C.GRAY })
    s.textRight(W - 20, 278, fmtTime(this.dur), { size: 9, color: C.GRAY })
    // 控制行
    // 上一首
    s.fillRect(46, 322, 3, 16, C.WHITE)
    for (let i = 0; i < 8; i++) s.pset(58 + i, 330 - i, C.WHITE), s.pset(58 + i, 330 + i, C.WHITE)
    // 下一首
    s.fillRect(271, 322, 3, 16, C.WHITE)
    for (let i = 0; i < 8; i++) s.pset(259 - i, 330 - i, C.WHITE), s.pset(259 - i, 330 + i, C.WHITE)
    // 播放/暂停
    roundRect(s, 134, 304, 52, 52, 26, C.AMBER, null)
    if (this.playing) {
      s.fillRect(153, 320, 5, 20, C.INK)
      s.fillRect(163, 320, 5, 20, C.INK)
    } else {
      for (let i = 0; i < 10; i++) s.pset(157 + i, 330 - i, C.INK), s.pset(157 + i, 330 + i, C.INK)
    }
  }

  /** 封面：按专辑名取色 + 顶部亮带 + 白音符 */
  private drawArt(s: Screen, x: number, y: number, size: number, tr: ATrack) {
    let h = 0
    for (const ch of tr.album) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const colors = [C.NAVY, C.BLUE, C.DGREEN, C.MAGENTA, C.AMBER, C.LBLUE]
    const base = colors[h % colors.length]!
    roundRect(s, x, y, size, size, 10, base, null)
    s.fillRect(x, y, size, 12, C.LAMBER)
    // 大音符
    s.fillRect(x + size / 2 - 1, y + 36, 3, 52, C.WHITE)
    s.fillRect(x + size / 2 - 1, y + 36, 16, 3, C.WHITE)
    s.fillRect(x + size / 2 - 13, y + 80, 14, 10, C.WHITE)
  }

  private drawShuffleIcon(x: number, y: number, on: boolean) {
    const s = this.ctx.screen
    const c = on ? C.AMBER : C.GRAY
    // 交叉双箭头
    s.line(x, y + 12, x + 12, y + 12, c)
    s.line(x + 4, y, x + 16, y, c)
    s.line(x, y + 12, x + 8, y, c)
    s.line(x + 8, y + 12, x + 16, y, c)
    s.pset(x + 13, y + 11, c); s.pset(x + 14, y + 12, c); s.pset(x + 13, y + 13, c)
    s.pset(x + 17, y - 1, c); s.pset(x + 18, y, c); s.pset(x + 17, y + 1, c)
  }

  private drawRepeatIcon(x: number, y: number, mode: number, str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    if (mode === 0) return
    const c = mode === 2 ? C.AMBER : C.WHITE
    // 3/4 圆环（折线近似）
    const cxp = x + 8
    const cyp = y + 8
    const r = 7
    for (let a = -0.6; a < Math.PI * 1.55; a += 0.25) {
      const x0 = Math.round(cxp + r * Math.cos(a))
      const y0 = Math.round(cyp + r * Math.sin(a))
      s.pset(x0, y0, c)
    }
    // 箭头
    s.pset(cxp + r - 1, cyp - 3, c); s.pset(cxp + r, cyp - 2, c); s.pset(cxp + r - 2, cyp - 1, c)
    if (mode === 2) s.text(cxp - 3, cyp - 4, '1', { size: 8, color: C.AMBER })
    void str
  }

  private drawSheet(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    s.fillRect(0, 0, W, H, C.BAR) // 半透明遮罩用 BAR 近似
    const rows = this.sheetRows()
    const cardH = Math.max(90, 44 + rows * 40 + 20)
    const y0 = 120
    roundRect(s, 20, y0, W - 40, cardH, 10, C.PANEL, null)
    let title = ''
    if (this.sheet === 'menu') title = str.musicTitle
    else if (this.sheet === 'target') title = str.muAddToPlaylist
    else title = str.muNewPlaylist
    s.text(36, y0 + 14, title, { size: 14, color: C.WHITE })
    if (this.sheet === 'name') {
      roundRect(s, 36, y0 + 40, W - 72, 38, 6, C.INK, null)
      s.text(44, y0 + 50, this.nameInput || str.muPlaylistName, {
        size: 12,
        color: this.nameInput ? C.WHITE : C.GRAY,
      })
      if (this.nameInput) s.fillRect(44 + s.measure(this.nameInput, { size: 12 }), y0 + 46, 2, 18, C.AMBER)
      return
    }
    for (let i = 0; i < rows; i++) {
      const y = y0 + 40 + i * 40
      if (i === this.sheetSel) {
        s.fillRect(24, y, W - 48, 36, C.ORANGE)
        s.fillRect(24, y, 3, 36, C.AMBER)
      }
      let label: string
      if (this.sheet === 'menu') label = this.menuItems()[i]!
      else if (i === this.playlists.length) label = str.muNewPlaylist
      else label = this.playlists[i]!.name
      s.text(36, y + 10, label, { size: 12, color: i === this.sheetSel ? C.INK : C.WHITE })
    }
  }
}

/** 秒 → m:ss */
function fmtTime(t: number): string {
  const tt = Math.max(0, Math.floor(t))
  return `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`
}

/** DeviceKey → 可打印字符（全键盘） */
function letterOf(k: DeviceKey): string {
  if (k.length === 1 && /[a-z0-9 .,\-]/.test(k)) return k === '.' || k === ',' ? k : k
  return ''
}

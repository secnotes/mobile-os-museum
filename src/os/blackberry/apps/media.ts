import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, rrStroke, disc } from '../graphics'
import { RINGTONES } from '../ringtones'
import { BBApp, type MenuCommand, type BBPhoto } from './common'
import { drawPhotoImage } from './photoimage'

/**
 * Media：音乐 / 图片 / 视频 / 语音备忘。
 */

type Mode = 'folders' | 'music' | 'pictures' | 'videos' | 'voices' | 'videoPlay'

interface VoiceNote {
  id: number
  dur: number
}

export class MediaApp extends BBApp {
  private mode: Mode = 'folders'
  private sel = 0
  private trackSel = 0
  private playing = false
  private playStop: (() => void) | null = null
  private photos: BBPhoto[] = []
  private voices: VoiceNote[] = []
  private tSec = 0
  private recordingAt = -1
  private videoAt = 0

  protected async onStart() {
    this.photos = await this.host.getPhotos2()
    this.voices = (await this.ctx.store.get<VoiceNote[]>('voices')) ?? []
    this.ctx.onFrame((dt) => { this.tSec += dt; this.tick() })
    this.onCleanup(() => this.stopMusic())
  }

  private tick() {
    if (this.mode === 'videoPlay') {
      if (this.tSec - this.videoAt > 4) this.mode = 'videos'
      this.draw()
    } else if (this.recordingAt >= 0) {
      this.draw()
    }
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    switch (this.mode) {
      case 'folders': this.drawFolders(); break
      case 'music': this.drawMusic(); break
      case 'pictures': this.drawPictures(); break
      case 'videos': this.drawVideos(); break
      case 'voices': this.drawVoices(); break
      case 'videoPlay': this.drawVideoPlay(); break
    }
    s.render()
  }

  private header(title: string) {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, title, { size: 18, color: C.WHITE })
  }

  private drawFolders() {
    const items: Array<[string, string]> = [
      ['music', this.str.music],
      ['pictures', this.str.pictures],
      ['videos', this.str.videos],
      ['voices', this.str.voiceNotes],
    ]
    items.forEach(([id, label], i) => {
      const x = 30 + (i % 2) * 230, y = 56 + Math.floor(i / 2) * 120
      if (i === this.sel) rrStroke(this.ctx.screen, x - 6, y - 6, 196, 106, 10, C.SELECT)
      drawSmall(this.ctx.screen, id, x, y)
      this.ctx.screen.text(x, y + 70, label, { size: 18, color: C.INK })
    })
  }

  private drawMusic() {
    this.header(this.str.nowPlaying)
    const s = this.ctx.screen
    // 唱片
    disc(s, 110, 170, 70, C.G8)
    disc(s, 110, 170, 22, C.GOLD)
    const track = RINGTONES[this.trackSel]!
    s.text(220, 100, track[this.ctx.lang.get() === 'en' ? 'en' : 'zh'], {
      size: 22, color: C.INK, maxWidth: 240,
    })
    s.text(220, 134, 'BlackBerry Bold', { size: 14, color: C.G6 })
    // 播放状态
    s.text(220, 190, this.playing ? '▶▶' : 'Ⅱ', { size: 26, color: C.SELECT })
    // 进度假条
    rr(s, 220, 240, 220, 6, 3, C.G3)
    if (this.playing) rr(s, 220, 240, Math.round(220 * ((this.tSec / 12) % 1)), 6, 3, C.SELECT)
    // 曲目列表（底部薄）
    s.text(220, 266, `${this.trackSel + 1}/${RINGTONES.length}`, { size: 13, color: C.G5 })
  }

  private drawPictures() {
    this.header(this.str.photos(this.photos.length))
    const s = this.ctx.screen
    if (!this.photos.length) {
      s.textCenter(240, 160, this.str.empty, { size: 16, color: C.G5 })
      return
    }
    this.photos.forEach((p, i) => {
      const x = 24 + (i % 4) * 112, y = 48 + Math.floor(i / 4) * 100
      if (i === this.sel) rrStroke(s, x - 4, y - 4, 104, 92, 6, C.SELECT)
      rr(s, x, y, 96, 84, 4, C.FIELD_BG)
      drawPhotoImage(s, p.seed, x + 2, y + 2, 92, 80)
    })
  }

  private drawVideos() {
    this.header(this.str.videos)
    const s = this.ctx.screen
    const names = this.ctx.lang.get() === 'en'
      ? ['Welcome to BlackBerry', 'Bold 9000 tour', 'BBM demo']
      : ['黑莓入门', 'Bold 9000 导览', 'BBM 演示']
    names.forEach((n, i) => {
      const y = 44 + i * 52
      if (i === this.sel) rr(s, 4, y, 472, 46, 6, C.FIELD_BG)
      // 胶片图标
      s.fillRect(16, y + 8, 30, 30, C.G8)
      s.fillRect(20, y + 12, 22, 22, C.G6)
      s.text(60, y + 14, n, { size: 17, color: C.INK })
    })
  }

  private drawVideoPlay() {
    const s = this.ctx.screen
    const p = Math.min(1, (this.tSec - this.videoAt) / 4)
    s.fillRect(0, 0, 480, 320, C.G8)
    // 伪视频内容：移动亮块
    disc(s, 100 + Math.round(280 * p), 150, 30, C.WP3)
    s.fillRect(60, 200, Math.round(360 * p), 8, C.G5)
    rr(s, 20, 286, 440, 10, 5, C.G7)
    rr(s, 20, 286, Math.round(440 * p), 10, 5, C.SELECT)
  }

  private drawVoices() {
    this.header(this.str.voiceNotes)
    const s = this.ctx.screen
    this.voices.forEach((v, i) => {
      const y = 44 + i * 34
      if (i === this.sel) rr(s, 4, y, 472, 30, 4, C.FIELD_BG)
      s.text(16, y + 8, `♪ ${v.dur}s`, { size: 15, color: C.INK })
    })
    // 录制区
    const y = 262
    if (this.recordingAt >= 0) {
      const dur = Math.round(this.tSec - this.recordingAt)
      disc(s, 40, y + 16, 10, C.RED)
      s.text(62, y + 8, '● REC ' + dur + 's', { size: 18, color: C.RED })
      // 波形
      for (let x = 0; x < 300; x++) {
        const h = 4 + Math.abs(Math.round(12 * Math.sin((x + dur * 20) * 0.7)))
        s.fillRect(170 + x, y + 16 - h / 2, 1, h, C.SELECT)
      }
    } else {
      rrStroke(s, 16, y, 448, 34, 8, C.SELECT)
      s.textCenter(240, y + 9, this.ctx.lang.get() === 'en' ? 'OK: record' : '确定键录音',
        { size: 15, color: C.SELECT })
    }
  }

  // ---------- 输入 ----------

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'folders') this.foldersKey(k)
    else if (this.mode === 'music') this.musicKey(k)
    else if (this.mode === 'pictures') this.picturesKey(k)
    else if (this.mode === 'videos') this.videosKey(k)
    else if (this.mode === 'voices') this.voicesKey(k)
  }

  /**
   * 返回键：录音中先停止录音；视频播放/各媒体页→文件夹；文件夹（根）→退出应用。
   */
  protected onBack(): boolean {
    if (this.mode === 'voices' && this.recordingAt >= 0) {
      const dur = Math.max(1, Math.round(this.tSec - this.recordingAt))
      const note: VoiceNote = { id: Date.now(), dur }
      this.voices.push(note)
      void this.ctx.store.set('voices', this.voices)
      this.recordingAt = -1
      this.draw()
      return true
    }
    if (this.mode === 'videoPlay') { this.mode = 'videos'; this.draw(); return true }
    if (this.mode === 'folders') return false
    this.mode = 'folders'
    this.draw()
    return true
  }

  private foldersKey(k: DeviceKey) {
    const n = 4
    if (k === 'up') this.sel = (this.sel + 2) % n
    else if (k === 'down') this.sel = (this.sel + 2) % n
    else if (k === 'left') this.sel = (this.sel + n - 1) % n
    else if (k === 'right') this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      const modes = ['music', 'pictures', 'videos', 'voices'] as const
      this.mode = modes[this.sel]!
      this.sel = 0
    } else return
    this.draw()
  }

  private musicKey(k: DeviceKey) {
    if (k === 'up' || k === 'down') {
      this.trackSel = (this.trackSel + (k === 'down' ? 1 : RINGTONES.length - 1)) % RINGTONES.length
      this.restartMusic()
    } else if (k === 'ok') {
      if (this.playing) this.stopMusic()
      else this.startMusic()
    } else return
    this.draw()
  }

  private picturesKey(k: DeviceKey) {
    const n = this.photos.length
    if (!n) return
    if (k === 'left') this.sel = (this.sel + n - 1) % n
    else if (k === 'right') this.sel = (this.sel + 1) % n
    else if (k === 'up') this.sel = (this.sel + n - 4) % n
    else if (k === 'down') this.sel = (this.sel + 4) % n
    else return
    this.draw()
  }

  private videosKey(k: DeviceKey) {
    const n = 3
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      this.videoAt = this.tSec
      this.mode = 'videoPlay'
    } else return
    this.draw()
  }

  private voicesKey(k: DeviceKey) {
    if (this.recordingAt >= 0) {
      if (k === 'ok') {
        const dur = Math.max(1, Math.round(this.tSec - this.recordingAt))
        const note: VoiceNote = { id: Date.now(), dur }
        this.voices.push(note)
        void this.ctx.store.set('voices', this.voices)
        this.recordingAt = -1
      }
    } else if (k === 'ok') {
      this.recordingAt = this.tSec
    } else return
    this.draw()
  }

  // ---------- 音乐 ----------

  private startMusic() {
    const track = RINGTONES[this.trackSel]!
    this.playStop = this.ctx.audio.playMelody(track.notes, 168, { loop: true, volume: 0.4 })
    this.playing = true
  }

  private stopMusic() {
    if (this.playStop) { this.playStop(); this.playStop = null }
    this.playing = false
  }

  private restartMusic() {
    if (this.playing) { this.stopMusic(); this.startMusic() }
  }

  protected menuItems(): MenuCommand[] {
    if (this.mode !== 'folders') {
      return [{ label: this.str.back, fn: () => { this.mode = 'folders'; this.draw() } }]
    }
    return []
  }
}

function drawSmall(s: import('../../../hal/screen').Screen, id: string, x: number, y: number) {
  const map: Record<string, number> = {
    music: C.PURPLE, pictures: C.MAGENTA, videos: C.G8, voices: C.CYAN,
  }
  rr(s, x, y, 84, 60, 8, map[id]!)
  if (id === 'music') {
    s.fillRect(x + 40, y + 12, 5, 26, C.WHITE)
    s.fillRect(x + 28, y + 12, 18, 5, C.WHITE)
  } else if (id === 'pictures') {
    disc(s, x + 30, y + 24, 10, C.GOLD); disc(s, x + 56, y + 34, 8, C.WHITE)
  } else if (id === 'videos') {
    s.fillRect(x + 30, y + 18, 24, 24, C.G5)
  } else {
    s.fillRect(x + 24, y + 14, 36, 30, C.WHITE)
    s.fillRect(x + 38, y + 22, 8, 14, C.CYAN)
  }
}

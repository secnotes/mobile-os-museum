import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { Screen } from '../../../hal/screen'
import { s60Strings } from '../strings'
import { C, S60_PALETTE } from '../palette'
import { softBar, disc } from '../ui'

/**
 * 相机（横屏）：真机横握时取景器全屏 320×240（旋转绘制到 240×320）。
 * 拍照生成 64×48 横版风景照存进相册；闪光灯 自动/强制/关闭，数码变焦 1–3×。
 */
type View = 'finder' | 'flash' | 'saved' | 'gallery'

const VW = 320
const VH = 240
const PHOTO_W = 64
const PHOTO_H = 48
const MAX_PHOTOS = 8
const ZOOM_LEVELS = [1, 1.5, 2, 3]

export const cameraApp: MiniApp = {
  id: 'camera',
  name: '相机',
  nameEn: 'Camera',
  icon(s, x, y) {
    // 银灰机身 + 蓝镜头
    s.fillRect(x + 2, y + 8, 40, 30, C.GRAY)
    s.fillRect(x + 14, y + 2, 16, 8, C.GRAY)
    disc(s, x + 22, y + 23, 10, C.INK)
    disc(s, x + 22, y + 23, 7, C.SKY)
    disc(s, x + 19, y + 20, 2, C.WHITE)
    s.fillRect(x + 34, y + 12, 5, 4, C.AMBER)
  },
  start(ctx: AppContext) {
    const ui = new CameraUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class CameraUI {
  private view: View = 'finder'
  /** 横屏虚拟画布（320×240），整幅旋转到主屏 */
  private vs: Screen
  private photos: number[][] = []
  private sel = 0
  private t = 0
  private toastT = 0
  private confirmDelete = false
  private zoomIdx = 0
  /** 0 自动 / 1 强制 / 2 关闭 */
  private flashMode = 0
  private dead = false

  constructor(private ctx: AppContext) {
    this.vs = new Screen(document.createElement('canvas'), VW, VH, { palette: S60_PALETTE })
  }

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onLang(() => this.draw())
    this.ctx.onFrame((dt) => {
      if (this.dead) return
      this.t += dt
      if (this.toastT > 0) this.toastT -= dt
      if (this.view === 'finder' || this.view === 'flash' || this.view === 'saved') this.draw()
    })
    this.photos = (await this.ctx.store.get<number[][]>('photos')) ?? []
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.view === 'gallery') return this.galleryKey(k)
    if (this.view === 'flash' || this.view === 'saved') return
    switch (k) {
      case 'ok':
      case 'soft1':
        // 关闭闪光：直接拍；自动/强制：白闪一帧
        if (this.flashMode === 2) this.doCapture()
        else {
          this.view = 'flash'
          this.toastT = 0.1
        }
        break
      case 'up':
        this.zoomIdx = Math.min(ZOOM_LEVELS.length - 1, this.zoomIdx + 1)
        break
      case 'down':
        this.zoomIdx = Math.max(0, this.zoomIdx - 1)
        break
      case '*':
        this.flashMode = (this.flashMode + 1) % 3
        break
      case 'soft2':
        if (this.photos.length) {
          this.view = 'gallery'
          this.sel = this.photos.length - 1
          this.confirmDelete = false
        }
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private galleryKey(k: DeviceKey) {
    switch (k) {
      case 'left':
      case 'up':
        this.sel = Math.max(0, this.sel - 1)
        this.confirmDelete = false
        break
      case 'right':
      case 'down':
        this.sel = Math.min(this.photos.length - 1, this.sel + 1)
        this.confirmDelete = false
        break
      case 'clear':
        if (this.confirmDelete) {
          this.photos.splice(this.sel, 1)
          this.sel = Math.min(this.sel, Math.max(0, this.photos.length - 1))
          void this.ctx.store.set('photos', this.photos)
          this.confirmDelete = false
          if (!this.photos.length) this.view = 'finder'
        } else {
          this.confirmDelete = true
        }
        break
      case 'soft1':
      case 'ok':
      case 'soft2':
      case 'back':
        this.view = 'finder'
        break
      default:
        return
    }
    this.draw()
  }

  // ---------- 拍照 ----------

  private doCapture() {
    this.ctx.audio.shutter()
    const photo = generatePhoto(Date.now())
    this.photos.push(photo)
    if (this.photos.length > MAX_PHOTOS) this.photos.splice(0, this.photos.length - MAX_PHOTOS)
    void this.ctx.store.set('photos', this.photos)
    this.view = 'saved'
    this.toastT = 1
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    switch (this.view) {
      case 'finder':
        this.composeFinder()
        this.blitVs(ZOOM_LEVELS[this.zoomIdx]!)
        break
      case 'flash':
        this.vs.fillRect(0, 0, VW, VH, C.WHITE)
        this.blitVs(1)
        if (this.toastT <= 0) this.doCapture()
        return
      case 'saved':
        this.composeFinder()
        // 居中提示面板
        this.vs.fillRect(40, 96, VW - 80, 48, C.DARK)
        this.vs.textCenter(VW / 2, 108, str.camSaved, { size: 15, color: C.WHITE })
        this.vs.textCenter(VW / 2, 130, `${this.photos.length}/${MAX_PHOTOS}`,
          { size: 11, color: C.PALE })
        this.blitVs(1)
        if (this.toastT <= 0) this.view = 'finder'
        return
      case 'gallery':
        this.composeGallery()
        this.blitVs(1)
        return
    }
    // 取景器软键提示：拍摄/相册
    softBar(s, str.camCapture, this.photos.length ? str.camGallery : str.camExit)
  }

  /** 取景场景合成进 vs（天空/太阳/双层山丘/噪点/辅助线/HUD） */
  private composeFinder() {
    const v = this.vs
    const str = s60Strings(this.ctx.lang.get())
    const hz = Math.floor(VH * 0.55)
    // 天空三段
    for (let y = 0; y < hz; y++) {
      const k = y / hz
      v.fillRect(0, y, VW, 1, k < 0.45 ? C.PALE : k < 0.8 ? C.SKY : C.BLUE)
    }
    disc(v, 248, 52, 20, C.AMBER)
    // 远山（藏青）
    for (let x = 0; x < VW; x++) {
      const my = hz - 12 + Math.round(Math.sin(x / 42) * 10 + Math.sin(x / 17) * 4)
      v.fillRect(x, my, 1, VH - my, C.NAVY)
    }
    // 近坡（绿）
    for (let x = 0; x < VW; x++) {
      const gy = hz + 8 + Math.round(Math.sin(x / 32 + 2) * 9)
      v.fillRect(x, gy, 1, VH - gy, C.GREEN)
    }
    // 传感器噪点（mulberry32：LCG 低位取模会严重坍缩、相邻帧相关）
    const r = rng32(Math.floor(this.t * 60) * 2654435761)
    for (let i = 0; i < 420; i++) {
      v.pset(Math.floor(r() * VW), Math.floor(r() * VH), C.WHITE)
    }
    // 四角括号 + 中心十字
    const b = 12
    const corners: Array<[number, number, number, number]> = [
      [8, 8, 1, 0], [8, 8, 0, 1],
      [VW - 8 - b, 8, 1, 0], [VW - 8, 8, 0, 1],
      [8, VH - 8, 1, 0], [8, VH - 8 - b, 0, 1],
      [VW - 8 - b, VH - 8, 1, 0], [VW - 8, VH - 8 - b, 0, 1],
    ]
    for (const [x, y, hx, vy] of corners) v.fillRect(x, y, hx ? b : 3, vy ? b : 3, C.INK)
    v.fillRect(VW / 2 - 9, VH / 2 - 1, 18, 2, C.GRAY)
    v.fillRect(VW / 2 - 1, VH / 2 - 9, 2, 18, C.GRAY)
    // HUD：左上闪光灯模式（⚡A/⚡/⚡×），右上变焦，左下计数
    const flashLabel = this.flashMode === 0 ? '⚡A' : this.flashMode === 1 ? '⚡' : '⚡×'
    v.text(9, 7, flashLabel, { size: 15, color: C.DARK })
    v.text(8, 6, flashLabel, { size: 15, color: this.flashMode === 2 ? C.WHITE : C.AMBER })
    v.textRight(VW - 10, 7, `x${ZOOM_LEVELS[this.zoomIdx]}`, { size: 13, color: C.DARK })
    v.textRight(VW - 11, 6, `x${ZOOM_LEVELS[this.zoomIdx]}`, { size: 13, color: C.WHITE })
    v.text(10, VH - 20, `${this.photos.length}/${MAX_PHOTOS}  * ${str.camFlash}`,
      { size: 11, color: C.WHITE })
  }

  /** 相册合成进 vs */
  private composeGallery() {
    const v = this.vs
    const str = s60Strings(this.ctx.lang.get())
    v.fillRect(0, 0, VW, VH, C.DARK)
    if (!this.photos.length) {
      v.textCenter(VW / 2, VH / 2, str.camEmpty, { size: 13, color: C.PALE })
      return
    }
    v.text(12, 8, `${str.camGallery} ${this.sel + 1}/${this.photos.length}`,
      { size: 13, color: C.WHITE })
    const photo = this.photos[this.sel]!
    const SC = 4 // 64×48 → 256×192
    const ox = (VW - PHOTO_W * SC) / 2
    const oy = 34
    v.fillRect(ox - 3, oy - 3, PHOTO_W * SC + 6, PHOTO_H * SC + 6, C.INK)
    for (let y = 0; y < PHOTO_H; y++)
      for (let x = 0; x < PHOTO_W; x++)
        v.fillRect(ox + x * SC, oy + y * SC, SC, SC, photo[y * PHOTO_W + x] ?? C.GRAY)
    v.textCenter(VW / 2, VH - 10,
      this.confirmDelete ? `${str.camDelete}?` : `C ${str.camDelete}`,
      { size: 11, color: this.confirmDelete ? C.AMBER : C.PALE })
  }

  /** vs 旋转 90° 采样到主屏（横屏全屏），zf 为变焦倍数（中心裁切） */
  private blitVs(zf: number) {
    const s = this.ctx.screen
    const cropW = VW / zf
    const cropH = VH / zf
    const x0 = (VW - cropW) / 2
    const y0 = (VH - cropH) / 2
    for (let sx = 0; sx < 240; sx++) {
      const vy = y0 + Math.floor((sx / 239) * cropH)
      for (let sy = 0; sy < 320; sy++) {
        const vx = x0 + Math.floor((sy / 319) * cropW)
        s.pset(sx, sy, this.vs.pget(vx, Math.floor(vy)))
      }
    }
  }
}

/** 种子随机（mulberry32） */
function rng32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 生成一张 64×48 横版调色板风景照：天空渐变 + 太阳 + 云 + 双层山丘 */
function generatePhoto(seed: number): number[] {
  const r = rng32(seed)
  const px = new Array<number>(PHOTO_W * PHOTO_H).fill(C.SKY)
  const hz = 20 + Math.floor(r() * 6)
  // 天空
  for (let y = 0; y < hz; y++) {
    const k = y / hz
    const c = k < 0.4 ? C.PALE : k < 0.75 ? C.SKY : C.BLUE
    for (let x = 0; x < PHOTO_W; x++) px[y * PHOTO_W + x] = c
  }
  // 太阳
  const sx = 8 + Math.floor(r() * 44)
  const sy = 4 + Math.floor(r() * 6)
  const sr = 4 + Math.floor(r() * 2)
  for (let dy = -sr; dy <= sr; dy++)
    for (let dx = -sr; dx <= sr; dx++)
      if (dx * dx + dy * dy <= sr * sr) px[(sy + dy) * PHOTO_W + sx + dx] = C.AMBER
  // 云（两团）
  for (let c = 0; c < 2; c++) {
    const cx = Math.floor(r() * (PHOTO_W - 14))
    const cy = 3 + Math.floor(r() * 8)
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 12; dx++) {
        if ((dx < 2 || dx > 9) && dy === 0) continue
        if ((dx < 1 || dx > 10) && dy === 2) continue
        px[(cy + dy) * PHOTO_W + cx + dx] = C.WHITE
      }
  }
  // 双层山丘
  const p1 = r() * 6.28
  const p2 = r() * 6.28
  for (let x = 0; x < PHOTO_W; x++) {
    const my = hz - 4 + Math.round(Math.sin(x / 9 + p1) * 3)
    for (let y = Math.max(0, my); y < PHOTO_H; y++) px[y * PHOTO_W + x] = C.NAVY
  }
  for (let x = 0; x < PHOTO_W; x++) {
    const gy = hz + 3 + Math.round(Math.sin(x / 7 + p2) * 3)
    for (let y = Math.max(0, gy); y < PHOTO_H; y++) px[y * PHOTO_W + x] = C.GREEN
  }
  return px
}

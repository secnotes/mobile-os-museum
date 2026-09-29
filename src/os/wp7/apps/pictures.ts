import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C, WP7_PALETTE } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG , onTrayChange } from '../ui'
import type { WPhoto } from './camera'
import { STOCK_PHOTOS, loadStockBitmaps, stockBitmap } from '../../stockPhotos'

/**
 * Pictures 图片中心（Mango 预装）：相机照片共享 camera:photos，
 * 九宫格浏览 / 单张查看 / 设为锁屏（生成 480×800 全彩 canvas 给锁屏）。
 */
export const picturesApp: MiniApp = {
  id: 'pictures',
  name: '图片',
  nameEn: 'Pictures',
  start(ctx: AppContext) {
    const ui = new PicturesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const LIST_TOP = 130
const TH = 138
const GAP_P = 8

class PicturesUI {
  private photos: WPhoto[] = []
  private cur: WPhoto | null = null
  private toastT = 0
  /** 素材位图加载中标志（避免重复触发） */
  private loadingStock = false
  /**
   * 启动预热：应用打开时有 morph 转场动画（~0.35s），转场结束会 clearOverlays
   * 清掉动画快照叠加层——但也会清掉照片 blit 叠加层。调色板绘制（fillRect/pset）
   * 写入缓冲不受影响，照片走 overlay 故需在转场结束后重铺。预热期每帧重绘以覆盖。
   */
  private warmup = 0.6
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    // 内置素材相册种子（版本化）：seedV 升级时重新放入素材相册，
    // 同时保留用户用相机拍的照片（整数大 id、无 src），丢弃旧版程序化示例图。
    const SEED_V = 2
    const v = (await this.ctx.store.get<number>('seedV')) ?? 0
    let photos = (await this.ctx.store.get<WPhoto[]>('photos')) ?? []
    if (v < SEED_V) {
      const userCam = photos.filter(
        (p) => p.src === undefined && p.id > 1000 && Number.isInteger(p.id),
      )
      photos = [...stockPhotos(), ...userCam]
      await this.ctx.store.set('photos', photos)
      await this.ctx.store.set('seedV', SEED_V)
    }
    this.photos = photos
    void loadStockBitmaps().then(() => this.draw())
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.warmup > 0) {
        // 转场动画期间/结束后重铺照片叠加层（见字段注释）
        this.warmup = Math.max(0, this.warmup - dt)
        this.draw()
      }
      if (this.toastT > 0) {
        this.toastT -= dt
        this.draw()
      }
    }))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      if (this.cur) this.cur = null
      else this.ctx.exit()
      this.draw()
    }
  }

  private persist() {
    return this.ctx.store.set('photos', this.photos)
  }

  private onTap(x: number, y: number) {
    if (this.cur) {
      // 底部应用栏（y≥H-120）：左半 = 设为锁屏，右半 = 删除
      if (y >= H - 120) {
        if (x < W / 2) {
          this.ctx.host.setLockPhoto?.(photoToCanvas(this.cur), this.cur.id)
          this.toastT = 2.4
        } else {
          this.photos = this.photos.filter((p) => p.id !== this.cur!.id)
          void this.persist()
          this.cur = null
        }
        this.draw()
      }
      return
    }
    if (y >= LIST_TOP && y < LIST_TOP + Math.ceil(this.photos.length / 3) * (TH + GAP_P)) {
      const col = Math.floor((x - 24) / (TH + GAP_P))
      const row = Math.floor((y - LIST_TOP) / (TH + GAP_P))
      const idx = row * 3 + col
      if (idx < this.photos.length && col < 3) {
        this.cur = this.photos[idx]!
        this.draw()
      }
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
    if (this.cur) this.drawSingle(str)
    else {
      s.text(24, TRAY_H + 18, str.picTitle, { size: 40, font: F_LIGHT(40), color: C.WHITE })
      if (!this.photos.length) {
        s.text(24, 380, str.picEmpty, { size: 24, font: F_REG(24), color: C.GRAY })
      } else {
        s.text(24, LIST_TOP - 30, str.picCount(this.photos.length), {
          size: 22, font: F_REG(22), color: C.GRAY,
        })
        this.photos.forEach((p, i) => {
          const col = i % 3
          const row = Math.floor(i / 3)
          this.drawPhoto(p, 24 + col * (TH + GAP_P), LIST_TOP + row * (TH + GAP_P), TH)
        })
      }
    }
    if (this.toastT > 0) {
      const accent = this.ctx.host.getAccent?.() ?? C.BLUE
      s.fillRect(0, TRAY_H, W, 4, accent)
      s.text(24, TRAY_H + 46, wpStrings(this.ctx.lang.get()).picSetLock, {
        size: 24, font: F_REG(24), color: C.WHITE,
      })
    }
    s.render()
  }

  private drawSingle(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const size = 432
    const x = (W - size) >> 1
    const y = 64
    this.drawPhoto(this.cur!, x, y, size)
    // 底部应用栏：真机 Mango 为半透明黑条 + 居中圆形图标按钮 + 下方小字标签。
    // 两按钮：左=设为锁屏背景（锁形图标）、右=删除（垃圾桶图标）。
    const barY = H - 120
    s.fillRect(0, barY, W, 120, C.BLACK)
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    const r = 26
    const drawBtn = (cx: number, icon: 'lock' | 'trash') => {
      // 圆形描边按钮（白圈 + 强调色图标），居中
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy
          if (d2 <= r * r && d2 > (r - 3) * (r - 3)) s.pset(cx + dx, barY + 28 + dy, C.WHITE)
        }
      if (icon === 'lock') {
        // 锁体（方）+ 上方锁环（半圆）
        s.fillRect(cx - 9, barY + 22, 18, 14, accent)
        for (let dx = -6; dx <= 6; dx++)
          for (let dy = -6; dy <= 4; dy++)
            if (dx * dx + dy * dy <= 36 && dx * dx + dy * dy > 16)
              s.pset(cx + dx, barY + 18 + dy, accent)
        s.fillRect(cx - 2, barY + 26, 4, 6, C.WHITE)
      } else {
        // 垃圾桶：桶身 + 盖 + 把手
        s.fillRect(cx - 9, barY + 20, 18, 2, accent)
        s.fillRect(cx - 3, barY + 17, 6, 3, accent)
        for (let i = 0; i < 12; i++) s.fillRect(cx - 8 + i, barY + 22 + (i / 12) * 1, 2, 14, accent)
        s.fillRect(cx - 7, barY + 22, 14, 13, accent)
        s.fillRect(cx - 4, barY + 26, 2, 7, C.WHITE)
        s.fillRect(cx + 2, barY + 26, 2, 7, C.WHITE)
      }
    }
    drawBtn(W / 4, 'lock')
    drawBtn((W * 3) / 4, 'trash')
    s.textCenter(W / 4, barY + 66, str.picSetLock, { size: 18, font: F_REG(18), color: C.WHITE })
    s.textCenter((W * 3) / 4, barY + 66, str.picDelete, { size: 18, font: F_REG(18), color: C.WHITE })
  }

  /** 绘制照片：素材照片 blit 真实位图（平滑），相机照片用调色板像素放大 */
  private drawPhoto(p: WPhoto, x: number, y: number, size: number) {
    const s = this.ctx.screen
    if (p.src) {
      const bmp = stockBitmap(p.src)
      if (bmp) { s.blit(bmp, x, y, { w: size, h: size, smooth: true }); return }
      // 位图尚未就绪：触发加载，就绪后重绘（幂等，多张照片只触发一次）
      if (!this.loadingStock) {
        this.loadingStock = true
        void loadStockBitmaps().then(() => { this.loadingStock = false; this.draw() })
      }
    }
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) {
        const px = Math.min(p.w - 1, Math.floor((dx / size) * p.w))
        const py = Math.min(p.h - 1, Math.floor((dy / size) * p.h))
        s.pset(x + dx, y + dy, p.data[py * p.w + px] ?? C.BLACK)
      }
  }
}

/** 照片 → 480×800 全彩 canvas（素材照片直接缩放绘制，相机照片走调色板放大） */
export function photoToCanvas(p: WPhoto): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 480
  cv.height = 800
  const g = cv.getContext('2d')!
  g.fillStyle = '#000000'
  g.fillRect(0, 0, 480, 800)
  // 素材照片：cover 填充屏宽、垂直居中
  const bmp = p.src ? stockBitmap(p.src) : undefined
  if (bmp) {
    const iw = (bmp as ImageBitmap).width || 640
    const ih = (bmp as ImageBitmap).height || 640
    const scale = Math.max(480 / iw, 480 / ih)
    const dw = iw * scale, dh = ih * scale
    g.imageSmoothingEnabled = true
    g.drawImage(bmp as CanvasImageSource, (480 - dw) / 2, (800 - dh) / 2, dw, dh)
    return cv
  }
  // 相机照片：调色板像素放大至 480×480，垂直居中
  const img = g.createImageData(480, 800)
  for (let i = 0; i < 480 * 800; i++) img.data[i * 4 + 3] = 255
  const top = (800 - 480) >> 1
  for (let dy = 0; dy < 480; dy++)
    for (let dx = 0; dx < 480; dx++) {
      const px = Math.min(p.w - 1, Math.floor((dx / 480) * p.w))
      const py = Math.min(p.h - 1, Math.floor((dy / 480) * p.h))
      const idx = p.data[py * p.w + px] ?? C.BLACK
      const hex = WP7_PALETTE[idx] ?? '#000000'
      const o = ((top + dy) * 480 + dx) * 4
      img.data[o] = parseInt(hex.slice(1, 3), 16)
      img.data[o + 1] = parseInt(hex.slice(3, 5), 16)
      img.data[o + 2] = parseInt(hex.slice(5, 7), 16)
    }
  g.putImageData(img, 0, 0)
  return cv
}

/** 内置素材相册（真实照片，懒加载位图） */
function stockPhotos(): WPhoto[] {
  return STOCK_PHOTOS.map((s) => ({ id: s.id, w: 640, h: 640, data: [], src: s.file }))
}

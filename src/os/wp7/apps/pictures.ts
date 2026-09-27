import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C, WP7_PALETTE } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG , onTrayChange } from '../ui'
import type { WPhoto } from './camera'

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
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    // 首次打开放入 3 张示例图（真机也有内置示例媒体）
    if (!(await this.ctx.store.get<boolean>('seeded'))) {
      await this.ctx.store.set('seeded', true)
      const existing = (await this.ctx.store.get<WPhoto[]>('photos')) ?? []
      if (!existing.length) await this.ctx.store.set('photos', samplePhotos())
    }
    this.photos = (await this.ctx.store.get<WPhoto[]>('photos')) ?? []
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onFrame((dt) => {
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
      // 底部应用栏：左 = 设为锁屏，右 = 删除
      if (y >= H - 110 && y < H - 30) {
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
    // 底部应用栏（真机 Metro 应用栏为半透明黑 + 白字）
    s.fillRect(0, H - 120, W, 120, C.DIM)
    s.text(24, H - 62, str.picSetLock, { size: 22, font: F_REG(22), color: C.WHITE })
    s.text(W / 2 + 24, H - 62, str.picDelete, { size: 22, font: F_REG(22), color: C.WHITE })
    s.fillRect(W / 2, H - 100, 1, 80, C.GRAY)
  }

  /** 最近邻放大绘制索引照片 */
  private drawPhoto(p: WPhoto, x: number, y: number, size: number) {
    const s = this.ctx.screen
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) {
        const px = Math.min(p.w - 1, Math.floor((dx / size) * p.w))
        const py = Math.min(p.h - 1, Math.floor((dy / size) * p.h))
        s.pset(x + dx, y + dy, p.data[py * p.w + px] ?? C.BLACK)
      }
  }
}

/** 索引照片 → 480×800 全彩 canvas（照片放大至屏宽，垂直居中，黑底） */
export function photoToCanvas(p: WPhoto): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 480
  cv.height = 800
  const g = cv.getContext('2d')!
  const img = g.createImageData(480, 800)
  for (let i = 0; i < 480 * 800; i++) img.data[i * 4 + 3] = 255
  const top = (800 - 480) >> 1
  for (let dy = 0; dy < 480; dy++)
    for (let dx = 0; dx < 480; dx++) {
      const px = Math.min(p.w - 1, Math.floor((dx / 480) * p.w))
      const py = Math.min(p.h - 1, Math.floor((dy / 480) * p.h))
      const idx = p.data[py * p.w + px] ?? C.BLACK
      const hex = WP7_PALETTE[idx] ?? '#000000'
      const r = parseInt(hex.slice(1, 3), 16)
      const gg = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const o = ((top + dy) * 480 + dx) * 4
      img.data[o] = r
      img.data[o + 1] = gg
      img.data[o + 2] = b
    }
  g.putImageData(img, 0, 0)
  return cv
}

/** 三张内置示例图（程序生成的 Metro 风像素画） */
function samplePhotos(): WPhoto[] {
  const w = 108
  const make = (fn: (x: number, y: number) => number): WPhoto => {
    const data: number[] = []
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) data.push(fn(x, y))
    return { id: Date.now() + Math.random() * 1000, w, h: w, data }
  }
  const sunset = make((x, y) => {
    if (y < 60) {
      const dx = x - 54
      const dy = y - 66
      if (dx * dx + dy * dy < 200) return C.MANGO
      return y < 25 ? C.PURPLE : y < 45 ? C.MAGENTA : C.BLUE
    }
    if (y < 80) return C.TEAL
    return C.BLACK
  })
  const waves = make((x, y) => {
    const band = Math.floor(y / 18)
    const wave = Math.sin((x + band * 14) / 12) > 0
    return wave ? C.TEAL : C.BLUE
  })
  const blocks = make((x, y) => {
    const palette = [C.MANGO, C.LIME, C.MAGENTA, C.TEAL, C.PINK, C.PURPLE]
    const bx = Math.floor(x / 36)
    const by = Math.floor(y / 36)
    return palette[(bx + by * 3) % palette.length]!
  })
  return [sunset, waves, blocks]
}

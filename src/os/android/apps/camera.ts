import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C, ANDROID_PALETTE } from '../palette'
import { iconTile } from '../ui'

export interface APhoto {
  id: number
  w: number
  h: number
  /** 调色板索引像素 */
  data: number[]
}

/**
 * Android 1.0 相机：真机为横屏 App，但手机框保持竖屏展示——
 * 场景正向铺满（天空在上），右侧半透明竖条（缩略图 + 变焦级 + 圆形快门），
 * 左侧 −/+ 变焦按钮；1.0 不支持视频录像故无 REC。快门音 audio.shutter()，
 * 照片 240×160 横图存入 store，Pictures 跨应用读取。
 */
export const cameraApp: MiniApp = {
  id: 'camera',
  name: '相机',
  nameEn: 'Camera',
  icon(s, x, y) {
    iconTile(s, x, y, C.DGREEN, C.GREEN)
    // 机身 + 镜头
    s.fillRect(x + 5, y + 8, 18, 13, C.INK)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dy * dy <= 16) s.pset(x + 14 + dx, y + 14 + dy, C.GRAY)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (dx * dx + dy * dy <= 4) s.pset(x + 14 + dx, y + 14 + dy, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new CameraUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const W = 320
const H = 480
// 存档：240×160 横图
const SW = 240
const SH = 160
// 右侧竖条宽度
const STRIP = 52
// 取景区域（竖条左侧）
const VW = W - STRIP
const ZOOMS = [1, 1.25, 1.5, 2]

class CameraUI {
  private seed = (Date.now() / 60000) | 0
  private flash = 0
  private savedT = 0
  private zoom = 0
  private lastPhoto: APhoto | null = null
  private qCache = new Map<number, number>()
  private offs: Array<() => void> = []
  private cv: HTMLCanvasElement
  private cx: CanvasRenderingContext2D
  private img: ImageData
  private rgbCache: Array<[number, number, number]>

  constructor(private ctx: AppContext) {
    this.cv = document.createElement('canvas')
    this.cv.width = W
    this.cv.height = H
    this.cx = this.cv.getContext('2d')!
    this.img = this.cx.createImageData(W, H)
    this.rgbCache = ANDROID_PALETTE.map((hex) => {
      if (!hex) return [0, 0, 0] as [number, number, number]
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
    })
  }

  dispose() {
    this.offs.forEach((off) => off())
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    const photos = (await this.ctx.store.get<APhoto[]>('photos')) ?? []
    this.lastPhoto = photos[photos.length - 1] ?? null
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.flash > 0) this.flash -= dt
      if (this.savedT > 0) this.savedT -= dt
      this.draw()
    }))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'call':
        void this.shoot()
        return
      case 'up':
      case 'right':
        this.zoom = (this.zoom + 1) % ZOOMS.length
        break
      case 'down':
      case 'left':
        this.zoom = (this.zoom + ZOOMS.length - 1) % ZOOMS.length
        break
      case 'back':
      case 'end':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private onTap(sx: number, sy: number) {
    // 快门圆：竖条下部 (294,412)
    const dx = sx - 294
    const dy = sy - 412
    if (dx * dx + dy * dy < 24 * 24) {
      void this.shoot()
      return
    }
    // 左侧变焦 − (4,196,40,40) / + (4,240,40,40)
    if (sx >= 4 && sx <= 44) {
      if (sy >= 196 && sy <= 236) this.zoom = (this.zoom + ZOOMS.length - 1) % ZOOMS.length
      else if (sy >= 240 && sy <= 280) this.zoom = (this.zoom + 1) % ZOOMS.length
      else return
      this.draw()
      return
    }
    // 点取景器其他区域 = 拍照（对应真机轨迹球按下）
    if (sx < VW) void this.shoot()
  }

  private async shoot() {
    if (this.flash > 0 || this.savedT > 0) return
    this.ctx.audio.shutter()
    this.flash = 0.18
    this.savedT = 1.4
    const z = ZOOMS[this.zoom]!
    const data: number[] = new Array(SW * SH)
    for (let py = 0; py < SH; py++) {
      // 160 行以 ×3 铺满取景高（0..477），变焦再围绕中心裁切；
      // 不能写成 240 + py*3——那样照片几乎全是地面
      const sy = this.zoomSrc(py * 3, H, z, 240)
      for (let px = 0; px < SW; px++) {
        const sx = this.zoomSrc(14 + px, VW, z, VW / 2)
        data[py * SW + px] = this.quantize(this.sceneRGB(sx, sy))
      }
    }
    const photo: APhoto = { id: Date.now(), w: SW, h: SH, data }
    const photos = (await this.ctx.store.get<APhoto[]>('photos')) ?? []
    photos.push(photo)
    await this.ctx.store.set('photos', photos.slice(-12))
    this.lastPhoto = photo
    this.draw()
  }

  /** 变焦：围绕取景中心裁切取样坐标 */
  private zoomSrc(v: number, max: number, z: number, c: number) {
    return Math.round(Math.min(max - 1, Math.max(0, c + (v - c) / z)))
  }

  /** 三角山脊线：返回该 x 处山脊顶端 y（horizon - 峰高） */
  private ridgeTop(x: number, period: number, peak: number, phase: number, horizon: number) {
    const q = (((x - phase) % period) + period) % period
    const tri = q < period / 2 ? q / (period / 2) : 1 - (q - period / 2) / (period / 2)
    return horizon - peak * tri
  }

  /**
   * 正向竖屏场景（全 RGB，平滑渐变）：天空三段渐变 + 太阳光晕、
   * 远/近两层三角山脊、草地渐变。
   */
  private sceneRGB(x: number, y: number): RGB {
    const horizon = 300
    const shift = this.seed % 80
    // 山体判定
    const farTop = this.ridgeTop(x + shift * 0.6, 150, 92, 20, horizon)
    const nearTop = this.ridgeTop(x - shift, 112, 58, 50, horizon)
    if (y >= farTop && y < horizon) {
      const t = (y - farTop) / Math.max(1, horizon - farTop)
      return mix(RGB_FARMT_TOP, RGB_FARMT_BOT, t)
    }
    if (y >= nearTop && y < horizon) {
      const t = (y - nearTop) / Math.max(1, horizon - nearTop)
      return mix(RGB_NEARMT_TOP, RGB_NEARMT_BOT, t)
    }
    if (y >= horizon) {
      const t = Math.min(1, (y - horizon) / 170)
      return mix(RGB_GRASS_HI, RGB_GRASS_LO, t)
    }
    // 天空：顶 → 地平线
    const t = y / horizon
    const sky = y < horizon * 0.42
      ? mix(RGB_SKY_TOP, RGB_SKY_MID, t / 0.42)
      : mix(RGB_SKY_MID, RGB_SKY_HOR, (t - 0.42) / 0.58)
    // 太阳：实心 + 两层软光晕（向暖色叠加）
    const sunX = 96 + shift
    const sunY = 78
    const dist = Math.hypot(x - sunX, y - sunY)
    if (dist < 22) return RGB_SUN
    if (dist < 60) return mix(sky, RGB_SUN_HALO, (1 - (dist - 22) / 38) * 0.55)
    return sky
  }

  /** RGB → 最近调色板索引（按粗量化值缓存） */
  private quantize(c: RGB): number {
    const key = (c[0] >> 3) * 1024 + (c[1] >> 3) * 32 + (c[2] >> 3)
    const hit = this.qCache.get(key)
    if (hit !== undefined) return hit
    let best = 0
    let bd = Infinity
    for (let i = 0; i < this.rgbCache.length; i++) {
      const p = this.rgbCache[i]!
      const dr = c[0] - p[0]
      const dg = c[1] - p[1]
      const db = c[2] - p[2]
      const dd = dr * dr + dg * dg + db * db
      if (dd < bd) { bd = dd; best = i }
    }
    this.qCache.set(key, best)
    return best
  }

  private pal(idx: number): [number, number, number] {
    return this.rgbCache[idx] ?? [0, 0, 0]
  }

  private draw() {
    const s = this.ctx.screen
    const str = androidStrings(this.ctx.lang.get())
    const d = this.img.data
    const z = ZOOMS[this.zoom]!
    for (let y = 0; y < H; y++) {
      const sy = this.zoomSrc(y, H, z, 240)
      for (let x = 0; x < W; x++) {
        let rgb: RGB
        if (x >= VW) {
          rgb = RGB_STRIP // 竖条底色，随后叠半透明黑
        } else if (this.flash > 0) {
          rgb = [255, 255, 255]
        } else {
          const sx = this.zoomSrc(x, VW, z, VW / 2)
          rgb = this.sceneRGB(sx, sy)
        }
        const [r, g, b] = rgb
        const o = (y * W + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
      }
    }
    this.cx.putImageData(this.img, 0, 0)
    this.drawOverlay(str)
    s.clear()
    s.blit(this.cv, 0, 0, { w: W, h: H, smooth: false })
    s.render()
  }

  private drawOverlay(str: ReturnType<typeof androidStrings>) {
    const c = this.cx
    // 右侧竖条
    c.fillStyle = 'rgba(0,0,0,0.72)'
    c.fillRect(VW, 0, STRIP, H)
    c.strokeStyle = 'rgba(255,255,255,0.25)'
    c.lineWidth = 1
    c.beginPath(); c.moveTo(VW + 0.5, 0); c.lineTo(VW + 0.5, H); c.stroke()

    // 缩略图（竖条顶部）
    if (this.lastPhoto) {
      this.drawThumb(c, VW + 6, 10, 40)
      c.strokeStyle = 'rgba(255,255,255,0.6)'
      c.strokeRect(VW + 6, 16, 40, 27)
    }
    // 变焦级文字
    c.fillStyle = '#fff'
    c.font = '11px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(str.cameraZoom(ZOOMS[this.zoom]!), VW + STRIP / 2, 62)

    // 左侧变焦 −/+
    this.zoomBtn(c, 4, 196, '−')
    this.zoomBtn(c, 4, 240, '+')

    // 圆形快门：白圈 + 红芯
    c.fillStyle = '#fff'
    c.beginPath(); c.arc(VW + STRIP / 2, 412, 22, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#c04a3a'
    c.beginPath(); c.arc(VW + STRIP / 2, 412, 16, 0, Math.PI * 2); c.fill()

    // 取景框角标
    c.strokeStyle = '#fff'
    const corners: Array<[number, number, number, number]> = [
      [8, 8, 1, 1], [VW - 8, 8, -1, 1],
      [8, H - 12, 1, -1], [VW - 8, H - 12, -1, -1],
    ]
    for (const [x, y, dx, dy] of corners) {
      c.beginPath()
      c.moveTo(x + (dx < 0 ? 10 : 0), y)
      c.lineTo(x, y); c.lineTo(x, y + (dy < 0 ? 10 : 0))
      c.stroke()
    }

    // 保存提示（取景区下部居中胶囊）
    if (this.savedT > 0) {
      c.font = '13px sans-serif'
      const tw = c.measureText(str.cameraSaved).width + 32
      c.fillStyle = 'rgba(0,0,0,0.72)'
      round(c, (VW - tw) / 2, H - 72, tw, 30, 8)
      c.fillStyle = '#fff'
      c.textAlign = 'center'
      c.fillText(str.cameraSaved, VW / 2, H - 57)
    }
  }

  private zoomBtn(c: CanvasRenderingContext2D, x: number, y: number, glyph: string) {
    c.fillStyle = 'rgba(0,0,0,0.5)'
    round(c, x, y, 40, 40, 6)
    c.fillStyle = '#fff'
    c.font = '22px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(glyph, x + 20, y + 21)
  }

  /** 把 240×160 横版照片按比例放进 40 宽框（40×27，垂直居中于 40 高槽） */
  private drawThumb(c: CanvasRenderingContext2D, x: number, y: number, box: number) {
    const p = this.lastPhoto
    if (!p) return
    const t = this.cx.createImageData(p.w, p.h)
    for (let py = 0; py < p.h; py++)
      for (let px = 0; px < p.w; px++) {
        const idx = p.data[py * p.w + px] ?? C.WHITE
        const [r, g, b] = this.pal(idx)
        const o = (py * p.w + px) * 4
        t.data[o] = r; t.data[o + 1] = g; t.data[o + 2] = b; t.data[o + 3] = 255
      }
    const tc = document.createElement('canvas')
    tc.width = p.w; tc.height = p.h
    tc.getContext('2d')!.putImageData(t, 0, 0)
    c.drawImage(tc, x, y + 6, box, (box * p.h) / p.w)
  }
}

type RGB = [number, number, number]

const hexRgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

const RGB_STRIP: RGB = [10, 10, 10]
const RGB_SKY_TOP = hexRgb('#2f3f9c')
const RGB_SKY_MID = hexRgb('#5d80cf')
const RGB_SKY_HOR = hexRgb('#a9c8ec')
const RGB_SUN = hexRgb('#ffd45a')
const RGB_SUN_HALO = hexRgb('#ffe9a8')
const RGB_FARMT_TOP = hexRgb('#7faa5e')
const RGB_FARMT_BOT = hexRgb('#648c47')
const RGB_NEARMT_TOP = hexRgb('#5a8a42')
const RGB_NEARMT_BOT = hexRgb('#426d30')
const RGB_GRASS_HI = hexRgb('#83b64c')
const RGB_GRASS_LO = hexRgb('#335e20')

/** Canvas2D 圆角填充 */
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.fill()
}

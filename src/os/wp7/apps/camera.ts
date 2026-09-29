import type { AppContext, MiniApp } from '../../../kernel/types'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_REG, onTrayChange } from '../ui'

export interface WPhoto {
  id: number
  w: number
  h: number
  /** 调色板索引像素（相机拍摄产物；素材照片为空数组） */
  data: number[]
  /** 素材照片文件名（存在则渲染真实照片，否则用 data 调色板像素） */
  src?: string
}

/** 取景器 432×432（正方形，Lumia 800 取景器的宽幅视角） */
const VW = 432
const VH = 432

/**
 * Windows Phone 7.5 相机：取景器（生成式风景）+ 快门。
 * 拍照存入本机，最近一张以缩略图回显 —— Lumia 800 的 800 万像素卡尔蔡司
 * 当然装不进浏览器，这里用调色板生成式风景致敬。
 */
export const cameraApp: MiniApp = {
  id: 'camera',
  name: '相机',
  nameEn: 'Camera',
  start(ctx: AppContext) {
    const ui = new CameraUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class CameraUI {
  private seed = (Date.now() / 60000) | 0
  private flash = 0
  private savedT = 0
  private t = 0
  private last: WPhoto | null = null
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    this.ctx.onKey((k) => {
      if (k === 'ok') this.shoot()
      else if (k === 'back') this.ctx.exit()
    })
    this.ctx.onTap((_x, y) => {
      // 取景器区域点按 = 快门（WP7 相机手势）
      if (y > TRAY_H + 20 && y < TRAY_H + 20 + VH) this.shoot()
    })
    this.ctx.onLang(() => this.draw())
    this.offs.push(onTrayChange(() => this.draw()))
    const photos = (await this.ctx.store.get<WPhoto[]>('photos')) ?? []
    this.last = photos[photos.length - 1] ?? null
    this.offs.push(
      this.ctx.onFrame((dt) => {
        this.t += dt
        if (this.flash > 0) this.flash -= dt
        if (this.savedT > 0) this.savedT -= dt
        this.draw()
      }),
    )
    this.draw()
  }

  private async shoot() {
    if (this.flash > 0 || this.savedT > 0) return
    this.flash = 0.25
    this.savedT = 1.4
    // 缩存 108×108
    const sw = VW >> 2
    const data: number[] = new Array(sw * sw)
    for (let y = 0; y < sw; y++)
      for (let x = 0; x < sw; x++) data[y * sw + x] = this.sceneAt(x * 4, y * 4)
    const photos = (await this.ctx.store.get<WPhoto[]>('photos')) ?? []
    this.last = { id: Date.now(), w: sw, h: sw, data }
    photos.push(this.last)
    await this.ctx.store.set('photos', photos.slice(-12))
    this.draw()
  }

  /** 场景像素：AMOLED 风格的深天色渐变 + 落日 + 山影 */
  private sceneAt(x: number, y: number): number {
    if (y < 250) {
      const sunX = 90 + (this.seed % 240)
      const sunY = 80
      const dx = x - sunX
      const dy = y - sunY
      if (dx * dx + dy * dy < 260) return C.MANGO
      if (dx * dx + dy * dy < 460) return C.LIME
      return y < 90 ? C.STEEL : y < 180 ? C.BLUE : C.TEAL
    }
    const m1 = Math.abs(x - 220 - (this.seed % 60)) < (430 - y) / 2.6
    const m2 = Math.abs(x - 80 + (this.seed % 40)) < (420 - y) / 3.4
    if (y < 340 && (m1 || m2)) return y > 300 ? C.BLACK : C.STEEL
    return C.BLACK
  }

  private draw() {
    if (this.dead) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const d = new Date()
    const two = (x: number) => String(x).padStart(2, '0')
    s.clear()
    tray(s, {
      unread: false,
      batteryPct: this.ctx.battery.percent,
      charging: this.ctx.battery.charging,
      clock: `${two(d.getHours())}:${two(d.getMinutes())}`,
    })
    s.fillRect(0, TRAY_H, W, H - TRAY_H, C.BLACK)
    const ox = (W - VW) >> 1
    const oy = TRAY_H + 20
    for (let y = 0; y < VH; y++)
      for (let x = 0; x < VW; x++) s.pset(ox + x, oy + y, this.sceneAt(x, y))
    // 快门闪光
    if (this.flash > 0) s.fillRect(ox, oy, VW, VH, C.WHITE)
    // 取景框角标
    for (const [cx, cy] of [[ox, oy], [ox + VW - 12, oy], [ox, oy + VH - 12], [ox + VW - 12, oy + VH - 12]] as const) {
      s.fillRect(cx, cy, 12, 3, C.WHITE)
      s.fillRect(cx, cy, 3, 12, C.WHITE)
    }
    // 快门键：强调色圆钮（屏幕底缘）
    const accent = this.ctx.host.getAccent ? this.ctx.host.getAccent() : C.BLUE
    const cy = H - 76
    for (let dy = -30; dy <= 30; dy++)
      for (let dx = -30; dx <= 30; dx++) {
        const dd = dx * dx + dy * dy
        if (dd <= 900 && dd >= 576) s.pset(W / 2 + dx, cy + dy, C.WHITE)
        else if (dd < 576) s.pset(W / 2 + dx, cy + dy, accent)
      }
    // 最近一张缩略图（左下）
    if (this.last) {
      const TH = 72
      const ph = this.last
      const sx = 24
      const sy = H - 76 - TH / 2
      s.fillRect(sx - 3, sy - 3, TH + 6, TH + 6, C.WHITE)
      for (let y = 0; y < TH; y++)
        for (let x = 0; x < TH; x++)
          s.pset(sx + x, sy + y, ph.data[Math.floor((y / TH) * ph.h) * ph.w + Math.floor((x / TH) * ph.w)] ?? C.BLACK)
    }
    // 提示
    if (this.savedT > 0) {
      s.textCenter(W / 2, oy + VH + 10, str.cameraSaved, { size: 24, font: F_REG(24), color: C.WHITE })
    } else if (Math.floor(this.t) % 2 === 0) {
      s.textCenter(W / 2, oy + VH + 10, str.cameraHint, { size: 22, font: F_REG(22), color: C.GRAY })
    }
    s.render()
  }
}

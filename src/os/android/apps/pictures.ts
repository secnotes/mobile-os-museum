import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { Contact } from '../../../scenario/data'
import type { APhoto } from './camera'
import { androidStrings } from '../strings'
import { C, ANDROID_PALETTE } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth } from '../ui'
import { loadStockBitmaps, stockBitmap } from '../../stockPhotos'

const GRID_TOP = STATUS_H + 38
const COLS = 3
const ROW_PITCH = 88

/**
 * Android 1.0 Pictures：相机照片网格 → 全屏查看；
 * MENU 出真机操作表——删除（OS 同步删 camera:photos）、
 * 设为锁屏壁纸（setLockPhoto）、设为联系人头像。
 */
export const picturesApp: MiniApp = {
  id: 'pictures',
  name: '图片',
  nameEn: 'Pictures',
  icon(s, x, y) {
    iconTile(s, x, y, C.PALE, C.WHITE)
    // 山 + 太阳的小照片
    s.fillRect(x + 5, y + 6, 18, 16, C.BLUE)
    s.fillRect(x + 5, y + 16, 8, 6, C.DGREEN)
    s.fillRect(x + 12, y + 13, 11, 9, C.GREEN)
    s.fillRect(x + 7, y + 8, 3, 3, C.AMBER)
  },
  start(ctx: AppContext) {
    const ui = new PicturesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type Sheet = null | 'actions' | 'delconfirm' | 'contacts'

class PicturesUI {
  private photos: APhoto[] = []
  private contacts: Contact[] = []
  private sel = 0
  private viewing = false
  private sheet: Sheet = null
  private toastText = ''
  private toastUntil = 0
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.photos = ((await this.ctx.host.getPhotos?.()) ?? []) as APhoto[]
    this.contacts = (await this.ctx.host.getContacts?.()) ?? []
    void loadStockBitmaps().then(() => this.draw())
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.sheet) {
      if (k === 'back') this.sheet = null
      else if (k === 'ok' && this.sheet === 'delconfirm') void this.doDelete()
      else return
      this.draw()
      return
    }
    if (this.viewing) {
      switch (k) {
        case 'left':
          this.sel = (this.sel + this.photos.length - 1) % this.photos.length
          break
        case 'right':
          this.sel = (this.sel + 1) % this.photos.length
          break
        case 'menu':
          this.sheet = 'actions'
          break
        case 'back':
          this.viewing = false
          break
        default:
          return
      }
      this.draw()
      return
    }
    switch (k) {
      case 'left':
        if (this.photos.length) this.sel = (this.sel + this.photos.length - 1) % this.photos.length
        break
      case 'right':
        if (this.photos.length) this.sel = (this.sel + 1) % this.photos.length
        break
      case 'up':
        if (this.photos.length) this.sel = (this.sel + this.photos.length - COLS) % this.photos.length
        break
      case 'down':
        if (this.photos.length) this.sel = (this.sel + COLS) % this.photos.length
        break
      case 'ok':
        if (this.photos.length) this.viewing = true
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  private onTap(x: number, y: number) {
    if (this.sheet) {
      this.sheetTap(x, y)
      return
    }
    if (this.viewing) {
      // 全屏：点 MENU 热区之外不做事；底部索引栏
      if (y > H - 30) this.viewing = false
      return
    }
    const cw = (W - 16) / COLS
    for (let i = 0; i < this.photos.length; i++) {
      const col = i % COLS
      const row = (i / COLS) | 0
      const cx = 8 + col * cw
      const cy = GRID_TOP + row * ROW_PITCH
      if (x >= cx && x < cx + cw - 6 && y >= cy && y < cy + 78) {
        this.sel = i
        this.viewing = true
        this.draw()
        return
      }
    }
  }

  /** 弹层触屏（几何与 drawSheet 一致） */
  private sheetTap(x: number, y: number) {
    const str = androidStrings(this.ctx.lang.get())
    if (this.sheet === 'delconfirm') {
      const cy = H / 2
      if (y >= cy + 36 && y <= cy + 74) {
        if (x >= 40 && x <= 150) this.sheet = null
        else if (x >= 170 && x <= 280) void this.doDelete()
        this.draw()
      } else if (y < cy - 30 || y > cy + 80) {
        this.sheet = null
        this.draw()
      }
      return
    }
    if (this.sheet === 'contacts') {
      const top = STATUS_H + 60
      for (let i = 0; i < this.contacts.length; i++) {
        if (y >= top + i * 42 && y < top + (i + 1) * 42) {
          this.sheet = null
          this.showToast(str.picContactToast(this.contacts[i]!.name))
          this.draw()
          return
        }
      }
      if (y < STATUS_H + 44) { this.sheet = null; this.draw() }
      return
    }
    // actions：三行（y 208/254/300）
    const rows = [
      () => { this.sheet = 'delconfirm' },
      () => this.setWallpaper(),
      () => { this.sheet = 'contacts' },
    ]
    for (let i = 0; i < 3; i++) {
      const ry = 208 + i * 46
      if (y >= ry && y < ry + 42 && x >= 12 && x <= W - 12) {
        rows[i]!()
        this.draw()
        return
      }
    }
    this.sheet = null
    this.draw()
  }

  private async doDelete() {
    const p = this.photos[this.sel]
    if (p) await this.ctx.host.deletePhoto?.(p.id)
    this.photos = this.photos.filter((x) => x.id !== p?.id)
    this.sheet = null
    this.viewing = false
    this.sel = Math.max(0, this.sel - 1)
    this.showToast(androidStrings(this.ctx.lang.get()).picDeletedToast)
    this.draw()
  }

  private setWallpaper() {
    const p = this.photos[this.sel]
    if (!p) return
    const cv = document.createElement('canvas')
    cv.width = p.w
    cv.height = p.h
    const cx = cv.getContext('2d')!
    const img = cx.createImageData(p.w, p.h)
    for (let i = 0; i < p.data.length; i++) {
      const hex = ANDROID_PALETTE[p.data[i]!] ?? '#000000'
      img.data[i * 4] = parseInt(hex.slice(1, 3), 16)
      img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
      img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
      img.data[i * 4 + 3] = 255
    }
    cx.putImageData(img, 0, 0)
    this.ctx.host.setLockPhoto?.(cv, p.id)
    this.sheet = null
    this.showToast(androidStrings(this.ctx.lang.get()).picWallpaperToast)
  }

  private showToast(t: string) {
    this.toastText = t
    this.toastUntil = Date.now() + 2200
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
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    s.fillRect(0, STATUS_H, W, 32, C.PALE)
    s.text(12, STATUS_H + 9, str.picturesTitle, { size: 14, color: C.INK })
    if (!this.photos.length) {
      s.textCenter(W >> 1, (H + STATUS_H) >> 1, str.picturesEmpty, { size: 12, color: C.GRAY })
    } else if (this.viewing) {
      this.drawFull()
    } else {
      this.drawGrid()
    }
    if (this.sheet) this.drawSheet(str)
    if (Date.now() < this.toastUntil) {
      roundRect(s, 24, H - 100, W - 48, 32, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 90, this.toastText, { size: 11, color: C.WHITE })
    }
    s.render()
  }

  private drawGrid() {
    const s = this.ctx.screen
    const cw = (W - 16) / COLS
    this.photos.forEach((p, i) => {
      const col = i % COLS
      const row = (i / COLS) | 0
      const cx = 8 + col * cw
      const cy = GRID_TOP + row * ROW_PITCH
      if (i === this.sel) roundRect(s, cx - 3, cy - 3, cw, 80, 6, C.ORANGE, null)
      // 缩略图 4:3
      const tw = 90
      const th = 64
      const fx = cx + (cw - 6 - tw) / 2
      if (p.src) {
        const bmp = stockBitmap(p.src)
        if (bmp) {
          s.blit(bmp, fx, cy, { w: tw, h: th, smooth: true })
          return
        }
      }
      for (let yy = 0; yy < th; yy++)
        for (let xx = 0; xx < tw; xx++)
          s.pset(fx + xx, cy + yy, p.data[(((yy / th) * p.h) | 0) * p.w + (((xx / tw) * p.w) | 0)] ?? 0)
    })
  }

  private drawFull() {
    const s = this.ctx.screen
    const p = this.photos[this.sel]!
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.BAR)
    if (p.src) {
      const bmp = stockBitmap(p.src)
      if (bmp) {
        // cover 填充可用区
        const aw = W, ah = H - STATUS_H - 30
        const iw = (bmp as ImageBitmap).width || 640, ih = (bmp as ImageBitmap).height || 640
        const sc = Math.max(aw / iw, ah / ih)
        const dw = iw * sc, dh = ih * sc
        s.blit(bmp, (aw - dw) / 2, STATUS_H + 14 + (ah - dh) / 2, { w: dw, h: dh, smooth: true })
        s.fillRect(0, H - 28, W, 28, C.INK)
        s.textCenter(W >> 1, H - 21, `${this.sel + 1} / ${this.photos.length}`, { size: 10, color: C.WHITE })
        s.text(12, H - 21, '‹', { size: 14, color: C.GRAY })
        s.textRight(W - 12, H - 22, '›', { size: 14, color: C.GRAY })
        return
      }
    }
    const scale = Math.min(W / p.w, (H - STATUS_H - 30) / p.h)
    const dw = Math.round(p.w * scale)
    const dh = Math.round(p.h * scale)
    const ox = (W - dw) >> 1
    const oy = STATUS_H + 14 + Math.max(0, ((H - STATUS_H - 30 - dh) >> 1))
    for (let yy = 0; yy < dh; yy++)
      for (let xx = 0; xx < dw; xx++)
        s.pset(ox + xx, oy + yy, p.data[Math.min(p.h - 1, (yy / scale) | 0) * p.w + Math.min(p.w - 1, (xx / scale) | 0)] ?? 0)
    // 底部索引栏
    s.fillRect(0, H - 28, W, 28, C.INK)
    s.textCenter(W >> 1, H - 21, `${this.sel + 1} / ${this.photos.length}`, { size: 10, color: C.WHITE })
    s.text(12, H - 21, '‹', { size: 14, color: C.GRAY })
    s.textRight(W - 12, H - 22, '›', { size: 14, color: C.GRAY })
  }

  /** 底部操作表 / 确认卡 / 联系人列表 */
  private drawSheet(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    if (this.sheet === 'actions') {
      s.fillRect(0, 196, W, H - 196, C.PANEL)
      const labels = [str.picDelete, str.picSetWallpaper, str.picSetContact]
      labels.forEach((label, i) => {
        const y = 208 + i * 46
        roundRect(s, 18, y + 4, 22, 22, 5, i === 0 ? C.DARKRED : C.DGREEN, null)
        s.text(50, y + 13, label, { size: 13, color: C.WHITE })
      })
      return
    }
    if (this.sheet === 'delconfirm') {
      s.fillRect(0, 0, W, H, C.BAR)
      const cy = H / 2
      roundRect(s, 30, cy - 30, W - 60, 110, 10, C.PANEL, null)
      s.textCenter(W >> 1, cy - 6, str.picDelete + '？', { size: 13, color: C.WHITE })
      roundRect(s, 40, cy + 36, 110, 38, 8, C.METAL, null)
      s.textCenter(95, cy + 49, str.mkCancel, { size: 12, color: C.WHITE })
      roundRect(s, 170, cy + 36, 110, 38, 8, C.DARKRED, null)
      s.textCenter(225, cy + 49, str.mkOk, { size: 12, color: C.WHITE })
      return
    }
    // contacts
    s.fillRect(0, 0, W, H, C.BAR)
    roundRect(s, 12, STATUS_H + 12, W - 24, H - STATUS_H - 26, 10, C.PANEL, null)
    s.text(28, STATUS_H + 28, str.picPickContact, { size: 12, color: C.WHITE })
    s.fillRect(28, STATUS_H + 48, W - 56, 1, C.METAL)
    this.contacts.forEach((c, i) => {
      const y = STATUS_H + 60 + i * 42
      s.text(28, y + 13, clipToWidth(s, c.name, W - 56, 12), { size: 12, color: C.PALE })
    })
  }
}

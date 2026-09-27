import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { androidStrings } from '../strings'
import { C } from '../palette'
import { W, H, STATUS_H, statusBar, roundRect, iconTile, clipToWidth } from '../ui'
import type { ATrack } from './music'

/** 每首歌一段 8 小节芯片旋律（购买后由「音乐」播放） */
const MELODIES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [65, 0.5], [69, 0.5], [72, 1], [69, 0.5], [65, 0.5], [62, 1],
    [65, 0.5], [67, 0.5], [69, 1], [0, 0.5], [60, 0.5], [65, 2],
  ],
  [
    [67, 0.5], [71, 0.5], [74, 1], [71, 0.5], [67, 0.5], [64, 1],
    [67, 0.5], [69, 0.5], [71, 1], [0, 0.5], [62, 0.5], [67, 2],
  ],
]

/**
 * Amazon MP3（G1 预装）：单曲 $0.89（上线时的标志性定价）。
 * 购买写入 store 'purchases'，「音乐」应用读取并入曲库。
 */
export const amazonApp: MiniApp = {
  id: 'amazon',
  name: 'Amazon MP3',
  nameEn: 'Amazon MP3',
  icon(s, x, y) {
    iconTile(s, x, y, C.AMBER, C.LAMBER)
    // 橙色底 + 白色音符 + "mp3"
    s.fillRect(x + 12, y + 5, 2, 12, C.WHITE)
    s.fillRect(x + 12, y + 5, 6, 2, C.WHITE)
    s.fillRect(x + 8, y + 15, 5, 4, C.WHITE)
    s.text(x + 6, y + 20, 'mp3', { size: 7, color: C.WHITE })
  },
  start(ctx: AppContext) {
    const ui = new AmazonUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

class AmazonUI {
  private sel = 0
  private view: 'list' | 'buy' | 'dl' = 'list'
  private dlP = 0
  private toast = 0
  private purchases: number[] = []
  private dead = false
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  async init() {
    this.ctx.onKey((k) => this.onKey(k))
    this.ctx.onTap((x, y) => this.onTap(x, y))
    this.ctx.onLang(() => this.draw())
    this.purchases = (await this.ctx.store.get<number[]>('purchases')) ?? []
    this.offs.push(this.ctx.onFrame((dt) => {
      if (this.view !== 'dl') return
      this.dlP += dt / 1.8
      if (this.dlP >= 1) {
        this.view = 'list'
        this.toast = Date.now() + 2500
      }
      this.draw()
    }))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    const str = androidStrings(this.ctx.lang.get())
    const n = str.amzSongs.length
    if (this.view === 'buy') {
      if (k === 'back') {
        this.view = 'list'
      } else if (k === 'ok') {
        void this.buy()
        return
      } else return
      this.draw()
      return
    }
    if (this.view === 'dl') {
      if (k === 'back') { this.view = 'list'; this.draw() }
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'ok':
        this.view = 'buy'
        break
      case 'back':
        this.ctx.exit()
        return
      default:
        return
    }
    this.draw()
  }

  /** 触屏：歌曲行 / 购买按钮 */
  private onTap(_x: number, y: number) {
    if (this.view === 'dl') return
    if (this.view === 'buy') {
      if (y > 300 && y < 344 && Math.abs(_x - (W >> 1)) < 70) {
        void this.buy()
      } else if (y <= STATUS_H + 34) {
        this.view = 'list'
        this.draw()
      }
      return
    }
    const str = androidStrings(this.ctx.lang.get())
    str.amzSongs.forEach((_, i) => {
      const y0 = STATUS_H + 44 + i * 62
      if (y >= y0 && y < y0 + 54) {
        this.sel = i
        this.view = 'buy'
        this.draw()
      }
    })
  }

  private async buy() {
    if (this.purchases.includes(this.sel)) {
      this.view = 'list'
      this.draw()
      return
    }
    this.purchases = [...this.purchases, this.sel]
    const str = androidStrings(this.ctx.lang.get())
    const bought: ATrack[] = this.purchases.map((i) => ({
      title: str.amzSongs[i]!.title,
      artist: str.amzSongs[i]!.artist,
      album: 'Amazon MP3',
      melody: MELODIES[i % MELODIES.length]!,
    }))
    await this.ctx.store.set('purchases', this.purchases)
    await this.ctx.store.set('downloaded', bought)
    // 下载进度动画
    this.view = 'dl'
    this.dlP = 0
    this.draw()
  }

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
    s.fillRect(0, STATUS_H, W, 30, C.PALE)
    s.text(12, STATUS_H + 7, str.amzTitle, { size: 15, color: C.INK })
    if (this.view === 'buy') this.drawBuy(str)
    else if (this.view === 'dl') this.drawDl(str)
    else this.drawList(str)
    s.render()
  }

  private drawList(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    str.amzSongs.forEach((song, i) => {
      const y = STATUS_H + 44 + i * 62
      if (i === this.sel) roundRect(s, 6, y - 2, W - 12, 54, 8, C.PALE, null)
      roundRect(s, 14, y + 5, 44, 44, 6, C.AMBER, null)
      s.fillRect(14, y + 5, 44, 10, C.LAMBER)
      s.text(70, y + 10, song.title, { size: 13, color: C.INK })
      s.text(70, y + 32, song.artist, { size: 10, color: C.GRAY })
      const done = this.purchases.includes(i)
      s.textRight(W - 14, y + 10, done ? str.amzBought : str.amzPrice, { size: 11, color: done ? C.GRAY : C.GREEN })
    })
    if (Date.now() < this.toast) {
      roundRect(s, 24, H - 70, W - 48, 34, 8, C.BAR, null)
      s.textCenter(W >> 1, H - 60, str.amzToMusic, { size: 10, color: C.WHITE })
    }
  }

  /** 下载中：黑色面板 + 橙色进度条 */
  private drawDl(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const song = str.amzSongs[this.sel]!
    roundRect(s, 20, STATUS_H + 120, W - 40, 110, 10, C.PANEL, C.METAL)
    s.text(36, STATUS_H + 142, clipToWidth(s, song.title, W - 72, 13), { size: 13, color: C.WHITE })
    s.text(36, STATUS_H + 166, song.artist, { size: 10, color: C.GRAY })
    s.fillRect(36, STATUS_H + 190, W - 72, 8, C.INK)
    s.fillRect(36, STATUS_H + 190, Math.round((W - 72) * this.dlP), 8, C.AMBER)
    s.textRight(W - 36, STATUS_H + 164, `${Math.min(99, Math.round(this.dlP * 100))}%`, {
      size: 12,
      color: C.AMBER,
    })
  }

  private drawBuy(str: ReturnType<typeof androidStrings>) {
    const s = this.ctx.screen
    const song = str.amzSongs[this.sel]!
    s.textCenter(W >> 1, STATUS_H + 70, song.title, { size: 16, color: C.INK })
    s.textCenter(W >> 1, STATUS_H + 96, song.artist, { size: 11, color: C.GRAY })
    s.textCenter(W >> 1, STATUS_H + 140, str.amzPrice, { size: 24, color: C.GREEN })
    const done = this.purchases.includes(this.sel)
    roundRect(s, (W >> 1) - 70, 300, 140, 44, 10, done ? C.GRAY : C.DGREEN, null)
    s.textCenter(W >> 1, 314, done ? str.amzBought : str.amzBuy, { size: 13, color: C.WHITE })
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { wpStrings } from '../strings'
import { C } from '../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI, clipToWidth , onTrayChange } from '../ui'
import { SnakeGame } from './games/snake'
import { MinesGame } from './games/mines'
import { SudokuGame } from './games/sudoku'

/** Xbox 品牌绿（WP7 Games hub 专属强调色，不在 10 个系统强调色内） */
const XBOX = C.GREEN

/**
 * Games（Xbox LIVE Hub）：三页 —— 收藏（三款可玩游戏入口，显示最高分）、
 * 焦点（编辑推荐假条目）、玩家资料（剪影/分数）。游戏在本应用内切换。
 */
export const gamesApp: MiniApp = {
  id: 'games',
  name: '游戏',
  nameEn: 'Games',
  start(ctx: AppContext) {
    const ui = new GamesUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

interface Playable {
  start(): void | Promise<void>
  dispose(): void
}

class GamesUI {
  private pane = 0
  private game: Playable | null = null
  private snakeBest = 0
  private offs: Array<() => void> = []
  private dead = false

  constructor(private ctx: AppContext) {}

  dispose() {
    this.dead = true
    this.game?.dispose()
    for (const off of this.offs.splice(0)) off()
  }

  async init() {
    this.snakeBest = (await this.ctx.store.get<number>('snake:best')) ?? 0
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.game) return
      if (dir === 'left') this.pane = Math.min(2, this.pane + 1)
      else if (dir === 'right') this.pane = Math.max(0, this.pane - 1)
      else return
      this.draw()
    }))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.game) return // 游戏自己处理（含 back → exitToHub）
    if (k === 'back') this.ctx.exit()
  }

  private launch(g: Playable) {
    this.game = g
    void g.start()
  }

  private exitToHub() {
    this.game?.dispose()
    this.game = null
    // 刷新最高分
    void this.ctx.store.get<number>('snake:best').then((b) => {
      this.snakeBest = b ?? 0
      this.draw()
    })
  }

  private onTap(x: number, y: number) {
    if (this.game) return
    const str = wpStrings(this.ctx.lang.get())
    // Pane 标题
    if (y >= TRAY_H && y < TRAY_H + 56) {
      const titles = [str.gamesCollection, str.gamesSpotlight, str.gamesGamer]
      let xx = 24
      for (let i = 0; i < titles.length; i++) {
        const w = this.ctx.screen.measure(titles[i]!, { size: i === this.pane ? 30 : 24 }) + 28
        if (x >= xx && x < xx + w) {
          this.pane = i
          this.draw()
          return
        }
        xx += w
      }
    }
    const TOP = TRAY_H + 70
    if (this.pane === 0 && y >= TOP && y < TOP + 3 * 110) {
      const r = Math.floor((y - TOP) / 110)
      if (r === 0) this.launch(new SnakeGame(this.ctx, () => this.exitToHub()))
      else if (r === 1) this.launch(new MinesGame(this.ctx, () => this.exitToHub()))
      else this.launch(new SudokuGame(this.ctx, () => this.exitToHub()))
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead) return
    if (this.game) return // 游戏自绘
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
    const titles = [str.gamesCollection, str.gamesSpotlight, str.gamesGamer]
    let xx = 24
    titles.forEach((t, i) => {
      const active = i === this.pane
      s.text(xx, TRAY_H + 12, t, {
        size: active ? 30 : 24, font: F_LIGHT(active ? 30 : 24),
        color: active ? XBOX : C.GRAY,
      })
      xx += s.measure(t, { size: active ? 30 : 24 }) + 28
    })
    const TOP = TRAY_H + 70
    if (this.pane === 0) this.drawCollection(str, TOP)
    else if (this.pane === 1) this.drawSpotlight(TOP)
    else this.drawProfile(str, TOP)
    s.render()
  }

  private drawCollection(str: ReturnType<typeof wpStrings>, top: number) {
    const s = this.ctx.screen
    const items: Array<[string, string]> = [
      [str.snakeName, `${str.snakeBest} ${this.snakeBest}`],
      [str.mineName, `${str.mineName}`],
      [str.sudokuName, str.sudokuName],
    ]
    items.forEach(([name, sub], i) => {
      const y = top + i * 110
      s.fillRect(24, y, 84, 84, XBOX)
      const glyph = ['S', 'M', '9'][i]!
      s.textCenterV(66, y + 42, glyph, { size: 44, font: F_SEMI(44), color: C.WHITE })
      s.text(128, y + 14, name, { size: 30, font: F_SEMI(30), color: C.WHITE })
      s.text(128, y + 56, clipToWidth(s, sub, W - 160, 22, F_REG(22)), {
        size: 22, font: F_REG(22), color: C.GRAY,
      })
      s.fillRect(24, y + 98, W - 48, 1, C.DIM)
    })
  }

  private drawSpotlight(top: number) {
    const s = this.ctx.screen
    // 大焦点条
    s.fillRect(24, top, W - 48, 200, XBOX)
    s.textCenter(W / 2, top + 100, 'Angry Birds', {
      size: 40, font: F_LIGHT(40), color: C.WHITE,
    })
    s.text(24, top + 150, '★★★★★', { size: 24, font: F_REG(24), color: C.WHITE })
    const more = ['Xbox LIVE 游戏合集', 'Xbox LIVE 独立游戏', '本周免费榜']
    const moreEn = ['Xbox LIVE Hits', 'Indie Games', 'Free this week']
    const en = this.ctx.lang.get() === 'en'
    ;(en ? moreEn : more).forEach((name, i) => {
      const y = top + 250 + i * 80
      s.fillRect(24, y, 56, 56, C.DIM)
      s.text(96, y + 10, name, { size: 26, font: F_REG(26), color: C.WHITE })
      s.fillRect(24, y + 68, W - 48, 1, C.DIM)
    })
  }

  private drawProfile(str: ReturnType<typeof wpStrings>, top: number) {
    const s = this.ctx.screen
    // 头像剪影：白圆 + 黑色人形
    for (let dy = -60; dy <= 60; dy++)
      for (let dx = -60; dx <= 60; dx++)
        if (dx * dx + dy * dy <= 3600) {
          const inside =
            // 头
            dx * dx + (dy + 18) * (dy + 18) <= 260 ||
            // 肩
            (dy > 22 && (dx * dx) / 1600 + ((dy - 22) * (dy - 22)) / 900 <= 1)
          s.pset(W / 2 + dx, top + 60 + dy, inside ? C.DIM : C.WHITE)
        }
    s.textCenter(W / 2, top + 180, 'Player1', {
      size: 34, font: F_SEMI(34), color: C.WHITE,
    })
    s.textCenter(W / 2, top + 220, str.gamesXbox, {
      size: 22, font: F_REG(22), color: XBOX,
    })
    const rows: Array<[string, string]> = [
      [str.gamesXbox, '1250G'],
      [str.gamesGamer, 'Player1'],
    ]
    rows.forEach(([k, v], i) => {
      const y = top + 300 + i * 70
      s.text(24, y, k, { size: 24, font: F_REG(24), color: C.GRAY })
      s.textRight(W - 24, y, v, { size: 24, font: F_REG(24), color: C.WHITE })
      s.fillRect(24, y + 40, W - 48, 1, C.DIM)
    })
  }
}

import type { AppContext } from '../../../../kernel/types'
import type { DeviceKey } from '../../../../hal/input'
import { wpStrings } from '../../strings'
import { C } from '../../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI , onTrayChange } from '../../ui'

/**
 * 扫雷（Xbox LIVE Collection）：9×9/10 雷（初级）与 12×12/24 雷（中级），
 * 点按揭开、模式切换插旗，首次点击安全；自动展开空白区。
 */
const LEVELS = [
  { n: 9, mines: 10, cell: 44 },
  { n: 12, mines: 24, cell: 33 },
]
const BOARD_W = 396
const BX = (W - BOARD_W) >> 1
const BY = 168

class Cell {
  mine = false
  adj = 0
  open = false
  flag = false
}

export class MinesGame {
  private level = 0
  private grid: Cell[][] = []
  private flagMode = false
  private over: null | 'win' | 'lose' = null
  /** 结束遮罩 overlay（dim + 文字同层） */
  private overCanvas: HTMLCanvasElement | null = null
  private first = true
  private opened = 0
  private offs: Array<() => void> = []
  private disposed = false

  constructor(private ctx: AppContext, private exitToHub: () => void) {}

  async start() {
    this.build()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.draw()
  }

  dispose() {
    this.disposed = true
    for (const off of this.offs.splice(0)) off()
  }

  private get cfg() {
    return LEVELS[this.level]!
  }

  private build() {
    const { n } = this.cfg
    this.grid = Array.from({ length: n }, () => Array.from({ length: n }, () => new Cell()))
    this.over = null
    this.overCanvas = null
    this.first = true
    this.opened = 0
  }

  /** 首次点击后排雷（点击格及其相邻格不布雷） */
  private plantMines(sx: number, sy: number) {
    const { n, mines } = this.cfg
    let placed = 0
    while (placed < mines) {
      const x = Math.floor(Math.random() * n)
      const y = Math.floor(Math.random() * n)
      const c = this.grid[y]![x]!
      if (c.mine || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue
      c.mine = true
      placed++
    }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let a = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            if (this.grid[y + dy]?.[x + dx]?.mine) a++
          }
        this.grid[y]![x]!.adj = a
      }
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') this.exitToHub()
    else if ((k === 'ok') && this.over) {
      this.build()
      this.draw()
    }
  }

  private cellAt(x: number, y: number): [number, number] | null {
    const { n, cell } = this.cfg
    if (x < BX || y < BY || x >= BX + n * cell || y >= BY + n * cell) return null
    return [Math.floor((x - BX) / cell), Math.floor((y - BY) / cell)]
  }

  private onTap(x: number, y: number) {
    if (this.over) {
      // 结束后点棋盘重开
      if (y >= BY && y < BY + BOARD_W) {
        this.build()
        this.draw()
      }
      return
    }
    // 底部三按钮
    if (y >= H - 100 && y < H - 40) {
      if (x < 158) this.flagMode = !this.flagMode
      else if (x < 292) {
        this.level = 1 - this.level
        this.build()
      } else this.build()
      this.draw()
      return
    }
    const at = this.cellAt(x, y)
    if (!at) return
    const [cx, cy] = at
    const c = this.grid[cy]![cx]!
    if (this.flagMode) {
      if (!c.open) c.flag = !c.flag
      this.draw()
      return
    }
    if (c.flag || c.open) return
    if (this.first) {
      this.plantMines(cx, cy)
      this.first = false
    }
    if (c.mine) {
      this.over = 'lose'
      this.grid.forEach((row) => row.forEach((x2) => {
        if (x2.mine) x2.open = true
      }))
      this.draw()
      return
    }
    this.flood(cx, cy)
    const safe = this.cfg.n ** 2 - this.cfg.mines
    if (this.opened >= safe) this.over = 'win'
    this.draw()
  }

  /** 空白格连片展开 */
  private flood(sx: number, sy: number) {
    const stack: Array<[number, number]> = [[sx, sy]]
    while (stack.length) {
      const [x, y] = stack.pop()!
      const c = this.grid[y]?.[x]
      if (!c || c.open || c.flag || c.mine) continue
      c.open = true
      this.opened++
      if (c.adj === 0)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx || dy) stack.push([x + dx, y + dy])
          }
    }
  }

  private numColor(n: number): number {
    return [C.BLUE, C.GREEN, C.RED, C.PURPLE, C.BROWN, C.TEAL, C.GRAY, C.STEEL][n - 1] ?? C.WHITE
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.disposed) return
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
    s.text(24, TRAY_H + 16, str.mineName, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    const flags = this.grid.flat().filter((c) => c.flag).length
    s.text(24, 110, `🚩 ${this.cfg.mines - flags}`, {
      size: 26, font: F_REG(26), color: C.GRAY,
    })
    s.textRight(W - 24, 110, `${this.cfg.n}×${this.cfg.n}`, {
      size: 26, font: F_REG(26), color: C.GRAY,
    })
    this.drawBoard()
    this.drawBar()
    if (this.over) {
      if (!this.overCanvas) this.buildOver(str)
      s.blit(this.overCanvas!, 0, 0)
    }
    s.render()
  }

  /** 结束 overlay：0.7 黑层 + 三行字（同层合成） */
  private buildOver(str: ReturnType<typeof wpStrings>) {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    g.fillStyle = 'rgba(0,0,0,0.7)'
    g.fillRect(0, 0, W, H)
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#ffffff'
    g.font = F_LIGHT(50)
    g.fillText(this.over === 'win' ? str.mineWin : str.gameOver, W / 2, 320)
    g.fillStyle = '#8a8a8a'
    g.font = F_REG(28)
    g.fillText(this.over === 'win' ? `🏆 ${this.cfg.n}×${this.cfg.n}` : `💣 ${str.mineName}`, W / 2, 390)
    g.fillStyle = '#ffffff'
    g.font = F_REG(26)
    g.fillText(str.gameNew, W / 2, 450)
    this.overCanvas = cv
  }

  private drawBoard() {
    const s = this.ctx.screen
    const { n, cell } = this.cfg
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = BX + x * cell
        const py = BY + y * cell
        const c = this.grid[y]![x]!
        if (!c.open) s.fillRect(px, py, cell - 2, cell - 2, C.STEEL)
        else {
          s.fillRect(px, py, cell - 2, cell - 2, c.mine ? C.RED : C.DIM)
          if (c.mine) s.fillRect(px + cell / 2 - 4, py + cell / 2 - 4, 9, 9, C.BLACK)
          else if (c.adj)
            s.textCenter(px + cell / 2 - 1, py + cell / 2 - cell * 0.32, String(c.adj), {
              size: Math.round(cell * 0.62),
              font: F_SEMI(Math.round(cell * 0.62)),
              color: this.numColor(c.adj),
            })
        }
        if (c.flag)
          s.textCenter(px + cell / 2 - 1, py + cell / 2 - cell * 0.32, '⚑', {
            size: Math.round(cell * 0.7),
            font: F_SEMI(Math.round(cell * 0.7)),
            color: C.MANGO,
          })
      }
  }

  private drawBar() {
    const s = this.ctx.screen
    const btns: Array<[string, number]> = [
      [this.flagMode ? '⚑' : '⛏', this.flagMode ? C.MANGO : C.DIM],
      [`${this.cfg.n}×${this.cfg.n}`, C.DIM],
      ['↻', C.DIM],
    ]
    btns.forEach(([label, fill], i) => {
      const x = 24 + i * 142
      s.fillRect(x, H - 100, 134, 60, fill)
      s.textCenter(x + 67, H - 80, label, { size: 30, font: F_REG(30), color: C.WHITE })
    })
  }

}

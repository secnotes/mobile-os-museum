import type { AppContext } from '../../../../kernel/types'
import type { DeviceKey } from '../../../../hal/input'
import { wpStrings } from '../../strings'
import { C } from '../../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI , onTrayChange } from '../../ui'

/**
 * 贪吃蛇（Xbox LIVE Collection 小品）：24×24 格，滑动/方向键转向，
 * 吃食加速；最高分持久化 games:snake:best。
 */
const N = 24
const CELL = 18
const BOARD = N * CELL // 432
const BX = 24
const BY = 120

type Dir = 0 | 1 | 2 | 3 // 上右下左
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

export class SnakeGame {
  private snake: Array<[number, number]> = []
  private dir: Dir = 1
  private queued: Dir[] = []
  private food: [number, number] = [0, 0]
  private score = 0
  private best = 0
  private dead = false
  /** 死亡遮罩 overlay（dim + 文字同层，避免文字被遮罩压暗） */
  private overCanvas: HTMLCanvasElement | null = null
  private acc = 0
  private offs: Array<() => void> = []
  private disposed = false

  constructor(private ctx: AppContext, private exitToHub: () => void) {}

  async start() {
    this.best = (await this.ctx.store.get<number>('snake:best')) ?? 0
    this.reset()
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.offs.push(this.ctx.onSwipe((dir) => {
      if (this.dead) return
      const map = { up: 0, right: 1, down: 2, left: 3 } as const
      this.turn(map[dir])
    }))
    this.offs.push(this.ctx.onFrame((dt) => {
      if (!this.dead) {
        this.acc += dt
        const interval = 1 / Math.min(9.5, 5 + this.score * 0.12)
        while (this.acc >= interval) {
          this.acc -= interval
          this.step()
          if (this.dead) break
        }
      }
      this.draw()
    }))
    this.draw()
  }

  dispose() {
    this.disposed = true
    for (const off of this.offs.splice(0)) off()
  }

  private reset() {
    this.snake = [[8, 12], [7, 12], [6, 12]]
    this.dir = 1
    this.queued = []
    this.score = 0
    this.dead = false
    this.overCanvas = null
    this.acc = 0
    this.placeFood()
  }

  private placeFood() {
    let x = 0
    let y = 0
    do {
      x = Math.floor(Math.random() * N)
      y = Math.floor(Math.random() * N)
    } while (this.snake.some(([sx, sy]) => sx === x && sy === y))
    this.food = [x, y]
  }

  private turn(d: Dir) {
    const last = this.queued.length ? this.queued[this.queued.length - 1]! : this.dir
    if (d === last || d === ((last + 2) % 4)) return
    this.queued.push(d)
    if (this.queued.length > 2) this.queued.shift()
  }

  private step() {
    if (this.queued.length) this.dir = this.queued.shift()!
    const head = this.snake[0]!
    const nx = head[0] + DX[this.dir]!
    const ny = head[1] + DY[this.dir]!
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || this.snake.some(([x, y]) => x === nx && y === ny)) {
      this.die()
      return
    }
    this.snake.unshift([nx, ny])
    if (nx === this.food[0] && ny === this.food[1]) {
      this.score++
      this.placeFood()
    } else this.snake.pop()
  }

  private die() {
    this.dead = true
    if (this.score > this.best) this.best = this.score
    void this.ctx.store.set('snake:best', this.best)
    this.buildOver()
  }

  /** 结束 overlay：0.7 黑层 + 三行字（同层合成） */
  private buildOver() {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    const str = wpStrings(this.ctx.lang.get())
    g.fillStyle = 'rgba(0,0,0,0.7)'
    g.fillRect(0, 0, W, H)
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#ffffff'
    g.font = F_LIGHT(50)
    g.fillText(str.gameOver, W / 2, 320)
    g.fillStyle = '#8a8a8a'
    g.font = F_REG(28)
    g.fillText(`${str.snakeBest} ${this.best}`, W / 2, 390)
    g.fillStyle = '#ffffff'
    g.font = F_REG(26)
    g.fillText(str.gameNew, W / 2, 450)
    this.overCanvas = cv
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') {
      this.exitToHub()
      return
    }
    if (this.dead) {
      if (k === 'ok') this.reset()
      return
    }
    const map: Partial<Record<DeviceKey, Dir>> = { up: 0, right: 1, down: 2, left: 3 }
    if (map[k] != null) this.turn(map[k]!)
  }

  private onTap(x: number, y: number) {
    if (this.dead && y >= BY && y < BY + BOARD) {
      this.reset()
      return
    }
    void x
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
    s.text(24, TRAY_H + 16, str.snakeName, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    s.text(24, 92, `${str.snakeBest} ${this.best}`, {
      size: 22, font: F_REG(22), color: C.GRAY,
    })
    s.textRight(W - 24, 92, String(this.score), {
      size: 30, font: F_SEMI(30), color: C.WHITE,
    })
    // 棋盘（暗底 + 网格淡线）
    s.fillRect(BX, BY, BOARD, BOARD, C.DIM)
    // 食物（强调色方块）
    s.fillRect(BX + this.food[0] * CELL + 2, BY + this.food[1] * CELL + 2, CELL - 4, CELL - 4, C.MANGO)
    // 蛇（头白，身绿）
    this.snake.forEach(([x, y], i) => {
      s.fillRect(BX + x * CELL + 1, BY + y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? C.WHITE : C.GREEN)
    })
    if (this.dead && this.overCanvas) s.blit(this.overCanvas, 0, 0)
    s.render()
  }
}

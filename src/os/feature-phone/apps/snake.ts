import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

/** 贪吃蛇 II：穿墙版（3310 原版行为），蛇身带 1px 缝隙还原老 LCD 手感 */
const CELL = 3
const OX = 1
const OY = 10

interface Pt {
  x: number
  y: number
}

export const snakeApp: MiniApp = {
  id: 'snake',
  name: '贪吃蛇II',
  nameEn: 'Snake II',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '..#####...',
      '..#...#...',
      '..#...#...',
      '....#.....',
      '..###.....',
      '..#.......',
      '..######..',
    ])
  },
  start(ctx: AppContext) {
    new SnakeGame(ctx)
  },
}

class SnakeGame {
  private snake: Pt[] = []
  private dir: Pt = { x: 1, y: 0 }
  private queue: Pt[] = []
  private food: Pt = { x: 0, y: 0 }
  private score = 0
  private high = 0
  private newRecord = false
  private speed = 6
  private acc = 0
  private blink = 0
  private over = false
  /** 棋盘随屏幕分辨率（3310 26×12，1100 更大） */
  private cols: number
  private rows: number

  constructor(private ctx: AppContext) {
    this.cols = Math.floor((ctx.screen.w - 6) / 3)
    this.rows = Math.floor((ctx.screen.h - 12) / 3)
    void ctx.store.get<number>('high').then((h) => {
      this.high = h ?? 0
    })
    this.reset()
    ctx.onKey((k) => this.onKey(k))
    ctx.onFrame((dt) => this.tick(dt))
  }

  private reset() {
    this.snake = [
      { x: 8, y: Math.floor(this.rows / 2) },
      { x: 7, y: Math.floor(this.rows / 2) },
      { x: 6, y: Math.floor(this.rows / 2) },
    ]
    this.dir = { x: 1, y: 0 }
    this.queue = []
    this.score = 0
    this.speed = 6
    this.over = false
    this.newRecord = false
    this.acc = 0
    this.spawnFood()
  }

  private spawnFood() {
    for (;;) {
      const p = {
        x: Math.floor(Math.random() * this.cols),
        y: Math.floor(Math.random() * this.rows),
      }
      if (!this.snake.some((s) => s.x === p.x && s.y === p.y)) {
        this.food = p
        return
      }
    }
  }

  private onKey(k: DeviceKey) {
    if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
      return
    }
    const want = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[
      k as 'up' | 'down' | 'left' | 'right'
    ]
    if (want) {
      const last = this.queue[this.queue.length - 1] ?? this.dir
      // 禁止 180° 掉头
      if (last.x + want.x !== 0 || last.y + want.y !== 0) {
        if (this.queue.length < 2) this.queue.push(want)
      }
      return
    }
    if (this.over && (k === 'ok' || k === 'soft1')) {
      this.reset()
      return
    }
    if (k === '2') {
      // 2 键加速彩蛋
      this.speed = Math.min(14, this.speed + 1)
    }
  }

  private tick(dt: number) {
    this.blink += dt
    if (!this.over) {
      this.acc += dt
      const step = 1 / this.speed
      while (this.acc > step) {
        this.acc -= step
        this.step()
        if (this.over) break
      }
    }
    this.draw()
  }

  private step() {
    const d = this.queue.shift()
    if (d) this.dir = d
    const head = this.snake[0]
    // Snake II：边界环绕（穿墙）
    const next = {
      x: (head.x + this.dir.x + this.cols) % this.cols,
      y: (head.y + this.dir.y + this.rows) % this.rows,
    }
    // 撞自己
    if (this.snake.some((s) => s.x === next.x && s.y === next.y)) {
      this.die()
      return
    }
    this.snake.unshift(next)
    if (next.x === this.food.x && next.y === this.food.y) {
      this.score += 10
      this.speed = Math.min(13, 6 + Math.floor(this.score / 60))
      this.ctx.audio.tone(1046, 0.05, { gain: 0.04 })
      this.spawnFood()
    } else {
      this.snake.pop()
    }
  }

  private die() {
    this.over = true
    this.ctx.audio.tone(196, 0.25, { type: 'sawtooth', gain: 0.05 })
    if (this.score > this.high) {
      this.high = this.score
      this.newRecord = true
      void this.ctx.store.set('high', this.high)
    }
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    s.clear()
    s.text(1, 1, `S ${String(this.score).padStart(4, '0')}`)
    s.textRight(s.w - 1, 1, `H ${String(this.high).padStart(4, '0')}`)
    s.frameRect(0, 9, s.w, s.h - 9)
    // 蛇身（2×2，留缝）
    for (const [i, p] of this.snake.entries()) {
      if (i === 0 && this.over) continue // 死亡后隐藏头部
      s.fillRect(OX + p.x * CELL, OY + p.y * CELL, 2, 2)
    }
    // 食物闪烁
    if (Math.floor(this.blink * 6) % 2 === 0) {
      s.fillRect(OX + this.food.x * CELL, OY + this.food.y * CELL, 2, 2)
    }
    if (this.over) {
      const bx = (s.w - 64) >> 1
      s.fillRect(bx, 15, 64, 15)
      // 反白字：实心块上先挖空字，再整块反白
      s.textCenter(s.w >> 1, 17, 'GAME OVER', { color: 0 })
      s.invertRect(bx, 15, 64, 15)
      s.textCenter(s.w >> 1, 33, str.snakeOver(this.score, this.newRecord))
    }
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, CONTENT_BOTTOM, titleBar, softBar, clearContent } from '../ui'

/** 贪吃蛇彩色版：15×16 大格子，蛇身带 1px 缝隙 */
const COLS = 15
const ROWS = 16
const CELL = 12
const OX = (W - COLS * CELL) / 2 // 30
const OY = CONTENT_TOP + 14 // 棋盘顶
const BOARD_H = ROWS * CELL // 192

interface Pt {
  x: number
  y: number
}

export const snakeApp: MiniApp = {
  id: 'snake',
  name: '贪吃蛇',
  nameEn: 'Snake',
  icon(s, x, y) {
    // 深底绿蛇
    s.fillRect(x, y, 44, 44, C.DARK)
    for (let i = 0; i < 8; i++) {
      const px = x + 8 + i * 4
      const py = y + 22 + Math.round(Math.sin(i * 0.9) * 8)
      s.fillRect(px, py, 5, 5, C.GREEN)
    }
    s.fillRect(x + 33, y + 14, 6, 6, C.BLUE)
    s.fillRect(x + 4, y + 36, 4, 4, C.AMBER)
  },
  start(ctx: AppContext) {
    new SnakeGame(ctx) // 按键/帧回调经 ctx 注册，退出由运行时统一回收
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
  private speed = 5
  private acc = 0
  private blink = 0
  private over = false
  private paused = false

  constructor(private ctx: AppContext) {
    void ctx.store.get<number>('high').then((h) => {
      this.high = h ?? 0
      if (this.over) this.draw()
    })
    this.reset()
    ctx.onKey((k) => this.onKey(k))
    ctx.onFrame((dt) => this.tick(dt))
    ctx.onLang(() => this.draw())
    this.draw()
  }

  private reset() {
    const cy = Math.floor(ROWS / 2)
    this.snake = [
      { x: 4, y: cy },
      { x: 3, y: cy },
      { x: 2, y: cy },
    ]
    this.dir = { x: 1, y: 0 }
    this.queue = []
    this.score = 0
    this.speed = 5
    this.newRecord = false
    this.over = false
    this.paused = false
    this.spawnFood()
  }

  private spawnFood() {
    for (;;) {
      const p = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      }
      if (!this.snake.some((s) => s.x === p.x && s.y === p.y)) {
        this.food = p
        return
      }
    }
  }

  private onKey(k: DeviceKey) {
    const dirs: Partial<Record<DeviceKey, Pt>> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    }
    if (this.over) {
      if (k === 'ok' || k === 'soft1') {
        this.reset()
        this.draw()
      } else if (k === 'back' || k === 'soft2') {
        this.ctx.exit()
      }
      return
    }
    const d = dirs[k]
    if (d) {
      if (this.paused) this.paused = false
      const last = this.queue[this.queue.length - 1] ?? this.dir
      if (d.x !== -last.x || d.y !== -last.y) this.queue.push(d)
    } else if (k === 'soft1') {
      this.paused = !this.paused
    } else if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
    }
    this.draw()
  }

  private tick(dt: number) {
    if (this.over) {
      this.blink += dt
      if (this.blink > 0.4) {
        this.blink = 0
        this.draw()
      }
      return
    }
    if (this.paused) return
    this.acc += dt
    const step = 1 / this.speed
    while (this.acc >= step) {
      this.acc -= step
      this.step()
    }
  }

  private step() {
    const d = this.queue.shift()
    if (d) this.dir = d
    const head = {
      x: this.snake[0]!.x + this.dir.x,
      y: this.snake[0]!.y + this.dir.y,
    }
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= COLS ||
      head.y >= ROWS ||
      this.snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      this.gameOver()
      return
    }
    this.snake.unshift(head)
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10
      this.speed = Math.min(12, this.speed + 0.25)
      this.ctx.audio.tone(880, 0.05)
      this.spawnFood()
    } else {
      this.snake.pop()
    }
    this.draw()
  }

  private gameOver() {
    this.over = true
    if (this.score > this.high) {
      this.high = this.score
      this.newRecord = true
      void this.ctx.store.set('high', this.high)
    }
    this.ctx.audio.tone(196, 0.3, { gain: 0.06 })
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    titleBar(s, (en ? snakeApp.nameEn : snakeApp.name)!)
    s.textRight(W - 10, 6, `${this.score}`, { size: 11, color: C.PALE })
    // 棋盘：底色 + 淡网格点
    s.fillRect(OX, OY, COLS * CELL, ROWS * CELL, C.WHITE)
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if ((x + y) % 2 === 0) s.fillRect(OX + x * CELL + 5, OY + y * CELL + 5, 2, 2, C.PALE)
    // 食物
    s.fillRect(OX + this.food.x * CELL + 2, OY + this.food.y * CELL + 2, CELL - 4, CELL - 4, C.AMBER)
    // 蛇（头蓝身绿，1px 缝隙）
    this.snake.forEach((p, i) => {
      s.fillRect(OX + p.x * CELL + 1, OY + p.y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? C.BLUE : C.GREEN)
    })
    // 边墙
    for (let i = 0; i < COLS * CELL + 4; i++) {
      s.fillRect(OX - 2 + i, OY - 2, 1, 2, C.INK)
      s.fillRect(OX - 2 + i, OY + BOARD_H, 1, 2, C.INK)
    }
    for (let j = 0; j < BOARD_H + 4; j++) {
      s.fillRect(OX - 2, OY - 2 + j, 2, 1, C.INK)
      s.fillRect(OX + COLS * CELL, OY - 2 + j, 2, 1, C.INK)
    }
    // 分数条
    s.text(10, CONTENT_BOTTOM - 20, `${this.high}`, { size: 11, color: C.GRAY })
    if (this.paused) {
      // 暂停提示条（棋盘保持可见，仅占顶部两行）
      s.fillRect(OX + 25, OY + 6, COLS * CELL - 50, 22, C.DARK)
      s.textCenter(W / 2, OY + 12, str.snakePaused, { size: 13, color: C.WHITE })
    }
    if (this.over) {
      // 半透明观感的结算框
      s.fillRect(20, OY + 60, W - 40, 70, C.DARK)
      s.fillRect(23, OY + 63, W - 46, 64, C.INK)
      s.textCenter(W / 2, OY + 72, str.snakeOver(this.score, this.newRecord), { size: 15, color: C.WHITE })
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        s.textCenter(W / 2, OY + 100, 'OK', { size: 11, color: C.SKY })
      }
    }
    softBar(s, this.over ? 'OK' : str.snakePause, str.msgsBack)
  }
}

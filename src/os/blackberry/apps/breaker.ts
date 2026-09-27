import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rr, disc } from '../graphics'
import { BBApp } from './common'

/**
 * Brick Breaker：黑莓自带经典打砖块。轨迹球左右（方向键）移动挡板，
 * 确定键发球；三命，最高分持久化。
 */

const COLS = 10, ROWS = 5
const BX = 10, BY = 34, BW = 44, BH = 13, GAP = 2
const PADDLE_W = 72, PADDLE_H = 8, PADDLE_Y = 298
const BALL_R = 3
const SPEED = 210

type Mode = 'ready' | 'play' | 'over'

export class BreakerApp extends BBApp {
  private mode: Mode = 'ready'
  private bricks: number[] = []
  private paddleX = 204
  private bx = 240
  private by = PADDLE_Y - 6
  private vx = 0
  private vy = 0
  private score = 0
  private lives = 3
  private high = 0
  private newHigh = false

  protected async onStart() {
    this.high = (await this.ctx.store.get<number>('high')) ?? 0
    this.resetBricks()
    this.ctx.onFrame((dt) => {
      if (this.mode === 'play') this.step(dt)
      this.draw()
    })
  }

  private resetBricks() {
    this.bricks = new Array(COLS * ROWS).fill(1)
  }

  private launch() {
    this.mode = 'play'
    this.vx = SPEED * 0.5 * (Math.random() > 0.5 ? 1 : -1)
    this.vy = -SPEED
  }

  private step(dt: number) {
    const steps = Math.min(4, Math.ceil(dt / 0.008))
    const h = dt / steps
    for (let s = 0; s < steps; s++) this.move(h)
  }

  private move(dt: number) {
    this.bx += this.vx * dt
    this.by += this.vy * dt
    // 墙
    if (this.bx < BALL_R) { this.bx = BALL_R; this.vx = Math.abs(this.vx) }
    if (this.bx > 480 - BALL_R) { this.bx = 480 - BALL_R; this.vx = -Math.abs(this.vx) }
    if (this.by < 22 + BALL_R) { this.by = 22 + BALL_R; this.vy = Math.abs(this.vy) }
    // 挡板
    if (this.vy > 0 && this.by + BALL_R >= PADDLE_Y
      && this.by - BALL_R <= PADDLE_Y + PADDLE_H
      && this.bx >= this.paddleX - BALL_R
      && this.bx <= this.paddleX + PADDLE_W + BALL_R) {
      this.by = PADDLE_Y - BALL_R
      const hit = (this.bx - (this.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2) // -1..1
      this.vx = hit * SPEED * 0.85
      this.vy = -Math.sqrt(Math.max(SPEED * SPEED - this.vx * this.vx, SPEED * 0.35))
      this.ctx.audio.keypad()
    }
    // 掉落
    if (this.by > 320 + BALL_R) {
      this.lives--
      if (this.lives <= 0) {
        this.gameOver()
      } else {
        this.mode = 'ready'
        this.resetBallOnPaddle()
      }
      return
    }
    // 砖块碰撞（扫描重叠格）
    this.hitBricks()
  }

  private resetBallOnPaddle() {
    this.bx = this.paddleX + PADDLE_W / 2
    this.by = PADDLE_Y - BALL_R - 1
    this.vx = 0; this.vy = 0
  }

  private hitBricks() {
    // 找球心所在砖
    const c = Math.floor((this.bx - BX) / (BW + GAP))
    const r = Math.floor((this.by - BY) / (BH + GAP))
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return
    const idx = r * COLS + c
    if (!this.bricks[idx]) return
    this.bricks[idx] = 0
    this.score += 10
    // 判定从水平还是竖直面进入：用球心相对砖中心
    const cellX = BX + c * (BW + GAP) + BW / 2
    const cellY = BY + r * (BH + GAP) + BH / 2
    const dx = this.bx - cellX, dy = this.by - cellY
    if (Math.abs(dx) / BW > Math.abs(dy) / BH) this.vx = dx > 0 ? Math.abs(this.vx) : -Math.abs(this.vx)
    else this.vy = dy > 0 ? Math.abs(this.vy) : -Math.abs(this.vy)
    this.ctx.audio.keypad()
    // 全部清空 → 重铺
    if (this.bricks.every((b) => !b)) {
      this.resetBricks()
      this.mode = 'ready'
      this.resetBallOnPaddle()
    }
  }

  private gameOver() {
    this.mode = 'over'
    if (this.score > this.high) {
      this.high = this.score
      this.newHigh = true
      void this.ctx.store.set('high', this.high)
    }
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.G8)
    // 顶栏
    s.fillRect(0, 0, 480, 22, C.G7)
    s.text(10, 4, this.str.score + ': ' + this.score, { size: 14, color: C.WHITE })
    s.text(200, 4, 'HI: ' + this.high, { size: 14, color: C.GOLD })
    s.textRight(470, 4, '♥'.repeat(Math.max(0, this.lives)), { size: 13, color: C.RED })

    // 砖
    const rowCols = [C.RED, C.GOLD, C.YELLOW, C.GREEN, C.SEL_L]
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!this.bricks[r * COLS + c]) continue
        const x = BX + c * (BW + GAP), y = BY + r * (BH + GAP)
        rr(s, x, y, BW, BH, 2, rowCols[r]!)
      }
    // 挡板
    rr(s, this.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, 4, C.G2)
    // 球
    disc(s, Math.round(this.bx), Math.round(this.by), BALL_R, C.WHITE)

    if (this.mode === 'ready') {
      s.textCenter(240, 250, this.str.launch + ': OK', { size: 16, color: C.G3 })
    } else if (this.mode === 'over') {
      s.fillRect(0, 0, 480, 320, C.G8)
      s.textCenter(240, 110, this.str.gameOver, { size: 30, color: C.WHITE })
      s.textCenter(240, 160, this.str.score + ': ' + this.score, { size: 22, color: C.GOLD })
      if (this.newHigh) s.textCenter(240, 200, this.str.newHigh, { size: 18, color: C.GREEN })
      s.textCenter(240, 250, 'OK', { size: 16, color: C.G3 })
    }
    s.render()
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'over') {
      if (k === 'ok') this.restart()
      return
    }
    if (k === 'left') this.paddleX = Math.max(6, this.paddleX - 26)
    else if (k === 'right') this.paddleX = Math.min(480 - PADDLE_W - 6, this.paddleX + 26)
    else if ((k === 'ok' || k === 'space') && this.mode === 'ready') this.launch()
    else return
    if (this.mode === 'ready') this.resetBallOnPaddle()
  }

  private restart() {
    this.score = 0
    this.lives = 3
    this.newHigh = false
    this.paddleX = 204
    this.resetBricks()
    this.resetBallOnPaddle()
    this.mode = 'ready'
  }
}

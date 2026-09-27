import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'

/**
 * Space Impact：横版卷轴射击（真机手机横持，画面顺时针旋转 90°）。
 * 逻辑坐标系 GW×GH（= 物理 H×W），映射 物理(W-1-y, x)。
 *   2/8（或物理 right/left）上下移动，ok/5 发射；3 命，三种敌机；high 持久化。
 */

interface Bullet {
  x: number
  y: number
  vx: number
}

interface Enemy {
  kind: 0 | 1 | 2
  x: number
  y: number
  hp: number
  base: number
  phase: number
  fireAt: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

interface Star {
  x: number
  y: number
  v: number
}

const SHIP_W = 7
const SHIP_H = 5
const SHIP_X = 8

export const spaceImpactApp: MiniApp = {
  id: 'spaceimpact',
  name: '空间大战',
  nameEn: 'Space Impact',
  icon(s, x, y) {
    // 三角飞船 + 星
    s.bitmap(x, y, [
      '#.....#',
      '##...##',
      '.#####.',
      '..###..',
      '...#...',
    ])
  },
  start(ctx: AppContext) {
    new SpaceImpact(ctx)
  },
}

class SpaceImpact {
  private GW: number
  private GH: number
  private phase: 'title' | 'play' | 'over' = 'title'
  private shipY: number
  private bullets: Bullet[] = []
  private enemies: Enemy[] = []
  private ebullets: Bullet[] = []
  private particles: Particle[] = []
  private stars: Star[] = []
  private score = 0
  private high = 0
  private lives = 3
  private spawnIn = 1.5
  private cool = 0
  private inv = 0
  private scroll = 24
  private blink = 0

  constructor(private ctx: AppContext) {
    this.GW = ctx.screen.h
    this.GH = ctx.screen.w
    this.shipY = (this.GH >> 1) + 4
    void ctx.store.get<number>('high').then((h) => {
      this.high = h ?? 0
    })
    for (let i = 0; i < 26; i++)
      this.stars.push({
        x: Math.random() * this.GW,
        y: Math.random() * this.GH,
        v: 6 + Math.random() * 22,
      })
    ctx.onKey((k) => this.onKey(k))
    ctx.onFrame((dt) => this.tick(dt))
  }

  // ---------- 逻辑→物理 绘制 ----------

  /** 逻辑像素：物理 (W-1-y, x) */
  private pset(x: number, y: number) {
    this.ctx.screen.pset(this.ctx.screen.w - 1 - y, x)
  }

  private rect(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) this.pset(x + i, y + j)
  }

  private frame(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, 1)
    this.rect(x, y + h - 1, w, 1)
    this.rect(x, y, 1, h)
    this.rect(x + w - 1, y, 1, h)
  }

  private bitmap(x: number, y: number, rows: string[]) {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) if (r[i] === '#') this.pset(x + i, y + j)
    })
  }

  private text(x: number, y: number, str: string, size = 9) {
    // 顺时针：逻辑原点 (x,y) → 物理 (W-1-y, x)
    this.ctx.screen.textRot(this.ctx.screen.w - 1 - y, x, str, 1, { size })
  }

  // ---------- 输入 ----------

  private onKey(k: DeviceKey) {
    if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
      return
    }
    if (this.phase !== 'play') {
      if (k === 'ok' || k === 'soft1' || k === '5') this.startGame()
      return
    }
    // 横持（顺时针）：物理 right = 逻辑上，left = 逻辑下
    if (k === '2' || k === 'right') this.shipY = Math.max(9, this.shipY - 2)
    else if (k === '8' || k === 'left') this.shipY = Math.min(this.GH - 6, this.shipY + 2)
    else if (k === 'ok' || k === 'soft1' || k === '5') this.fire()
  }

  private startGame() {
    this.phase = 'play'
    this.score = 0
    this.lives = 3
    this.bullets = []
    this.enemies = []
    this.ebullets = []
    this.particles = []
    this.shipY = (this.GH >> 1) + 4
    this.spawnIn = 1.2
    this.cool = 0
    this.inv = 1.5
    this.scroll = 24
  }

  private fire() {
    if (this.cool > 0) return
    this.cool = 0.22
    this.bullets.push({ x: SHIP_X + SHIP_W, y: this.shipY + 2, vx: 78 })
    this.ctx.audio.tone(880, 0.04, { type: 'square', gain: 0.03 })
  }

  // ---------- 更新 ----------

  private tick(dt: number) {
    this.blink += dt
    this.updateStars(dt)
    if (this.phase === 'play') this.updatePlay(dt)
    this.particles = this.particles.filter((p) => {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      return p.life > 0
    })
    this.draw()
  }

  private updateStars(dt: number) {
    for (const st of this.stars) {
      st.x -= st.v * dt
      if (st.x < 0) {
        st.x = this.GW - 1
        st.y = Math.random() * this.GH
      }
    }
  }

  private updatePlay(dt: number) {
    const level = Math.floor(this.score / 150)
    this.scroll = 24 + level * 4
    this.cool = Math.max(0, this.cool - dt)
    this.inv = Math.max(0, this.inv - dt)

    this.spawnIn -= dt
    if (this.spawnIn <= 0) {
      this.spawn()
      this.spawnIn = Math.max(0.7, 2.1 - level * 0.18) * (0.7 + Math.random() * 0.6)
    }

    this.bullets = this.bullets.filter((b) => {
      b.x += b.vx * dt
      return b.x < this.GW + 2
    })
    this.ebullets = this.ebullets.filter((b) => {
      b.x += b.vx * dt
      return b.x > -2
    })
    this.enemies = this.enemies.filter((e) => {
      e.x -= this.scroll * dt
      e.phase += dt
      if (e.kind === 1) e.y = e.base + Math.round(Math.sin(e.phase * 3) * 10)
      if (e.kind === 2) {
        e.fireAt -= dt
        if (e.fireAt <= 0 && e.x < this.GW - 4 && e.x > SHIP_X + 14) {
          e.fireAt = 1.4 + Math.random()
          this.ebullets.push({ x: e.x - 1, y: e.y + 2, vx: -46 })
        }
      }
      return e.x > -10
    })

    this.collide()
  }

  private spawn() {
    const r = Math.random()
    const y = 10 + Math.random() * (this.GH - 20)
    if (r < 0.55)
      this.enemies.push({ kind: 0, x: this.GW + 2, y: Math.round(y), hp: 1, base: y, phase: 0, fireAt: 0 })
    else if (r < 0.85)
      this.enemies.push({ kind: 1, x: this.GW + 2, y: Math.round(y), hp: 1, base: y, phase: 0, fireAt: 0 })
    else
      this.enemies.push({ kind: 2, x: this.GW + 4, y: Math.round(y) - 3, hp: 3, base: y, phase: 0, fireAt: 1 })
  }

  private hit(x: number, y: number, w: number, h: number, bx: number, by: number, bw: number, bh: number) {
    return x < bx + bw && x + w > bx && y < by + bh && y + h > by
  }

  private collide() {
    // 我弹 → 敌机
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        const ew = e.kind === 2 ? 7 : 5
        const eh = e.kind === 2 ? 6 : 4
        if (this.hit(b.x, b.y, 2, 1, e.x, e.y, ew, eh)) {
          b.x = -99
          e.hp -= 1
          if (e.hp <= 0) {
            e.x = -99
            this.score += e.kind === 0 ? 10 : e.kind === 1 ? 20 : 30
            this.explode(e.x, e.y)
            this.ctx.audio.tone(140, 0.18, { type: 'sawtooth', gain: 0.05 })
          } else {
            this.ctx.audio.tone(300, 0.04, { type: 'square', gain: 0.03 })
          }
          break
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.x > -50)
    this.enemies = this.enemies.filter((e) => e.x > -50)

    if (this.inv > 0) return
    // 敌机 / 敌弹 → 我舰
    let crash = false
    for (const e of this.enemies) {
      const ew = e.kind === 2 ? 7 : 5
      const eh = e.kind === 2 ? 6 : 4
      if (this.hit(SHIP_X, this.shipY, SHIP_W, SHIP_H, e.x, e.y, ew, eh)) {
        e.x = -99
        crash = true
        break
      }
    }
    for (const b of this.ebullets) {
      if (this.hit(SHIP_X, this.shipY, SHIP_W, SHIP_H, b.x, b.y, 2, 1)) {
        b.x = -99
        crash = true
        break
      }
    }
    this.ebullets = this.ebullets.filter((b) => b.x > -50)
    this.enemies = this.enemies.filter((e) => e.x > -50)
    if (crash) this.loseLife()
  }

  private loseLife() {
    this.explode(SHIP_X + 2, this.shipY + 2)
    this.ctx.audio.tone(110, 0.3, { type: 'sawtooth', gain: 0.06 })
    this.lives -= 1
    if (this.lives <= 0) {
      this.phase = 'over'
      if (this.score > this.high) {
        this.high = this.score
        void this.ctx.store.set('high', this.high)
      }
    } else {
      this.inv = 2.4
    }
  }

  private explode(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 8 + Math.random() * 26
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.4,
      })
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    s.clear()
    for (const st of this.stars) this.pset(st.x | 0, st.y | 0)

    if (this.phase === 'title') {
      this.text(4, (this.GH >> 1) - 16, 'SPACE', 12)
      this.text(1, (this.GH >> 1) - 2, 'IMPACT', 12)
      if (Math.floor(this.blink * 2) % 2 === 0)
        this.text(3, (this.GH >> 1) + 14, 'PRESS 5')
      return
    }

    for (const e of this.enemies) this.drawEnemy(e)
    for (const b of this.bullets) this.rect(b.x | 0, b.y, 2, 1)
    for (const b of this.ebullets) this.rect(b.x | 0, b.y, 2, 1)
    for (const p of this.particles) this.pset(p.x | 0, p.y | 0)

    if (this.phase === 'play') {
      // 复活无敌期间闪烁
      if (this.inv <= 0 || Math.floor(this.blink * 10) % 2 === 0) this.drawShip()
    }

    // HUD（逻辑顶部 8px；单色屏仅分隔线，不做实心底）
    this.rect(0, 8, this.GW, 1)
    this.text(2, 1, String(this.score).padStart(5, '0'))
    for (let i = 0; i < this.lives; i++) this.miniShip(this.GW - 4 - i * 5, 3)

    if (this.phase === 'over') {
      this.frame(5, this.shipY - 16, this.GW - 10, 42)
      this.text((this.GW - 24) >> 1, this.shipY - 10, 'GAME')
      this.text((this.GW - 24) >> 1, this.shipY, 'OVER')
      this.text(9, this.shipY + 11, `S ${this.score}`)
      this.text(9, this.shipY + 21, `H ${this.high}`)
    }
  }

  private drawShip() {
    this.bitmap(SHIP_X, this.shipY, [
      '.....#.',
      '.....##',
      '#######',
      '.....##',
      '.....#.',
    ])
  }

  private miniShip(x: number, y: number) {
    this.bitmap(x, y, [
      '.#.',
      '###',
    ])
  }

  private drawEnemy(e: Enemy) {
    if (e.kind === 0) {
      // 直行兵：菱形小机
      this.bitmap(e.x, e.y, [
        '..#..',
        '#####',
        '.#.#.',
      ])
    } else if (e.kind === 1) {
      // 之字兵：叉翼机
      this.bitmap(e.x, e.y, [
        '#..#',
        '####',
        '####',
        '#..#',
      ])
    } else {
      // 重装兵：装甲大块，受击掉像素（hp 3→2→1 逐渐缺角）
      this.bitmap(e.x, e.y, [
        e.hp < 3 ? '.#####.' : '#######',
        '##...##',
        e.hp < 2 ? '##...##' : '#######',
        '##.#.##',
        '.#####.',
      ])
    }
  }
}

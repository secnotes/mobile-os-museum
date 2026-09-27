import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'

/**
 * Pairs II（3310 游戏，菜单 8→3）：记忆翻牌。
 * 6 列 × 4 行 = 24 张（12 对）；2/4/6/8 移动光标，ok 翻牌，
 * 不符 750ms 翻回；完成显示翻牌数，best 记最少翻牌数。
 */

const COLS = 6
const ROWS = 4
const CW = 14
const CH = 9
const OX = 1
const OY = 11

/** 12 个 9×7 区分牌面 */
const FACES: string[][] = [
  [ // 1 心
    '.##...##.',
    '####.####',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  [ // 2 星
    '....#....',
    '....#....',
    '#########',
    '.#######.',
    '..##.##..',
    '.##...##.',
    '##.....##',
  ],
  [ // 3 三角
    '....#....',
    '...###...',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '#########',
  ],
  [ // 4 方块
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  [ // 5 圆
    '..#####..',
    '.#######.',
    '#########',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
  ],
  [ // 6 十字
    '...###...',
    '...###...',
    '#########',
    '#########',
    '#########',
    '...###...',
    '...###...',
  ],
  [ // 7 叉
    '##.....##',
    '.##...##.',
    '..##.##..',
    '...###...',
    '..##.##..',
    '.##...##.',
    '##.....##',
  ],
  [ // 8 月牙
    '...####..',
    '..######.',
    '.##......',
    '###......',
    '.##......',
    '..######.',
    '...####..',
  ],
  [ // 9 闪电
    '######...',
    '.######..',
    '...###...',
    '...####..',
    '..####...',
    '.######..',
    '######...',
  ],
  [ // 10 沙漏
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
  ],
  [ // 11 四叶
    '..##.##..',
    '.########',
    '#########',
    '....#....',
    '#########',
    '.########',
    '..##.##..',
  ],
  [ // 12 T 形
    '#########',
    '#########',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
  ],
]

export const pairsApp: MiniApp = {
  id: 'pairs',
  name: '翻牌配对',
  nameEn: 'Pairs II',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '##...##',
      '##...##',
      '.#####.',
      '##...##',
      '##...##',
    ])
  },
  start(ctx: AppContext) {
    new PairsGame(ctx)
  },
}

class PairsGame {
  private phase: 'title' | 'play' | 'over' = 'title'
  private cards: number[] = []
  private up: boolean[] = []
  private matched: boolean[] = []
  private sel = 0
  private first = -1
  private lock = false
  private flips = 0
  private pairs = 0
  private best = 0
  private dead = false
  private blink = 0

  constructor(private ctx: AppContext) {
    void ctx.store.get<number>('best').then((b) => {
      this.best = b ?? 0
    })
    ctx.onKey((k) => this.onKey(k))
    ctx.onFrame((dt) => {
      this.blink += dt
      this.draw()
    })
  }

  private deal() {
    const ids = [...FACES.keys(), ...FACES.keys()]
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    }
    this.cards = ids
    this.up = new Array(24).fill(false)
    this.matched = new Array(24).fill(false)
    this.sel = 0
    this.first = -1
    this.lock = false
    this.flips = 0
    this.pairs = 0
  }

  private onKey(k: DeviceKey) {
    if (this.dead) return
    if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
      return
    }
    if (this.phase !== 'play') {
      if (k === 'ok' || k === 'soft1' || k === '5') {
        this.deal()
        this.phase = 'play'
      }
      return
    }
    if (this.lock) return
    const col = this.sel % COLS
    const row = (this.sel / COLS) | 0
    if (k === '4' || k === 'left') this.sel = row * COLS + ((col + COLS - 1) % COLS)
    else if (k === '6' || k === 'right') this.sel = row * COLS + ((col + 1) % COLS)
    else if (k === '8' || k === 'up') this.sel = ((row + ROWS - 1) % ROWS) * COLS + col
    else if (k === '2' || k === 'down') this.sel = ((row + 1) % ROWS) * COLS + col
    else if (k === 'ok' || k === 'soft1' || k === '5') this.flip()
  }

  private flip() {
    if (this.up[this.sel] || this.matched[this.sel]) return
    this.up[this.sel] = true
    this.ctx.audio.tone(660, 0.05, { type: 'square', gain: 0.03 })
    if (this.first < 0) {
      this.first = this.sel
      return
    }
    this.flips += 1
    const a = this.first
    const b = this.sel
    this.first = -1
    this.lock = true
    if (this.cards[a] === this.cards[b]) {
      setTimeout(() => {
        if (this.dead) return
        this.matched[a] = true
        this.matched[b] = true
        this.lock = false
        this.pairs += 1
        this.ctx.audio.tone(1046, 0.1, { type: 'square', gain: 0.04 })
        if (this.pairs === 12) this.win()
      }, 300)
    } else {
      setTimeout(() => {
        if (this.dead) return
        this.up[a] = false
        this.up[b] = false
        this.lock = false
        this.ctx.audio.tone(300, 0.08, { type: 'square', gain: 0.03 })
      }, 750)
    }
  }

  private win() {
    this.phase = 'over'
    if (!this.best || this.flips < this.best) {
      this.best = this.flips
      void this.ctx.store.set('best', this.best)
    }
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    s.clear()
    if (this.phase === 'title') {
      s.textCenter(s.w >> 1, 8, 'PAIRS II')
      if (Math.floor(this.blink * 2) % 2 === 0)
        s.textCenter(s.w >> 1, 26, 'PRESS OK')
      return
    }

    // HUD
    s.text(1, 1, `T ${this.flips}`)
    s.textRight(s.w - 1, 1, `B ${this.best}`)
    s.fillRect(0, 9, s.w, 1)

    for (let i = 0; i < 24; i++) {
      const col = i % COLS
      const row = (i / COLS) | 0
      const x = OX + col * CW
      const y = OY + row * CH
      if (this.up[i] || this.matched[i]) {
        const face = FACES[this.cards[i]!]!
        s.bitmap(x + 2, y + 1, face)
      } else {
        // 牌背：实心块留 1px 边
        s.fillRect(x + 1, y + 1, CW - 3, CH - 2)
      }
      if (i === this.sel && this.phase === 'play')
        s.frameRect(x, y, CW - 1, CH - 1)
    }

    if (this.phase === 'over') {
      s.fillRect(12, 14, 60, 22)
      // 反白字：实心块上先挖空字，再整块反白
      s.textCenter(s.w >> 1, 17, 'YOU WIN!', { color: 0 })
      s.invertRect(12, 14, 60, 22)
      s.textCenter(s.w >> 1, 30, `TRIES ${this.flips}`)
    }
  }
}

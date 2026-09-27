import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'

/**
 * Bantumi（3310 游戏，菜单 8→4）：Mancala 播棋，对一层贪心 AI。
 * 板：两排各 6 坑（顶排 AI、底排玩家），端坑各一；初始每坑 4 粒。
 * 规则：跳过对方端坑；末粒落己端坑再走；末粒落己空坑且对坑有种→俘获。
 * 4/6 移动光标，ok 落子；wins 记玩家胜场。
 */

// 下标：0..5 AI 排，6..11 玩家排，12 AI 端坑，13 玩家端坑
const A_STORE = 12
const P_STORE = 13

export const bantumiApp: MiniApp = {
  id: 'bantumi',
  name: '播棋',
  nameEn: 'Bantumi',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '.##.##.',
      '#######',
      '.#.#.#.',
      '#######',
      '.##.##.',
    ])
  },
  start(ctx: AppContext) {
    new BantumiGame(ctx)
  },
}

/** 下一坑（跳过对方端坑） */
function nextPit(cur: number, who: 'p' | 'a'): number {
  if (who === 'p') {
    if (cur === 11) return P_STORE
    if (cur === P_STORE) return 5
    if (cur === 0) return 6
    return cur + 1
  }
  if (cur === 0) return A_STORE
  if (cur === A_STORE) return 11
  if (cur === 6) return 0
  return cur - 1
}

/** 模拟落子：返回 { board, last, again }（不判俘获，只看轨迹） */
function simulate(board: number[], start: number, who: 'p' | 'a') {
  const b = [...board]
  let hand = b[start]!
  b[start] = 0
  let cur = start
  while (hand > 0) {
    cur = nextPit(cur, who)
    b[cur]!++
    hand--
  }
  const myStore = who === 'p' ? P_STORE : A_STORE
  return { board: b, last: cur, again: cur === myStore }
}

class BantumiGame {
  private phase: 'title' | 'play' | 'over' = 'title'
  private board: number[] = []
  private turn: 'p' | 'a' = 'p'
  private sel = 6
  private msg = ''
  private wins = 0
  private dead = false
  private blink = 0
  private busy = false

  constructor(private ctx: AppContext) {
    void ctx.store.get<number>('wins').then((w) => {
      this.wins = w ?? 0
    })
    ctx.onKey((k) => this.onKey(k))
    ctx.onFrame((dt) => {
      this.blink += dt
      this.draw()
    })
  }

  private newGame() {
    this.board = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0]
    this.turn = 'p'
    this.sel = 6
    this.msg = ''
    this.busy = false
  }

  private onKey(k: DeviceKey) {
    if (this.dead) return
    if (k === 'back' || k === 'soft2') {
      this.dead = true
      this.ctx.exit()
      return
    }
    if (this.phase === 'title') {
      if (k === 'ok' || k === 'soft1' || k === '5') {
        this.newGame()
        this.phase = 'play'
      }
      return
    }
    if (this.phase === 'over') {
      if (k === 'ok' || k === 'soft1' || k === '5') {
        this.newGame()
        this.phase = 'play'
      }
      return
    }
    if (this.turn !== 'p' || this.busy) return
    const idx = this.sel - 6
    if (k === '4' || k === 'left') this.sel = 6 + ((idx + 5) % 6)
    else if (k === '6' || k === 'right') this.sel = 6 + ((idx + 1) % 6)
    else if ((k === 'ok' || k === 'soft1' || k === '5') && this.board[this.sel]! > 0)
      this.playerMove()
  }

  // ---------- 落子 ----------

  private playerMove() {
    const r = this.applySow(this.sel, 'p')
    this.ctx.audio.tone(660, 0.06, { type: 'square', gain: 0.03 })
    if (this.checkEnd()) return
    if (r) {
      this.msg = 'AGAIN!'
      return
    }
    this.turn = 'a'
    this.msg = 'PHONE'
    setTimeout(() => { if (!this.dead) this.aiMove() }, 700)
  }

  private aiMove() {
    // 一层贪心：端坑增量 + 连走的最佳额外增量
    let best = -Infinity
    let pick = -1
    for (let i = 0; i < 6; i++) {
      if (this.board[i] === 0) continue
      const before = this.board[A_STORE]!
      const sim = simulate(this.board, i, 'a')
      let v = sim.board[A_STORE]! - before
      if (sim.again) {
        let extra = 0
        for (let j = 0; j < 6; j++) {
          if (sim.board[j] === 0) continue
          const b2 = sim.board[A_STORE]!
          extra = Math.max(extra, simulate(sim.board, j, 'a').board[A_STORE]! - b2)
        }
        v += extra + 1
      }
      if (v > best || (v === best && Math.random() < 0.5)) {
        best = v
        pick = i
      }
    }
    const again = this.applySow(pick, 'a')
    this.ctx.audio.tone(440, 0.06, { type: 'square', gain: 0.03 })
    if (this.checkEnd()) return
    if (again) {
      this.msg = 'PHONE AGAIN'
      setTimeout(() => { if (!this.dead) this.aiMove() }, 800)
      return
    }
    this.turn = 'p'
    this.msg = 'YOU'
  }

  /** 执行落子（含俘获），返回是否末粒落己端坑（再走） */
  private applySow(start: number, who: 'p' | 'a'): boolean {
    const r = simulate(this.board, start, who)
    this.board = r.board
    const myPits = who === 'p' ? [6, 11] : [0, 5]
    const myStore = who === 'p' ? P_STORE : A_STORE
    if (r.last >= myPits[0]! && r.last <= myPits[1]! && this.board[r.last] === 1) {
      const mirror = 11 - r.last
      if (this.board[mirror]! > 0) {
        this.board[myStore]! += this.board[r.last]! + this.board[mirror]!
        this.board[r.last] = 0
        this.board[mirror] = 0
      }
    }
    return r.again
  }

  /** 终局判定：一方坑全空，对方收种；返回是否结束 */
  private checkEnd(): boolean {
    const pEmpty = this.board.slice(6, 12).every((n) => n === 0)
    const aEmpty = this.board.slice(0, 6).every((n) => n === 0)
    if (!pEmpty && !aEmpty) return false
    if (pEmpty) for (let i = 0; i < 6; i++) {
      this.board[A_STORE] += this.board[i]!
      this.board[i] = 0
    }
    else for (let i = 6; i < 12; i++) {
      this.board[P_STORE] += this.board[i]!
      this.board[i] = 0
    }
    this.phase = 'over'
    this.busy = true
    if (this.board[P_STORE]! > this.board[A_STORE]!) {
      this.msg = 'YOU WIN'
      this.wins += 1
      void this.ctx.store.set('wins', this.wins)
    } else {
      this.msg = 'YOU LOSE'
    }
    return true
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    s.clear()
    if (this.phase === 'title') {
      s.textCenter(s.w >> 1, 8, 'BANTUMI')
      if (Math.floor(this.blink * 2) % 2 === 0)
        s.textCenter(s.w >> 1, 26, 'PRESS OK')
      return
    }

    // 端坑
    s.frameRect(1, 12, 12, 18)
    s.frameRect(71, 12, 12, 18)
    this.numCenter(7, 19, this.board[A_STORE]!)
    this.numCenter(77, 19, this.board[P_STORE]!)

    // 两排 6 坑
    for (let i = 0; i < 6; i++) {
      const x = 13 + i * 10
      s.frameRect(x, 12, 8, 8)
      s.frameRect(x, 22, 8, 8)
      this.numCenter(x + 4, 18, this.board[i]!)
      this.numCenter(x + 4, 28, this.board[6 + i]!)
      if (6 + i === this.sel && this.turn === 'p' && this.phase === 'play') {
        s.invertRect(x - 1, 21, 10, 10)
      }
    }

    s.fillRect(0, 32, s.w, 1)
    s.textCenter(s.w >> 1, 35, this.msg || (this.turn === 'p' ? 'YOUR TURN' : 'PHONE'))
    s.text(1, 40, `WINS ${this.wins}`)

    if (this.phase === 'over' && Math.floor(this.blink * 2) % 2 === 0)
      s.textCenter(s.w >> 1, 40, 'OK: AGAIN')
  }

  /** 以 cx 居中绘制小数字（坑内种子数；0 不画） */
  private numCenter(cx: number, cy: number, n: number) {
    if (n === 0) return
    const str = String(n)
    this.ctx.screen.textCenter(cx, cy - 4, str, { size: 9 })
  }
}

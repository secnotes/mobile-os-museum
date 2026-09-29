import type { AppContext } from '../../../../kernel/types'
import type { DeviceKey } from '../../../../hal/input'
import { wpStrings } from '../../strings'
import { C } from '../../palette'
import { W, H, TRAY_H, tray, F_LIGHT, F_REG, F_SEMI , onTrayChange } from '../../ui'

/**
 * 数独（Xbox LIVE Collection）：固定解 + 4 档挖空盘，
 * 选格 → 数字键填入；支持候选笔记、错次统计、完成庆祝。
 */

// 经典有效终盘
const SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

/** 各档保留的提示数 */
const GIVENS = [40, 34, 30, 26]
const LEVEL_LABELS_ZH = ['简单', '普通', '困难', '专家']
const LEVEL_LABELS_EN = ['Easy', 'Normal', 'Hard', 'Expert']

const CELL = 44
const BOARD = CELL * 9
const BX = (W - BOARD) >> 1
const BY = 146

export class SudokuGame {
  private given: number[][] = []
  private entry: number[][] = []
  private notes: Set<number>[][] = []
  private sel: [number, number] = [0, 0]
  private notesMode = false
  private mistakes = 0
  private level = 0
  private done = false
  /** 完成遮罩 overlay（dim + 文字同层） */
  private overCanvas: HTMLCanvasElement | null = null
  private offs: Array<() => void> = []
  private disposed = false

  constructor(private ctx: AppContext, private exitToHub: () => void) {}

  async start() {
    this.newPuzzle(0)
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onTap((x, y) => this.onTap(x, y)))
    this.offs.push(onTrayChange(() => this.draw()))
    this.draw()
  }

  dispose() {
    this.disposed = true
    for (const off of this.offs.splice(0)) off()
  }

  /** 确定性伪随机（线性同余）挖空，保证每档盘固定可复现 */
  private newPuzzle(level: number) {
    this.level = level
    this.mistakes = 0
    this.done = false
    this.overCanvas = null
    this.entry = Array.from({ length: 9 }, () => Array(9).fill(0))
    this.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>()))
    // 深拷贝终盘后挖空
    this.given = SOLUTION.map((r) => r.slice())
    const remove = 81 - GIVENS[level]!
    let seed = 1234 + level * 999
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    let removed = 0
    while (removed < remove) {
      const x = Math.floor(rand() * 9)
      const y = Math.floor(rand() * 9)
      if (!this.given[y]![x]) continue
      this.given[y]![x] = 0
      removed++
    }
  }

  private onKey(k: DeviceKey) {
    if (k === 'back') this.exitToHub()
    else if (/^[1-9]$/.test(k)) this.put(Number(k))
  }

  private put(n: number) {
    if (this.done) return
    const [x, y] = this.sel
    if (this.given[y]![x]) return
    if (this.notesMode) {
      const s = this.notes[y]![x]!
      if (s.has(n)) s.delete(n)
      else s.add(n)
      this.draw()
      return
    }
    this.entry[y]![x] = n
    if (n !== SOLUTION[y]![x]) this.mistakes++
    // 填对后清除相关笔记
    if (n === SOLUTION[y]![x])
      for (let i = 0; i < 9; i++) {
        this.notes[y]![i]!.delete(n)
        this.notes[i]![x]!.delete(n)
      }
    this.checkDone()
    this.draw()
  }

  private checkDone() {
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const v = this.given[y]![x] || this.entry[y]![x]
        if (v !== SOLUTION[y]![x]) return
      }
    this.done = true
  }

  private onTap(x: number, y: number) {
    const str = wpStrings(this.ctx.lang.get())
    // 数字行（y 582–638）
    if (y >= 582 && y < 640) {
      const kw = BOARD / 9
      const n = Math.floor((x - BX) / kw) + 1
      if (n >= 1 && n <= 9) this.put(n)
      return
    }
    // 功能行（y 660–720）：笔记 / 清除 / 难度循环
    if (y >= 660 && y < 722) {
      if (x < BX + 130) this.notesMode = !this.notesMode
      else if (x < BX + 262) {
        const [cx2, cy2] = this.sel
        if (!this.given[cy2]![cx2]) {
          this.entry[cy2]![cx2] = 0
          this.notes[cy2]![cx2]!.clear()
        }
      } else this.newPuzzle((this.level + 1) % 4)
      this.draw()
      return
    }
    // 棋盘选区
    if (x >= BX && y >= BY && x < BX + BOARD && y < BY + BOARD) {
      this.sel = [Math.floor((x - BX) / CELL), Math.floor((y - BY) / CELL)]
      this.draw()
    }
    void str
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.disposed) return
    const s = this.ctx.screen
    const str = wpStrings(this.ctx.lang.get())
    const en = this.ctx.lang.get() === 'en'
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
    s.text(24, TRAY_H + 16, str.sudokuName, { size: 32, font: F_LIGHT(32), color: C.WHITE })
    const levelLabel = en ? LEVEL_LABELS_EN[this.level] : LEVEL_LABELS_ZH[this.level]
    s.text(24, 112, levelLabel!, { size: 24, font: F_REG(24), color: C.GRAY })
    s.textRight(W - 24, 112, `${str.sudokuMistakes} ${this.mistakes}`, {
      size: 24, font: F_REG(24), color: C.GRAY,
    })
    this.drawBoard()
    this.drawKeys(str)
    if (this.done) {
      if (!this.overCanvas) this.buildOver(str)
      s.blit(this.overCanvas!, 0, 0)
    }
    s.render()
  }

  /** 完成 overlay：0.7 黑层 + 三行字（同层合成） */
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
    g.font = F_LIGHT(54)
    g.fillText(str.sudokuComplete, W / 2, 320)
    g.fillStyle = '#8a8a8a'
    g.font = F_REG(26)
    g.fillText(`${str.sudokuMistakes} ${this.mistakes}`, W / 2, 390)
    g.fillStyle = '#ffffff'
    g.font = F_REG(26)
    g.fillText(str.gameNew, W / 2, 450)
    this.overCanvas = cv
  }

  private drawBoard() {
    const s = this.ctx.screen
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    const [selX, selY] = this.sel
    // 同列/同行/同宫淡亮
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const related =
          x === selX || y === selY ||
          (Math.floor(x / 3) === Math.floor(selX / 3) && Math.floor(y / 3) === Math.floor(selY / 3))
        if (related) s.fillRect(BX + x * CELL, BY + y * CELL, CELL, CELL, C.DIM)
      }
    // 数字
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const px = BX + x * CELL
        const py = BY + y * CELL
        const g = this.given[y]![x]
        if (g)
          s.textCenter(px + CELL / 2, py + 9, String(g), {
            size: 30, font: F_SEMI(30), color: C.WHITE,
          })
        else {
          const v = this.entry[y]![x]
          if (v)
            s.textCenter(px + CELL / 2, py + 9, String(v), {
              size: 30,
              font: F_LIGHT(30),
              color: v === SOLUTION[y]![x] ? accent : C.RED,
            })
          else {
            const notes = this.notes[y]![x]!
            for (const n of notes)
              s.text(px + 4 + ((n - 1) % 3) * 13, py + 4 + Math.floor((n - 1) / 3) * 14, String(n), {
                size: 12, font: F_REG(12), color: C.GRAY,
              })
          }
        }
      }
    // 网格线（细格暗，3×3 宫白线）
    for (let i = 0; i <= 9; i++) {
      const thick = i % 3 === 0
      s.fillRect(BX + i * CELL - (thick ? 1 : 0), BY, thick ? 2 : 1, BOARD, thick ? C.WHITE : C.GRAY)
      s.fillRect(BX, BY + i * CELL - (thick ? 1 : 0), BOARD, thick ? 2 : 1, thick ? C.WHITE : C.GRAY)
    }
    // 选中框（强调色）
    s.fillRect(BX + selX * CELL - 1, BY + selY * CELL - 1, CELL + 2, 3, accent)
    s.fillRect(BX + selX * CELL - 1, BY + (selY + 1) * CELL - 2, CELL + 2, 3, accent)
    s.fillRect(BX + selX * CELL - 1, BY + selY * CELL - 1, 3, CELL + 2, accent)
    s.fillRect(BX + (selX + 1) * CELL - 2, BY + selY * CELL - 1, 3, CELL + 2, accent)
  }

  private drawKeys(str: ReturnType<typeof wpStrings>) {
    const s = this.ctx.screen
    const accent = this.ctx.host.getAccent?.() ?? C.BLUE
    // 数字键
    const kw = BOARD / 9
    for (let n = 1; n <= 9; n++) {
      const x = BX + (n - 1) * kw
      s.textCenter(x + kw / 2, 614, String(n), {
        size: 32, font: F_SEMI(32), color: C.WHITE,
      })
    }
    // 功能键
    const buttons = [
      [str.sudokuNote, this.notesMode ? accent : C.DIM],
      [str.sudokuErase, C.DIM],
      ['⟳', C.DIM],
    ] as const
    buttons.forEach(([label, fill], i) => {
      const x = BX + i * 132
      s.fillRect(x, 660, 126, 56, fill)
      s.textCenterV(x + 63, 688, label, { size: 22, font: F_REG(22), color: C.WHITE })
    })
  }

}

import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rrGrad } from './graphics'
import type { PinyinIme } from '../wp7/ime'

export const KB_H = 216
const KB_TOP = 480 - KB_H
const KEY_H = 39

const ROW1 = ['q','w','e','r','t','y','u','i','o','p']
const ROW2 = ['a','s','d','f','g','h','j','k','l']
const ROW3 = ['z','x','c','v','b','n','m']

const NUM1 = ['1','2','3','4','5','6','7','8','9','0']
const NUM2 = ['-','/',':',';','(',')','$','&','@','"']
const NUM3 = ['.',',','?','!',"'"]
const SYM1 = ['[',']','{','}','#','%','^','*','+','=']
const SYM2 = ['_','\\','|','~','<','>','€','£','•','…']
const SYM3 = ['.',',','?','!',"'"]

/** 键位矩形 */
interface KeyRect { x: number; y: number; w: number; h: number }

export type KbAction =
  | { type: 'char'; ch: string }
  | { type: 'back' }
  | { type: 'ret' }
  | { type: 'shift' }
  /** 底行模式键：abc↔123 */
  | { type: 'mode' }
  /** 字母行特殊键：123↔#+= */
  | { type: 'modeSym' }
  | { type: 'ime'; i: number }
  | { type: 'imeBar' }

export class Keyboard {
  mode: 'abc' | '123' | '#+=' = 'abc'
  shift = true
  /** 拼音输入态（博物馆补充：真机 1.0 无中文输入法，此键让中文观众可输入） */
  pinyin = false
  private flash: KeyRect | null = null
  /** 候选条横向滚动 */
  candOff = 0

  constructor(private redraw: () => void) {}

  reset() {
    this.mode = 'abc'
    this.shift = true
    this.candOff = 0
  }

  /** 绘制键盘；ime 在拼音态提供候选 */
  draw(s: Screen, ime: PinyinIme | null, retLabel: string) {
    s.fillRect(0, KB_TOP, 320, KB_H, C.KB_BG)
    s.fillRect(0, KB_TOP, 320, 1, C.GRAY2)
    if (this.pinyin && ime) this.drawCandBar(s, ime)
    if (this.mode === 'abc') this.drawAbc(s)
    else if (this.mode === '123') this.drawSym(s, NUM1, NUM2, NUM3)
    else this.drawSym(s, SYM1, SYM2, SYM3)
    this.drawBottomRow(s, retLabel)
  }

  /** 点按命中 → 动作（含按下高亮闪烁） */
  tap(s: Screen, x: number, y: number, ime: PinyinIme | null): KbAction | null {
    // 候选条
    if (this.pinyin && ime && y >= KB_TOP && y < KB_TOP + 36) {
      const i = this.candHit(x, ime)
      if (i >= 0) { this.candOff = 0; return { type: 'ime', i } }
      return null
    }
    if (y < KB_TOP + (this.pinyin ? 36 : 4)) return null
    const act = this.hit(x, y)
    if (act) {
      const rect = this.findRect(x, y)
      if (rect) this.doFlash(s, rect)
    }
    return act
  }

  /** 候选条横向拖拽（滚候选）；x=当前、px=上一次位置 */
  dragCands(x: number, px: number, ime: PinyinIme) {
    let totalW = 10
    for (const c of ime.cands) totalW += this.candW(c) + 18
    const maxOff = Math.max(0, totalW - 320)
    this.candOff = Math.max(0, Math.min(maxOff, this.candOff + (px - x)))
  }

  // ---------- 绘制 ----------

  private drawAbc(s: Screen) {
    ROW1.forEach((ch, i) => this.letterKey(s, 3 + i * 32, 272, 26, ch))
    ROW2.forEach((ch, i) => this.letterKey(s, 19 + i * 32, 325, 26, ch))
    // Shift
    this.shiftKey(s, 4, 378, 42)
    ROW3.forEach((ch, i) => this.letterKey(s, 52 + i * 32, 378, 26, ch))
    this.deleteKey(s, 278, 378, 38)
  }

  private drawSym(s: Screen, r1: string[], r2: string[], r3: string[]) {
    r1.forEach((ch, i) => this.letterKey(s, 3 + i * 32, 272, 26, ch))
    r2.forEach((ch, i) => this.letterKey(s, 3 + i * 32, 325, 26, ch))
    // #+= / abc
    this.modeKey(s, 4, 378, 42, this.mode === '123' ? '#+=' : '123')
    r3.forEach((ch, i) => this.letterKey(s, 52 + i * 32, 378, 26, ch))
    this.deleteKey(s, 278, 378, 38)
  }

  private drawBottomRow(s: Screen, retLabel: string) {
    // .?123 / ABC
    this.modeKey(s, 4, 432, 52, this.mode === 'abc' ? '.?123' : 'ABC')
    // 拼音切换
    this.smallKey(s, 62, 432, 30, this.pinyin ? 'EN' : '拼')
    // space
    this.spaceKey(s, 98, 432, 132)
    // return
    this.labelKey(s, 236, 432, 80, retLabel)
  }

  private drawCandBar(s: Screen, ime: PinyinIme) {
    s.fillRect(0, KB_TOP, 320, 36, C.GRAY7)
    s.fillRect(0, KB_TOP + 35, 320, 1, C.GRAY5)
    if (!ime.cands.length) {
      s.text(12, KB_TOP + 10, ime.buf || 'pinyin', { size: 14, font: F_REG(14), color: C.GRAY3 })
      return
    }
    let x = 10 - this.candOff
    ime.cands.forEach((c) => {
      const w = this.candW(c) + 18
      s.text(x + 9, KB_TOP + 9, c, { size: 17, font: F_REG(17), color: C.INK })
      s.fillRect(x + w - 1, KB_TOP + 6, 1, 24, C.GRAY5)
      x += w
    })
  }

  private candW(c: string): number {
    // 逐字 measure（避免私有字段）
    return measureCand(c)
  }

  private candHit(x: number, ime: PinyinIme): number {
    let cx = 10 - this.candOff
    for (let i = 0; i < ime.cands.length; i++) {
      const w = this.candW(ime.cands[i]) + 18
      if (x >= cx && x < cx + w) return i
      cx += w
    }
    return -1
  }

  // ---------- 键面 ----------

  private letterKey(s: Screen, x: number, y: number, w: number, ch: string) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    const up = ch.toUpperCase()
    s.textCenter(x + (w >> 1), y + 9, up, { size: 20, font: F_REG(20), color: C.INK })
  }

  private spaceKey(s: Screen, x: number, y: number, w: number) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    // 真机 space 无文字（1.0）
  }

  private labelKey(s: Screen, x: number, y: number, w: number, label: string) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    s.textCenter(x + (w >> 1), y + 12, label, { size: 15, font: F_REG(15), color: C.BLUE })
  }

  private smallKey(s: Screen, x: number, y: number, w: number, label: string) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    s.textCenter(x + (w >> 1), y + 12, label, { size: 14, font: F_BOLD(14), color: this.pinyin ? C.BLUE : C.GRAY2 })
  }

  private modeKey(s: Screen, x: number, y: number, w: number, label: string) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    s.textCenter(x + (w >> 1), y + 12, label, { size: 14, font: F_REG(14), color: C.INK })
  }

  private shiftKey(s: Screen, x: number, y: number, w: number) {
    this.keyFace(s, { x, y, w, h: KEY_H }, this.shift)
    // 向上箭头
    const col = this.shift ? C.BLUE : C.INK
    s.line(x + (w >> 1), y + 24, x + (w >> 1), y + 12, col)
    s.line(x + (w >> 1), y + 12, x + (w >> 1) - 6, y + 18, col)
    s.line(x + (w >> 1), y + 12, x + (w >> 1) + 6, y + 18, col)
  }

  private deleteKey(s: Screen, x: number, y: number, w: number) {
    this.keyFace(s, { x, y, w, h: KEY_H })
    const cx = x + (w >> 1)
    // ⌫：梯形外框 + X
    s.fillRect(cx - 9, y + 12, 15, 13, C.INK)
    s.fillRect(cx - 7, y + 9, 11, 3, C.INK)
    s.fillRect(cx + 4, y + 14, 3, 9, C.INK)
    s.line(cx - 7, y + 14, cx - 2, y + 23, C.WHITE)
    s.line(cx - 2, y + 14, cx - 7, y + 23, C.WHITE)
  }

  private keyFace(s: Screen, r: KeyRect, active = false) {
    if (this.flash && sameRect(this.flash, r)) {
      rrGrad(s, r.x, r.y, r.w, r.h, 6, R.BLUE_BTN)
      return
    }
    rrGrad(s, r.x, r.y, r.w, r.h, 6, active ? R.BLUE_BTN : R.KEY)
  }

  private doFlash(s: Screen, r: KeyRect) {
    this.flash = r
    this.redraw()
    setTimeout(() => {
      this.flash = null
      this.redraw()
      void s
    }, 90)
  }

  // ---------- 命中 ----------

  private hit(x: number, y: number): KbAction | null {
    for (const r of this.allRects())
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.act
    return null
  }

  private findRect(x: number, y: number): KeyRect | null {
    for (const r of this.allRects())
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r
    return null
  }

  private allRects(): Array<KeyRect & { act: KbAction }> {
    const out: Array<KeyRect & { act: KbAction }> = []
    const add = (x: number, y: number, w: number, h: number, act: KbAction) =>
      out.push({ x, y, w, h, act })
    const charOf = (ch: string): KbAction => {
      let c = ch
      if (this.mode === 'abc' && this.shift) c = ch.toUpperCase()
      return { type: 'char', ch: c }
    }
    if (this.mode === 'abc') {
      ROW1.forEach((ch, i) => add(3 + i * 32, 272, 26, KEY_H, charOf(ch)))
      ROW2.forEach((ch, i) => add(19 + i * 32, 325, 26, KEY_H, charOf(ch)))
      add(4, 378, 42, KEY_H, { type: 'shift' })
      ROW3.forEach((ch, i) => add(52 + i * 32, 378, 26, KEY_H, charOf(ch)))
    } else {
      const r1 = this.mode === '123' ? NUM1 : SYM1
      const r2 = this.mode === '123' ? NUM2 : SYM2
      const r3 = this.mode === '123' ? NUM3 : SYM3
      r1.forEach((ch, i) => add(3 + i * 32, 272, 26, KEY_H, { type: 'char', ch }))
      r2.forEach((ch, i) => add(3 + i * 32, 325, 26, KEY_H, { type: 'char', ch }))
      add(4, 378, 42, KEY_H, { type: 'modeSym' })
      r3.forEach((ch, i) => add(52 + i * 32, 378, 26, KEY_H, { type: 'char', ch }))
    }
    add(278, 378, 38, KEY_H, { type: 'back' })
    // 底行
    add(4, 432, 52, KEY_H, { type: 'mode' })
    add(62, 432, 30, KEY_H, { type: 'imeBar' })
    add(98, 432, 132, KEY_H, { type: 'char', ch: ' ' })
    add(236, 432, 80, KEY_H, { type: 'ret' })
    return out
  }
}

function sameRect(a: KeyRect, b: KeyRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function measureCand(c: string): number {
  // ASCII 宽 9px/字；汉字 17px/字
  let w = 0
  for (const ch of c) w += /[一-鿿]/.test(ch) ? 17 : 9
  return w
}

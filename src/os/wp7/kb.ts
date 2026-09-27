/**
 * Mango 虚拟 QWERTY 键盘（可复用组件）：
 * 3 行字母 + 功能行（中/英切换、退格、标点、空格、发送）+ 拼音候选条。
 * 中文经 PinyinIme 出候选，英文直接上屏。信息/便签/日历/IE/搜索共用。
 */
import type { Screen } from '../../hal/screen'
import type { DeviceKey } from '../../hal/input'
import { C } from './palette'
import { roundRect, F_LIGHT, F_REG, F_SEMI } from './ui'
import { PinyinIme } from './ime'
import { wpStrings } from './strings'
import type { AppContext } from '../../kernel/types'

const KEY_W = 44
const KEY_H = 62
const GAP = 5
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const CAND_H = 48

export class MetroKb {
  text = ''
  ime = new PinyinIme()
  mode: 'zh' | 'en' = 'zh'
  private candIdx = 0
  private punctIdx = 0
  /** 发送按钮回调（无则不画发送键，画宽空格） */
  onSend?: () => void

  constructor(
    private ctx: AppContext,
    private redraw: () => void,
  ) {
    // 参数属性：ctx 取强调色/语言，redraw 由宿主应用提供
  }

  /** 字母键行起始 y（候选条在 top-56，键盘整体在 [top-56, top+268]） */
  static get H(): number {
    return 3 * (KEY_H + GAP) + KEY_H + CAND_H + 8
  }

  private accent(): number {
    return this.ctx.host.getAccent?.() ?? C.BLUE
  }

  // ---------- 点按 ----------

  /** 命中键盘区返回 true（已处理） */
  tap(x: number, y: number, top: number): boolean {
    // 候选条
    if (y >= top - CAND_H - 8 && y < top - 8) {
      if (this.mode === 'zh' && this.ime.cands.length) {
        const cw = 480 / this.ime.cands.length
        const i = Math.floor(x / cw)
        const pick = this.ime.pick(i)
        if (pick) this.text += pick
        this.candIdx = 0
        this.redraw()
      }
      return true
    }
    // 字母三行
    for (let r = 0; r < ROWS.length; r++) {
      const row = ROWS[r]!
      const rw = row.length * (KEY_W + GAP) - GAP
      const kx0 = (480 - rw) / 2
      const ky = top + r * (KEY_H + GAP)
      if (y >= ky && y < ky + KEY_H) {
        const i = Math.floor((x - kx0) / (KEY_W + GAP))
        const ch = row[i]
        if (ch) this.feedLetter(ch)
        return true
      }
    }
    // 功能行
    const fy = top + 3 * (KEY_H + GAP)
    if (y >= fy && y < fy + KEY_H) {
      if (x < 90) {
        this.toggleMode()
        return true
      }
      if (x >= 96 && x < 176) {
        this.backspace()
        return true
      }
      if (x >= 182 && x < 246) {
        const str = wpStrings(this.ctx.lang.get())
        this.text += str.punct[this.punctIdx++ % str.punct.length]
        this.redraw()
        return true
      }
      const sendW = this.onSend ? 108 : 0
      if (!this.onSend || x < 362) {
        this.space()
        return true
      }
      if (sendW && x >= 362) {
        this.onSend!()
        return true
      }
    }
    return false
  }

  private feedLetter(ch: string) {
    if (this.mode === 'zh') this.ime.feed(ch)
    else this.text += ch
    this.ctx.audio.keypad()
    this.redraw()
  }

  private toggleMode() {
    this.mode = this.mode === 'zh' ? 'en' : 'zh'
    if (this.mode === 'en') this.ime.reset()
    this.redraw()
  }

  private backspace() {
    if (this.mode === 'zh' && this.ime.backspace() === 'letter') {
      this.redraw()
      return
    }
    this.text = this.text.slice(0, -1)
    this.redraw()
  }

  private space() {
    if (this.mode === 'zh') {
      const out = this.ime.space()
      if (out) this.text += out
    } else this.text += ' '
    this.redraw()
  }

  /** 物理键盘（全键机型）：返回是否消费 */
  key(k: DeviceKey): boolean {
    // 先判单字符：'space' 首字符 s 会误落 a–z 字符串区间
    if (k.length === 1 && k >= 'a' && k <= 'z') {
      this.feedLetter(k)
      return true
    }
    if (k === 'space') {
      this.space()
      return true
    }
    if (k === 'clear') {
      this.backspace()
      return true
    }
    return false
  }

  // ---------- 绘制 ----------

  draw(s: Screen, top: number) {
    const str = wpStrings(this.ctx.lang.get())
    const accent = this.accent()
    // 候选条
    s.fillRect(0, top - CAND_H - 8, 480, CAND_H, this.mode === 'zh' && this.ime.cands.length ? C.DIM : C.BLACK)
    if (this.mode === 'zh' && this.ime.cands.length) {
      const cw = 480 / this.ime.cands.length
      this.ime.cands.forEach((cand, i) => {
        s.textCenter(i * cw + cw / 2, top - CAND_H + 8, cand, {
          size: 28, font: F_LIGHT(28), color: i === this.candIdx ? accent : C.WHITE,
        })
        if (i === this.candIdx) s.fillRect(i * cw + 4, top - 12, cw - 8, 3, accent)
      })
    } else {
      s.text(24, top - CAND_H + 12, this.mode === 'en' ? str.imeEn : str.imeZh, {
        size: 22, font: F_REG(22), color: C.GRAY,
      })
    }
    // 字母三行
    for (let r = 0; r < ROWS.length; r++) {
      const row = ROWS[r]!
      const rw = row.length * (KEY_W + GAP) - GAP
      const kx0 = (480 - rw) / 2
      const ky = top + r * (KEY_H + GAP)
      for (let i = 0; i < row.length; i++) {
        const x = kx0 + i * (KEY_W + GAP)
        roundRect(s, x, ky, KEY_W, KEY_H, 4, C.DIM, null)
        s.textCenter(x + KEY_W / 2, ky + 18, row[i]!, { size: 28, font: F_LIGHT(28), color: C.WHITE })
      }
    }
    // 功能行
    const fy = top + 3 * (KEY_H + GAP)
    roundRect(s, 10, fy, 80, KEY_H, 4, accent, null)
    s.textCenter(50, fy + 18, this.mode === 'zh' ? str.imeZh : str.imeEn, { size: 26, font: F_SEMI(26), color: C.WHITE })
    roundRect(s, 96, fy, 80, KEY_H, 4, C.DIM, null)
    s.textCenter(136, fy + 16, '⌫', { size: 30, font: F_LIGHT(30), color: C.WHITE })
    roundRect(s, 182, fy, 64, KEY_H, 4, C.DIM, null)
    s.textCenter(214, fy + 18, str.punct[0], { size: 26, font: F_LIGHT(26), color: C.WHITE })
    if (this.onSend) {
      roundRect(s, 252, fy, 104, KEY_H, 4, C.DIM, null)
      s.textCenter(304, fy + 18, str.imeSpace, { size: 20, font: F_REG(20), color: C.WHITE })
      roundRect(s, 362, fy, 108, KEY_H, 4, accent, null)
      s.textCenter(416, fy + 18, str.msgSend, { size: 24, font: F_SEMI(24), color: C.WHITE })
    } else {
      roundRect(s, 252, fy, 218, KEY_H, 4, C.DIM, null)
      s.textCenter(361, fy + 18, str.imeSpace, { size: 20, font: F_REG(20), color: C.WHITE })
    }
  }
}

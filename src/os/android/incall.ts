import type { DeviceKey } from '../../hal/input'
import type { Screen } from '../../hal/screen'
import type { AudioSynth } from '../../hal/audio'
import { C } from './palette'
import { W, H, STATUS_H, roundRect } from './ui'
import type { AndroidStrings } from './strings'

type Mode = 'none' | 'sheet' | 'pad' | 'add' | 'adding'

/** 底部选项表：5 项 × 42px */
const ITEM_H = 42
const SHEET_H = ITEM_H * 5

/** 拨号键盘 3×4 几何 */
const KEY_W = 86
const KEY_H = 50
const GAP_X = 10
const GAP_Y = 12
const KEY_X0 = (W - (KEY_W * 3 + GAP_X * 2)) >> 1
const PAD_GRID_TOP = STATUS_H + 92

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const

/**
 * Android 1.0 通话中控件（来电 / 去电共用同一份真机 InCallScreen 行为）：
 * MENU 键弹出底部五项——Dialpad / Speaker / Mute / Hold / Add call；
 * 开关项即时打勾，拨号键盘与添加通话为整屏覆盖页。
 */
export class InCallControls {
  private mode: Mode = 'none'
  private sheetSel = 0
  /** 拨号键盘焦点（KEYS 索引），默认中央 5 */
  private padSel = 4
  private dtmf = ''
  private addNum = ''
  private addTimer: ReturnType<typeof setTimeout> | null = null
  private toast = false
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  speaker = false
  muted = false
  held = false
  /** 添加通话已接通的第二方号码 */
  party: string | null = null

  constructor(private audio: AudioSynth) {}

  dispose() {
    if (this.addTimer) clearTimeout(this.addTimer)
    if (this.toastTimer) clearTimeout(this.toastTimer)
  }

  /** 通话结束：复位全部开关与覆盖页 */
  reset() {
    this.dispose()
    this.addTimer = null
    this.toastTimer = null
    this.mode = 'none'
    this.dtmf = ''
    this.addNum = ''
    this.toast = false
    this.speaker = false
    this.muted = false
    this.held = false
    this.party = null
  }

  get open(): boolean {
    return this.mode !== 'none'
  }

  private toggleMenu() {
    this.mode = this.mode === 'sheet' ? 'none' : 'sheet'
    this.sheetSel = 0
  }

  /** 按键处理；返回 true 表示已消费、调用方需重绘（END 由调用方自行处理） */
  key(k: DeviceKey, repeat: boolean): boolean {
    if (repeat) return false
    if (k === 'menu') {
      if (this.mode === 'adding') return false
      this.toggleMenu()
      return true
    }
    switch (this.mode) {
      case 'sheet':
        return this.sheetKey(k)
      case 'pad':
        return this.padKey(k)
      case 'add':
        return this.addKey(k)
      default:
        return false
    }
  }

  private sheetKey(k: DeviceKey): boolean {
    switch (k) {
      case 'up':
        this.sheetSel = (this.sheetSel + 4) % 5
        return true
      case 'down':
        this.sheetSel = (this.sheetSel + 1) % 5
        return true
      case 'ok':
        this.activateSheet()
        return true
      case 'back':
        this.mode = 'none'
        return true
      default:
        return false
    }
  }

  private activateSheet() {
    switch (this.sheetSel) {
      case 0:
        this.mode = 'pad'
        this.dtmf = ''
        break
      case 1:
        this.speaker = !this.speaker
        break
      case 2:
        this.muted = !this.muted
        break
      case 3:
        this.held = !this.held
        break
      case 4:
        this.mode = 'add'
        this.addNum = ''
        break
    }
  }

  private padKey(k: DeviceKey): boolean {
    if (/^[0-9*#]$/.test(k)) {
      this.pressDtmf(k)
      return true
    }
    switch (k) {
      case 'up':
        this.padSel = (this.padSel + 9) % 12
        return true
      case 'down':
        this.padSel = (this.padSel + 3) % 12
        return true
      case 'left':
        this.padSel = (this.padSel + 11) % 12
        return true
      case 'right':
        this.padSel = (this.padSel + 1) % 12
        return true
      case 'ok':
        this.pressDtmf(KEYS[this.padSel]!)
        return true
      case 'clear':
        this.dtmf = this.dtmf.slice(0, -1)
        return true
      case 'back':
        this.mode = 'none'
        return true
      default:
        return false
    }
  }

  private addKey(k: DeviceKey): boolean {
    if (/^[0-9*#]$/.test(k)) {
      if (this.addNum.length < 12) {
        this.addNum += k
        this.audio.dtmf(k)
      }
      return true
    }
    switch (k) {
      case 'clear':
        this.addNum = this.addNum.slice(0, -1)
        return true
      case 'call':
      case 'ok':
        if (this.addNum.length) this.startAdding()
        return true
      case 'back':
        this.mode = 'none'
        return true
      default:
        return false
    }
  }

  private pressDtmf(k: string) {
    this.audio.dtmf(k)
    if (this.dtmf.length < 18) this.dtmf += k
  }

  private startAdding() {
    this.mode = 'adding'
    this.addTimer = setTimeout(() => {
      this.party = this.addNum
      this.addNum = ''
      this.mode = 'none'
      this.toast = true
      if (this.toastTimer) clearTimeout(this.toastTimer)
      this.toastTimer = setTimeout(() => {
        this.toast = false
      }, 1600)
    }, 1600)
  }

  /** 触屏：返回 true 表示已消费 */
  tap(x: number, y: number): boolean {
    switch (this.mode) {
      case 'sheet': {
        const y0 = H - 6 - SHEET_H
        if (y < y0) {
          this.mode = 'none'
          return true
        }
        const r = Math.floor((y - y0) / ITEM_H)
        if (r >= 0 && r < 5) {
          this.sheetSel = r
          this.activateSheet()
          return true
        }
        return false
      }
      case 'pad':
        return this.padTap(x, y, true)
      case 'add':
        if (this.padTap(x, y, false)) return true
        // 绿色呼叫按钮（H-78 居中，140×44）
        if (y > H - 88 && y < H - 34 && Math.abs(x - (W >> 1)) < 74 && this.addNum.length) {
          this.startAdding()
          return true
        }
        return false
      default:
        return false
    }
  }

  /** 键盘触点命中（pad/add 共用）；返回是否命中 */
  private padTap(x: number, y: number, isPad: boolean): boolean {
    for (let i = 0; i < 12; i++) {
      const col = i % 3
      const row = Math.floor(i / 3)
      const kx = KEY_X0 + col * (KEY_W + GAP_X)
      const ky = PAD_GRID_TOP + row * (KEY_H + GAP_Y)
      if (x >= kx && x < kx + KEY_W && y >= ky && y < ky + KEY_H) {
        if (isPad) this.pressDtmf(KEYS[i]!)
        else if (this.addNum.length < 12) {
          this.addNum += KEYS[i]
          this.audio.dtmf(KEYS[i]!)
        }
        return true
      }
    }
    return false
  }

  // ---------- 绘制 ----------

  /** 覆盖层绘制（在通话底屏之上）；toast 无论 mode 都画 */
  draw(s: Screen, str: AndroidStrings) {
    switch (this.mode) {
      case 'sheet':
        this.drawSheet(s, str)
        break
      case 'pad':
        this.drawPad(s)
        break
      case 'add':
        this.drawAdd(s, str)
        break
      case 'adding':
        this.drawAdding(s, str)
        break
      default:
        break
    }
    if (this.toast) {
      const text = str.icAdded
      const w = Math.max(150, s.measure(text, { size: 13 }) + 40)
      roundRect(s, (W - w) >> 1, (H >> 1) - 24, w, 48, 10, C.INK, null)
      s.textCenterSmooth(W >> 1, (H >> 1) - 6, text, { size: 13, color: C.WHITE, shadow: true })
    }
  }

  /** 底屏状态行：静音 / 扬声器 / 已保持 小胶囊（紧贴主信息下方） */
  drawStateChips(s: Screen, str: AndroidStrings, cx: number, y: number) {
    const chips: string[] = []
    if (this.muted) chips.push(str.icMute)
    if (this.speaker) chips.push(str.icSpeaker)
    if (this.held) chips.push(str.icHeld)
    if (this.party) chips.push(str.icParty(this.party))
    if (!chips.length) return
    const joined = chips.join(' · ')
    s.textCenterSmooth(cx, y, joined, { size: 11, color: this.held ? C.AMBER : C.GRAY })
  }

  private labels(str: AndroidStrings): Array<{ label: string; on: boolean }> {
    return [
      { label: str.icDialpad, on: false },
      { label: str.icSpeaker, on: this.speaker },
      { label: str.icMute, on: this.muted },
      { label: str.icHold, on: this.held },
      { label: str.icAddCall, on: false },
    ]
  }

  private drawSheet(s: Screen, str: AndroidStrings) {
    const y0 = H - 6 - SHEET_H
    // 真机 options menu：底部白色工作表，无标题，橙色聚焦
    roundRect(s, 6, y0, W - 12, SHEET_H, 8, C.WHITE, C.GRAY)
    this.labels(str).forEach((it, i) => {
      const ry = y0 + i * ITEM_H
      if (i === this.sheetSel) s.fillRect(10, ry + 1, W - 20, ITEM_H - 2, C.ORANGE)
      else if (i > 0) s.fillRect(16, ry, W - 32, 1, C.PALE)
      s.textSmooth(42, ry + 14, it.label, {
        size: 14,
        color: i === this.sheetSel ? C.WHITE : C.INK,
        shadow: i === this.sheetSel,
      })
      if (it.on)
        s.textSmooth(18, ry + 13, '✓', {
          size: 14,
          color: i === this.sheetSel ? C.WHITE : C.GREEN,
          shadow: i === this.sheetSel,
        })
    })
  }

  /** 整屏白底键盘页（pad / add 共用底版） */
  private drawPanelBase(s: Screen) {
    s.fillRect(0, STATUS_H, W, H - STATUS_H, C.WHITE)
    for (let i = 0; i < 12; i++) {
      const col = i % 3
      const row = Math.floor(i / 3)
      const kx = KEY_X0 + col * (KEY_W + GAP_X)
      const ky = PAD_GRID_TOP + row * (KEY_H + GAP_Y)
      const focus = i === this.padSel
      s.fillRect(kx, ky, KEY_W, KEY_H, focus ? C.ORANGE : C.PALE)
      colorFrame(s, kx, ky, KEY_W, KEY_H, focus ? C.ORANGE : C.GRAY)
      s.textCenterSmooth(kx + (KEY_W >> 1), ky + 15, KEYS[i]!, {
        size: 20,
        color: focus ? C.WHITE : C.INK,
        shadow: focus,
      })
    }
  }

  private drawPad(s: Screen) {
    this.drawPanelBase(s)
    const shown = this.dtmf || '|'
    s.textCenterSmooth(W >> 1, STATUS_H + 42, shown, { size: 24, color: C.INK })
  }

  private drawAdd(s: Screen, str: AndroidStrings) {
    this.drawPanelBase(s)
    s.textCenterSmooth(W >> 1, STATUS_H + 24, str.icAddHint, { size: 10, color: C.GRAY })
    s.textCenterSmooth(W >> 1, STATUS_H + 48, this.addNum || '|', { size: 22, color: C.INK })
    // 绿色呼叫胶囊
    roundRect(s, (W >> 1) - 70, H - 88, 140, 44, 10, C.DGREEN, null)
    s.textCenterSmooth(W >> 1, H - 72, str.dialerCall, { size: 15, color: C.WHITE, shadow: true })
  }

  private drawAdding(s: Screen, str: AndroidStrings) {
    // 不遮底屏：中央深色胶囊提示「正在呼出」
    const w = 200
    roundRect(s, (W - w) >> 1, (H >> 1) - 30, w, 60, 10, C.INK, null)
    s.textCenterSmooth(W >> 1, H >> 1 - 6, str.icCalling, { size: 15, color: C.WHITE, shadow: true })
  }
}

/** 1px 彩色边框（frameRect 固定 INK，需要其他色时用此） */
function colorFrame(s: Screen, x: number, y: number, w: number, h: number, color: number) {
  s.fillRect(x, y, w, 1, color)
  s.fillRect(x, y + h - 1, w, 1, color)
  s.fillRect(x, y, 1, h, color)
  s.fillRect(x + w - 1, y, 1, h, color)
}

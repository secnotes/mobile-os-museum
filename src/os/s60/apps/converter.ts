import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, softBar, clearContent, frameRectC } from '../ui'

/**
 * 单位换算：长度 / 重量 / 温度 / 汇率（离线固定值）。
 * 上下键切类别，左右键切单位，数字键录入数值。
 */
export const converterApp: MiniApp = {
  id: 'converter',
  name: '单位换算',
  nameEn: 'Converter',
  start(ctx) {
    const ui = new ConvUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

interface UnitDef { zh: string; en: string; toBase: (v: number) => number; fromBase: (v: number) => number }

const CATS: Array<{ zh: string; en: string; units: UnitDef[] }> = [
  {
    zh: '长度', en: 'Length',
    units: [
      { zh: '千米', en: 'km', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { zh: '米', en: 'm', toBase: (v) => v, fromBase: (v) => v },
      { zh: '厘米', en: 'cm', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      { zh: '英里', en: 'mile', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
      { zh: '英尺', en: 'ft', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    ],
  },
  {
    zh: '重量', en: 'Weight',
    units: [
      { zh: '千克', en: 'kg', toBase: (v) => v, fromBase: (v) => v },
      { zh: '克', en: 'g', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      { zh: '磅', en: 'lb', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      { zh: '盎司', en: 'oz', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    ],
  },
  {
    zh: '温度', en: 'Temp',
    units: [
      { zh: '摄氏度', en: '°C', toBase: (v) => v, fromBase: (v) => v },
      { zh: '华氏度', en: '°F', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => v * 9 / 5 + 32 },
      { zh: '开尔文', en: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    zh: '汇率', en: 'FX',
    units: [
      { zh: '人民币', en: 'CNY', toBase: (v) => v, fromBase: (v) => v },
      { zh: '美元', en: 'USD', toBase: (v) => v * 7.1, fromBase: (v) => v / 7.1 },
      { zh: '欧元', en: 'EUR', toBase: (v) => v * 7.8, fromBase: (v) => v / 7.8 },
      { zh: '日元', en: 'JPY', toBase: (v) => v * 0.048, fromBase: (v) => v / 0.048 },
      { zh: '港币', en: 'HKD', toBase: (v) => v * 0.91, fromBase: (v) => v / 0.91 },
    ],
  },
]

class ConvUI {
  private offs: Array<() => void> = []
  private cat = 0
  private from = 0
  private to = 1
  private val = '1'

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'up': this.cat = (this.cat + CATS.length - 1) % CATS.length; this.guard(); break
      case 'down': this.cat = (this.cat + 1) % CATS.length; this.guard(); break
      case 'left': this.to = (this.to + this.units().length - 1) % this.units().length; break
      case 'right': this.to = (this.to + 1) % this.units().length; break
      case 'clear': this.val = this.val.slice(0, -1) || '0'; break
      case 'soft2': case 'back': this.ctx.exit(); return
      default:
        if (/^[0-9]$/.test(k)) this.val = this.val === '0' ? k : this.val + k
        else if (k === '.') { if (!this.val.includes('.')) this.val += '.' }
        else return
    }
    this.draw()
  }

  private units() { return CATS[this.cat]!.units }

  /** 换类别后单位索引可能越界 */
  private guard() {
    const n = this.units().length
    this.from %= n
    this.to %= n
    if (this.from === this.to) this.to = (this.to + 1) % n
  }

  private convert(): string {
    const u = this.units()
    const v = parseFloat(this.val)
    if (isNaN(v)) return '-'
    const base = u[this.from]!.toBase(v)
    const out = u[this.to]!.fromBase(base)
    let s = String(Math.round(out * 1e6) / 1e6)
    if (s.length > 12) s = out.toExponential(5)
    return s
  }

  private draw() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    // 类别行
    const cat = CATS[this.cat]!
    s.textCenter(W / 2, CONTENT_TOP + 10, en ? cat.en : cat.zh, { size: 18, color: C.BLUE })
    s.text(10, CONTENT_TOP + 12, '▲', { size: 9, color: C.GRAY })
    s.textRight(W - 10, CONTENT_TOP + 12, '▼', { size: 9, color: C.GRAY })
    // 源值 + 单位
    const u = this.units()
    const fromU = u[this.from]!
    const toU = u[this.to]!
    s.fillRect(12, 84, W - 24, 42, C.WHITE)
    frameRectC(s, 12, 84, W - 24, 42, C.GRAY)
    s.text(20, 96, this.val, { size: 20, color: C.INK })
    s.textRight(W - 20, 100, en ? fromU.en : fromU.zh, { size: 12, color: C.BLUE })
    // 等号 + 结果
    s.textCenter(W / 2, 136, '▼', { size: 12, color: C.GRAY })
    s.fillRect(12, 152, W - 24, 46, C.NAVY)
    s.text(20, 166, this.convert(), { size: 20, color: C.WHITE })
    s.textRight(W - 20, 170, en ? toU.en : toU.zh, { size: 12, color: C.PALE })
    s.textCenter(W / 2, 220, en ? '◀ select unit ▶' : '◀ 选择目标单位 ▶', { size: 11, color: C.GRAY })
    softBar(s, '', s60Strings(en ? 'en' : 'zh').contactsBack)
  }
}

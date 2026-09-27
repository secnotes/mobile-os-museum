import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../../feature-phone/t9'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, CONTENT_TOP, softBar, clearContent, frameRectC } from '../ui'

/**
 * 英汉双向词典：EN↔CN ~40 词种子库，T9 增量查询。
 */
export const dictionaryApp: MiniApp = {
  id: 'dictionary',
  name: '词典',
  nameEn: 'Dictionary',
  start(ctx) {
    const ui = new DictUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

const WORDS: Array<[string, string]> = [
  ['hello', '你好'], ['phone', '电话；手机'], ['mobile', '移动的；手机'], ['message', '消息；短信'],
  ['camera', '照相机'], ['music', '音乐'], ['calendar', '日历'], ['clock', '时钟'],
  ['computer', '计算机'], ['screen', '屏幕'], ['key', '钥匙；键'], ['number', '号码；数字'],
  ['network', '网络'], ['bluetooth', '蓝牙'], ['battery', '电池'], ['charge', '充电；费用'],
  ['love', '爱'], ['home', '家'], ['work', '工作'], ['friend', '朋友'],
  ['family', '家庭；家人'], ['dinner', '晚餐'], ['water', '水'], ['book', '书；预订'],
  ['time', '时间'], ['day', '天；日子'], ['week', '星期'], ['year', '年'],
  ['morning', '早晨'], ['night', '夜晚'], ['today', '今天'], ['tomorrow', '明天'],
  ['weather', '天气'], ['sun', '太阳'], ['moon', '月亮'], ['star', '星星'],
  ['rain', '雨；下雨'], ['snow', '雪；下雪'], ['road', '道路'], ['city', '城市'],
  ['school', '学校'], ['store', '商店；存储'], ['bank', '银行'], ['money', '钱'],
  ['travel', '旅行'], ['photo', '照片'], ['video', '视频'], ['radio', '收音机'],
]

class DictUI {
  private offs: Array<() => void> = []
  private t9 = new T9()
  private query = ''

  constructor(private ctx: AppContext) {}

  init() {
    this.t9.setMode('en')
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.query += out
    } else switch (k) {
      case 'ok': {
        const out = this.t9.select()
        if (out) this.query += out
        break
      }
      case 'left': this.t9.cycleCand(-1); break
      case 'right': this.t9.cycleCand(1); break
      case 'clear':
        if (this.t9.backspace() === 'char') this.query = this.query.slice(0, -1)
        break
      case 'soft2': case 'back': this.ctx.exit(); return
      default: return
    }
    this.draw()
  }

  private matches(): Array<[string, string]> {
    const q = this.query.trim().toLowerCase()
    if (!q) return WORDS.slice(0, 9)
    return WORDS.filter(([en, zh]) => en.includes(q) || zh.includes(q)).slice(0, 9)
  }

  private draw() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    // 查询框
    s.fillRect(8, CONTENT_TOP + 8, W - 16, 30, C.WHITE)
    frameRectC(s, 8, CONTENT_TOP + 8, W - 16, 30, C.GRAY)
    const hint = this.t9.hint()
    s.text(14, CONTENT_TOP + 17, this.query + hint || '…', { size: 14, color: hint ? C.BLUE : C.INK })
    // 结果列表
    const ms = this.matches()
    if (!ms.length) {
      s.textCenter(W / 2, 130, en ? 'No match' : '未找到词条', { size: 12, color: C.GRAY })
    } else {
      ms.forEach(([w, zh], i) => {
        const y = CONTENT_TOP + 50 + i * 24
        if (i % 2 === 0) s.fillRect(6, y - 2, W - 12, 22, C.WHITE)
        s.text(14, y + 4, w, { size: 12, color: C.BLUE })
        s.text(90, y + 4, zh, { size: 12, color: C.INK })
      })
    }
    softBar(s, '', s60Strings(this.ctx.lang.get()).contactsBack)
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { T9 } from '../t9'
import { osStrings } from '../strings'
import { loadContacts } from '../../../scenario/data'

/**
 * Chat（3310 顶级 '3'；1100 在 Messages 下）：
 * 会话式 IM —— 对方气泡左（框线）、我方气泡右（反白），
 * 气泡内首行带 HH:MM 时间戳；底部 T9 撰写行。
 * 存储 chat:threads（OS 调度同线程回复，回复不进 SMS inbox）。
 */

export interface ChatLine {
  id: number
  mine: boolean
  text: string
  ts: number
}

export interface ChatThread {
  withName: string
  withTel: string
  lines: ChatLine[]
}

export const chatApp: MiniApp = {
  id: 'chat',
  name: '聊天',
  nameEn: 'Chat',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '##....##',
      '##....##',
      '........',
      '..####..',
      '.##..##.',
      '##....##',
    ])
  },
  start(ctx: AppContext) {
    const ui = new ChatUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

const charW = (s: string): number => {
  let w = 0
  for (const ch of s) w += /[ -~]/.test(ch) ? 6 : 9
  return w
}

class ChatUI {
  private threads: ChatThread[] = []
  private thread: ChatThread | null = null
  private t9 = new T9()
  private draft = ''
  private scrollPx = 0
  private dead = false
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  async init() {
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
    this.offs.push(this.ctx.onLang(() => {
      this.t9.setMode(this.ctx.lang.get() === 'en' ? 'en' : 'py')
      this.draw()
    }))
    this.offs.push(this.ctx.every(100, () => {
      const out = this.t9.expire()
      if (out) this.draft += out
      this.draw()
    }))
    this.offs.push(this.ctx.store.onChange((key) => {
      if (key === 'threads') void this.reload()
    }))
    await this.reload()
    this.draw()
  }

  dispose() {
    this.dead = true
    this.offs.forEach((off) => off())
  }

  private async reload() {
    this.threads = (await this.ctx.store.get<ChatThread[]>('threads')) ?? []
    if (!this.threads.length) await this.seedThread()
    this.thread = this.threads[0]!
    this.scrollPx = 0
    this.draw()
  }

  private async seedThread() {
    const contacts = await loadContacts(this.ctx.host.getContacts!.bind(this.ctx.host))
    const mom = contacts[0]
    const str = osStrings(this.ctx.lang.get())
    this.threads = [{
      withName: mom?.name ?? str.recipient,
      withTel: mom?.tel ?? '13912345678',
      lines: [],
    }]
    await this.ctx.store.set('threads', this.threads)
  }

  private onKey(k: DeviceKey) {
    const editing = this.t9.cands.length > 0 || this.draft.length > 0
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.draft += out
    } else if (k === 'ok') {
      const out = this.t9.select()
      if (out) this.draft += out
    } else if (k === 'up') {
      if (editing) this.t9.cycleCand(-1)
      else this.scrollPx = Math.max(0, this.scrollPx - 10)
    } else if (k === 'down') {
      if (editing) this.t9.cycleCand(1)
      else this.scrollPx = Math.min(999, this.scrollPx + 10)
    } else if (k === 'clear') {
      if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'soft1') {
      const t = this.draft.trim()
      if (t) {
        this.draft = ''
        this.ctx.host.chatSend?.(t)
      }
    } else if (k === 'back' || k === 'soft2') {
      this.ctx.exit()
      return
    } else {
      return
    }
    this.draw()
  }

  // ---------- 绘制 ----------

  private draw() {
    if (this.dead || !this.thread) return
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()

    // 标题栏：名字 + 在线
    s.text(1, 1, this.thread.withName.slice(0, 8))
    s.textRight(W - 1, 1, str.chatOnline)
    s.invertRect(0, 0, W, 11)

    const composeH = 12
    const areaY = 11
    const areaH = H - areaY - composeH

    // 消息块：自下而上排布
    const perLine = Math.floor(W / 11) - 1
    const blocks: Array<{ mine: boolean; lines: string[]; h: number }> = []
    for (const ln of this.thread.lines) {
      const t = new Date(ln.ts)
      const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} `
      const body = hm + ln.text
      const lines: string[] = []
      for (let i = 0; i < body.length; i += perLine) lines.push(body.slice(i, i + perLine))
      blocks.push({ mine: ln.mine, lines, h: lines.length * 9 + 5 })
    }

    let totalH = 0
    blocks.forEach((b) => { totalH += b.h + 1 })
    const maxScroll = Math.max(0, totalH - areaH)
    this.scrollPx = Math.min(this.scrollPx, maxScroll)

    let y = areaY + areaH + this.scrollPx
    for (let bi = blocks.length - 1; bi >= 0; bi--) {
      const b = blocks[bi]!
      y -= b.h
      this.drawBubble(b.mine, b.lines, y, W)
      y -= 1
    }

    // 撰写行：模式 + 草稿（空时仅闪烁光标，真机不印占位句）
    s.fillRect(0, H - composeH, W, 1)
    const cy = H - composeH + 2
    s.text(1, cy, { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode])
    const x0 = 20
    let dVis = this.draft
    while (charW(dVis) > W - x0 - 9 && dVis.length) dVis = dVis.slice(1)
    const dw = dVis ? s.text(x0, cy, dVis, { size: 9 }) : 0
    if (Math.floor(Date.now() / 400) % 2 === 0)
      s.fillRect(Math.max(x0, dw), cy + 1, 2, 8)
    s.textRight(W - 1, cy, '↗')
  }

  private drawBubble(mine: boolean, lines: string[], y: number, W: number) {
    const s = this.ctx.screen
    let bw = 4
    for (const ln of lines) bw = Math.max(bw, charW(ln) + 4)
    bw = Math.min(bw, W - 8)
    const h = lines.length * 9 + 5
    const x = mine ? W - bw - 2 : 2
    lines.forEach((ln, i) => s.text(x + 2, y + 2 + i * 9, ln, { size: 9 }))
    if (mine) s.invertRect(x, y, bw, h)
    else s.frameRect(x, y, bw, h)
  }
}

import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad, rr, rrStroke, disc } from '../graphics'
import { BBApp, type MenuCommand, type BBMContact } from './common'

/**
 * BBM（BlackBerry Messenger）：联系人列表（可用性）→ 气泡会话。
 */

type Mode = 'list' | 'chat' | 'compose'

export class BBMApp extends BBApp {
  private mode: Mode = 'list'
  private contacts: BBMContact[] = []
  private sel = 0
  private chatOff = 0
  private draft = ''
  private openId = 0

  protected async onStart() {
    this.contacts = await this.host.getBBM()
    // 轮询宿主：对方回复到达后刷新（host.bbmSend 负责调度回复）
    this.ctx.every(700, async () => {
      const fresh = await this.host.getBBM()
      const changed = fresh.some((f) => {
        const cur = this.contacts.find((c) => c.id === f.id)
        return !cur || cur.msgs.length !== f.msgs.length
      })
      if (changed) {
        this.contacts = fresh
        if (this.mode !== 'compose') this.draw()
      }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    if (this.mode === 'list') this.drawList()
    else if (this.mode === 'chat') this.drawChat()
    else this.drawCompose()
    s.render()
  }

  private header(title: string) {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, title, { size: 18, color: C.WHITE })
  }

  private drawList() {
    this.header(this.str.bbm)
    const s = this.ctx.screen
    this.contacts.forEach((c, i) => {
      const y = 40 + i * 40
      if (i === this.sel) rr(s, 2, y, 476, 36, 5, C.FIELD_BG)
      // 可用性点
      disc(s, 20, y + 18, 7, C.GREEN)
      s.text(36, y + 4, c.name, { size: 17, color: C.INK })
      s.text(36, y + 22, c.status, { size: 12, color: C.G5 })
      // 自己的显示名 / BBM 小标
      s.textRight(468, y + 4, c.msgs.length ? String(c.msgs.length) : '', {
        size: 13, color: C.G5,
      })
    })
  }

  private drawChat() {
    const c = this.contacts.find((x) => x.id === this.openId)
    this.header(c ? c.name : 'BBM')
    const s = this.ctx.screen
    if (!c) return
    let y = 42 - this.chatOff
    c.msgs.forEach((m) => {
      const mine = m.dir === 'out'
      const lines = wrapBubble(m.text, 280, (t) => s.measure(t, { size: 15 }))
      const textW = Math.max(...lines.map((l) => s.measure(l, { size: 15 })))
      const w = Math.max(60, textW + 20)
      const x = mine ? 470 - w : 10
      const h = lines.length * 19 + 14
      rr(s, x, y, w, h, 8, mine ? C.SELECT : C.G2)
      lines.forEach((ln, i) => s.text(x + 10, y + 8 + i * 19, ln, {
        size: 15, color: mine ? C.WHITE : C.INK,
      }))
      // D = delivered（BBM 送达标记）
      if (mine) s.text(x + w - 16, y + h - 12, 'D', { size: 9, color: C.WHITE })
      y += h + 6
    })
    rrStroke(s, 8, 290, 464, 24, 6, C.SELECT)
    s.text(16, 296, this.str.compose + '…', { size: 14, color: C.SELECT })
  }

  private drawCompose() {
    const c = this.contacts.find((x) => x.id === this.openId)
    this.header(c ? c.name : 'BBM')
    const s = this.ctx.screen
    s.fillRect(14, 80, 452, 2, C.G3)
    s.text(14, 96, this.draft || '_', { size: 18, color: C.INK, maxWidth: 450 })
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      const w = s.measure(this.draft, { size: 18 })
      s.fillRect(14 + w, 96, 2, 20, C.SELECT)
    }
    s.text(12, 292, this.str.send + ': Enter', { size: 13, color: C.SELECT })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (this.mode === 'list') this.listKey(k)
    else if (this.mode === 'chat') this.chatKey(k)
    else this.composeKey(k)
  }

  private listKey(k: DeviceKey) {
    const n = this.contacts.length
    if (k === 'up') this.sel = (this.sel + n - 1) % n
    else if (k === 'down') this.sel = (this.sel + 1) % n
    else if (k === 'ok') {
      this.openId = this.contacts[this.sel]!.id
      this.mode = 'chat'
    } else return
    this.draw()
  }

  private chatKey(k: DeviceKey) {
    if (k === 'up') this.chatOff = Math.max(0, this.chatOff - 24)
    else if (k === 'down') this.chatOff += 24
    else if (k === 'ok') { this.mode = 'compose'; this.draft = '' }
    else if (k === 'back') this.mode = 'list'
    else return
    this.draw()
  }

  private composeKey(k: DeviceKey) {
    if (k === 'clear') this.draft = this.draft.slice(0, -1)
    else if (k === 'back') { this.mode = 'chat' }
    else if (k === 'ok') { this.send() ; return }
    else if (k === 'space') this.draft += ' '
    else if (/^[a-z0-9.,]$/.test(k)) this.draft += k
    else return
    this.draw()
  }

  private send() {
    const text = this.draft.trim()
    if (!text) { this.mode = 'chat'; this.draw(); return }
    this.host.bbmSend(this.openId, text)
    const c = this.contacts.find((x) => x.id === this.openId)
    c?.msgs.push({ dir: 'out', text, ts: Date.now() })
    this.draft = ''
    this.mode = 'chat'
  }

  protected menuItems(): MenuCommand[] {
    if (this.mode === 'compose') {
      return [{ label: this.str.send, fn: () => this.send() }]
    }
    if (this.mode === 'chat') {
      return [
        { label: this.str.compose, fn: () => { this.mode = 'compose'; this.draft = ''; this.draw() } },
      ]
    }
    return []
  }
}

// ---------- 折行：CJK 任意字间断点，拉丁文本尽量在空格断词 ----------

function isCJK(ch: string): boolean {
  return ch.codePointAt(0)! > 0x2e00
}

function wrapBubble(text: string, maxWpx: number, measure: (t: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (line && measure(line + ch) > maxWpx) {
      if (isCJK(ch) || isCJK(line[line.length - 1]!)) {
        lines.push(line)
        line = ch
      } else {
        const sp = line.lastIndexOf(' ')
        if (sp > 0) {
          lines.push(line.slice(0, sp))
          line = line.slice(sp + 1) + ch
        } else {
          lines.push(line)
          line = ch
        }
      }
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

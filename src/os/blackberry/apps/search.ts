import type { DeviceKey } from '../../../hal/input'
import type { Contact } from '../../../scenario/data'
import { C } from '../palette'
import { rrGrad, rr } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Search：主屏键入即入；联系人 + 应用的即时结果。
 */

interface Hit {
  kind: 'contact' | 'app'
  label: string
  sub: string
  key: string
}

export class SearchApp extends BBApp {
  private query = ''
  private contacts: Contact[] = []
  private sel = 0
  private hits: Hit[] = []

  constructor(ctx: ConstructorParameters<typeof BBApp>[0], init?: string) {
    super(ctx)
    if (init && /^[a-z]$/.test(init)) this.query = init
  }

  protected async onStart() {
    this.contacts = (await this.host.getContacts()) ?? []
    this.recompute()
  }

  private recompute() {
    const q = this.query.toLowerCase()
    const hits: Hit[] = []
    for (const c of this.contacts) {
      if (!q || c.name.toLowerCase().includes(q) || c.tel.includes(q)) {
        hits.push({ kind: 'contact', label: c.name, sub: c.tel, key: c.tel })
      }
    }
    for (const id of Object.keys(this.str.apps)) {
      const name = this.appName(id)
      if (!q || name.toLowerCase().includes(q) || id.includes(q)) {
        hits.push({ kind: 'app', label: name, sub: id, key: id })
      }
    }
    this.hits = hits
    this.sel = 0
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    // 查询框
    rr(s, 10, 42, 460, 36, 6, C.FIELD_BG)
    s.text(20, 50, this.query || '_', { size: 20, color: C.INK })
    this.hits.slice(0, 7).forEach((h, i) => {
      const y = 88 + i * 32
      if (i === this.sel) rr(s, 4, y, 472, 30, 4, C.FIELD_BG)
      s.text(16, y + 8, h.kind === 'contact' ? '👤' : '▣', { size: 13, color: C.G6 })
      s.text(44, y + 6, h.label, { size: 15, color: C.INK, maxWidth: 220 })
      s.textRight(462, y + 8, h.sub, { size: 12, color: C.G5 })
    })
    s.render()
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (k === 'clear') {
      this.query = this.query.slice(0, -1)
      this.recompute()
    } else if (k === 'space') {
      this.query += ' '
      this.recompute()
    } else if (k === 'ok') {
      this.activate()
      return
    } else if (/^[a-z0-9.]$/.test(k)) {
      this.query += k
      this.recompute()
    } else return
    this.draw()
  }

  private activate() {
    const h = this.hits[this.sel]
    if (!h) return
    if (h.kind === 'app') this.host.launchAppById(h.key)
    else {
      // 联系人：呼叫
      this.host.dial?.(h.key, h.label)
    }
  }

  protected menuItems(): MenuCommand[] {
    return []
  }
}

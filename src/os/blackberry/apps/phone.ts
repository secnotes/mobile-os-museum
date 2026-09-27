import type { DeviceKey } from '../../../hal/input'
import type { CallEntry } from '../../../scenario/data'
import { C } from '../palette'
import { rrGrad, rr } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Phone：号码输入 + 通话记录（全部/未接/已接/已拨）。
 */

type Tab = 'all' | 'missed' | 'received' | 'dialled'

export class PhoneApp extends BBApp {
  private number = ''
  private tab: Tab = 'all'
  private log: CallEntry[] = []

  constructor(ctx: ConstructorParameters<typeof BBApp>[0], init?: string) {
    super(ctx)
    if (init && /^[0-9]$/.test(init)) this.number = init
  }

  protected async onStart() {
    this.log = (await this.host.getCallLog()) as CallEntry[]
  }

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, this.str.apps.phone!, { size: 18, color: C.WHITE })

    // 号码显示
    rr(s, 12, 44, 456, 40, 6, C.FIELD_BG)
    s.text(22, 52, this.number || '_', { size: 26, color: C.INK })
    s.textRight(458, 56, '📞', { size: 18, color: C.GREEN_D })

    this.drawRows()
    this.drawTabs()
    s.render()
  }

  private filtered(): CallEntry[] {
    return this.log.filter((e) => {
      if (this.tab === 'all') return true
      if (this.tab === 'missed') return e.missed
      if (this.tab === 'received') return e.dir === 'in' && !e.missed
      return e.dir === 'out'
    })
  }

  private drawRows() {
    const s = this.ctx.screen
    const rows = this.filtered()
    if (!rows.length) {
      s.textCenter(240, 160, this.str.empty, { size: 15, color: C.G5 })
      return
    }
    rows.slice(0, 6).forEach((e, i) => {
      const y = 92 + i * 30
      // 方向图标
      const col = e.missed ? C.RED : e.dir === 'in' ? C.GREEN_D : C.SELECT
      const mark = e.missed ? '✖' : e.dir === 'in' ? '↙' : '↗'
      s.text(16, y + 8, mark, { size: 14, color: col })
      s.text(44, y + 6, e.name, { size: 15, color: C.INK, maxWidth: 200 })
      s.text(260, y + 8, e.tel, { size: 13, color: C.G6 })
      if (e.dur > 0) s.textRight(462, y + 8, e.dur + 's', { size: 12, color: C.G5 })
    })
  }

  private drawTabs() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    const tabs: Array<[Tab, string]> = [
      ['all', en ? 'All' : '全部'],
      ['missed', this.str.missed],
      ['received', this.str.received],
      ['dialled', this.str.dialled],
    ]
    s.fillRect(0, 288, 480, 32, C.G1)
    tabs.forEach(([id, label], i) => {
      const x = i * 120
      if (id === this.tab) s.fillRect(x, 288, 120, 3, C.SELECT)
      s.text(x + 18, 298, label, {
        size: 14, color: id === this.tab ? C.SELECT : C.G6,
      })
    })
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (/^[0-9*#]$/.test(k)) {
      this.number += k
      this.ctx.audio.dtmf(k)
    } else if (k === 'clear') {
      if (this.number) this.number = this.number.slice(0, -1)
    } else if (k === 'call' || k === 'ok') {
      if (this.number) {
        this.host.dial?.(this.number)
        return
      }
    } else if (k === 'left') {
      this.tab = shiftTab(this.tab, -1)
    } else if (k === 'right') {
      this.tab = shiftTab(this.tab, 1)
    } else return
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    return [
      {
        label: this.str.delete + ' (' + this.str.apps.phone! + ')',
        fn: async () => {
          await this.host.deleteCallLog(this.tab)
          this.log = (await this.host.getCallLog()) as CallEntry[]
          this.draw()
        },
      },
    ]
  }
}

const TABS: Tab[] = ['all', 'missed', 'received', 'dialled']
function shiftTab(t: Tab, d: number): Tab {
  const i = TABS.indexOf(t)
  return TABS[(i + d + 4) % 4]!
}

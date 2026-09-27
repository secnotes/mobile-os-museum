import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import type { CallEntry } from '../../../scenario/data'
import { osStrings } from '../strings'

export type CallLogMode = 'missed' | 'received' | 'dialled' | 'delete' | 'duration'

/**
 * 通话记录（五模式，共享 id 'calllog'）：
 * missed/received/dialled 三个条目列表、delete 删除近期记录、duration 通话计时。
 * 数据不走进 AppStore（裸键 calllog 对应用层不可见），全部经 host 桥读写。
 */
export function calllogApp(mode: CallLogMode): MiniApp {
  return {
    id: 'calllog',
    name: '通话记录',
    nameEn: 'Call register',
    start(ctx: AppContext) {
      if (mode === 'delete') new DeleteUI(ctx)
      else if (mode === 'duration') new DurationUI(ctx)
      else new EntryListUI(ctx, mode)
    },
  }
}

const RH = 11
type DelKind = 'all' | 'missed' | 'received' | 'dialled'

/** 保证 sel 落在滚动窗内，返回是否需要重绘 */
function clampTop(sel: number, top: number, rows: number, total: number) {
  let t = top
  if (sel < t) t = sel
  if (sel >= t + rows) t = sel - rows + 1
  if (t < 0) t = 0
  if (total <= rows) t = 0
  return t
}

const fmtDur = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

// ---------- 条目列表（missed / received / dialled） ----------

class EntryListUI {
  private entries: CallEntry[] = []
  private sel = 0
  private top = 0
  private readonly rows: number

  constructor(private ctx: AppContext, private mode: 'missed' | 'received' | 'dialled') {
    this.rows = Math.floor((ctx.screen.h - 11) / RH)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    void this.reload()
  }

  private async reload() {
    const all = (await this.ctx.host.getCallLog?.()) ?? []
    this.entries = all.filter((e) => this.pred(e)).sort((a, b) => b.ts - a.ts)
    this.sel = Math.min(this.sel, Math.max(0, this.entries.length - 1))
    this.top = clampTop(this.sel, this.top, this.rows, this.entries.length)
    this.draw()
  }

  private pred(e: CallEntry): boolean {
    if (this.mode === 'missed') return e.missed
    if (this.mode === 'received') return e.dir === 'in' && !e.missed
    return e.dir === 'out'
  }

  private onKey(k: DeviceKey) {
    if (!this.entries.length) {
      if (k === 'back' || k === 'soft2' || k === 'clear') this.ctx.exit()
      return
    }
    switch (k) {
      case 'up':
        this.move(-1)
        break
      case 'down':
        this.move(1)
        break
      case 'ok':
      case 'soft1': {
        const e = this.entries[this.sel]!
        this.ctx.host.dial?.(e.tel, e.name)
        return
      }
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit()
        return
    }
  }

  private move(d: number) {
    const n = this.entries.length
    this.sel = (this.sel + d + n) % n
    this.top = clampTop(this.sel, this.top, this.rows, n)
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (!this.entries.length) {
      s.textCenter(W >> 1, (H >> 1) - 4, str.calllogEmpty, { size: 9 })
      s.textRight(W - 1, H - 10, str.calllogBack, { size: 9 })
      return
    }
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      const e = this.entries[i]
      if (!e) break
      const y = r * RH
      s.text(2, y + 1, e.name || e.tel, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    }
    if (this.entries.length > this.rows) {
      const trackH = H - 11
      const thumbY = Math.floor((this.top / this.entries.length) * trackH)
      const thumbH = Math.max(2, Math.floor((this.rows / this.entries.length) * trackH))
      s.fillRect(W - 1, thumbY, 1, thumbH)
    }
    s.text(1, H - 10, str.calllogCall, { size: 9 })
    s.textRight(W - 1, H - 10, str.calllogBack, { size: 9 })
  }
}

// ---------- 删除近期记录 ----------

class DeleteUI {
  private readonly kinds: ReadonlyArray<DelKind> = ['all', 'missed', 'received', 'dialled']
  private sel = 0
  private top = 0
  private readonly rows: number
  private toast = 0

  constructor(private ctx: AppContext) {
    this.rows = Math.floor((ctx.screen.h - 11) / RH)
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.onFrame((dt) => {
      if (this.toast <= 0) return
      this.toast -= dt
      if (this.toast < 0) this.toast = 0
      this.draw()
    })
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.toast) return
    switch (k) {
      case 'up':
        this.sel = (this.sel + this.kinds.length - 1) % this.kinds.length
        break
      case 'down':
        this.sel = (this.sel + 1) % this.kinds.length
        break
      case 'ok':
      case 'soft1':
        void this.doDelete()
        return
      case 'back':
      case 'soft2':
      case 'clear':
        this.ctx.exit()
        return
      default:
        return
    }
    this.top = clampTop(this.sel, this.top, this.rows, this.kinds.length)
    this.draw()
  }

  private async doDelete() {
    await this.ctx.host.deleteCallLog?.(this.kinds[this.sel]!)
    this.toast = 1.4
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    const labels = [str.clDelAll, str.clDelMissed, str.clDelReceived, str.clDelDialled]
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r
      if (i >= this.kinds.length) break
      const y = r * RH
      s.text(2, y + 1, labels[i]!, { size: 9 })
      if (i === this.sel) s.invertRect(0, y, W, RH)
    }
    s.text(1, H - 10, str.menuSelect, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
    if (this.toast > 0) {
      s.frameRect(2, (H >> 1) - 8, W - 4, 15)
      s.textCenter(W >> 1, (H >> 1) - 4, str.clDeleted, { size: 9 })
    }
  }
}

// ---------- 通话计时 ----------

class DurationUI {
  /** 计时基点（清零后只统计此后的通话），存于本应用私有键 */
  private base = 0
  private last = 0
  private inSum = 0
  private outSum = 0
  private phase: 'view' | 'confirm' | 'cleared' = 'view'
  private toast = 0

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.onFrame((dt) => {
      if (this.toast <= 0) return
      this.toast -= dt
      if (this.toast < 0) this.toast = 0
      this.draw()
    })
    void this.reload()
  }

  private async reload() {
    const [all, base] = await Promise.all([
      this.ctx.host.getCallLog?.() ?? [],
      this.ctx.store.get<number>('durBase'),
    ])
    this.base = base ?? 0
    const counted = all.filter((e) => !e.missed && e.ts >= this.base).sort((a, b) => b.ts - a.ts)
    this.last = counted[0]?.dur ?? 0
    this.inSum = counted.filter((e) => e.dir === 'in').reduce((a, e) => a + e.dur, 0)
    this.outSum = counted.filter((e) => e.dir === 'out').reduce((a, e) => a + e.dur, 0)
    this.draw()
  }

  private onKey(k: DeviceKey) {
    if (this.phase === 'confirm') {
      if (k === 'ok' || k === 'soft1') void this.doClear()
      else {
        this.phase = 'view'
        this.draw()
      }
      return
    }
    if (this.phase === 'cleared') {
      this.phase = 'view'
      this.draw()
      return
    }
    if (k === 'ok' || k === 'soft1') {
      this.phase = 'confirm'
      this.draw()
    } else if (k === 'back' || k === 'soft2' || k === 'clear') {
      this.ctx.exit()
    }
  }

  private async doClear() {
    this.base = Date.now()
    await this.ctx.store.set('durBase', this.base)
    this.last = 0
    this.inSum = 0
    this.outSum = 0
    this.phase = 'view'
    this.toast = 1.6
    this.draw()
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    if (this.phase === 'confirm') {
      s.textCenter(W >> 1, (H >> 1) - 10, str.clClearTimers + '?', { size: 9 })
      s.text(8, (H >> 1) + 4, str.menuSelect, { size: 9 })
      s.textRight(W - 8, (H >> 1) + 4, str.menuBack, { size: 9 })
      return
    }
    // 三行：上次 / 来电 / 去电（对齐 9px 字、行间隔 11px）
    const rows: Array<[string, number]> = [
      [str.clDurLast, this.last],
      [str.clDurIn, this.inSum],
      [str.clDurOut, this.outSum],
    ]
    rows.forEach(([label, sec], i) => {
      s.text(2, 2 + i * 11, `${label} ${fmtDur(sec)}`, { size: 9 })
    })
    s.text(1, H - 10, str.clClearTimers, { size: 9 })
    s.textRight(W - 1, H - 10, str.calllogBack, { size: 9 })
    if (this.toast > 0) {
      s.frameRect(2, (H >> 1) - 8, W - 4, 15)
      s.textCenter(W >> 1, (H >> 1) - 4, str.clTimersCleared, { size: 9 })
    }
  }
}

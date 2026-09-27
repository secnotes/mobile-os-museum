/**
 * 情景调度器：进入设备后按 `events` 中每个未触发事件的 delaySec 触发来电/来短信。
 *
 * 与设备共用同一 Store（键 `${deviceId}:events`），设置页写入事件 →
 * onChange 增量调度新增事件；触发后标记 fired=true 写回，避免重复。
 */
import type { Store } from '../hal/storage'
import type { ScenarioEvent } from './data'

export interface ScenarioCallbacks {
  onCall: (tel: string, name?: string) => void
  onSms: (from: string, text: string) => void
}

export class ScenarioScheduler {
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private off: (() => void) | null = null
  private stopped = false

  constructor(
    private store: Store,
    private cb: ScenarioCallbacks,
  ) {}

  async start() {
    await this.scheduleAll()
    // 监听 events 变更：设置页新增/编辑事件后增量调度
    this.off = this.store.onChange((fk) => {
      if (fk.endsWith(':events')) void this.scheduleAll()
    })
  }

  private async scheduleAll() {
    if (this.stopped) return
    const events = (await this.store.get<ScenarioEvent[]>('events')) ?? []
    const live = new Set<number>()
    for (const e of events) {
      if (e.fired) continue
      live.add(e.id)
      if (this.timers.has(e.id)) continue // 已在等待
      const t = setTimeout(() => void this.fire(e.id), Math.max(0, e.delaySec) * 1000)
      this.timers.set(e.id, t)
    }
    // 已删除或已 fired 的事件：取消其定时器
    for (const [id, t] of this.timers) {
      if (!live.has(id)) {
        clearTimeout(t)
        this.timers.delete(id)
      }
    }
  }

  private async fire(id: number) {
    this.timers.delete(id)
    if (this.stopped) return
    const events = (await this.store.get<ScenarioEvent[]>('events')) ?? []
    const e = events.find((x) => x.id === id)
    if (!e || e.fired) return
    // 标记 fired 写回
    e.fired = true
    await this.store.set('events', events)
    if (e.type === 'call') this.cb.onCall(e.from, e.name || undefined)
    else if (e.text != null) this.cb.onSms(e.from, e.text)
  }

  /** 立即触发指定事件（不等待 delaySec）；fired 仍写回 true */
  async triggerNow(id: number) {
    const t = this.timers.get(id)
    if (t) {
      clearTimeout(t)
      this.timers.delete(id)
    }
    await this.fire(id)
  }

  stop() {
    this.stopped = true
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    if (this.off) {
      this.off()
      this.off = null
    }
  }
}

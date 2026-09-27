import type { Store } from './storage'

/**
 * 模拟电池：按真实流逝时间衰减（默认每小时 5%），
 * 快照持久化到存储里 —— 关掉网页，电量也在慢慢流走。
 */
export class Battery {
  private level = 100
  private ts = Date.now()
  private snapLevel = 100
  private isChg = false

  constructor(private store: Store, private decayPerHour = 5) {}

  async init() {
    const d = await this.store.get<{ level: number; ts: number }>('battery')
    if (d && typeof d.level === 'number') {
      this.level = d.level
      this.snapLevel = d.level
      this.ts = d.ts
    }
    this.isChg = (await this.store.get<boolean>('battery:charging')) ?? false
  }

  /** 是否处于充电状态（锁屏充电行据此显示） */
  get charging(): boolean {
    return this.isChg
  }

  async setCharging(v: boolean) {
    this.isChg = v
    await this.store.set('battery:charging', v)
  }

  get percent(): number {
    const p = Math.max(
      0,
      Math.min(100, this.level - ((Date.now() - this.ts) / 3_600_000) * this.decayPerHour),
    )
    // 漂移超过 2% 时落盘快照
    if (this.snapLevel - p >= 2) {
      this.level = p
      this.snapLevel = p
      this.ts = Date.now()
      void this.store.set('battery', { level: Math.round(p), ts: this.ts })
    }
    return Math.round(p)
  }
}

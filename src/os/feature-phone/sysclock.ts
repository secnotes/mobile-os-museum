import type { Store } from '../../hal/storage'

/**
 * 功能机系统时钟：真机时间由网络授时，但允许「时间设置」手动校准。
 * 偏移存设备裸键 time:offset；now() 返回校准后的时间。
 */
export class SysClock {
  private offsetMs = 0

  async load(store: Store) {
    this.offsetMs = (await store.get<number>('time:offset')) ?? 0
  }

  /** 校准时钟到指定时分（秒归零） */
  setTime(store: Store, h: number, m: number) {
    const d = new Date()
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0)
    this.offsetMs = target.getTime() - Date.now()
    void store.set('time:offset', this.offsetMs)
  }

  /** 校准日期到指定年月日 */
  setDate(store: Store, y: number, mo: number, day: number) {
    const d = new Date()
    const target = new Date(2000 + y, mo - 1, day, d.getHours(), d.getMinutes(), d.getSeconds(), 0)
    this.offsetMs = target.getTime() - Date.now()
    void store.set('time:offset', this.offsetMs)
  }

  /** 当前（校准后）时刻 */
  now(): Date {
    return new Date(Date.now() + this.offsetMs)
  }
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { osStrings } from '../strings'

interface SWState {
  run: boolean
  /** 本次启动时刻 */
  startAt: number
  /** 暂停时累计毫秒 */
  acc: number
  /** 计次时刻（相对）毫秒列表 */
  laps: number[]
}

const DEFAULT_STATE: SWState = { run: false, startAt: 0, acc: 0, laps: [] }

/** 秒表（1100 Extras-2；3310 Clock-3）：MM:SS.cs，ok 起停，软1 计次，clear 清零 */
export const stopwatchApp: MiniApp = {
  id: 'stopwatch',
  name: '秒表',
  nameEn: 'Stopwatch',
  start(ctx: AppContext) {
    new StopwatchUI(ctx)
  },
}

const fmt = (ms: number): string => {
  const t = Math.max(0, Math.floor(ms / 10))
  const cs = t % 100
  const sec = Math.floor(t / 100)
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

class StopwatchUI {
  private st: SWState = { ...DEFAULT_STATE }

  constructor(private ctx: AppContext) {
    ctx.onKey((k) => this.onKey(k))
    ctx.onLang(() => this.draw())
    ctx.onFrame(() => this.draw())
    void this.init()
  }

  private async init() {
    const saved = await this.ctx.store.get<SWState>('state')
    // 运行态恢复：以保存时的 elapsed 折算
    if (saved) {
      this.st = saved
      if (this.st.run) {
        const elapsed = Date.now() - this.st.startAt
        this.st.acc = 0
        this.st.startAt = Date.now() - elapsed
      }
    }
    this.draw()
  }

  private elapsed(): number {
    return this.st.acc + (this.st.run ? Date.now() - this.st.startAt : 0)
  }

  private onKey(k: DeviceKey) {
    switch (k) {
      case 'ok':
      case 'soft1':
        if (this.st.run) {
          this.st.acc = this.elapsed()
          this.st.run = false
        } else {
          this.st.startAt = Date.now()
          this.st.run = true
        }
        void this.save(); break
      case 'soft2':
        if (this.st.run) {
          this.st.laps.push(this.elapsed())
          if (this.st.laps.length > 10) this.st.laps.shift()
          void this.save()
        }
        break
      case 'clear':
        if (!this.st.run) this.st = { ...DEFAULT_STATE }
        void this.save(); break
      case 'back':
        if (!this.st.run) { this.ctx.exit(); return }
        // 运行中后台继续
        this.ctx.exit(); return
      default:
        return
    }
    this.draw()
  }

  private async save() {
    await this.ctx.store.set('state', this.st)
  }

  private draw() {
    const s = this.ctx.screen
    const str = osStrings(this.ctx.lang.get())
    const W = s.w
    const H = s.h
    s.clear()
    s.textCenter(W >> 1, 8, str.swTitle, { size: 9 })
    s.textCenter(W >> 1, 20, fmt(this.elapsed()), { size: 14 })
    const n = this.st.laps.length
    if (n) {
      s.text(2, 38, `${str.swLap} ${n}`, { size: 9 })
      s.textRight(W - 2, 38, fmt(this.st.laps[n - 1]!), { size: 9 })
    }
    s.text(1, H - 10, str.swStart, { size: 9 })
    s.textRight(W - 1, H - 10, str.menuBack, { size: 9 })
  }
}

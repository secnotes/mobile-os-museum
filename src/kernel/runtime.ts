import type { AppContext, AppHost, MiniApp, OSDeps } from './types'
import { AppStore } from '../hal/storage'

/**
 * MiniApp 运行时：管理当前应用的生命周期，
 * onKey/onFrame/every 注册的资源在应用退出时统一回收。
 */
export class AppRuntime {
  private cleanups: Array<() => void> = []
  active: MiniApp | null = null

  constructor(
    private deps: OSDeps,
    private onExit: (snapshot?: HTMLCanvasElement, app?: MiniApp) => void,
  ) {}

  launch(app: MiniApp, host: AppHost = {}) {
    this.cleanup()
    this.active = app
    const ctx: AppContext = {
      screen: this.deps.screen,
      input: this.deps.input,
      audio: this.deps.audio,
      battery: this.deps.battery,
      device: this.deps.profile,
      store: new AppStore(this.deps.store, this.deps.profile.id, app.id),
      host,
      lang: this.deps.lang,
      onLang: (fn) => this.track(this.deps.lang.onChange(fn)),
      onKey: (fn) => this.track(this.deps.input.subscribe(fn)),
      onTap: (fn) => this.track(this.deps.input.subscribeTap(fn)),
      onTapUp: (fn) => this.track(this.deps.input.subscribeTapUp(fn)),
      onDrag: (fn) => this.track(this.deps.input.subscribeDrag(fn)),
      onDragEnd: (fn) => this.track(this.deps.input.subscribeDragEnd(fn)),
      onLongPress: (fn) => this.track(this.deps.input.subscribeLongPress(fn)),
      onSwipe: (fn) => this.track(this.deps.input.subscribeSwipe(fn)),
      onWheel: (fn) => this.track(this.deps.input.subscribeWheel(fn)),
      onFrame: (fn) => this.track(this.deps.frames.add(fn)),
      every: (ms, f) => {
        const id = setInterval(f, ms)
        return this.track(() => clearInterval(id))
      },
      exit: () => this.close(),
    }
    const dispose = app.start(ctx)
    if (dispose) this.track(dispose)
  }

  /** 关闭当前应用并回到系统（清屏前截一帧供转场，触发 onExit 回调） */
  close() {
    const app = this.active
    const snapshot =
      typeof this.deps.screen.snapshot === 'function' ? this.deps.screen.snapshot() : undefined
    this.cleanup()
    this.onExit(snapshot, app ?? undefined)
  }

  private cleanup() {
    for (const off of this.cleanups.splice(0)) {
      try {
        off()
      } catch {
        /* 回收失败忽略 */
      }
    }
    this.active = null
    this.deps.input.releaseAll()
    this.deps.screen.clear()
  }

  private track(off: () => void): () => void {
    this.cleanups.push(off)
    return off
  }
}

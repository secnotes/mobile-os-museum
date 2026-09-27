/**
 * 帧循环：所有动画/游戏逻辑挂到同一根 requestAnimationFrame 上，
 * 每帧回调（带 dt 秒）跑完后统一渲染屏幕。
 */
export class FrameHub {
  private fns = new Set<(dt: number) => void>()
  private raf = 0
  private last = 0

  constructor(private render: () => void) {}

  add(fn: (dt: number) => void): () => void {
    this.fns.add(fn)
    if (!this.raf) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.loop)
    }
    return () => {
      this.fns.delete(fn)
    }
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.fns.clear()
  }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, (t - this.last) / 1000)
    this.last = t
    for (const fn of this.fns) fn(dt)
    this.render()
  }
}

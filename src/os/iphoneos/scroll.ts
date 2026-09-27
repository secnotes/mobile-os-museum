/**
 * 惯性滚动器（UIScrollView 行为）：跟手拖拽 + 边缘橡皮筋 + 抬手惯性 + 回弹。
 * 坐标方向：offset 为内容向上滚出的像素（0..maxScroll）。
 */
export class Scroller {
  offset = 0
  private vel = 0 // px/s（正=内容向上）
  private dragging = false
  private startOffset = 0
  private startY = 0
  private lastY = 0
  private lastT = 0
  private maxScroll = 0
  animating = false
  /** 编程滚动目标（如点状态栏回顶）；null = 无 */
  private animTarget: number | null = null

  constructor(private redraw: () => void) {}

  setContent(contentH: number, viewH: number) {
    this.maxScroll = Math.max(0, contentH - viewH)
  }

  /** 编程滚动到指定 offset（快速动画，真机点状态栏回顶的手感） */
  scrollTo(target: number) {
    this.dragging = false
    this.vel = 0
    this.animTarget = Math.max(0, Math.min(this.maxScroll, target))
    this.animating = true
  }

  get down(): boolean {
    return this.dragging
  }

  onDrag(y: number, sy: number) {
    const now = performance.now()
    if (!this.dragging) {
      this.dragging = true
      this.animating = false
      this.startOffset = this.offset
      this.startY = sy
      this.lastY = y
      this.lastT = now
      return
    }
    // 速度采样（px/s）
    const dt = Math.max(1, now - this.lastT) / 1000
    this.vel = (this.lastY - y) / dt
    this.lastY = y
    this.lastT = now
    let target = this.startOffset + (this.startY - y)
    target = this.applyRubber(target)
    this.offset = target
    this.redraw()
  }

  onEnd() {
    this.dragging = false
    this.animating = true // step() 里处理惯性/回弹
  }

  /** 每帧推进；返回 true 表示仍在动 */
  step(dt: number): boolean {
    if (this.dragging) return false
    if (!this.animating) return false
    if (this.animTarget !== null) {
      const d = this.animTarget - this.offset
      if (Math.abs(d) < 0.6) {
        this.offset = this.animTarget
        this.animTarget = null
        this.animating = false
        this.redraw()
        return false
      }
      this.offset += d * Math.min(1, dt * 11)
      this.redraw()
      return true
    }
    if (this.offset < 0 || this.offset > this.maxScroll) {
      // 橡皮筋回弹
      const target = this.clamp(this.offset)
      this.offset += (target - this.offset) * Math.min(1, dt * 11)
      if (Math.abs(target - this.offset) < 0.5) {
        this.offset = target
        this.animating = false
      }
      this.redraw()
      return this.animating
    }
    // 惯性：真机摩擦约 0.0035 剩余/秒级
    this.vel *= Math.pow(0.0009, dt)
    if (Math.abs(this.vel) < 14) {
      this.vel = 0
      this.animating = false
      return false
    }
    this.offset += this.vel * dt
    if (this.offset < 0 || this.offset > this.maxScroll) {
      // 触边：压入橡皮筋并消耗速度
      this.vel *= 0.25
      this.offset = this.applyRubber(this.offset)
    }
    this.redraw()
    return true
  }

  private applyRubber(target: number): number {
    if (target >= 0 && target <= this.maxScroll) return target
    const over = target < 0 ? -target : target - this.maxScroll
    const base = target < 0 ? 0 : this.maxScroll
    // 橡皮筋：阻力随超出量增长（与真机近似的 1/(1+d/c) 公式）
    return base + (target < 0 ? -1 : 1) * (over * 0.38 / (1 + over / 220))
  }

  private clamp(v: number): number {
    return Math.max(0, Math.min(this.maxScroll, v))
  }
}

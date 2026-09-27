/**
 * S60 动效引擎：补间挂到 FrameHub 同一根 rAF。
 * 真机 S60 3rd 的转场特征：视图切换为快速交叉淡入（~150ms），
 * 通过 Screen 快照 + 全彩叠加层（递减 alpha）实现，不改动调色板缓冲。
 */
import type { FrameHub } from '../../hal/frames'
import type { Screen } from '../../hal/screen'

export type Easing = (t: number) => number
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t)
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3

export class Transit {
  private running = false

  constructor(
    private frames: FrameHub,
    private screen: Screen,
  ) {}

  get busy(): boolean {
    return this.running
  }

  /**
   * 交叉淡入：截取当前画面，随后每帧以递减 alpha 盖在新视图上。
   * 调用时机：状态刚切换、旧帧仍在画布上（输入事件中）。
   */
  fade(ms = 150, done?: () => void) {
    const img = this.screen.snapshot()
    const fc = document.createElement('canvas')
    fc.width = img.width
    fc.height = img.height
    const c = fc.getContext('2d')!
    let elapsed = 0
    this.running = true
    const dur = ms / 1000
    const off = this.frames.add((dt) => {
      elapsed += dt
      const p = Math.min(1, elapsed / dur)
      // 清掉上一帧的淡出叠加层（状态本身的位图在调色板缓冲里，不受影响）
      this.screen.clearOverlays()
      if (p < 1) {
        c.clearRect(0, 0, fc.width, fc.height)
        c.globalAlpha = 1 - easeOutCubic(p)
        c.drawImage(img, 0, 0)
        this.screen.blit(fc, 0, 0)
      } else {
        this.running = false
        off()
        done?.()
      }
    })
  }
}

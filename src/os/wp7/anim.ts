/**
 * Metro 动效引擎：所有补间挂到 FrameHub 的同一根 rAF 上。
 * 转场通过 Screen 的快照（前/后两帧）+ 位图叠加层合成 ——
 * 真机 WP 的转场特征：快速（200–260ms）、干净、以 ease-out 收尾，绝不拖泥带水。
 */
import type { FrameHub } from '../../hal/frames'
import type { Screen } from '../../hal/screen'

export type Easing = (t: number) => number
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t)
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3
export const easeInCubic: Easing = (t) => t ** 3

interface Job {
  elapsed: number
  dur: number
  step: (p: number) => void
  done?: () => void
  easing: Easing
}

export class Fx {
  private jobs: Job[] = []
  private off: (() => void) | null = null

  constructor(
    private frames: FrameHub,
    private screen: Screen,
  ) {}

  get busy(): boolean {
    return this.jobs.length > 0
  }

  /** 跑一个补间；step 每帧向 screen 铺像素/叠加层，FrameHub 随后统一 render */
  run(durMs: number, step: (p: number) => void, done?: () => void, easing: Easing = easeOutQuad) {
    this.jobs.push({ elapsed: 0, dur: durMs / 1000, step, done, easing })
    if (!this.off) this.off = this.frames.add((dt) => this.tick(dt))
  }

  cancelAll() {
    this.jobs = []
    this.off?.()
    this.off = null
    this.screen.clearOverlays()
  }

  private tick(dt: number) {
    for (const j of this.jobs) {
      j.elapsed += dt
      const p = Math.min(1, j.elapsed / j.dur)
      j.step(j.easing(p))
      if (p >= 1) j.done?.()
    }
    this.jobs = this.jobs.filter((j) => j.elapsed < j.dur)
    if (!this.jobs.length) {
      this.off?.()
      this.off = null
    }
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 开始屏 → 应用列表：列表从右滑入，开始屏向左轻推 */
export function slideOpen(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, done: () => void, ms = 260,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(before, Math.round(-46 * p), 0, { w: W, h: H })
    screen.blit(after, Math.round(W * (1 - p)), 0, { w: W, h: H })
  }, done)
}

/** 应用列表 → 开始屏：列表向右滑出，开始屏归位 */
export function slideClose(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, done: () => void, ms = 260,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(after, Math.round(-46 * (1 - p)), 0, { w: W, h: H })
    screen.blit(before, Math.round(W * p), 0, { w: W, h: H })
  }, done)
}

/** 点磁贴：磁贴矩形展开为全屏 */
export function morphOpen(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, r: Rect, done: () => void, ms = 240,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(before, 0, 0, { w: W, h: H })
    const w = r.w + (W - r.w) * p
    const h = r.h + (H - r.h) * p
    screen.blit(after, Math.round(r.x * (1 - p)), Math.round(r.y * (1 - p)), {
      w: Math.round(w), h: Math.round(h), sx: 0, sy: 0, sw: W, sh: H, smooth: true,
    })
  }, done)
}

/** 返回：全屏应用收缩回磁贴矩形，露出开始屏 */
export function morphClose(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, r: Rect, done: () => void, ms = 240,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(after, 0, 0, { w: W, h: H })
    const w = W - (W - r.w) * p
    const h = H - (H - r.h) * p
    screen.blit(before, Math.round(r.x * p), Math.round(r.y * p), {
      w: Math.round(w), h: Math.round(h), sx: 0, sy: 0, sw: W, sh: H, smooth: true,
    })
  }, done)
}

/** 锁屏上滑解锁：锁屏壁纸向上退出，露出开始屏 */
export function unlockRise(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, done: () => void, ms = 240,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(after, 0, 0, { w: W, h: H })
    screen.blit(before, 0, Math.round(-H * p), { w: W, h: H })
  }, done)
}

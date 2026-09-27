/**
 * Android 1.0 动效引擎：所有补间挂到 FrameHub 的同一根 rAF 上。
 * 真机参数：Activity 横向滑入 ~150ms、锁屏淡入淡出 ~150ms、抽屉上滑 ~220ms，
 * 干脆利落、ease-out 收尾；动画期间系统层抑制按键。
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

/** 整屏交叉淡入淡出（锁屏亮灭 / 对话框底） */
export function crossFade(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, done: () => void, ms = 150,
) {
  fx.run(ms, (p) => {
    screen.clearOverlays()
    screen.blit(before, 0, 0, { w: W, h: H })
    // 半透明叠加：用临时 canvas 携带 alpha
    const c = fadeCanvas(after, p)
    screen.blit(c, 0, 0, { w: W, h: H })
  }, done)
}

/** 横向滑动转场（Activity 进入/退出：真机 ~150ms） */
export function slideX(
  fx: Fx, screen: Screen, W: number, H: number,
  before: CanvasImageSource, after: CanvasImageSource, done: () => void,
  opts: { ms?: number; enter?: boolean } = {},
) {
  const ms = opts.ms ?? 150
  const enter = opts.enter ?? true
  fx.run(ms, (p) => {
    screen.clearOverlays()
    if (enter) {
      screen.blit(before, Math.round(-W * 0.22 * p), 0, { w: W, h: H })
      screen.blit(after, Math.round(W * (1 - p)), 0, { w: W, h: H })
    } else {
      screen.blit(before, Math.round(W * p), 0, { w: W, h: H })
      screen.blit(after, Math.round(-W * 0.22 * (1 - p)), 0, { w: W, h: H })
    }
  }, done)
}

let fadeCvs: HTMLCanvasElement | null = null
let fadeCtx: CanvasRenderingContext2D | null = null
/** 生成带全局 alpha 的整屏画布（同一画布复用） */
export function fadeCanvas(img: CanvasImageSource, alpha: number, W = 320, H = 480): HTMLCanvasElement {
  const c = (fadeCvs ??= document.createElement('canvas'))
  if (c.width !== W || c.height !== H) {
    c.width = W
    c.height = H
  }
  const g = (fadeCtx ??= c.getContext('2d')!)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.clearRect(0, 0, W, H)
  g.globalAlpha = alpha
  g.drawImage(img, 0, 0, W, H)
  return c
}

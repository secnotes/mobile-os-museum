import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { rrGrad, disc } from '../graphics'

/**
 * 程序化「照片」：确定性 seed → 天空渐变 + 太阳/月 + 丘陵。
 * Photos 与 Camera 共用。
 */
export function drawPhotoArt(s: Screen, x: number, y: number, w: number, h: number, seed: number) {
  const rng = mulberry(seed)
  // 天空：三种时段
  const skyKind = rng() % 3
  const skyRamp = skyKind === 0 ? R.SKY : skyKind === 1 ? R.LOCK_V : R.IPOD
  rrGrad(s, x, y, w, h, 0, skyRamp)
  // 太阳/月亮
  const sunR = Math.round(h * (0.1 + (rng() % 8) / 100))
  const sx = x + Math.round(w * (0.15 + (rng() % 60) / 100))
  const sy = y + Math.round(h * (0.12 + (rng() % 30) / 100))
  disc(s, sx, sy, sunR, skyKind === 1 ? C.WHITE : C.YELLOW)
  // 丘陵：两排大圆扫描线
  const hills = skyKind === 2 ? [C.PURPLE, C.PINK] : [C.GREEN, C.GREEN_D]
  for (let layer = 0; layer < 2; layer++) {
    const cx = x + Math.round(w * ((rng() % 80) / 100))
    const r = Math.round(w * (0.5 + (rng() % 50) / 100))
    const cy = y + Math.round(h * (0.62 + layer * 0.16))
    fillDome(s, cx, cy, r, y + h, hills[layer]!)
  }
}

/** 下半圆（丘陵），裁到 bottom */
function fillDome(s: Screen, cx: number, cy: number, r: number, bottom: number, v: number) {
  for (let dy = 0; dy <= r; dy++) {
    const yy = cy + dy
    if (yy >= bottom) break
    const w = Math.round(Math.sqrt(r * r - dy * dy))
    s.fillRect(cx - w, yy, w * 2, 1, v)
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
}

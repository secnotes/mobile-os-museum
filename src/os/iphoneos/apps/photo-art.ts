import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { rrGrad, disc } from '../graphics'
import { stockBitmap } from '../../stockPhotos'

/**
 * 照片绘制：有素材 src 且位图已加载时 blit 真实照片（cover 填充），
 * 否则用确定性 seed 程序化生成（天空渐变 + 太阳/月 + 丘陵）。
 * Photos 与 Camera 共用。
 */
export function drawPhotoArt(s: Screen, x: number, y: number, w: number, h: number, seed: number, src?: string) {
  if (src) {
    const bmp = stockBitmap(src)
    if (bmp) {
      const iw = (bmp as ImageBitmap).width || 640, ih = (bmp as ImageBitmap).height || 640
      const sc = Math.max(w / iw, h / ih)
      const dw = iw * sc, dh = ih * sc
      s.blit(bmp, x + (w - dw) / 2, y + (h - dh) / 2, { w: dw, h: dh, smooth: true })
      return
    }
  }
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

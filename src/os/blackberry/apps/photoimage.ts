import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { disc } from '../graphics'

/**
 * 相机"成像"：由整数种子生成的程序化风景（天空 / 太阳 / 山 / 草地）。
 */

function hash(seed: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= salt
  return (h >>> 0)
}

export function drawPhotoImage(
  s: Screen, seed: number,
  x0: number, y0: number, w: number, h: number,
) {
  const skyH = Math.round(h * 0.62)
  // 天空：5 级蓝渐变
  const skyCols = [C.WP0, C.WP1, C.WP2, C.WP3, C.WP4]
  for (let y = 0; y < skyH; y++) {
    const idx = Math.min(4, Math.floor(y / skyH * 5))
    s.fillRect(x0, y0 + y, w, 1, skyCols[idx]!)
  }
  // 太阳
  const sunX = x0 + 12 + hash(seed, 1) % (w - 24)
  const sunY = y0 + 10 + hash(seed, 2) % (skyH - 30)
  const sunR = 7 + hash(seed, 3) % 5
  disc(s, sunX, sunY, sunR + 2, C.YELLOW)
  disc(s, sunX, sunY, sunR, C.GOLD)

  // 远山（三角扫描线）
  const drawHill = (peakFrac: number, baseY: number, hgt: number, col: number) => {
    const peakX = x0 + Math.round(w * peakFrac)
    const topY = baseY - hgt
    for (let y = topY; y < baseY; y++) {
      const t = (y - topY) / hgt // 0..1
      const half = Math.round((w * 0.55) * t)
      s.fillRect(peakX - half, y, half * 2, 1, col)
    }
  }
  drawHill(0.3 + (hash(seed, 4) % 30) / 100, y0 + skyH + 8, Math.round(h * 0.34), C.G6)
  drawHill(0.65 + (hash(seed, 5) % 25) / 100, y0 + skyH + 4, Math.round(h * 0.28), C.G7)

  // 草地
  for (let y = skyH; y < h; y++) {
    const t = (y - skyH) / (h - skyH)
    s.fillRect(x0, y0 + y, w, 1, t < 0.5 ? C.GREEN : C.GREEN_D)
  }
  // 草丛点缀
  for (let i = 0; i < w; i += 5) {
    if (hash(seed, 100 + i) % 3 === 0) {
      s.fillRect(x0 + i, y0 + h - 3 - hash(seed, i) % 3, 1, 3, C.GREEN_D)
    }
  }
}

import type { Screen } from '../../hal/screen'
import { C, R } from './palette'

/**
 * 锁屏地球壁纸（真机 1.0 经典地球）。
 * 逐像素 value-noise：海洋深浅 + 大陆色块 + 极地冰盖 + 云层 + 大气边缘光。
 */

const CX = 160
const CY = 300
const GR = 112

// 确定性整数哈希 → [0,1)
function hash(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}
function smooth(t: number) {
  return t * t * (3 - 2 * t)
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = smooth(x - ix), fy = smooth(y - iy)
  const a = hash(ix, iy), b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(x: number, y: number): number {
  let v = 0, amp = 0.55, f = 1
  for (let o = 0; o < 4; o++) {
    v += amp * vnoise(x * f, y * f)
    amp *= 0.5
    f *= 2.05
  }
  return v
}

/** Aqua 水波壁纸：深蓝纵向渐变 + 斜向波光 + 稀疏亮点 */
export function drawAquaWallpaper(s: Screen) {
  const rng = R.WEATHER_BLUE
  const [start, n] = rng
  for (let y = 0; y < 480; y++) {
    const t = Math.floor((y / 479) * (n - 1))
    s.fillRect(0, y, 320, 1, start + t)
  }
  for (let y = 6; y < 480; y += 9)
    for (let x = (y & 16 ? 4 : 14); x < 320; x += 26)
      if (((x + y) & 3) === 0) s.pset(x, y, C.WHITE)
}

export function drawEarthWallpaper(s: Screen) {
  const r2 = GR * GR
  // 大气边缘光（外环，稀疏 2px）
  for (let dy = -GR - 2; dy <= GR + 2; dy++)
    for (let dx = -GR - 2; dx <= GR + 2; dx++) {
      const d = dx * dx + dy * dy
      if (d <= r2 || d > (GR + 2) * (GR + 2)) continue
      if (((dx * 3 + dy) & 3) === 0) s.pset(CX + dx, CY + dy, C.EARTH_RIM)
    }
  for (let py = CY - GR; py <= CY + GR; py++) {
    const dy = py - CY
    const half = Math.round(Math.sqrt(r2 - dy * dy))
    const lat = dy / GR // -1..1
    for (let px = CX - half; px <= CX + half; px++) {
      const ux = (px - CX) / GR
      // 球面经度拉伸（两极收窄感）
      const n = fbm(ux * 3.0 + 11.7, lat * 3.0 + 4.3)
      const cl = fbm(ux * 3.4 + 40.1, lat * 3.4 - 12.7)
      const pole = Math.abs(lat)
      let v: number
      if (pole > 0.80 - n * 0.16 && ((px + py * 2) & 1) === 0) {
        v = C.EARTH_ICE
      } else if (n > 0.55) {
        // 陆地：纬度带 → 丛林/荒漠/苔原
        if (pole < 0.28) v = C.EARTH_LD1
        else if (pole < 0.5 && n < 0.68) v = C.EARTH_LD3
        else v = C.EARTH_LD2
      } else {
        v = n < 0.36 ? C.EARTH_OC : C.EARTH_OC2
      }
      // 边缘暗化（球面感）
      const edge = Math.sqrt(ux * ux + lat * lat)
      if (edge > 0.86 && ((px + py) & 1) === 0) v = C.EARTH_OC
      // 云层（稀疏点灯近似半透明白）
      if (cl > 0.62 && ((px * 3 + py) & 2) === 0) v = C.WHITE
      s.pset(px, py, v)
    }
  }
}

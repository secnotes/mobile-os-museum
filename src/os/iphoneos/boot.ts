import type { Screen } from '../../hal/screen'
import { C } from './palette'

/** 开机总时长（秒）：真机约 20s+，博物馆压缩到 3s */
export const BOOT_TOTAL = 3

/**
 * 开机动画：黑屏 → 0.25s 后 Apple logo 持续到加载完成 → 直接进锁屏。
 * 真机 1.0 无白闪/无进度条/无 spinner，仅黑底 Apple logo。
 */
export function drawBoot(s: Screen, t: number) {
  s.fillRect(0, 0, 320, 480, C.BLACK)
  if (t >= 0.25) drawApple(s, 160, 240)
}

/**
 * Apple logo（1977 矢量，iPhone 1.0 沿用）：
 * 椭圆果身（接近方形）+ 顶部叶根 V 凹 + 底部双臀凹 + 右侧咬口 + 右上斜叶。
 * 逐行扫描，每行产出 0–2 段（V 凹/臀凹会把中线切开）。
 */
function drawApple(s: Screen, cx: number, cy: number) {
  const v = C.WHITE
  const rx = 23 // 果身半宽
  const ry = 24 // 果身半高（略高于宽，真机果身近方略瘦）
  const by = cy + 6 // 果身中心

  for (let y = by - ry; y <= by + ry; y++) {
    const yy = y - by
    const dx = rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)))
    let l = cx - dx
    let r = cx + dx
    if (r < l) continue

    // 顶部叶根 V 凹：顶部 3px 内，极浅楔形切除（真机 stem 仅 1..2px 深）
    let segs: Array<[number, number]> = [[l, r]]
    if (yy < -ry + 3) {
      const t = (-ry + 3 - yy) / 3 // 0(底) .. 1(顶)
      const cut = 0.8 + t * 1.2 // 半宽 0.8..2.0
      segs = [
        [l, cx - cut],
        [cx + cut, r],
      ].filter(([a, b]) => b > a) as Array<[number, number]>
    }

    // 底部双臀凹：底部 2px 内，极浅中央向上切除（真机底部几乎完整椭圆）
    if (yy > ry - 2) {
      const t = (yy - (ry - 2)) / 2 // 0(顶) .. 1(底)
      const cut = t * 0.8 // 半宽 0..0.8
      segs = segs
        .map(([a, b]) => [
          [a, Math.min(b, cx - cut)],
          [Math.max(a, cx + cut), b],
        ])
        .flat()
        .filter(([a, b]) => b > a) as Array<[number, number]>
    }

    for (const [a, b] of segs) {
      // 右侧咬口：圆心 (cx+18, by-4) r=8（真机 bite 约占宽 1/4）
      let rr = b
      const bdy = y - (by - 4)
      const bite = 8 * 8 - bdy * bdy
      if (bite >= 0) {
        const bl = cx + 18 - Math.sqrt(bite)
        if (bl > a && bl < rr) rr = Math.min(rr, bl)
      }
      if (rr > a) s.fillRect(Math.round(a), y, Math.round(rr) - Math.round(a), 1, v)
    }
  }

  // 叶子：右上斜置小椭圆（向右上翘）
  for (let y = by - ry - 12; y <= by - ry + 2; y++) {
    const t2 = (y - (by - ry - 5)) / 7 // 椭圆纵参数
    const half = 9 * Math.sqrt(Math.max(0, 1 - t2 * t2))
    if (half <= 0) continue
    // 叶心随高度右移（斜向）
    const lx = cx + 4 + (by - ry - 5 - y) * 0.5
    s.fillRect(Math.round(lx - half), y, Math.round(half * 2), 1, v)
  }
}

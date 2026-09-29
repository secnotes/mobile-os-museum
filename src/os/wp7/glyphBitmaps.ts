import type { Screen } from '../../hal/screen'

/**
 * 真机字形位图（由用户提供的真机参考 PNG 提取的二值掩码）：
 * - CALL：电话听筒（~/call.png，512×512 RGBA，按 alpha>100 采样到 96×96）。
 *   真机 Mango 电话瓷贴字形：听筒在左上、话筒在右下，手柄 C 弧弓向左侧，
 *   两端等大对称、朝弧心各带月牙缺口。绘制时按目标颜色上色（瓷贴为白色）。
 * - ARROW：开始屏右上角「圆圈+右箭头」（~/a.png，裁掉黑边后 41×41 原生尺寸）。
 * 位行为 MSB-first 行主序打包后 base64。
 */

export const CALL_SIZE = 96
export const CALL_B64 =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAf+AAAAAAAAAAAAAA//AAAAAAAAAAAAAB//gAAAAAAAAAAAAD//wAAAAAAAAAAAAH//4AAAAAAAAAAAAP//8AAAAAAAAAAAAf//+AAAAAAAAAAAAf///AAAAAAAAAAAA////gAAAAAAAAAAA////wAAAAAAAAAAA////4AAAAAAAAAAB////8AAAAAAAAAAB////+AAAAAAAAAAB/////AAAAAAAAAAB/////gAAAAAAAAAB/////wAAAAAAAAAD/////4AAAAAAAAAD/////4AAAAAAAAAD/////4AAAAAAAAAD/////4AAAAAAAAAD/////4AAAAAAAAAB/////4AAAAAAAAAB/////wAAAAAAAAAB/////wAAAAAAAAAB/////gAAAAAAAAAB/////AAAAAAAAAAB////+AAAAAAAAAAA////8AAAAAAAAAAA////4AAAAAAAAAAA////wAAAAAAAAAAA////gAAAAAAAAAAAf///gAAAAAAAAAAAf///gAAAAAAAAAAAf///gAAAAAAAAAAAP///gAAAAAAAAAAAP///gAAAAAAAAAAAH///wAAAAAAAAAAAH///wAAAAAAAAAAAD///wAAAAAAAAAAAD///4AAAAAAAAAAAB///4AAAAAAAAAAAB///8AAAAAAAAAAAA///8AAAAAAAAAAAA///+AAAAAAAAAAAAf///AAAAAAAAAAAAf///AAAAAAAAAAAAP///gAAAAAAAAAAAH///wAAAAAAAAAAAH///4AAAAAAAAAAAD///8AAAAAAAAAAAB///+AAAAAAAAAAAB////AAAAPgAAAAAA////gAAAf4AAAAAAf///wAAA/8AAAAAAP///8AAB/+AAAAAAH///+AAD//AAAAAAH////gAH//gAAAAAD////4AP//wAAAAAB////+Af//4AAAAAA/////////8AAAAAAf////////+AAAAAAP/////////AAAAAAH/////////gAAAAAD/////////wAAAAAB/////////4AAAAAA/////////8AAAAAAf////////+AAAAAAP/////////AAAAAAH/////////gAAAAAB/////////gAAAAAA/////////wAAAAAAf////////wAAAAAAP////////wAAAAAAD////////wAAAAAAB////////gAAAAAAAf///////gAAAAAAAP///////AAAAAAAAD//////+AAAAAAAAA//////8AAAAAAAAAP/////4AAAAAAAAAH/////wAAAAAAAAAA/////gAAAAAAAAAAP////AAAAAAAAAAAB///8AAAAAAAAAAAAP//wAAAAAAAAAAAAAf8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export const ARROW_SIZE = 41
export const ARROW_B64 =
  'AAP/4AAAB//8AAAP//+AAB/AB/AAHwAAfAAeAAAPAB4AAAPAHgAAAPAeAAAAPA4AAAAODgAAAAOHAAAAAccAA+AAc4AA/AA7gAA/AA/AAA/AB+AAA/AD8AAA/AH4H///APwP///Afgf///A/A///8B+B///wD8AAA/AH4AAD8APwAAPwAfgAA/AA7gAD4ADnAAPgAHHAAAAAcOAAAAA4OAAAADgeAAAAPAeAAAA8AeAAADwAeAAAPAAfAAB8AAfwAfwAAP//+AAAH//wAAAD/+AAAA=='

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const callMask = decode(CALL_B64)
const arrowMask = decode(ARROW_B64)

function bit(mask: Uint8Array, i: number): boolean {
  return (mask[i >> 3] & (0x80 >> (i & 7))) !== 0
}

/**
 * 把 size×size 的掩码最近邻缩放到 u×u、以 (cx,cy) 为中心绘制（只用 color 上色，
 * 透明处不写——缺口/镂空天然透出底色）。
 */
export function drawMask(s: Screen, mask: Uint8Array, size: number, cx: number, cy: number, u: number, color: number) {
  const x0 = Math.round(cx - u / 2)
  const y0 = Math.round(cy - u / 2)
  for (let dy = 0; dy < u; dy++) {
    const sy = Math.min(size - 1, Math.floor((dy * size) / u))
    for (let dx = 0; dx < u; dx++) {
      const sx = Math.min(size - 1, Math.floor((dx * size) / u))
      if (bit(mask, sy * size + sx)) s.pset(x0 + dx, y0 + dy, color)
    }
  }
}

/** 电话听筒（真机字形，白色剪影） */
export function maskPhone(s: Screen, cx: number, cy: number, u: number, color: number) {
  drawMask(s, callMask, CALL_SIZE, cx, cy, Math.round(u), color)
}

/** 圆圈右箭头（原生 41×41，1:1 绘制于 (cx,cy) 中心） */
export function maskArrow(s: Screen, cx: number, cy: number, color: number) {
  drawMask(s, arrowMask, ARROW_SIZE, cx, cy, ARROW_SIZE, color)
}

import type { Screen } from '../../../hal/screen'
import { C } from '../palette'
import { rr, rrGrad, disc } from '../graphics'

/**
 * BlackBerry OS 4.6 Precision 图标（40×40，程序化绘制）。
 * 真机图标为彩色圆角方块上的立体物，这里用有限调色板近似。
 */

function px(s: Screen, x: number, y: number, w: number, h: number, v: number) {
  s.fillRect(x, y, w, h, v)
}

export function drawIcon(s: Screen, id: string, x0: number, y0: number, sz = 40) {
  const k = sz / 40
  const at = (x: number, y: number, w: number, h: number, v: number) =>
    px(s, x0 + Math.round(x * k), y0 + Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), v)
  const circle = (cx: number, cy: number, r: number, v: number) =>
    disc(s, x0 + Math.round(cx * k), y0 + Math.round(cy * k), Math.max(1, Math.round(r * k)), v)
  const box = (x: number, y: number, w: number, h: number, r: number, v: number) =>
    rr(s, x0 + Math.round(x * k), y0 + Math.round(y * k), Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)), Math.round(r * k), v)

  switch (id) {
    case 'messages': {
      // 黄色信封
      box(4, 10, 32, 22, 2, C.GOLD)
      at(4, 10, 32, 4, C.YELLOW)
      at(5, 11, 2, 20, C.WHITE)
      at(33, 11, 2, 20, C.WHITE)
      at(8, 12, 24, 2, C.ORANGE) // 信封中缝（V 形简化为斜线像素）
      at(6, 10, 2, 2, C.ORANGE); at(10, 14, 2, 2, C.ORANGE); at(14, 18, 2, 2, C.ORANGE)
      at(24, 18, 2, 2, C.ORANGE); at(28, 14, 2, 2, C.ORANGE); at(32, 10, 2, 2, C.ORANGE)
      break
    }
    case 'calendar': {
      box(6, 6, 28, 30, 3, C.WHITE)
      at(6, 6, 28, 8, C.RED)
      at(10, 3, 4, 6, C.G6); at(26, 3, 4, 6, C.G6)
      // 日期格点
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) at(10 + c * 6, 18 + r * 6, 3, 3, c === 1 && r === 1 ? C.SELECT : C.G3)
      break
    }
    case 'contacts': {
      box(5, 4, 30, 32, 3, C.SELECT)
      at(5, 4, 30, 6, C.SEL_L)
      // 人像
      circle(20, 17, 6, C.WHITE)
      at(11, 26, 18, 8, C.WHITE)
      break
    }
    case 'browser': {
      circle(20, 20, 16, C.WHITE)
      circle(20, 20, 15, C.SELECT)
      at(19, 5, 2, 30, C.WHITE)
      at(5, 19, 30, 2, C.WHITE)
      circle(20, 20, 6, C.WHITE)
      circle(20, 20, 5, C.SELECT)
      break
    }
    case 'media': {
      circle(20, 22, 15, C.MAGENTA)
      circle(20, 22, 14, C.PURPLE)
      at(24, 8, 3, 14, C.WHITE)
      at(16, 8, 11, 3, C.WHITE)
      circle(15, 25, 4, C.WHITE); circle(15, 25, 2, C.PURPLE)
      break
    }
    case 'camera': {
      box(4, 12, 32, 22, 3, C.G5)
      at(10, 8, 10, 6, C.G6)
      circle(20, 23, 8, C.G8)
      circle(20, 23, 6, C.G3)
      circle(20, 23, 3, C.SELECT)
      at(30, 15, 4, 3, C.YELLOW)
      break
    }
    case 'bbm': {
      box(4, 6, 32, 24, 8, C.SELECT)
      at(10, 30, 8, 6, C.SELECT)
      circle(13, 18, 2.5, C.WHITE); circle(20, 18, 2.5, C.WHITE); circle(27, 18, 2.5, C.WHITE)
      break
    }
    case 'phone': {
      circle(20, 20, 16, C.GREEN)
      circle(20, 20, 15, C.GREEN_D)
      // 听筒形
      at(10, 14, 4, 8, C.WHITE); at(26, 14, 4, 8, C.WHITE)
      at(10, 14, 20, 5, C.WHITE)
      break
    }
    case 'options': {
      circle(20, 20, 13, C.G6)
      circle(20, 20, 6, C.WHITE)
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2
        at(20 + Math.round(Math.cos(ang) * 12) - 2, 20 + Math.round(Math.sin(ang) * 12) - 2, 4, 4, C.G6)
      }
      circle(20, 20, 3, C.G5)
      break
    }
    case 'search': {
      circle(17, 16, 10, C.WHITE)
      circle(17, 16, 10, C.SELECT)
      at(24, 23, 12, 4, C.WHITE)
      circle(17, 16, 6, C.WHITE)
      break
    }
    case 'help': {
      box(6, 5, 28, 31, 3, C.WHITE)
      at(6, 5, 6, 31, C.BTN_BLUE)
      s.text(x0 + Math.round(14 * k), y0 + Math.round(8 * k), '?', {
        size: Math.round(22 * k), color: C.SELECT,
      })
      break
    }
    case 'calculator': {
      box(6, 4, 28, 32, 3, C.G8)
      at(9, 7, 22, 7, C.FIELD_BG)
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) at(9 + c * 8, 17 + r * 6, 5, 4, c === 2 ? C.GOLD : C.G4)
      break
    }
    case 'clock': {
      circle(20, 20, 15, C.WHITE)
      circle(20, 20, 15, C.INK)
      circle(20, 20, 14, C.WHITE)
      at(19, 11, 2, 10, C.INK)
      at(20, 19, 8, 2, C.INK)
      circle(20, 20, 2, C.SELECT)
      break
    }
    case 'memopad': {
      box(7, 4, 26, 33, 2, C.WHITE)
      for (let r = 0; r < 5; r++) at(11, 10 + r * 5, 18, 2, r === 0 ? C.SELECT : C.G3)
      at(7, 4, 26, 3, C.SEL_L)
      break
    }
    case 'tasks': {
      box(7, 5, 26, 31, 3, C.WHITE)
      at(7, 5, 26, 5, C.GREEN)
      for (let r = 0; r < 4; r++) {
        at(11, 13 + r * 6, 5, 5, r < 2 ? C.GREEN_D : C.G4)
        if (r < 2) at(12, 14 + r * 6, 3, 2, C.WHITE)
        at(19, 14 + r * 6, 10, 2, C.G5)
      }
      break
    }
    case 'breaker': {
      at(4, 8, 32, 4, C.RED); at(4, 14, 32, 4, C.GOLD); at(4, 20, 32, 4, C.GREEN)
      at(12, 30, 16, 4, C.G6)
      circle(20, 28, 3, C.WHITE)
      break
    }
    default:
      box(6, 6, 28, 28, 4, C.G5)
  }
}

/** 应用内部小图标（如媒体文件夹），20×20 */
export function drawMiniIcon(s: Screen, id: string, x0: number, y0: number) {
  drawIcon(s, id, x0, y0, 20)
}

/** 壁纸（供 blitBg 不需要，OS 直接像素绘制） */
export function wallpaperFill(s: Screen, rng: readonly [number, number]) {
  rrGrad(s, 0, 0, 480, 320, 0, rng)
}

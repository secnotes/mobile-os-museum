import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD } from './fonts'
import { badge as drawBadge } from './widgets'
import { scrim, rrGrad } from './graphics'
import { assets } from './assets'
import type { IconDrawer } from './icons'

export interface AppEntry {
  id: string
  name: string
  icon: IconDrawer
  /** 真机 PNG 图标名（app id）；assets 已加载时优先 blit PNG，否则走 icon() 程序化兜底 */
  iconPng?: string
  /** 角标数字（0 = 不显示） */
  badge?: () => number
}

/** 当前按下的图标（按下变暗反馈，真机 1.0 手感） */
export interface PressedHit {
  kind: 'grid' | 'dock'
  i: number
}

export const GRID_X = [16, 92, 168, 244]
export const GRID_Y = [30, 114, 198]
export const ICON = 57
export const DOCK_X = [28, 100, 172, 244]
export const DOCK_ICON = 50
export const DOCK_Y = 399

/**
 * Springboard：黑底（1.0 无壁纸设置）、3×4 网格 + 页点 + 网纹 Dock。
 * pressed：当前按下的图标索引，绘制后在其上叠暗（真机点按反馈）。
 */
export function drawSpringboard(
  s: Screen,
  grid: AppEntry[], // 12 个（行优先）
  dock: AppEntry[], // 4 个
  pressed?: PressedHit | null,
) {
  s.fillRect(0, 0, 320, 480, C.BLACK)
  // 网格
  grid.forEach((app, i) => {
    const col = i % 4
    const row = (i / 4) | 0
    const x = GRID_X[col], y = GRID_Y[row]
    drawAppIcon(s, app, x, y, ICON)
    s.textCenter(x + (ICON >> 1), y + ICON + 3, app.name, {
      size: 12, font: F_BOLD(12), color: C.WHITE, maxWidth: 72,
    })
    if (app.badge) drawBadgeOverlay(s, app, x, y, ICON)
    if (pressed && pressed.kind === 'grid' && pressed.i === i) {
      scrim(s, x, y, ICON, ICON, C.BLACK, 2)
    }
  })
  // 真机 1.0 只有一页主屏，无页点指示器（页点随 1.1.3 多屏桌面而来）
  // Dock：真机 1.0 为钛灰金属渐变底（非棋盘雪花），顶部 1px 高光
  rrGrad(s, 6, 391, 308, 87, 14, R.DOCK)
  s.fillRect(10, 391, 300, 1, C.MESH_L)
  dock.forEach((app, i) => {
    const x = DOCK_X[i]!
    drawAppIcon(s, app, x, DOCK_Y, DOCK_ICON)
    s.textCenter(x + (DOCK_ICON >> 1), 455, app.name, {
      size: 12, font: F_BOLD(12), color: C.WHITE, maxWidth: 74,
    })
    if (app.badge) drawBadgeOverlay(s, app, x, DOCK_Y, DOCK_ICON)
    if (pressed && pressed.kind === 'dock' && pressed.i === i) {
      scrim(s, x, DOCK_Y, DOCK_ICON, DOCK_ICON, C.BLACK, 2)
    }
  })
}

/**
 * 绘制 app 图标：真机 PNG 优先（assets.icon，圆角与高光已烘焙在 PNG 内，平滑缩放）；
 * 否则走程序化 IconDrawer（flat 扁平绘制，真机 1.0 图标本就无额外玻璃高光层）。
 */
function drawAppIcon(s: Screen, app: AppEntry, x: number, y: number, u: number) {
  const png = app.iconPng ? assets.icon(app.iconPng) : undefined
  if (png) {
    s.blit(png, x, y, { w: u, h: u, smooth: true })
    return
  }
  app.icon(s, x, y, u)
}

/**
 * 角标 overlay：PNG 图标是 overlay 层（render 时盖在调色板 buf 之上），
 * 若 badge 仍画到 buf 会被图标盖住（只剩 smooth 数字浮出，像"角标在图标后面"）。
 * 故把整个 badge（红底+白边+数字）用 iconCanvas 渲染成透明底 canvas，
 * 在 blit 图标之后作为 overlay 合成，确保角标居顶。按数字缓存避免每帧重算。
 * (x,y,u) 与图标一致：badge 右上角，右边界对齐 x+u-2，中心 cy=y+2（与原 drawBadge 位置一致）。
 */
const badgeCache = new Map<string, HTMLCanvasElement>()
function drawBadgeOverlay(s: Screen, app: AppEntry, x: number, y: number, u: number) {
  const n = app.badge!()
  if (n <= 0) return
  const key = String(n)
  let c = badgeCache.get(key)
  if (!c) {
    const text = n > 99 ? '…' : String(n)
    const tw = s.measure(text, { size: 13, font: F_BOLD(13) })
    const w = Math.max(20, tw + 10)
    const BW = w + 6, BH = 24
    c = s.iconCanvas((ms, ox, oy) => {
      // cx=badge 右边界（画布右侧留 3px），cy=画布中心偏上 12
      drawBadge(ms, ox + BW - 3, oy + 12, n)
    }, BW, BH)
    badgeCache.set(key, c)
  }
  const BW = c.width
  // 还原原 drawBadge(s, x+u-2, y+2, n) 的几何：右边界=x+u-2，中心 cy=y+2
  s.blit(c, x + u - 2 - (BW - 3), y + 2 - 12)
}
/** 点按命中 → 应用 id（'grid:x' / 'dock:x'），或 null */
export function springboardHit(x: number, y: number): { kind: 'grid' | 'dock'; i: number } | null {
  // Dock
  if (y >= 391) {
    for (let i = 0; i < 4; i++)
      if (x >= DOCK_X[i] - 8 && x < DOCK_X[i] + DOCK_ICON + 8) return { kind: 'dock', i }
    return null
  }
  // 网格：每行热区 ~80 高（图标+标签）
  for (let r = 0; r < 3; r++) {
    if (y >= GRID_Y[r] - 4 && y < GRID_Y[r] + 78) {
      for (let c = 0; c < 4; c++)
        if (x >= GRID_X[c] - 6 && x < GRID_X[c] + ICON + 6) return { kind: 'grid', i: r * 4 + c }
    }
  }
  return null
}

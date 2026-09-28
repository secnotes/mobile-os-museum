import type { Screen } from '../../hal/screen'
import { C } from './palette'
import { F_BOLD } from './fonts'
import { badge as drawBadge } from './widgets'
import { scrim, gloss } from './graphics'
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
    if (app.badge) {
      const n = app.badge()
      if (n > 0) drawBadge(s, x + ICON - 2, y + 2, n)
    }
    if (pressed && pressed.kind === 'grid' && pressed.i === i) {
      scrim(s, x, y, ICON, ICON, C.BLACK, 2)
    }
  })
  // 真机 1.0 只有一页主屏，无页点指示器（页点随 1.1.3 多屏桌面而来）
  // Dock：真机 1.0 为灰色网纹（交叉点阵）磨砂底
  dockMesh(s, 6, 391, 308, 87, 14)
  s.fillRect(10, 391, 300, 1, C.MESH_L)
  dock.forEach((app, i) => {
    const x = DOCK_X[i]!
    drawAppIcon(s, app, x, DOCK_Y, DOCK_ICON)
    s.textCenter(x + (DOCK_ICON >> 1), 455, app.name, {
      size: 12, font: F_BOLD(12), color: C.WHITE, maxWidth: 74,
    })
    if (app.badge) {
      const n = app.badge()
      if (n > 0) drawBadge(s, x + DOCK_ICON - 2, DOCK_Y + 2, n)
    }
    if (pressed && pressed.kind === 'dock' && pressed.i === i) {
      scrim(s, x, DOCK_Y, DOCK_ICON, DOCK_ICON, C.BLACK, 2)
    }
  })
}

/**
 * 绘制 app 图标：真机 PNG 优先（assets.icon，圆角与 gloss 已烘焙在 PNG 内，平滑缩放）；
 * 否则走程序化 IconDrawer，并在其上叠 gloss 玻璃高光（顶部 42% 亮带，真机 1.0 图标共性）。
 */
function drawAppIcon(s: Screen, app: AppEntry, x: number, y: number, u: number) {
  const png = app.iconPng ? assets.icon(app.iconPng) : undefined
  if (png) {
    s.blit(png, x, y, { w: u, h: u, smooth: true })
    return
  }
  app.icon(s, x, y, u)
  const r = Math.max(1, Math.round((u / 57) * 12))
  gloss(s, x, y, u, u, r, C.WHITE, 4)
}
function dockMesh(s: Screen, x: number, y: number, w: number, h: number, r: number) {
  for (let dy = 0; dy < h; dy++) {
    let inset = 0
    if (dy < r || dy >= h - r) {
      const cy = dy < r ? r - dy - 0.5 : dy - (h - r) + 0.5
      inset = Math.round(r - Math.sqrt(Math.max(0, r * r - cy * cy)))
    }
    for (let dx = inset; dx < w - inset; dx++)
      s.pset(x + dx, y + dy, ((dx + dy) & 1) === 0 ? C.MESH_L : C.MESH_D)
  }
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

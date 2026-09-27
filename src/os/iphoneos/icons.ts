import type { Screen } from '../../hal/screen'
import { C, R } from './palette'
import { F_BOLD, F_REG } from './fonts'
import { rr, rrGrad, disc } from './graphics'

/**
 * 16 个 Springboard 图标（真机 57×57，圆角 12；Dock 中 50×50）。
 * 全部按 57 设计坐标绘制，经 T 缩放到实际 u。
 * 每个 (s,x,y,u)：x,y 左上角，u 边长。
 */
export type IconDrawer = (s: Screen, x: number, y: number, u: number) => void

/** 57 设计坐标 → 实际像素 */
function T(x: number, y: number, u: number) {
  const k = u / 57
  return {
    X: (v: number) => x + Math.round(v * k),
    Y: (v: number) => y + Math.round(v * k),
    R: (v: number) => Math.max(1, Math.round(v * k)),
    S: (v: number) => Math.max(5, Math.round(v * k)),
  }
}

// ---------- Text（绿底白气泡 "SMS"） ----------
export const iconText: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.GREEN_SB)
  // 白色气泡（含左下小尾巴）
  rr(s, t.X(9), t.Y(14), t.R(39), t.R(24), t.R(8), C.WHITE)
  s.fillRect(t.X(17), t.Y(37), t.R(9), t.R(5), C.WHITE)
  s.fillRect(t.X(19), t.Y(41), t.R(5), t.R(4), C.WHITE)
  s.textCenter(t.X(28), t.Y(19), 'SMS', { size: t.S(17), font: F_BOLD(t.S(17)), color: C.GREEN_D })
}

// ---------- Calendar（红条白字星期 + 大号黑色日期） ----------
export const iconCalendar: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  const now = new Date()
  // 整体红底，再盖白色下半（圆角自然落在顶部红条、底部白身）
  rr(s, x, y, u, u, t.R(12), C.RED)
  rr(s, x, t.Y(15), u, u - t.R(15), t.R(12), C.WHITE)
  const wd = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][now.getDay()]!
  s.textCenter(t.X(28), t.Y(3), wd, { size: t.S(10), font: F_BOLD(t.S(10)), color: C.WHITE })
  s.textCenter(t.X(28), t.Y(17), String(now.getDate()), { size: t.S(30), font: F_BOLD(t.S(30)), color: C.BLACK })
}

// ---------- Photos（蓝天向日葵） ----------
export const iconPhotos: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.SKY_PHO)
  // 茎与叶
  s.fillRect(t.X(27), t.Y(31), t.R(2), t.R(16), C.STEM)
  disc(s, t.X(21), t.Y(41), t.R(4), C.STEM)
  // 花瓣
  const cx = t.X(28), cy = t.Y(23)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    disc(s, cx + Math.round(Math.cos(a) * t.R(11)), cy + Math.round(Math.sin(a) * t.R(11)), t.R(5), C.PETAL)
  }
  disc(s, cx, cy, t.R(8), C.SUN_CORE)
  disc(s, cx, cy, t.R(4), C.SUN_INNER)
}

// ---------- Camera（银灰机身 + 黑色镜头圈 + 蓝镜片） ----------
export const iconCamera: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.SILVER)
  rr(s, t.X(18), t.Y(9), t.R(21), t.R(8), t.R(3), C.GRAY2)
  const cx = t.X(28), cy = t.Y(30)
  disc(s, cx, cy, t.R(14), C.INK)
  disc(s, cx, cy, t.R(11), C.BLACK)
  disc(s, cx, cy, t.R(7), C.BLUE_D)
  disc(s, cx - t.R(3), cy - t.R(3), t.R(2), C.WHITE)
}

// ---------- YouTube（深棕边 + 米色面板 + 绿灰屏老式电视） ----------
export const iconYoutube: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rr(s, x, y, u, u, t.R(12), C.BLACK)
  rr(s, t.X(3), t.Y(8), t.R(51), t.R(41), t.R(8), C.TV_DARK)
  rr(s, t.X(5), t.Y(10), t.R(47), t.R(37), t.R(7), C.TV_BODY)
  rrGrad(s, t.X(11), t.Y(14), t.R(35), t.R(24), t.R(4), R.TV_SCR)
  // 底部两个黑旋钮
  disc(s, t.X(12), t.Y(41), t.R(4), C.INK)
  disc(s, t.X(45), t.Y(41), t.R(4), C.INK)
  s.pset(t.X(11), t.Y(40), C.TV_DARK); s.pset(t.X(44), t.Y(40), C.TV_DARK)
}

// ---------- Stocks（蓝底白色走势） ----------
export const iconStocks: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.STOCKS_BLUE)
  // 两条竖向参考线（稀疏点灯近似淡线）
  for (const gx of [19, 38])
    for (let gy = 8; gy < 43; gy += 2) s.pset(t.X(gx), t.Y(gy), C.WHITE)
  const pts = [[7,33],[13,29],[19,31],[25,21],[31,25],[37,13],[43,18],[50,9]]
  pts.forEach((p, i) => {
    if (!i) return
    s.line(t.X(pts[i - 1]![0]), t.Y(pts[i - 1]![1]), t.X(p[0]!), t.Y(p[1]!), C.WHITE)
  })
  s.text(t.X(7), t.Y(46), 'Jul', { size: t.S(6), font: F_REG(t.S(6)), color: C.WHITE })
  s.text(t.X(23), t.Y(46), 'Aug', { size: t.S(6), font: F_REG(t.S(6)), color: C.WHITE })
  s.text(t.X(40), t.Y(46), 'Sep', { size: t.S(6), font: F_REG(t.S(6)), color: C.WHITE })
}

// ---------- Maps（公路盾 280 + 红针 + 黄色公路） ----------
export const iconMaps: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rr(s, x, y, u, u, t.R(12), C.MAP_LAND)
  // 灰色街道
  s.fillRect(t.X(12), y, t.R(3), u, C.GRAY5)
  s.fillRect(x, t.Y(33), u, t.R(3), C.GRAY5)
  // 绿地
  rr(s, t.X(35), t.Y(30), t.R(18), t.R(20), t.R(3), C.MAP_PARK)
  // 黄色十字公路（竖 + 横）
  s.fillRect(t.X(19), y, t.R(7), u, C.MAP_HWY)
  s.fillRect(x, t.Y(16), u, t.R(6), C.MAP_HWY)
  // 280 公路盾：红顶 + 蓝底
  rr(s, t.X(29), t.Y(4), t.R(20), t.R(17), t.R(3), C.SHIELD_BLUE)
  rr(s, t.X(29), t.Y(4), t.R(20), t.R(7), t.R(3), C.RED)
  s.textCenter(t.X(39), t.Y(12), '280', { size: t.S(8), font: F_BOLD(t.S(8)), color: C.WHITE })
  // 红色大头针
  disc(s, t.X(16), t.Y(27), t.R(5), C.RED)
  s.fillRect(t.X(14), t.Y(30), t.R(4), t.R(7), C.RED)
  s.fillRect(t.X(13), t.Y(36), t.R(6), t.R(2), C.RED)
  disc(s, t.X(16), t.Y(27), t.R(2), C.WHITE)
}

// ---------- Weather（蓝色光晕太阳 + 73°） ----------
export const iconWeather: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.WEATHER_BLUE)
  disc(s, t.X(28), t.Y(19), t.R(13), C.GLOW_OUT)
  disc(s, t.X(28), t.Y(19), t.R(10), C.GLOW_MID)
  disc(s, t.X(28), t.Y(19), t.R(6), C.GLOW_IN)
  s.textCenter(t.X(28), t.Y(37), '73°', { size: t.S(18), font: F_BOLD(t.S(18)), color: C.WHITE })
}

// ---------- Clock（黑边白底，实时表盘） ----------
export const iconClock: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rr(s, x, y, u, u, t.R(12), C.BLACK)
  const cx = t.X(28), cy = t.Y(28)
  disc(s, cx, cy, t.R(20), C.WHITE)
  // 12 刻度
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r1 = t.R(17), r2 = t.R(15)
    s.pset(cx + Math.round(Math.sin(a) * r1), cy - Math.round(Math.cos(a) * r1), C.BLACK)
    s.pset(cx + Math.round(Math.sin(a) * r2), cy - Math.round(Math.cos(a) * r2), C.BLACK)
  }
  // 实时指针
  const now = new Date()
  const sec = now.getSeconds()
  const min = now.getMinutes() + sec / 60
  const hr = (now.getHours() % 12) + min / 60
  const hand = (a: number, len: number, v: number) =>
    s.line(cx, cy, cx + Math.round(Math.sin(a) * t.R(len)), cy - Math.round(Math.cos(a) * t.R(len)), v)
  hand((hr / 12) * Math.PI * 2, 9, C.BLACK)
  hand((min / 60) * Math.PI * 2, 13, C.BLACK)
  hand((sec / 60) * Math.PI * 2, 14, C.RED)
  disc(s, cx, cy, t.R(2), C.BLACK)
}

// ---------- Calculator（银底 4 个深棕圆钮） ----------
export const iconCalculator: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.SILVER)
  const btns: Array<[number, number, string]> = [
    [18, 18, '+'], [39, 18, '−'], [18, 39, '×'], [39, 39, '÷'],
  ]
  btns.forEach(([bx, by, g]) => {
    disc(s, t.X(bx), t.Y(by), t.R(9), C.CALC_BR)
    s.textCenter(t.X(bx), t.Y(by - 6), g, { size: t.S(14), font: F_BOLD(t.S(14)), color: C.WHITE })
  })
}

// ---------- Notes（棕顶黄纸横线便签） ----------
export const iconNotes: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rr(s, x, y, u, u, t.R(12), C.NOTES_BG)
  rr(s, x, y, u, t.R(19), t.R(12), C.NOTES_TOP)
  s.fillRect(t.X(10), t.Y(19), t.R(1), t.R(38), C.NOTES_LINE)
  for (let i = 0; i < 4; i++)
    s.fillRect(t.X(12), t.Y(26 + i * 7), t.R(43), t.R(1), C.NOTES_LINE)
}

// ---------- Settings（银底深色内框 + 白色齿轮组） ----------
export const iconSettings: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.SILVER)
  rr(s, t.X(5), t.Y(5), t.R(47), t.R(47), t.R(8), C.GEAR_IN)
  gear(s, t.X(13), t.Y(44), t.R(6), C.WHITE, C.GEAR_IN)
  gear(s, t.X(43), t.Y(44), t.R(6), C.WHITE, C.GEAR_IN)
  gear(s, t.X(28), t.Y(24), t.R(13), C.WHITE, C.GEAR_IN)
}

// ---------- Phone（绿底白色曲线听筒） ----------
export const iconPhone: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.GREEN_DK)
  // 听筒为粗二次曲线：耳(14,13) → 控制点(-6,28) → 嘴(44,42)
  const P0 = [14, 13], CP = [-15, 32], P1 = [44, 43]
  for (let k = 0; k <= 26; k++) {
    const q = k / 26
    const a = (1 - q) * (1 - q), b = 2 * (1 - q) * q, c = q * q
    const px = t.X(a * P0[0]! + b * CP[0]! + c * P1[0]!)
    const py = t.Y(a * P0[1]! + b * CP[1]! + c * P1[1]!)
    const end = k === 0 || k === 26
    disc(s, px, py, t.R(end ? 6 : 5), C.WHITE)
  }
}

// ---------- Mail（蓝天白云 + 白色信封） ----------
export const iconMail: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.MAIL_SKY)
  // 底部云朵
  disc(s, t.X(8), t.Y(44), t.R(4), C.WHITE)
  disc(s, t.X(16), t.Y(46), t.R(5), C.WHITE)
  disc(s, t.X(24), t.Y(44), t.R(3), C.WHITE)
  // 信封
  rr(s, t.X(11), t.Y(17), t.R(28), t.R(19), t.R(2), C.WHITE)
  s.line(t.X(11), t.Y(17), t.X(25), t.Y(28), C.GRAY3)
  s.line(t.X(39), t.Y(17), t.X(25), t.Y(28), C.GRAY3)
}

// ---------- Safari（蓝底白色风玫瑰 + 红/白罗盘针） ----------
export const iconSafari: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.MAIL_SKY)
  const cx = t.X(28), cy = t.Y(28)
  const k = u / 57
  // 白色风玫瑰：四主尖角（上下长、左右稍短）+ 四短斜尖
  const star: Array<[number, number, number]> = [
    [0, -15, 4.2], [0, 15, 4.2], [13, 0, 3.6], [-13, 0, 3.6],
  ]
  star.forEach(([dx, dy, w]) => rosePoint(s, cx, cy, dx * k, dy * k, w * k, C.WHITE))
  for (let a = 0; a < 4; a++) {
    const ang = Math.PI / 4 + (a * Math.PI) / 2
    rosePoint(
      s, cx, cy, Math.sin(ang) * 5.5 * k, -Math.cos(ang) * 5.5 * k, 2 * k, C.WHITE,
    )
  }
  // N/S 标
  s.textCenter(cx, t.Y(4), 'N', { size: t.S(7), font: F_BOLD(t.S(7)), color: C.WHITE })
  s.textCenter(cx, t.Y(45), 'S', { size: t.S(7), font: F_BOLD(t.S(7)), color: C.WHITE })
  // 红针（指向约 53°）与对向白针
  compassNeedle(s, cx, cy, 53, 16 * k, 2.4 * k, C.RED)
  compassNeedle(s, cx, cy, 233, 13 * k, 2.2 * k, C.WHITE)
  disc(s, cx, cy, t.R(2), C.GRAY2)
}

// ---------- iPod（橙色底 + 白色经典 iPod） ----------
export const iconIpod: IconDrawer = (s, x, y, u) => {
  const t = T(x, y, u)
  rrGrad(s, x, y, u, u, t.R(12), R.IPOD_ORG)
  rr(s, t.X(16), t.Y(10), t.R(20), t.R(34), t.R(4), C.WHITE)
  rr(s, t.X(19), t.Y(13), t.R(14), t.R(10), t.R(2), C.ORANGE)
  disc(s, t.X(26), t.Y(34), t.R(7), C.WHITE)
  disc(s, t.X(26), t.Y(34), t.R(5), C.ORANGE)
}

/** 风玫瑰尖角（菱形）：从中心到 (cx+dx,cy+dy)，根部半宽 w */
function rosePoint(
  s: Screen, cx: number, cy: number, dx: number, dy: number, w: number, v: number,
) {
  const len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  for (let k = 0; k <= len; k++) {
    const hw = Math.max(0.3, w * (1 - k / len))
    const bx = cx + ux * k, by = cy + uy * k
    s.fillRect(
      Math.round(bx - Math.abs(uy) * hw - 0.3),
      Math.round(by - Math.abs(ux) * hw - 0.3),
      Math.max(1, Math.ceil(2 * Math.abs(uy) * hw + (uy === 0 ? 0.6 : 0))),
      Math.max(1, Math.ceil(2 * Math.abs(ux) * hw + (ux === 0 ? 0.6 : 0))),
      v,
    )
  }
}

/** 罗盘针（三角形）：angle 0=北，90=东 */
function compassNeedle(
  s: Screen, cx: number, cy: number, angDeg: number, len: number, w: number, v: number,
) {
  const a = (angDeg * Math.PI) / 180
  const dx = Math.sin(a), dy = -Math.cos(a)
  for (let k = 0; k <= len; k++) {
    const hw = Math.max(0.3, w * (1 - k / len))
    const bx = cx + dx * k, by = cy + dy * k
    s.fillRect(
      Math.round(bx - Math.abs(dy) * hw - 0.3),
      Math.round(by - Math.abs(dx) * hw - 0.3),
      Math.max(1, Math.ceil(2 * Math.abs(dy) * hw)),
      Math.max(1, Math.ceil(2 * Math.abs(dx) * hw)),
      v,
    )
  }
}

/** 齿轮：齿圈 + 环形盘 + 中心孔 */
function gear(s: Screen, cx: number, cy: number, r: number, v: number, holeV: number) {
  const teeth = r >= 10 ? 10 : 8
  const tooth = r >= 10 ? 4 : 3
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2
    const tx = cx + Math.round(Math.cos(a) * (r + 1)) - (tooth >> 1)
    const ty = cy + Math.round(Math.sin(a) * (r + 1)) - (tooth >> 1)
    s.fillRect(tx, ty, tooth, tooth, v)
  }
  const ri = Math.max(1, Math.round(r * 0.62))
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy
      if (d <= r * r && d >= ri * ri) s.pset(cx + dx, cy + dy, v)
    }
  disc(s, cx, cy, Math.max(1, Math.round(r * 0.3)), holeV)
}

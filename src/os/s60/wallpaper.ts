/**
 * N73 壁纸：240×320 离屏预渲染（只在切换主题时重画一次），
 * 经 Screen.blitBg 铺底，调色板控件浮在其上。
 * 0 = 蓝调云气（中文固件出厂主题，对齐待机照片）
 * 1 = 青绿自然
 * 2 = 深夜星点
 */
import { W, H } from './ui'

function canvas2d(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return [c, c.getContext('2d')!]
}

/** 纵向三段渐变 */
function vgradient(g: CanvasRenderingContext2D, stops: Array<[number, string]>) {
  const grd = g.createLinearGradient(0, 0, 0, H)
  for (const [k, col] of stops) grd.addColorStop(k, col)
  g.fillStyle = grd
  g.fillRect(0, 0, W, H)
}

/** 柔和云团（径向光团） */
function cloud(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, alpha: number) {
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r)
  grd.addColorStop(0, hexA(col, alpha))
  grd.addColorStop(0.6, hexA(col, alpha * 0.5))
  grd.addColorStop(1, hexA(col, 0))
  g.fillStyle = grd
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** 颗粒噪点（相机质感，避免纯色发假） */
function grain(g: CanvasRenderingContext2D, amount: number) {
  const id = g.getImageData(0, 0, W, H)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    d[i] += n; d[i + 1] += n; d[i + 2] += n
  }
  g.putImageData(id, 0, 0)
}

function blue(): HTMLCanvasElement {
  const [c, g] = canvas2d()
  vgradient(g, [
    [0, '#0b58a6'],
    [0.45, '#1279cf'],
    [0.78, '#1fa6df'],
    [1, '#36c9e4'],
  ])
  // 两团青色云气（待机照片中下部两个大椭圆光斑）
  cloud(g, 70, 196, 92, '#42d4f4', 0.5)
  cloud(g, 132, 232, 104, '#57dcf2', 0.42)
  cloud(g, 196, 96, 56, '#2aa9e0', 0.35)
  grain(g, 7)
  return c
}

function green(): HTMLCanvasElement {
  const [c, g] = canvas2d()
  vgradient(g, [
    [0, '#1d6b46'],
    [0.5, '#2e9460'],
    [1, '#8fce7a'],
  ])
  cloud(g, 60, 210, 90, '#bde98c', 0.4)
  grain(g, 7)
  return c
}

function night(): HTMLCanvasElement {
  const [c, g] = canvas2d()
  vgradient(g, [
    [0, '#0a1538'],
    [0.6, '#132a5e'],
    [1, '#1c3d75'],
  ])
  // 月亮
  cloud(g, 186, 64, 34, '#dff0ff', 0.9)
  g.fillStyle = '#132a5e'
  g.beginPath(); g.arc(178, 58, 30, 0, Math.PI * 2); g.fill()
  // 星点
  g.fillStyle = 'rgba(255,255,255,0.85)'
  for (let i = 0; i < 40; i++) {
    const x = (i * 97 + 31) % W
    const y = (i * 61 + 13) % (H - 80)
    g.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1)
  }
  grain(g, 5)
  return c
}

let cache: HTMLCanvasElement[] | null = null

/** 按主题索引取预渲染壁纸（惰性构建） */
export function getWallpaper(idx: number): HTMLCanvasElement {
  if (!cache) cache = [blue(), green(), night()]
  return cache[Math.min(2, Math.max(0, idx))]!
}

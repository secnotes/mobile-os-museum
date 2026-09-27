/**
 * 锁屏壁纸：全部程序生成的 480×800 全彩画布（Metro 抽象风格），
 * 对应真机「设置 → 锁定屏幕 → 更改壁纸」的可选壁纸。
 * 不经过 Screen 调色板，走 blitBg 全彩背景层。
 */

export interface Wallpaper {
  zh: string
  en: string
  draw: (c: CanvasRenderingContext2D) => void
}

function canvas(draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 480
  cv.height = 800
  const c = cv.getContext('2d')!
  draw(c)
  return cv
}

export const WALLPAPERS: Wallpaper[] = [
  {
    zh: '极光', en: 'Aurora',
    draw: (c) => {
      const g = c.createLinearGradient(0, 0, 0, 800)
      g.addColorStop(0, '#0b2a5b')
      g.addColorStop(0.55, '#106a8f')
      g.addColorStop(1, '#0aa29b')
      c.fillStyle = g
      c.fillRect(0, 0, 480, 800)
      const r = c.createRadialGradient(120, 140, 10, 120, 140, 320)
      r.addColorStop(0, 'rgba(160,255,220,0.55)')
      r.addColorStop(1, 'rgba(160,255,220,0)')
      c.fillStyle = r
      c.fillRect(0, 0, 480, 800)
    },
  },
  {
    zh: '暮光', en: 'Dusk',
    draw: (c) => {
      const g = c.createLinearGradient(0, 0, 480, 800)
      g.addColorStop(0, '#2b0a4a')
      g.addColorStop(0.6, '#7a1663')
      g.addColorStop(1, '#d8443a')
      c.fillStyle = g
      c.fillRect(0, 0, 480, 800)
      c.fillStyle = 'rgba(255,210,120,0.35)'
      c.beginPath()
      c.arc(360, 180, 70, 0, Math.PI * 2)
      c.fill()
    },
  },
  {
    zh: '同心圆', en: 'Ripples',
    draw: (c) => {
      c.fillStyle = '#0d1b2a'
      c.fillRect(0, 0, 480, 800)
      const colors = ['#1ba1e2', '#00aba9', '#a2c139', '#f09609', '#d80073']
      colors.forEach((col, i) => {
        c.strokeStyle = col
        c.lineWidth = 14
        c.beginPath()
        c.arc(240, 400, 40 + i * 66, 0, Math.PI * 2)
        c.stroke()
      })
    },
  },
  {
    zh: '斜条纹', en: 'Stripes',
    draw: (c) => {
      const colors = ['#1ba1e2', '#11425f', '#00aba9', '#0c6260', '#a2c139', '#5d6f1e']
      colors.forEach((col, i) => {
        c.fillStyle = col
        c.save()
        c.translate(0, i * 150 - 200)
        c.rotate(-0.42)
        c.fillRect(-300, 0, 1200, 70)
        c.restore()
      })
    },
  },
  {
    zh: '波线', en: 'Waves',
    draw: (c) => {
      c.fillStyle = '#04122b'
      c.fillRect(0, 0, 480, 800)
      const colors = ['#1ba1e2', '#33bdd6', '#7fd9dd', '#bff0e6']
      colors.forEach((col, k) => {
        c.strokeStyle = col
        c.lineWidth = 8
        c.beginPath()
        for (let x = 0; x <= 480; x += 8) {
          const y = 520 + k * 60 + Math.sin(x / 42 + k) * 26
          if (x === 0) c.moveTo(x, y)
          else c.lineTo(x, y)
        }
        c.stroke()
      })
    },
  },
  {
    zh: '双色', en: 'Split',
    draw: (c) => {
      c.fillStyle = '#1ba1e2'
      c.fillRect(0, 0, 480, 800)
      c.fillStyle = '#000000'
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(480, 300)
      c.lineTo(480, 800)
      c.lineTo(0, 560)
      c.closePath()
      c.fill()
    },
  },
  {
    zh: '光芒', en: 'Rays',
    draw: (c) => {
      c.fillStyle = '#0a0a0a'
      c.fillRect(0, 0, 480, 800)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        c.strokeStyle = i % 2 ? '#f09609' : '#a05000'
        c.lineWidth = 10
        c.beginPath()
        c.moveTo(240, 400)
        c.lineTo(240 + Math.cos(a) * 700, 400 + Math.sin(a) * 700)
        c.stroke()
      }
      c.fillStyle = '#fff3d0'
      c.beginPath()
      c.arc(240, 400, 60, 0, Math.PI * 2)
      c.fill()
    },
  },
  {
    zh: '点阵', en: 'Dots',
    draw: (c) => {
      c.fillStyle = '#10242b'
      c.fillRect(0, 0, 480, 800)
      for (let y = 30; y < 800; y += 48)
        for (let x = 30; x < 480; x += 48) {
          c.fillStyle = ((x + y) / 48) % 3 === 0 ? '#a2c139' : '#1ba1e2'
          c.beginPath()
          c.arc(x, y, 11, 0, Math.PI * 2)
          c.fill()
        }
    },
  },
  {
    zh: '青空', en: 'Teal',
    draw: (c) => {
      const g = c.createLinearGradient(0, 0, 0, 800)
      g.addColorStop(0, '#003f45')
      g.addColorStop(1, '#00aba9')
      c.fillStyle = g
      c.fillRect(0, 0, 480, 800)
      c.strokeStyle = 'rgba(255,255,255,0.25)'
      c.lineWidth = 3
      for (let y = 60; y < 800; y += 90) {
        c.beginPath()
        c.moveTo(0, y)
        c.lineTo(480, y + 40)
        c.stroke()
      }
    },
  },
  {
    zh: '三角', en: 'Triangles',
    draw: (c) => {
      c.fillStyle = '#16103a'
      c.fillRect(0, 0, 480, 800)
      const colors = ['#a200ff', '#d80073', '#1ba1e2']
      for (let y = -80; y < 880; y += 120)
        for (let x = -80; x < 560; x += 120) {
          c.fillStyle = colors[((x + 200) / 120 + (y + 200) / 120) % 3 | 0]!
          c.beginPath()
          c.moveTo(x, y)
          c.lineTo(x + 100, y + 30)
          c.lineTo(x + 40, y + 110)
          c.closePath()
          c.fill()
        }
    },
  },
  {
    zh: '气泡', en: 'Bubbles',
    draw: (c) => {
      c.fillStyle = '#240b2e'
      c.fillRect(0, 0, 480, 800)
      const cols = ['#e671b8', '#d80073', '#a200ff', '#1ba1e2', '#a2c139']
      for (let i = 0; i < 16; i++) {
        const r = 24 + ((i * 37) % 60)
        c.fillStyle = cols[i % cols.length]!
        c.globalAlpha = 0.75
        c.beginPath()
        c.arc((i * 131) % 480, (i * 211) % 800, r, 0, Math.PI * 2)
        c.fill()
      }
      c.globalAlpha = 1
    },
  },
  {
    zh: '夜色', en: 'Night',
    draw: (c) => {
      c.fillStyle = '#000000'
      c.fillRect(0, 0, 480, 800)
      c.fillStyle = '#ffffff'
      for (let i = 0; i < 60; i++) {
        const x = (i * 173) % 480
        const y = (i * 263) % 700
        c.globalAlpha = 0.25 + ((i * 7) % 10) / 14
        c.fillRect(x, y, 2, 2)
      }
      c.globalAlpha = 1
      c.fillStyle = '#e6e9ef'
      c.beginPath()
      c.arc(370, 150, 46, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#000'
      c.beginPath()
      c.arc(352, 138, 42, 0, Math.PI * 2)
      c.fill()
    },
  },
]

let cache: HTMLCanvasElement[] | null = null

/** 取第 i 张壁纸画布（惰性生成并缓存） */
export function getWallpaper(i: number): HTMLCanvasElement {
  if (!cache) cache = WALLPAPERS.map((w) => canvas(w.draw))
  return cache[Math.max(0, Math.min(i, cache.length - 1))]!
}

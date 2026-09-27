import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, disc, rrGrad } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconWeather } from '../icons'

interface WCity {
  name: string
  temp: number
  hi: number
  lo: number
  cond: 0 | 1 | 2 // 晴/云/雨
  days: Array<[number, number, 0 | 1 | 2]>
}

/**
 * Weather：蓝渐变全天背景，大温度 + 六日预报；两个城市切换。
 */
class WeatherApp extends IphoneApp {
  private sel = 0

  private cities: WCity[] = [
    {
      name: this.str.weatherCities[0]!, temp: 72, hi: 78, lo: 58, cond: 0,
      days: [[76, 57, 0], [79, 59, 1], [75, 56, 2], [72, 54, 1], [74, 55, 0], [77, 58, 0]],
    },
    {
      name: this.str.weatherCities[1]!, temp: 86, hi: 92, lo: 70, cond: 2,
      days: [[90, 71, 2], [88, 69, 2], [92, 72, 1], [91, 70, 0], [89, 68, 0], [87, 67, 1]],
    },
  ]

  protected draw() {
    const s = this.ctx.screen
    rrGrad(s, 0, 0, 320, 480, 0, R.SKY)
    statusBar(s, { dark: true, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    const c = this.cities[this.sel]!
    // 城市
    s.textCenter(160, 44, c.name, { size: 20, font: F_BOLD(20), color: C.WHITE })
    // 大温度
    s.text(96, 150, String(c.temp), { size: 88, font: F_REG(88), color: C.WHITE })
    s.text(214, 70, '°', { size: 40, font: F_REG(40), color: C.WHITE })
    // 天气图标
    this.drawCond(s, 232, 110, c.cond, 1.7)
    s.textCenter(160, 210, this.condName(c.cond), { size: 19, font: F_REG(19), color: C.WHITE })
    // 高低温
    s.textCenter(160, 240, `H:${c.hi}°  L:${c.lo}°`, { size: 17, font: F_BOLD(17), color: C.WHITE })
    // 六日预报
    rr(s, 12, 300, 296, 120, 10, C.BLACK)
    c.days.forEach(([hi, lo, cd], i) => {
      const x = 12 + i * Math.floor(296 / 6)
      const dayN = new Date(Date.now() + (i + 1) * 86400e3).getDay()
      s.textCenter(x + 24, 322, this.str.weekdayMin[dayN], { size: 13, font: F_BOLD(13), color: C.WHITE })
      this.drawCond(s, x + 24, 352, cd, 0.9)
      s.textCenter(x + 24, 392, `${hi}° ${lo}°`, { size: 12, font: F_REG(12), color: C.GRAY4 })
    })
    // 页点
    this.cities.forEach((_, i) => {
      disc(s, 152 + i * 16, 452, 4, i === this.sel ? C.WHITE : C.GRAY4)
    })
  }

  private drawCond(s: Screen, cx: number, cy: number, cond: 0 | 1 | 2, scale: number) {
    const r = (n: number) => Math.round(n * scale)
    const px = (n: number) => Math.round(cx + n * scale)
    if (cond === 0) {
      disc(s, cx, cy, r(11), C.YELLOW)
    } else {
      // 云：几个白圆 + 底
      disc(s, px(-8), cy + r(2), r(9), C.WHITE)
      disc(s, px(6), cy + r(3), r(10), C.WHITE)
      disc(s, cx, cy - r(4), r(10), C.WHITE)
      s.fillRect(px(-16), cy + r(4), r(32), r(6), C.WHITE)
      if (cond === 2) {
        // 雨滴
        for (let i = -1; i <= 1; i++) s.fillRect(px(i * 9), cy + r(14), 2, r(7), C.BLUE_H)
      }
    }
  }

  private condName(c: 0 | 1 | 2): string {
    const zh = this.ctx.lang.get() === 'zh'
    if (c === 0) return zh ? '晴' : 'Sunny'
    if (c === 1) return zh ? '多云' : 'Cloudy'
    return zh ? '有雨' : 'Rain'
  }

  protected tap(x: number, y: number) {
    if (y < 64 || y > 420) {
      this.sel = x < 160 ? (this.sel + 1) % 2 : (this.sel + 1) % 2
      this.draw()
    }
  }
}

export const weatherFactory = miniApp('weather', 'Weather', iconWeather, (ctx, b) => new WeatherApp(ctx, b))

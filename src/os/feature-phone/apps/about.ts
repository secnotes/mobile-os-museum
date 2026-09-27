import type { AppContext, MiniApp } from '../../../kernel/types'
import { osStrings } from '../strings'

export const aboutApp: MiniApp = {
  id: 'about',
  name: '关于',
  nameEn: 'About',
  icon(s, x, y) {
    s.bitmap(x, y, [
      '..####..',
      '.##..##.',
      '.##..##.',
      '..####..',
      '........',
      '..###...',
      '..###...',
      '..###...',
    ])
  },
  start(ctx: AppContext) {
    // 静态界面：注册一次绘制 + 语言切换重绘（ctx 退出时自动回收订阅）
    const draw = () => {
      const s = ctx.screen
      const str = osStrings(ctx.lang.get())
      s.clear()
      s.textCenter(s.w >> 1, 1, ctx.device.name)
      s.invertRect(0, 0, s.w, 12)
      const lines = [
        str.aboutByMaker(ctx.device.maker),
        str.aboutFirmware(ctx.device.era),
        str.aboutBattery(ctx.battery.percent),
        `SN ${ctx.device.id.toUpperCase().replace(/-/g, '')}`,
      ]
      lines.forEach((ln, i) => s.text(2, 15 + i * 7, ln, { size: 9 }))
      s.text(1, s.h - 9, str.aboutAnyKey, { size: 9 })
    }
    draw()
    ctx.onLang(draw)
    ctx.onKey(() => ctx.exit())
  },
}

import type { AppContext, MiniApp } from '../../../kernel/types'
import { osStrings } from '../strings'

/**
 * 1100 内置手电筒（真机标志性功能：顶部 LED）。
 * 真机为待机长按 C 点亮；本模拟在 IdleUI 的 frame 回调里轮询 isDown('clear') 判定 900ms 长按。
 * 点亮后整屏暗底 + 中央亮条（手电筒光束），按任意键熄灭返回。
 * （单色 LCD 无法显示「白光」，用反差表达：暗夜底 + 亮光束面板。）
 */
export const flashlightApp: MiniApp = {
  id: 'flashlight',
  name: '手电筒',
  nameEn: 'Torch',
  icon(s, x, y) {
    // 手电筒灯泡 + 光芒
    s.bitmap(x, y, [
      '...##...',
      '..####..',
      '..####..',
      '..####..',
      '...##...',
      '..#..#..',
      '.#....#.',
      '#......#',
    ])
  },
  start(ctx: AppContext) {
    let on = true
    const draw = () => {
      const s = ctx.screen
      const str = osStrings(ctx.lang.get())
      s.clear()
      if (on) {
        // 整屏暗底（夜），中央亮条 = 手电筒光束
        s.fillRect(0, 0, s.w, s.h)
        const ph = Math.min(26, s.h - 16)
        const py = ((s.h - ph) >> 1) - 1
        s.invertRect(5, py, s.w - 10, ph)
        s.textCenter(s.w >> 1, py + 3, str.flashlightTitle, { size: 12 })
        s.textCenter(s.w >> 1, py + 13, str.flashlightHint, { size: 9 })
      }
    }
    draw()
    ctx.onLang(draw)
    ctx.onKey((_k, repeat) => {
      // 长按 C 进入时键仍按着：忽略随后的自动重复，等用户重新按键
      if (repeat) return
      if (on) {
        on = false
        draw()
        // 短暂熄灭后再退出，避免视觉跳跃
        setTimeout(() => ctx.exit(), 160)
      } else {
        ctx.exit()
      }
    })
  },
}

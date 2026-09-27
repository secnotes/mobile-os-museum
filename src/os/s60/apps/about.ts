import type { AppContext, MiniApp } from '../../../kernel/types'
import { s60Strings } from '../strings'
import { C } from '../palette'
import { W, H, CONTENT_TOP, softBar, clearContent } from '../ui'

export const aboutApp: MiniApp = {
  id: 'about',
  name: '关于',
  nameEn: 'About',
  icon(s, x, y) {
    // 蓝底白 i
    s.fillRect(x, y, 44, 44, C.BLUE)
    s.fillRect(x + 19, y + 8, 6, 6, C.WHITE)
    s.fillRect(x + 19, y + 18, 6, 18, C.WHITE)
  },
  start(ctx: AppContext) {
    const ui = new AboutUI(ctx)
    ui.init()
    return () => ui.dispose()
  },
}

class AboutUI {
  private offs: Array<() => void> = []

  constructor(private ctx: AppContext) {}

  init() {
    this.offs.push(this.ctx.onKey(() => this.ctx.exit()))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.offs.push(this.ctx.every(1000, () => this.draw()))
    this.draw()
  }

  dispose() {
    this.offs.forEach((off) => off())
  }

  private draw() {
    const s = this.ctx.screen
    const str = s60Strings(this.ctx.lang.get())
    const d = this.ctx.device
    clearContent(s)
    // 仿 *#0000#：顶部蓝色 N73 标题块 + 逐行固件信息
    const cx = W / 2
    s.fillRect(0, CONTENT_TOP, W, 52, C.BLUE)
    s.textCenter(cx, CONTENT_TOP + 10, 'Nokia N73', { size: 20, color: C.WHITE })
    s.textCenter(cx, CONTENT_TOP + 36, str.aboutByMaker(d.maker), { size: 10, color: C.PALE })
    // 真机 *#0000# 五行
    const lines = [
      'V 3.0638.0.0.1',
      '26-07-2006',
      'Nokia N73 (RM-133)',
      '(c) Nokia',
      str.aboutFirmware(d.era),
      `240×320 TFT · ${str.aboutBattery(this.ctx.battery.percent)}`,
    ]
    lines.forEach((ln, i) => {
      s.textCenter(cx, CONTENT_TOP + 74 + i * 24, ln, { size: 12, color: C.INK })
    })
    s.textCenter(cx, H - 60, str.aboutAnyKey, { size: 10, color: C.GRAY })
    softBar(s, '', '')
  }
}

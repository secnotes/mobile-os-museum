import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { rrGrad } from '../graphics'
import { BBApp, type MenuCommand } from './common'

/**
 * Help：帮助文本，滚动阅读。
 */
export class HelpApp extends BBApp {
  private off = 0

  protected draw() {
    const s = this.ctx.screen
    s.fillRect(0, 0, 480, 320, C.WHITE)
    rrGrad(s, 0, 0, 480, 34, 0, [C.WP2, 3])
    s.text(12, 7, this.str.apps.help!, { size: 18, color: C.WHITE })

    // 按句号/分号分段，逐段折行绘制
    const paras = this.str.helpText.split(/(?<=。)|(?<=\.) /).filter((p) => p.trim())
    let y = 48 - this.off
    paras.forEach((p) => {
      const lines = wrapTo(s, p.trim(), 440)
      lines.forEach((ln) => {
        s.text(18, y, ln, { size: 15, color: C.INK, maxWidth: 444 })
        y += 22
      })
      y += 8
    })
    s.render()
  }

  protected onKeyApp(k: DeviceKey, _rep: boolean) {
    if (k === 'up') this.off = Math.max(0, this.off - 22)
    else if (k === 'down') this.off += 22
    else return
    this.draw()
  }

  protected menuItems(): MenuCommand[] {
    return []
  }
}

function wrapTo(s: { measure: (t: string, o: { size: number }) => number },
  text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const ch of text) {
    const test = line + ch
    if (s.measure(test, { size: 15 }) > maxW) { out.push(line); line = ch }
    else line = test
  }
  out.push(line)
  return out
}

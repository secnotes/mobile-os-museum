import type { Screen } from '../../hal/screen'

/** 按像素宽度换行（汉字/西文混排），\n 强制换行 */
export function wrapLines(
  s: Screen,
  text: string,
  maxW: number,
  size: number,
  font?: string,
): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (s.measure(line + ch, { size, font }) > maxW && line) {
        out.push(line)
        line = ch
      } else line += ch
    }
    out.push(line)
  }
  return out
}

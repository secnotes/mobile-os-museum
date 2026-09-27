/**
 * Mango 全拼输入法：虚拟 QWERTY 键盘上打字母 → 拼音串 → 候选字/词。
 * 字典复用功能机 T9 引擎的 DICT（音节→汉字）与 WORDS（词组），
 * 换掉数字键驱动，改为字母全拼切分 —— 也就是 Windows Phone 7.5
 * 在中文市场引以为傲的「键盘直接打拼音」体验。
 */
import { DICT, WORDS } from '../feature-phone/t9'

const MAX_CANDS = 10

/** buf 完整切成有效音节的所有方案（每个方案是音节数组） */
function segmentAll(buf: string): string[][] {
  const out: string[][] = []
  const dfs = (start: number, parts: string[]) => {
    if (out.length >= 12) return
    if (start === buf.length) {
      out.push([...parts])
      return
    }
    for (let end = start + 1; end <= Math.min(buf.length, start + 6); end++) {
      const seg = buf.slice(start, end)
      if (DICT[seg]) {
        parts.push(seg)
        dfs(end, parts)
        parts.pop()
      }
    }
  }
  dfs(0, [])
  return out
}

/** 以 prefix 开头的音节（如 "zh" → zhang/zhao/zhong…） */
function syllablesWithPrefix(prefix: string): string[] {
  if (!prefix) return []
  const out: string[] = []
  for (const py of Object.keys(DICT)) if (py.startsWith(prefix)) out.push(py)
  return out.sort((a, b) => a.length - b.length)
}

export class PinyinIme {
  /** 已敲的字母串 */
  buf = ''
  /** 候选（汉字/词） */
  cands: string[] = []
  candIdx = 0
  /** 提交候选时需要一并上屏的前缀音节字（如 "niha" 的 "ni"→"你"） */
  private lead = ''

  get active() {
    return this.buf.length > 0
  }

  /** 敲一个字母 */
  feed(ch: string) {
    if (!/^[a-z]$/.test(ch)) return
    this.buf += ch
    this.recompute()
  }

  /**
   * 删除：拼音串非空时删一个字母；删空后返回 'char'（调用方继续删正文）。
   */
  backspace(): 'letter' | 'char' {
    if (this.buf) {
      this.buf = this.buf.slice(0, -1)
      this.recompute()
      return 'letter'
    }
    return 'char'
  }

  /** 空格提交首选候选（真输入法习惯） */
  space(): string | null {
    if (this.buf && this.cands.length) return this.pick(0)
    return ' '
  }

  /** 上屏第 i 个候选 */
  pick(i: number): string | null {
    const s = this.cands[i]
    if (!s) return null
    const out = this.lead + s
    this.reset()
    return out
  }

  reset() {
    this.buf = ''
    this.cands = []
    this.candIdx = 0
    this.lead = ''
  }

  private recompute() {
    this.candIdx = 0
    this.cands = []
    this.lead = ''
    const buf = this.buf
    if (!buf) return
    const push = (s: string) => {
      if (s && !this.cands.includes(s) && this.cands.length < MAX_CANDS) this.cands.push(s)
    }
    // 1) 完整切分：词组优先，其次逐音节首字
    const segs = segmentAll(buf)
    if (segs.length) {
      for (const seg of segs) {
        const w = WORDS[seg.join(' ')]
        if (w) push(w)
      }
      for (const seg of segs) {
        push(seg.map((p) => DICT[p]?.[0] ?? '').join(''))
        // 末音节的备选字
        const alts = DICT[seg[seg.length - 1]!] ?? ''
        for (let k = 1; k <= 2 && k < alts.length; k++)
          push(seg.map((p, i) => (i === seg.length - 1 ? alts[k] : DICT[p]?.[0] ?? '')).join(''))
      }
      if (this.cands.length) return
    }
    // 2) 前缀输入（打到一半，如 "zh"）：最长完整音节前缀 + 尾巴模糊匹配
    let cut = buf.length - 1
    let headSeg: string[] = []
    while (cut >= 0) {
      const head = segmentAll(buf.slice(0, cut))
      if (head.length) {
        headSeg = head[0]!
        break
      }
      cut--
    }
    if (headSeg.length) {
      // 完整部分的首字组合随候选一起上屏
      this.lead = headSeg.map((p) => DICT[p]?.[0] ?? '').join('')
      const rest = buf.slice(cut)
      for (const py of syllablesWithPrefix(rest))
        for (const ch of DICT[py] ?? '') push(ch)
      if (this.cands.length) return
      this.lead = ''
    }
    // 3) 整串当模糊音节（如 "z" → 在/再…）
    for (const py of syllablesWithPrefix(buf))
      for (const ch of DICT[py] ?? '') push(ch)
  }
}

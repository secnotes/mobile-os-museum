import type { SeqNote } from '../../hal/audio'
import { midiFreq } from '../../hal/audio'

/**
 * 合成铃声。真机默认铃声为「马林巴琴」（专有录音无法分发），
 * 这里用 triangle 波 + 快衰减包络合成马林巴/木琴音色，旋律为原创泛奏。
 */
const mf = midiFreq
const note = (midi: number, d: number, extra: Partial<SeqNote> = {}): SeqNote => ({
  f: mf(midi), d, t: 'triangle', g: 0.32, ...extra,
})

/** 马林巴琴：沉稳的两小节泛奏（默认铃声） */
const MARIMBA: SeqNote[] = [
  note(76, 0.22, { gap: 0.04 }), note(71, 0.22, { gap: 0.04 }),
  note(74, 0.2, { gap: 0.04 }), note(79, 0.26, { gap: 0.05 }),
  note(76, 0.22, { gap: 0.04 }), note(83, 0.3, { gap: 0.05 }),
  note(79, 0.2, { gap: 0.04 }), note(81, 0.22, { gap: 0.04 }),
  note(79, 0.2, { gap: 0.04 }), note(74, 0.34, { gap: 0.12 }),
]

/** 木琴：高音区五声音阶跳跃 */
const XYLOPHONE: SeqNote[] = [
  note(84, 0.14, { gap: 0.05 }), note(88, 0.14, { gap: 0.05 }),
  note(91, 0.16, { gap: 0.05 }), note(88, 0.14, { gap: 0.05 }),
  note(84, 0.14, { gap: 0.05 }), note(81, 0.16, { gap: 0.05 }),
  note(84, 0.2, { gap: 0.1 }), note(79, 0.3, { gap: 0.12 }),
]

/** 门铃：叮——咚（正弦长音，下行大三度） */
const DOORBELL: SeqNote[] = [
  note(76, 0.9, { t: 'sine', g: 0.26, gap: 0.5 }),
  note(72, 1.1, { t: 'sine', g: 0.26, gap: 0.2 }),
]

/** 蟋蟀：高频快速脉冲群（真机为昆虫鸣，用短音脉冲近似） */
const CRICKETS: SeqNote[] = (() => {
  const out: SeqNote[] = []
  for (let k = 0; k < 10; k++)
    out.push(note(106, 0.05, { g: 0.16, gap: 0.05 }))
  out.push(note(106, 0.3, { g: 0.12, gap: 0.4 }))
  return out
})()

export const RINGTONES: SeqNote[][] = [MARIMBA, XYLOPHONE, DOORBELL, CRICKETS]

/** 短信提示音 Tri-tone：真机 1.0 默认短信音，三个上行短音 */
export const SMS_TONE: SeqNote[] = [
  note(76, 0.11, { g: 0.2, gap: 0.07 }),
  note(81, 0.11, { g: 0.2, gap: 0.07 }),
  note(86, 0.2, { g: 0.2, gap: 0.02 }),
]

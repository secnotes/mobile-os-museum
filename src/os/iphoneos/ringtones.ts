import type { SeqNote } from '../../hal/audio'
import { midiFreq } from '../../hal/audio'

/**
 * 合成铃声。真机默认铃声为「马林巴琴」（专有录音无法分发），
 * 这里用 triangle 波 + 快衰减包络合成马林巴/木琴音色，旋律为原创泛奏。
 * 为接近真机马林巴质感：每个旋律音叠加低八度共振（gain 折半），
 * 并以极短 attack 模拟琴槌击木的 click，整体两小节循环。
 */
const mf = midiFreq
const note = (midi: number, d: number, extra: Partial<SeqNote> = {}): SeqNote => ({
  f: mf(midi), d, t: 'triangle', g: 0.32, ...extra,
})

/**
 * 马林巴琴音：旋律音 + 低八度共振层（同时起振，负 gap 对齐）。
 * 返回两音：先共振（低 gain）再旋律，playSequence 按序排程、负 gap 让二者齐奏。
 */
const marimbaNote = (midi: number, d: number, gap = 0.04): SeqNote[] => [
  note(midi - 12, d, { gap, g: 0.14 }), // 低八度共振（先排，gap 正常）
  note(midi, d, { gap: -d, g: 0.3 }),    // 旋律音（负 gap 与共振齐奏）
]

/** 马林巴琴：两小节泛奏（默认铃声），旋律 + 共振层 */
const MARIMBA: SeqNote[] = [
  ...marimbaNote(76, 0.22, 0.04),
  ...marimbaNote(71, 0.22, 0.04),
  ...marimbaNote(74, 0.20, 0.04),
  ...marimbaNote(79, 0.26, 0.05),
  ...marimbaNote(76, 0.22, 0.04),
  ...marimbaNote(83, 0.30, 0.05),
  ...marimbaNote(79, 0.20, 0.04),
  ...marimbaNote(81, 0.22, 0.04),
  ...marimbaNote(79, 0.20, 0.04),
  ...marimbaNote(74, 0.34, 0.12),
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

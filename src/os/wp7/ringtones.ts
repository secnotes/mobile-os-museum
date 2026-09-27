/**
 * Windows Phone 7.5 铃声与音效表。
 * 来电铃声首选 Lumia 出厂默认的诺基亚铃声原声（复用展馆已有的 nokia_tune.ogg），
 * 其余铃声/提示音/闹钟音全部 WebAudio 合成（柔和三角波为主，Metro 清透风格）。
 * WP 微软专有默认铃声不可分发，以风格相近的合成曲替代。
 */
import type { AudioSynth } from '../../hal/audio'
import { midiFreq, noteMidi, type SeqNote } from '../../hal/audio'

/** 诺基亚经典铃声（Gran Vals 片段，Tárrega 1902，旋律已进入公有域）——旧旋律接口回落用 */
export const NOKIA_TUNE: ReadonlyArray<readonly [number, number]> = [
  [76, 0.5], [74, 0.5], [66, 1], [68, 1],
  [73, 0.5], [71, 0.5], [62, 1], [64, 1],
  [71, 0.5], [69, 0.5], [61, 1], [64, 1],
  [69, 2],
]

export interface SoundDef {
  zh: string
  en: string
  /** 预加载音频缓存名（nokia_tune.ogg 原声优先） */
  file?: string
  /** 合成序列（无文件时 / 作为试听） */
  seq?: SeqNote[]
}

/** 音名 → 序列音 */
function n(name: string, d: number, opts: { gap?: number; g?: number; t?: OscillatorType } = {}): SeqNote {
  return { f: midiFreq(noteMidi(name)), d, ...opts }
}

/** 来电铃声：诺基亚铃声（原声）+ 7 支合成短曲 */
export const RINGTONES: ReadonlyArray<SoundDef> = [
  { zh: '诺基亚铃声', en: 'Nokia tune', file: 'nokia_tune', seq: [n('E5', 0.5)] },
  {
    zh: '呼号', en: 'On top',
    seq: [n('B4', 0.14), n('E5', 0.5, { gap: 0.12 }), n('B4', 0.14, { gap: 0.35 }), n('#F5', 0.6, { gap: 0.12 })],
  },
  {
    zh: '小铃', en: 'Small bells',
    seq: [n('E5', 0.1), n('G5', 0.1, { gap: 0.05 }), n('B5', 0.1, { gap: 0.05 }), n('E6', 0.35, { gap: 0.05 })],
  },
  {
    zh: '绽放', en: 'Bloom',
    seq: [n('E4', 0.16), n('G4', 0.16), n('B4', 0.16), n('E5', 0.45)],
  },
  {
    zh: '脉冲', en: 'Pings',
    seq: [n('C6', 0.12), n('G5', 0.12, { gap: 0.15 }), n('C6', 0.12, { gap: 0.15 }), n('G5', 0.3, { gap: 0.15 })],
  },
  {
    zh: '弹珠', en: 'Marble',
    seq: [n('E5', 0.1), n('D5', 0.1, { gap: 0.04 }), n('G5', 0.1, { gap: 0.04 }), n('A5', 0.4, { gap: 0.04 })],
  },
  {
    zh: '蜂鸣', en: 'Beeper',
    seq: [
      n('A5', 0.09, { gap: 0.09, t: 'square', g: 0.14 }),
      n('A5', 0.09, { gap: 0.09, t: 'square', g: 0.14 }),
      n('A5', 0.09, { gap: 0.09, t: 'square', g: 0.14 }),
      n('A5', 0.09, { gap: 0.09, t: 'square', g: 0.14 }),
    ],
  },
  {
    zh: '切分', en: 'Syncopate',
    seq: [
      n('E5', 0.08), n('E5', 0.08, { gap: 0.03 }), n('G5', 0.08, { gap: 0.15 }),
      n('A5', 0.35, { gap: 0.03 }), n('B4', 0.25, { gap: 0.2 }),
    ],
  },
]

/** 短信提示音 5 支 */
export const SMS_SOUNDS: ReadonlyArray<SoundDef> = [
  { zh: '轻提示', en: 'Blip', seq: [n('E6', 0.12, { g: 0.16 })] },
  { zh: '叮咚', en: 'Ding', seq: [n('A5', 0.08, { g: 0.16 }), n('E6', 0.2, { gap: 0.04, g: 0.16 })] },
  { zh: '三音', en: 'Triad', seq: [n('E5', 0.06), n('G5', 0.06), n('B5', 0.18)] },
  { zh: '气泡', en: 'Pop', seq: [n('G6', 0.06, { g: 0.15 }), n('E6', 0.14, { gap: 0.02, g: 0.15 })] },
  { zh: '风铃', en: 'Chime', seq: [n('B5', 0.09, { t: 'sine' }), n('E6', 0.3, { gap: 0.05, t: 'sine' })] },
]

/** 闹钟音 4 支（循环） */
export const ALARM_SOUNDS: ReadonlyArray<SoundDef> = [
  {
    zh: '紧急蜂鸣', en: 'Alert',
    seq: [
      n('B5', 0.12, { gap: 0.12, t: 'square', g: 0.13 }), n('B5', 0.12, { gap: 0.12, t: 'square', g: 0.13 }),
      n('B5', 0.12, { gap: 0.12, t: 'square', g: 0.13 }), n('B5', 0.12, { gap: 0.12, t: 'square', g: 0.13 }),
    ],
  },
  { zh: '双铃', en: 'Double bell', seq: [n('E5', 0.25), n('A5', 0.3, { gap: 0.08 })] },
  {
    zh: '上下琶音', en: 'Up and down',
    seq: [n('C5', 0.1), n('E5', 0.1), n('G5', 0.1), n('C6', 0.1), n('G5', 0.1), n('E5', 0.22)],
  },
  {
    zh: '马林巴', en: 'Marimba',
    seq: [n('G4', 0.14), n('D5', 0.14), n('G5', 0.14), n('B5', 0.4)],
  },
]

/**
 * 播放声音：优先音频文件，无文件用合成序列。
 * loop=true（来电/闹钟）；返回 stop()。
 */
export function playSound(
  audio: AudioSynth,
  def: SoundDef,
  opts: { loop?: boolean; volume?: number } = {},
): () => void {
  if (def.file && audio.hasFile(def.file)) return audio.playFile(def.file, opts)
  if (def.seq) return audio.playSequence(def.seq, opts)
  return () => {}
}

// ---------- UI 音效（走 melody 接口的简短旋律） ----------

/** 短信到达：WP 的轻柔两音“叮咚” */
export const SMS_ALERT: ReadonlyArray<readonly [number, number]> = [
  [93, 0.16], [0, 0.06], [96, 0.4],
]

/** 解锁提示音（短促轻点） */
export const UNLOCK_CLICK: ReadonlyArray<readonly [number, number]> = [
  [91, 0.05], [0, 0.03], [91, 0.05],
]

/** 按键音（虚拟键盘，Mango 的轻点声） */
export const KEY_TICK: ReadonlyArray<readonly [number, number]> = [[95, 0.03]]

/** Toast 滑入：两声轻上挑 */
export const TOAST_SOUND: ReadonlyArray<readonly [number, number]> = [[88, 0.06], [93, 0.12]]

/** Pivot 横向切换：极短轻敲 */
export const PIVOT_TICK: ReadonlyArray<readonly [number, number]> = [[79, 0.04]]

/** PIN 数字键 */
export const PIN_TICK: ReadonlyArray<readonly [number, number]> = [[90, 0.05]]

/** 磁贴翻转 whoosh（噪声扫频） */
export function flipWhoosh(audio: AudioSynth) {
  audio.noiseBurst(0.16, { freq: 600, sweepTo: 2400, gain: 0.05 })
}

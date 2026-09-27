/**
 * Nokia N73（S60 3rd）真机声音资源。
 * Nokia tune（Gran Vals，Tárrega 1902，旋律已进入公有域）= 真机 OGG 原声；
 * 其余铃声为合成旋律（S60 标准铃声旋律为公开音符序列，Nokia 专有录音无公开源）。
 * loadAll() 在 OS init 时调用；未就绪时 playFile 静默跳过，回落到合成 melody。
 */
const BASE = `${import.meta.env.BASE_URL}s60/`

/** 铃声列表：第 0 个 = 真机 Nokia tune OGG；其余 = 合成旋律 */
export const RINGTONE_NAMES: ReadonlyArray<{ file: string; zh: string; en: string; synth?: ReadonlyArray<readonly [number, number]> }> = [
  { file: 'nokia_tune', zh: 'Nokia 经典', en: 'Nokia tune' },
  { file: 'cosmic', zh: '宇宙', en: 'Cosmic', synth: [[60, 1], [64, 1], [67, 1], [72, 2], [67, 1], [64, 1], [60, 2]] },
  { file: 'trail', zh: '轨迹', en: 'Trail', synth: [[69, 1], [72, 1], [76, 2], [74, 1], [72, 1], [69, 2]] },
  { file: 'tremor', zh: '震颤', en: 'Tremor', synth: [[64, 0.5], [64, 0.5], [67, 0.5], [67, 0.5], [71, 1], [69, 1], [64, 2]] },
  { file: 'marimba', zh: '马林巴', en: 'Marimba', synth: [[72, 0.5], [76, 0.5], [79, 1], [76, 0.5], [72, 0.5], [67, 1]] },
]

/** 短信提示音（Nokia tune 风格下行三连音） */
export const SMS_ALERT_NOTES: ReadonlyArray<readonly [number, number]> = [[84, 1], [79, 1], [76, 2]]

const SOUND_FILES: Record<string, string> = {
  nokia_tune: 'sounds/nokia_tune.ogg',
}

class AssetStore {
  private loaded = false

  /** 预加载声音（委托给 AudioSynth.loadFiles） */
  async loadAll(audio: { loadFiles(map: Record<string, string>): Promise<void> }): Promise<void> {
    if (this.loaded) return
    const soundMap: Record<string, string> = {}
    for (const [name, file] of Object.entries(SOUND_FILES)) soundMap[name] = BASE + file
    await audio.loadFiles(soundMap)
    this.loaded = true
  }
}

export const assets = new AssetStore()

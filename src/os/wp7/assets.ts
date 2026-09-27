import type { AudioSynth } from '../../hal/audio'

/**
 * WP7.5 资源加载：唯一的原声文件是诺基亚铃声（复用展馆 s60 目录的 ogg）；
 * 其余 UI（瓷贴/字形/字体）全部由调色板绘制，不需要位图资源。
 */
const SOUND_FILES: Record<string, string> = {
  nokia_tune: 's60/sounds/nokia_tune.ogg',
}

export const assets = {
  /** 预加载声音（OGG 原声；失败静默回落合成音） */
  async loadAll(audio: AudioSynth): Promise<void> {
    await audio.loadFiles(SOUND_FILES)
  },
}

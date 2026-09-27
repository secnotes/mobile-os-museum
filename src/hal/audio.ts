/**
 * 音频合成：全部音效用 WebAudio 现场合成（方波 = 芯片音质感），
 * 不加载任何音频文件。首次用户手势时 unlock()。
 */
export class AudioSynth {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** 解码后的音频缓存（真机铃声/闹钟/通知音原声） */
  private buffers = new Map<string, AudioBuffer>()

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.6
        this.master.connect(this.ctx.destination)
      } catch {
        this.ctx = null
      }
    } else if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** 设置主输出音量（0..0.7）；大哥大 Vol/Fcn 使用 */
  setMasterVolume(v: number) {
    if (this.master) this.master.gain.value = v
  }

  /** 预加载音频文件（.ogg 等）→ 解码为 AudioBuffer 缓存。未就绪时 playFile 静默跳过。 */
  async loadFile(name: string, url: string): Promise<void> {
    if (this.buffers.has(name)) return
    try {
      const res = await fetch(url)
      const arr = await res.arrayBuffer()
      // ensure ctx exists for decode (unlock may not have been called yet)
      if (!this.ctx) this.unlock()
      const buf = await this.ctx!.decodeAudioData(arr)
      this.buffers.set(name, buf)
    } catch {
      // 网络或解码失败：静默，调用方回落到合成音
    }
  }

  /** 批量预加载 {name: url} */
  async loadFiles(map: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(map).map(([n, u]) => this.loadFile(n, u)))
  }

  /** 缓存是否就绪 */
  hasFile(name: string): boolean {
    return this.buffers.has(name)
  }

  /**
   * 播放预加载的音频文件。返回 stop() 函数。
   * loop=true 时持续循环（闹钟），直到调用 stop。
   */
  playFile(name: string, opts: { loop?: boolean; volume?: number } = {}): () => void {
    if (!this.ctx || !this.master) return () => {}
    const buf = this.buffers.get(name)
    if (!buf) return () => {}
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = !!opts.loop
    const g = this.ctx.createGain()
    g.gain.value = opts.volume ?? 0.6
    src.connect(g).connect(this.master)
    src.start()
    return () => {
      try {
        src.stop()
      } catch {
        // 已停止
      }
    }
  }

  /** 单音，freq=0 为休止 */
  tone(
    freq: number,
    dur = 0.06,
    opts: { type?: OscillatorType; gain?: number; when?: number } = {},
  ) {
    if (!this.ctx || !this.master || freq <= 0) return
    const { type = 'square', gain = 0.05, when = 0 } = opts
    const t0 = this.ctx.currentTime + when
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  /** 按键哔声（高音短促） */
  keypad() {
    this.tone(1318, 0.03, { gain: 0.035 })
  }

  /** DTMF 双音多频：真机按数字键时的双频率拨号音 */
  dtmf(key: string) {
    const rows: Record<string, [number, number]> = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '0': [941, 1336], '*': [941, 1209], '#': [941, 1477],
    }
    const pair = rows[key]
    if (!pair) {
      this.keypad()
      return
    }
    this.tone(pair[0], 0.08, { type: 'sine', gain: 0.06 })
    this.tone(pair[1], 0.08, { type: 'sine', gain: 0.06 })
  }

  /** 回铃音：440+480Hz 双音频（北美标准，0.4s 通 0.2s 断由调用方控制节奏） */
  ringbackTone(dur = 0.4) {
    this.tone(440, dur, { type: 'sine', gain: 0.045 })
    this.tone(480, dur, { type: 'sine', gain: 0.045 })
  }

  /** 相机快门声：两声机械咔嗒 */
  shutter() {
    this.tone(1600, 0.015, { type: 'square', gain: 0.08 })
    this.tone(700, 0.03, { type: 'square', gain: 0.07, when: 0.05 })
  }

  /**
   * 播放单音旋律（一次性，不可停）。notes: [midi 音高(0=休止), 拍数][]
   * 仅供无需控制的简单场景；音乐播放器用 playMelody。
   */
  melody(notes: ReadonlyArray<readonly [number, number]>, bpm = 200): void {
    if (!this.ctx) return
    const beat = 60 / bpm
    let t = 0
    for (const [midi, beats] of notes) {
      if (midi > 0) {
        const dur = beats * beat * 0.9
        this.tone(midiFreq(midi), dur, { gain: 0.06, when: t })
      }
      t += beats * beat
    }
  }

  /**
   * 播放旋律并返回 stop()。支持从 offset 秒起播、loop 循环、音量调节。
   * notes: [midi(0=休止), 拍数][]。全部音符预排程，循环按时间窗续排。
   */
  playMelody(
    notes: ReadonlyArray<readonly [number, number]>,
    bpm = 160,
    opts: { loop?: boolean; volume?: number; offset?: number } = {},
  ): () => void {
    if (!this.ctx || !this.master || !notes.length) return () => {}
    const vol = opts.volume ?? 0.5
    const beat = 60 / bpm
    const evs: Array<{ start: number; d: number; f: number }> = []
    let t = 0
    for (const [midi, beats] of notes) {
      const span = beats * beat
      if (midi > 0) evs.push({ start: t, d: span * 0.92, f: midiFreq(midi) })
      t += span
    }
    const total = t
    const t0 = this.ctx.currentTime + 0.05
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    const schedule = (base: number, off: number) => {
      for (const e of evs) {
        const s0 = e.start - off
        const end = s0 + e.d
        if (end <= 0) continue
        const start = Math.max(0, s0)
        const d = end - start
        const at = base + start
        const g = this.ctx!.createGain()
        const peak = 0.1 * vol
        g.gain.setValueAtTime(0.0001, at)
        g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, at + d)
        const osc = this.ctx!.createOscillator()
        osc.type = 'square'
        osc.frequency.value = e.f
        osc.connect(g).connect(this.master!)
        osc.start(at)
        osc.stop(at + d + 0.03)
        oscs.push(osc)
        gains.push(g)
      }
    }
    const off = opts.offset ?? 0
    schedule(t0, off)
    let stopped = false
    let nextAt = t0 + (total - off)
    let timer: ReturnType<typeof setInterval> | null = null
    if (opts.loop) {
      timer = setInterval(() => {
        if (stopped || !this.ctx) return
        while (nextAt < this.ctx.currentTime + 1.5) {
          schedule(nextAt, 0)
          nextAt += total
        }
      }, 700)
    }
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      const now = this.ctx?.currentTime ?? 0
      for (const g of gains)
        try { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.0001, now, 0.03) } catch { /* 已释放 */ }
      for (const o of oscs)
        try { o.stop(now + 0.15) } catch { /* 已停止 */ }
    }
  }

  /**
   * 播放合成序列。loop=true 循环（铃声/闹钟）。返回 stop()。
   * 全部音符预先精确排程，循环通过时间窗续排实现。
   */
  playSequence(notes: SeqNote[], opts: { loop?: boolean; volume?: number } = {}): () => void {
    if (!this.ctx || !this.master || !notes.length) return () => {}
    const vol = opts.volume ?? 0.5
    const t0 = this.ctx.currentTime + 0.05
    const total = seqTotal(notes)
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    const schedule = (base: number) => {
      let at = 0
      for (const n of notes) {
        at += n.gap ?? 0
        const start = base + at
        const g = this.ctx!.createGain()
        const peak = (n.g ?? 0.22) * vol
        g.gain.setValueAtTime(0.0001, start)
        g.gain.exponentialRampToValueAtTime(peak, start + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, start + n.d)
        const osc = this.ctx!.createOscillator()
        osc.type = n.t ?? 'triangle'
        osc.frequency.value = n.f
        osc.connect(g).connect(this.master!)
        osc.start(start)
        osc.stop(start + n.d + 0.03)
        oscs.push(osc)
        gains.push(g)
        at += n.d
      }
    }
    schedule(t0)
    let stopped = false
    let next = t0 + total
    let timer: ReturnType<typeof setInterval> | null = null
    if (opts.loop) {
      timer = setInterval(() => {
        if (stopped || !this.ctx) return
        while (next < this.ctx.currentTime + 1.5) {
          schedule(next)
          next += total
        }
      }, 700)
    }
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      const now = this.ctx?.currentTime ?? 0
      for (const g of gains)
        try { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.0001, now, 0.03) } catch { /* 已释放 */ }
      for (const o of oscs)
        try { o.stop(now + 0.15) } catch { /* 已停止 */ }
    }
  }

  /** 2s 白噪声缓冲（FM 静场/过场 whoosh 用） */
  private noiseBuf(): AudioBuffer {
    let buf = this._noiseBuf
    if (!buf) {
      buf = this.ctx!.createBuffer(1, this.ctx!.sampleRate * 2, this.ctx!.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this._noiseBuf = buf
    }
    return buf
  }
  private _noiseBuf: AudioBuffer | null = null

  /** 短促噪声（过场/音效）：经带通滤波 */
  noiseBurst(dur: number, opts: { freq?: number; q?: number; gain?: number; sweepTo?: number } = {}) {
    if (!this.ctx || !this.master) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf()
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(opts.freq ?? 1200, t0)
    if (opts.sweepTo) bp.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur)
    bp.Q.value = opts.q ?? 0.8
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(opts.gain ?? 0.12, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }

  /**
   * FM 收音机静场：循环白噪声 → 带通（电台中心频率映射）→ 可调增益。
   * 返回 { stop, tune(freqMHz) }。
   */
  fmStatic(volume = 0.1): { stop: () => void; tune: (mhz: number) => void } {
    if (!this.ctx || !this.master) return { stop: () => {}, tune: () => {} }
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf()
    src.loop = true
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1000
    bp.Q.value = 0.6
    const g = this.ctx.createGain()
    g.gain.value = volume
    src.connect(bp).connect(g).connect(this.master)
    src.start()
    return {
      tune: (mhz) => {
        bp.frequency.setTargetAtTime(300 + (mhz - 87.5) * 120, this.ctx!.currentTime, 0.15)
      },
      stop: () => {
        try { src.stop() } catch { /* 已停 */ }
      },
    }
  }
}

/** 序列总时长（秒） */
function seqTotal(notes: ReadonlyArray<SeqNote>): number {
  let t = 0
  for (const n of notes) t += (n.gap ?? 0) + n.d
  return t
}

/** 序列音事件（铃声/短信/闹钟的合成定义） */
export interface SeqNote {
  f: number
  d: number
  t?: OscillatorType
  g?: number
  /** 相对上一音的起始间隔（缺省为连续播放） */
  gap?: number
}

/** MIDI 音高 → 频率 */
export function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** 旋律总时长（秒） */
export function melodyDuration(
  notes: ReadonlyArray<readonly [number, number]>,
  bpm = 160,
): number {
  const beat = 60 / bpm
  let t = 0
  for (const [, beats] of notes) t += beats * beat
  return t
}

/** 音名（如 'C5'、'#A4'）→ MIDI 音高 */
export function noteMidi(name: string): number {
  const m = /^([#b]?)([A-G])(\d)$/.exec(name)
  if (!m) return 0
  const [, acc, letter, oct] = m
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let n = base[letter]! + (oct as unknown as number) * 12 + 12
  if (acc === '#') n++
  if (acc === 'b') n--
  return n
}

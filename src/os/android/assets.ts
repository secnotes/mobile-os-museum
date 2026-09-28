/**
 * Android 1.0 真机资源（AOSP 1.0 + 真机 G1 系统 APK 提取）。
 * 图标/状态栏/壁纸/时钟挂件 = 真机同源 PNG；铃声/闹钟/通知音 = 真机 OGG 原声。
 * loadAll() 在 OS init 时调用；未就绪时 img()/snd() 返回 undefined，调用方回落到像素绘制。
 */
const BASE = `${import.meta.env.BASE_URL}g1/`

/** 图标名 → 文件名（真机 APK ic_launcher_*.png 提取，48×48 RGBA） */
const ICON_FILES: Record<string, string> = {
  AlarmClock: 'icons/AlarmClock.png',
  Amazon: 'icons/Amazon.png',
  Android: 'icons/Android.png',
  Browser: 'icons/Browser.png',
  Calculator: 'icons/Calculator.png',
  Calendar: 'icons/Calendar.png',
  Camera: 'icons/Camera.png',
  Contacts: 'icons/Contacts.png',
  Dialer: 'icons/Dialer.png',
  Gmail: 'icons/Gmail.png',
  IM: 'icons/IM.png',
  Maps: 'icons/Maps.png',
  Market: 'icons/Market.png',
  Messaging: 'icons/Messaging.png',
  Music: 'icons/Music.png',
  Settings: 'icons/Settings.png',
  YouTube: 'icons/YouTube.png',
}

/** 框架资源（framework-res.apk 提取） */
const FW_FILES: Record<string, string> = {
  bootMask: 'fw/android-logo-mask.png',
  bootShine: 'fw/android-logo-shine.png',
  wallpaper: 'fw/default_wallpaper.jpg',
  clockDial: 'fw/clock_dial.png',
  clockHour: 'fw/clock_hour.png',
  clockMinute: 'fw/clock_minute.png',
  lockIcon: 'fw/ic_lock_idle_lock.png',
  btnCheckOn: 'fw/btn_check_on.png',
  btnCheckOff: 'fw/btn_check_off.png',
  codeLockDot: 'fw/btn_code_lock_default.png',
  ringerSilent: 'fw/stat_sys_ringer_silent.png',
  notifySms: 'fw/stat_notify_sms.png',
  notifyChat: 'fw/stat_notify_chat.png',
  notifyMissedCall: 'fw/stat_notify_missed_call.png',
  closeIcon: 'fw/ic_menu_close_clear_cancel.png',
}

/** 状态栏电池/信号图标（按档位） */
const BATTERY_LEVELS = [0, 10, 20, 40, 60, 80, 100] as const
const SIGNAL_LEVELS = [0, 1, 2, 3, 4] as const

/** 铃声（15 首）—— AOSP 1.0 Ring_Classic/Digital/Synth 01-05 */
export const RINGTONE_NAMES: ReadonlyArray<{ file: string; zh: string; en: string }> = [
  { file: 'ringtones/Ring_Classic_01', zh: '经典 01', en: 'Ring Classic 01' },
  { file: 'ringtones/Ring_Classic_02', zh: '经典 02', en: 'Ring Classic 02' },
  { file: 'ringtones/Ring_Classic_03', zh: '经典 03', en: 'Ring Classic 03' },
  { file: 'ringtones/Ring_Classic_04', zh: '经典 04', en: 'Ring Classic 04' },
  { file: 'ringtones/Ring_Classic_05', zh: '经典 05', en: 'Ring Classic 05' },
  { file: 'ringtones/Ring_Digital_01', zh: '数字 01', en: 'Ring Digital 01' },
  { file: 'ringtones/Ring_Digital_02', zh: '数字 02', en: 'Ring Digital 02' },
  { file: 'ringtones/Ring_Digital_03', zh: '数字 03', en: 'Ring Digital 03' },
  { file: 'ringtones/Ring_Digital_04', zh: '数字 04', en: 'Ring Digital 04' },
  { file: 'ringtones/Ring_Digital_05', zh: '数字 05', en: 'Ring Digital 05' },
  { file: 'ringtones/Ring_Synth_01', zh: '合成 01', en: 'Ring Synth 01' },
  { file: 'ringtones/Ring_Synth_02', zh: '合成 02', en: 'Ring Synth 02' },
  { file: 'ringtones/Ring_Synth_03', zh: '合成 03', en: 'Ring Synth 03' },
  { file: 'ringtones/Ring_Synth_04', zh: '合成 04', en: 'Ring Synth 04' },
  { file: 'ringtones/Ring_Synth_05', zh: '合成 05', en: 'Ring Synth 05' },
]

/** 闹钟音（7 个）—— AOSP 1.0 Alarm_* */
export const ALARM_NAMES: ReadonlyArray<{ file: string; zh: string; en: string }> = [
  { file: 'alarms/Alarm_Beep_01', zh: '哔哔 01', en: 'Beep 01' },
  { file: 'alarms/Alarm_Beep_02', zh: '哔哔 02', en: 'Beep 02' },
  { file: 'alarms/Alarm_Beep_03', zh: '哔哔 03', en: 'Beep 03' },
  { file: 'alarms/Alarm_Buzzer', zh: '蜂鸣', en: 'Buzzer' },
  { file: 'alarms/Alarm_Classic', zh: '经典', en: 'Classic' },
  { file: 'alarms/Alarm_Rooster_01', zh: '公鸡 01', en: 'Rooster 01' },
  { file: 'alarms/Alarm_Rooster_02', zh: '公鸡 02', en: 'Rooster 02' },
]

/** 通知音 */
export const NOTIFY_FILES = {
  sms: 'notifications/F1_New_SMS',
  mms: 'notifications/F1_New_MMS',
  missedCall: 'notifications/F1_MissedCall',
}

const SOUND_FILES: Record<string, string> = {
  ...Object.fromEntries(RINGTONE_NAMES.map((r) => [r.file, `sounds/${r.file}.ogg`])),
  ...Object.fromEntries(ALARM_NAMES.map((a) => [a.file, `sounds/${a.file}.ogg`])),
  [NOTIFY_FILES.sms]: `sounds/${NOTIFY_FILES.sms}.ogg`,
  [NOTIFY_FILES.mms]: `sounds/${NOTIFY_FILES.mms}.ogg`,
  [NOTIFY_FILES.missedCall]: `sounds/${NOTIFY_FILES.missedCall}.ogg`,
}

class AssetStore {
  private imgs = new Map<string, CanvasImageSource>()
  private loaded = false

  /** 预加载全部图片 + 声音（声音委托给 AudioSynth.loadFiles） */
  async loadAll(audio: { loadFiles(map: Record<string, string>): Promise<void> }): Promise<void> {
    if (this.loaded) return
    const allImg: Record<string, string> = {
      ...Object.fromEntries(Object.entries(ICON_FILES).map(([k, v]) => [`icon:${k}`, v])),
      ...Object.fromEntries(Object.entries(FW_FILES).map(([k, v]) => [`fw:${k}`, v])),
      ...Object.fromEntries(
        BATTERY_LEVELS.map((l) => [`fw:battery:${l}`, `fw/stat_sys_battery_${l}.png`] as const),
      ),
      ...Object.fromEntries(
        SIGNAL_LEVELS.map((l) => [`fw:signal:${l}`, `fw/stat_sys_signal_${l}.png`] as const),
      ),
    }
    const entries = Object.entries(allImg)
    await Promise.all(
      entries.map(async ([name, file]) => {
        try {
          const res = await fetch(BASE + file)
          if (!res.ok) return
          const blob = await res.blob()
          const bmp = await createImageBitmap(blob)
          this.imgs.set(name, bmp)
        } catch {
          // 加载失败：调用方回落到像素绘制
        }
      }),
    )
    // 声音交给 AudioSynth 缓存
    const soundMap: Record<string, string> = {}
    for (const [name, file] of Object.entries(SOUND_FILES)) soundMap[name] = BASE + file
    await audio.loadFiles(soundMap)
    this.loaded = true
  }

  /** 应用图标（48×48） */
  icon(name: string): CanvasImageSource | undefined {
    return this.imgs.get(`icon:${name}`)
  }

  /** 框架资源 */
  fw(name: keyof typeof FW_FILES): CanvasImageSource | undefined {
    return this.imgs.get(`fw:${name}`)
  }

  /** 电池图标（按电量档位 0/10/20/40/60/80/100） */
  battery(level: number): CanvasImageSource | undefined {
    const clamped = BATTERY_LEVELS.reduce((best, l) => (l <= level ? l : best), 0)
    return this.imgs.get(`fw:battery:${clamped}`)
  }

  /** 信号图标（0-4 档） */
  signal(bars: number): CanvasImageSource | undefined {
    return this.imgs.get(`fw:signal:${Math.max(0, Math.min(4, bars))}`)
  }
}

export const assets = new AssetStore()
export const FONT_BASE = BASE

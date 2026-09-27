/**
 * 情景模式数据：General / Silent / Discreet / Loud / My style
 * （对齐 1100/3310 用户指南 Profiles；名称双语）。
 * 激活时把模式设置写入 tones:conf，铃声/振动/按键音全部走既有通道。
 */

export interface ProfileSettings {
  /** 铃声音量 0..4 */
  ringLevel: number
  /** 来电提醒方式 */
  alert: 'ring' | 'ascending' | 'once'
  keyBeep: boolean
  vibrate: boolean
  /** 短信提示音 */
  msgSound: boolean
}

export interface ProfileDef {
  zh: string
  en: string
  preset: ProfileSettings
}

export const PROFILES: ReadonlyArray<ProfileDef> = [
  {
    zh: '标准', en: 'General',
    preset: { ringLevel: 3, alert: 'ring', keyBeep: true, vibrate: false, msgSound: true },
  },
  {
    zh: '无声', en: 'Silent',
    preset: { ringLevel: 0, alert: 'once', keyBeep: false, vibrate: false, msgSound: false },
  },
  {
    zh: '轻响', en: 'Discreet',
    preset: { ringLevel: 2, alert: 'once', keyBeep: true, vibrate: true, msgSound: true },
  },
  {
    zh: '响亮', en: 'Loud',
    preset: { ringLevel: 4, alert: 'ring', keyBeep: true, vibrate: false, msgSound: true },
  },
  {
    zh: '自定义', en: 'My style',
    preset: { ringLevel: 3, alert: 'ring', keyBeep: true, vibrate: true, msgSound: true },
  },
]

/** profiles:conf：活动模式 + 各模式个性化覆盖（未覆盖项取预设） */
export interface ProfilesConf {
  active: number
  /** 长度 5；null 项 = 仍用预设 */
  pers: Array<ProfileSettings | null>
}

export const DEFAULT_PROFILES: ProfilesConf = {
  active: 0,
  pers: [null, null, null, null, null],
}

/** 取某模式实际生效设置（个性化覆盖优先） */
export function effectiveSettings(conf: ProfilesConf, idx: number): ProfileSettings {
  return { ...PROFILES[idx]!.preset, ...conf.pers[idx] }
}

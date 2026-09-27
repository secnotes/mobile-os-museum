/**
 * 情景编排共享数据模型（通讯录 / 通话记录 / 来电来短信事件）。
 * 所有键按 `${deviceId}:<key>` 存于同一 IndexedDB（mobile-museum 库 kv 表），
 * 与设备内 OS 共用同一 Store，设置页写入 → OS 的 onChange 即时感知。
 */

/** 通讯录条目 */
export interface Contact {
  name: string
  /** 手机号码（默认号码） */
  tel: string
  /** 住宅电话 */
  home?: string
  email?: string
  company?: string
  /** 分组（朋友/家人/同事/重要） */
  group?: string
}

/** 通用事件日志条目（短信 / 数据连接，通讯记录→事件日志） */
export interface LogEvent {
  id: number
  kind: 'sms' | 'data'
  dir: 'in' | 'out'
  text: string
  ts: number
}

/** 通话记录条目 */
export interface CallEntry {
  id: number
  tel: string
  name: string
  /** 来电 / 去电 */
  dir: 'in' | 'out'
  ts: number
  /** 通话时长（秒）；未接为 0 */
  dur: number
  /** 未接来电（来电未接听） */
  missed: boolean
}

/** 情景事件：进入设备后 delaySec 秒触发的来电 / 来短信 */
export interface ScenarioEvent {
  id: number
  type: 'call' | 'sms'
  /** 来电号码 / 短信发送方 */
  from: string
  /** 联系人名（来电显示 / 短信署名） */
  name: string
  /** 短信内容（type==='sms' 时用） */
  text?: string
  /** 进入设备后多少秒触发 */
  delaySec: number
  /** 是否已触发（触发后置 true，避免重复） */
  fired: boolean
}

/** 通讯录默认种子（首次读取无数据时写回） */
export const SEED_CONTACTS: ReadonlyArray<Contact> = [
  { name: '妈妈', tel: '13912345678' },
  { name: '爸爸', tel: '13800001111' },
  { name: '张伟', tel: '13722223333' },
  { name: '客服热线', tel: '10086' },
]

/** 通话记录默认为空（首次无数据时返回 []，不写回） */
export const EMPTY_CALLLOG: readonly CallEntry[] = []

/** 读取通讯录：无数据时返回种子（可选写回） */
export type ContactGetter =
  | (<T>(key: string) => Promise<T | undefined>)
  | (() => Promise<Contact[]>)

export async function loadContacts(get: ContactGetter): Promise<Contact[]> {
  const saved: Contact[] | undefined =
    get.length === 0
      ? await (get as () => Promise<Contact[]>)()
      : await (get as <T>(key: string) => Promise<T | undefined>)<Contact[]>('contacts')
  return saved && saved.length ? saved : [...SEED_CONTACTS]
}

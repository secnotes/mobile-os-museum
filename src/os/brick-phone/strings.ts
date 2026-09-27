import type { Lang } from '../../i18n'

/**
 * 大哥大系统层双语文案。屏幕 72×48，
 * 12px 汉字约 6 字/行，9px 拉丁约 13 字符/行，文案刻意精简。
 */
export interface BrickStrings {
  /** 待机屏运营商名 */
  operator: string
  /** 星期全拼（按 getDay 排序，日..六） */
  weekdays: string[]
  dialCall: string
  dialExit: string
  calling: string
  inCall: string
  endCall: string
  listOpen: string
  listExit: string
  listWrite: string
  noMsgs: string
  toPrefix: string
  readReply: string
  readBack: string
  composeSend: string
  composeExit: string
  imePy: string
  imeEn: string
  imeNum: string
  msgsSending: string
  msgsSent: string
  /** 通讯录 / 来电 */
  contactsTitle: string
  contactsCall: string
  contactsBack: string
  contactsEmpty: string
  incomingCall: string
  incomingAnswer: string
  incomingReject: string
  ringMuted: string
  /** M+ 存号命名 */
  nameEntry: string
  saveConfirm: string
  saveCancel: string
  saved: string
  /** Fcn 快速静音 / Vol 音量 */
  silentOn: string
  silentOff: string
  volLabel: string
  /** 短信中心服务号（发欢迎短信的"号码"） */
  serviceNum: string
  recipient: string
  seedWelcome: string
  seedMom: string
  replies: string[]
}

export const BRICK_STRINGS: Record<Lang, BrickStrings> = {
  zh: {
    operator: '中国电信',
    weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    dialCall: '呼叫',
    dialExit: '结束',
    calling: '正在呼叫',
    inCall: '通话中',
    endCall: '挂断',
    listOpen: '读',
    listExit: '结束',
    listWrite: '写',
    noMsgs: '无短信',
    toPrefix: '发:',
    readReply: '回复',
    readBack: '返回',
    composeSend: '发送',
    composeExit: '结束',
    imePy: '拼音',
    imeEn: '英文',
    imeNum: '数字',
    msgsSending: '正在发送',
    msgsSent: '已送达',
    contactsTitle: '电话本',
    contactsCall: '呼叫',
    contactsBack: '返回',
    contactsEmpty: '电话本为空',
    incomingCall: '来电',
    incomingAnswer: '接听',
    incomingReject: '挂断',
    ringMuted: '已静音',
    nameEntry: '输入姓名',
    saveConfirm: '存储',
    saveCancel: '结束',
    saved: '已存储',
    silentOn: '静音开',
    silentOff: '静音关',
    volLabel: '音量',
    serviceNum: '1258',
    recipient: '妈妈',
    seedWelcome: '欢迎使用大哥大！本月话费已超支，请尽快到营业厅缴费。',
    seedMom: '长途费贵，长话短说。周末回家吃饭吗？',
    replies: ['收到，勿念', '早点回家吃饭', '话费贵，少打长途', '天冷多穿点', '给你留了饭', '周末回来吗'],
  },
  en: {
    operator: 'CN-TELECOM',
    weekdays: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    dialCall: 'Call',
    dialExit: 'End',
    calling: 'Calling',
    inCall: 'In call',
    endCall: 'End',
    listOpen: 'Read',
    listExit: 'End',
    listWrite: 'Write',
    noMsgs: 'No msgs',
    toPrefix: 'To:',
    readReply: 'Reply',
    readBack: 'Back',
    composeSend: 'Send',
    composeExit: 'End',
    imePy: 'Pinyin',
    imeEn: 'ABC',
    imeNum: '123',
    msgsSending: 'Sending',
    msgsSent: 'Sent',
    contactsTitle: 'Phone book',
    contactsCall: 'Call',
    contactsBack: 'Back',
    contactsEmpty: 'Empty',
    incomingCall: 'Incoming',
    incomingAnswer: 'Answer',
    incomingReject: 'Reject',
    ringMuted: 'MUTED',
    nameEntry: 'ENTER NAME',
    saveConfirm: 'Save',
    saveCancel: 'End',
    saved: 'SAVED',
    silentOn: 'SILENT',
    silentOff: 'NORMAL',
    volLabel: 'VOL',
    serviceNum: '1258',
    recipient: 'Mom',
    seedWelcome: 'Welcome! Your bill is overdue - please pay at a service hall soon.',
    seedMom: 'Long distance is pricey, keep it short. Dinner this weekend?',
    replies: [
      'Got it, no worries',
      'Come home early',
      'Calls cost a lot',
      'Dress warm',
      'I saved you dinner',
      'Home this wknd?',
    ],
  },
}

/** 当前语言词表 */
export function brickStrings(lang: Lang): BrickStrings {
  return BRICK_STRINGS[lang]
}

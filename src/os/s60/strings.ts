import type { Lang } from '../../i18n'

/**
 * S60 系统层双语文案。屏幕 240×320，字号宽松，
 * 12px 标签 / 14px 正文 / 20px 以上标题。
 */
export interface S60Strings {
  operator: string
  /** 待机左软键：进功能表 */
  idleMenu: string
  /** 待机右软键：进电话本 */
  idleContacts: string
  menuTitle: string
  menuExit: string
  /** 待机日期行：{m}月{d}日 周{x} / {m}/{d} {wk} */
  dateLine: (m: number, d: number, wk: string) => string
  weekdays: string[]
  dialCall: string
  dialClear: string
  calling: string
  inCall: string
  endCall: string
  callEnded: string
  /** 通话中选项 */
  callOptions: string
  callMute: string
  callUnmute: string
  callSpeaker: string
  callEarpiece: string
  callHold: string
  callResume: string
  callHeld: string
  msgsTitle: string
  msgsOpen: string
  /** 收件箱左软键：写新信息 */
  msgsNew: string
  msgsExit: string
  msgsReply: string
  msgsBack: string
  msgsSend: string
  msgsSending: string
  msgsSent: string
  msgsEmpty: string
  fmInbox: string
  fmMyFolders: string
  fmDrafts: string
  fmSentItems: string
  fmOutbox: string
  fmSelect: string
  toPrefix: string
  mePrefix: string
  imePy: string
  imeEn: string
  imeNum: string
  contactsTitle: string
  contactsCall: string
  contactsBack: string
  /** 名片夹详情卡 / 编辑 */
  cOpen: string
  cNew: string
  cDelete: string
  cEdit: string
  cName: string
  cMobile: string
  cHomeTel: string
  cEmail: string
  cCompany: string
  cGroup: string
  cGroups: string[]
  cSaved: string
  cEmpty: string
  cNeedName: string
  /** 通话记录 */
  logTitle: string
  logCall: string
  logBack: string
  logEmpty: string
  logMissed: string
  /** B9 通讯记录三 pane + 事件日志/计时 */
  logReceived: string
  logDialled: string
  logEvents: string
  logTimers: string
  logEvtSMS: string
  logEvtData: string
  logEvtIn: string
  logEvtOut: string
  logEvtEmpty: string
  logTotalIn: string
  logTotalOut: string
  logMissedN: string
  /** 来电 */
  incomingCall: string
  incomingAnswer: string
  incomingReject: string
  /** 相机 */
  camTitle: string
  camCapture: string
  camExit: string
  camSaved: string
  camGallery: string
  camEmpty: string
  camDelete: string
  camDeleted: string
  /** B9 横屏相机：闪光灯模式 */
  camFlash: string
  camFlashV: string[]
  /** 贪吃蛇 */
  snakeOver: (score: number, record: boolean) => string
  snakePause: string
  snakePaused: string
  /** 设置 */
  setTitle: string
  setWallpaper: string
  setKeyBeep: string
  setRingtone: string
  setActiveStandby: string
  setAutoLock: string
  /** 壁纸预设名（蓝天/草原/夜幕） */
  wallpapers: string[]
  setOn: string
  setOff: string
  setDone: string
  /** B6 设置树 */
  setProfiles: string
  setThemes: string
  setDateTime: string
  setPhone: string
  setSecurity: string
  setFactory: string
  setRingVolume: string
  setVibration: string
  setMsgTone: string
  setWarnTone: string
  setFontSize: string
  fontSizes: string[]
  setHour24: string
  setHour: string
  setMinute: string
  setAutoTime: string
  setBrightness: string
  brightnessV: string[]
  setLanguage: string
  setCallSet: string
  setConnSet: string
  setCallWaiting: string
  setCallForward: string
  setSendId: string
  setBluetooth: string
  setPacketData: string
  packetDataV: string[]
  setPinReq: string
  setSecCode: string
  codeTitle: string
  codeOk: string
  codeBad: string
  resetDone: string
  /** 关于 */
  aboutByMaker: (maker: string) => string
  aboutFirmware: (era: number) => string
  aboutBattery: (pct: number) => string
  aboutAnyKey: string
  /** 短信生态 */
  serviceNum: string
  recipient: string
  seedWelcome: string
  seedMom: string
  replies: string[]
  /** 电话本种子 */
  contactsSeed: Array<{ name: string; tel: string }>
  /** 6 种情景模式：标准/无声/会议/户外/寻呼机/离线 */
  profileNames: string[]
  /** 待机日历插件：今天无日历项 */
  calNoEvents: string
  /** 电源键菜单 */
  pmPowerOff: string
  pmLockKeys: string
  pmRemoveCard: string
  pmRemoveCardMsg: string
  pmProfilesHint: string
  /** 键盘锁 */
  keysLocked: string
  /** 功能表 Options 软键菜单 */
  optsOpen: string
  optsChangeView: string
  optsMemDetails: string
  optsHelp: string
  optsExit: string
  memDetailsText: string
  helpText: string
  /** 功能表视图：宫格/列表 */
  viewGrid: string
  viewList: string
  /** 未开放功能的提示 */
  notAvail: string
}

export const S60_STRINGS: Record<Lang, S60Strings> = {
  zh: {
    operator: '中国移动',
    idleMenu: '功能表',
    idleContacts: '名片',
    menuTitle: '功能表',
    menuExit: '退出',
    dateLine: (m, d, wk) => `${m}月${d}日 ${wk}`,
    weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    dialCall: '呼叫',
    dialClear: '清空',
    calling: '正在呼叫…',
    inCall: '通话中',
    endCall: '挂断',
    callEnded: '通话已结束',
    callOptions: '选项',
    callMute: '静音',
    callUnmute: '取消静音',
    callSpeaker: '扬声器',
    callEarpiece: '听筒',
    callHold: '保持',
    callResume: '恢复',
    callHeld: '通话已保持',
    msgsTitle: '信息',
    msgsOpen: '打开',
    msgsNew: '写信息',
    msgsExit: '退出',
    msgsReply: '回复',
    msgsBack: '返回',
    msgsSend: '发送',
    msgsSending: '正在发送…',
    msgsSent: '已送达',
    msgsEmpty: '收件箱是空的',
    fmInbox: '收件箱',
    fmMyFolders: '我的文件夹',
    fmDrafts: '草稿',
    fmSentItems: '已发送',
    fmOutbox: '未发送',
    fmSelect: '打开',
    toPrefix: '发：',
    mePrefix: '我 → ',
    imePy: '拼音',
    imeEn: 'Abc',
    imeNum: '123',
    contactsTitle: '名片夹',
    contactsCall: '通话',
    contactsBack: '返回',
    cOpen: '打开',
    cNew: '新建联系人',
    cDelete: '删除联系人',
    cEdit: '编辑',
    cName: '姓名',
    cMobile: '手机',
    cHomeTel: '住宅',
    cEmail: '邮箱',
    cCompany: '公司',
    cGroup: '分组',
    cGroups: ['朋友', '家人', '同事', '重要'],
    cSaved: '已保存',
    cEmpty: '名片夹是空的',
    cNeedName: '请输入姓名',
    logTitle: '记录',
    logCall: '重拨',
    logBack: '返回',
    logEmpty: '无通话记录',
    logMissed: '未接',
    logReceived: '已接',
    logDialled: '已拨',
    logEvents: '事件日志',
    logTimers: '通话计时',
    logEvtSMS: '短信',
    logEvtData: '数据',
    logEvtIn: '接收',
    logEvtOut: '发送',
    logEvtEmpty: '无事件',
    logTotalIn: '已接来电总计',
    logTotalOut: '已拨电话总计',
    logMissedN: '未接来电',
    incomingCall: '来电',
    incomingAnswer: '接听',
    incomingReject: '挂断',
    camTitle: '相机',
    camCapture: '拍摄',
    camExit: '退出',
    camSaved: '已保存到相册',
    camGallery: '相册',
    camEmpty: '相册是空的，先拍一张吧',
    camDelete: '删除',
    camDeleted: '已删除',
    camFlash: '闪光灯',
    camFlashV: ['自动', '强制', '关闭'],
    snakeOver: (score, record) => (record ? `新纪录！${score} 分` : `得分 ${score}`),
    snakePause: '暂停',
    snakePaused: '已暂停',
    setTitle: '设置',
    setWallpaper: '壁纸',
    setKeyBeep: '按键音',
    setRingtone: '铃声',
    setActiveStandby: '活动待机',
    setAutoLock: '自动锁键盘',
    wallpapers: ['蓝天', '草原', '夜幕'],
    setOn: '开',
    setOff: '关',
    setDone: '已设置',
    setProfiles: '情景模式',
    setThemes: '主题模式',
    setDateTime: '日期和时间',
    setPhone: '手机设置',
    setSecurity: '安全性设置',
    setFactory: '恢复出厂设置',
    setRingVolume: '铃声音量',
    setVibration: '振动',
    setMsgTone: '信息提示音',
    setWarnTone: '警告音',
    setFontSize: '字号',
    fontSizes: ['普通', '小号'],
    setHour24: '24 小时制',
    setHour: '时钟—时',
    setMinute: '时钟—分',
    setAutoTime: '自动更新时间',
    setBrightness: '亮度',
    brightnessV: ['暗', '较暗', '亮', '最亮'],
    setLanguage: '手机语言',
    setCallSet: '通话设置',
    setConnSet: '连接设置',
    setCallWaiting: '呼叫等待',
    setCallForward: '呼叫转移',
    setSendId: '发送本机号码',
    setBluetooth: '蓝牙',
    setPacketData: '分组数据连接',
    packetDataV: ['总是在线', '当需要时'],
    setPinReq: 'PIN 码请求',
    setSecCode: '保密码',
    codeTitle: '输入保密码',
    codeOk: '保密码正确',
    codeBad: '密码错误',
    resetDone: '已恢复出厂设置',
    aboutByMaker: (maker) => `${maker} 出品`,
    aboutFirmware: (era) => `Symbian OS 9.1 · S60 3rd · ${era}`,
    aboutBattery: (pct) => `电量 ${pct}%`,
    aboutAnyKey: '按任意键返回',
    serviceNum: '10086',
    recipient: '妈妈',
    seedWelcome: '欢迎使用中国移动GPRS业务！本月流量已用 0.0KB，放心冲浪。',
    seedMom: '周末回家吃饭吗？学会发彩信了，拍了院里的花，回个信息看看。',
    replies: ['好的，知道了', '记得按时吃饭', '天冷多穿点衣服', '少玩手机，早点睡', '给你留了饭', '周末回家吃饭吗'],
    contactsSeed: [
      { name: '妈妈', tel: '13912345678' },
      { name: '爸爸', tel: '13800001111' },
      { name: '张伟', tel: '13722223333' },
      { name: '客服热线', tel: '10086' },
    ],
    profileNames: ['标准', '无声', '会议', '户外', '寻呼机', '离线'],
    calNoEvents: '今天无日历项',
    pmPowerOff: '关机',
    pmLockKeys: '锁键盘',
    pmRemoveCard: '取出存储卡',
    pmRemoveCardMsg: '现在可以安全取出存储卡。',
    pmProfilesHint: '选择情景模式',
    keysLocked: '按键已锁',
    optsOpen: '打开',
    optsChangeView: '更改视图',
    optsMemDetails: '存储详情',
    optsHelp: '帮助',
    optsExit: '退出',
    memDetailsText: '手机存储：可用 41 MB\n存储卡：已用 620 MB / 共 1024 MB',
    helpText: '用导航键移动选择，按中键打开，按右软键返回。',
    viewGrid: '宫格视图',
    viewList: '列表视图',
    notAvail: '此功能暂不可用',
  },
  en: {
    operator: 'CN Mobile',
    idleMenu: 'Menu',
    idleContacts: 'Contacts',
    menuTitle: 'Menu',
    menuExit: 'Exit',
    dateLine: (m, d, wk) => `${m}/${d} ${wk}`,
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dialCall: 'Call',
    dialClear: 'Clear',
    calling: 'Calling…',
    inCall: 'In call',
    endCall: 'End',
    callEnded: 'Call ended',
    callOptions: 'Options',
    callMute: 'Mute',
    callUnmute: 'Unmute',
    callSpeaker: 'Loudspeaker',
    callEarpiece: 'Handset',
    callHold: 'Hold',
    callResume: 'Resume',
    callHeld: 'Call on hold',
    msgsTitle: 'Messages',
    msgsOpen: 'Open',
    msgsNew: 'Write',
    msgsExit: 'Exit',
    msgsReply: 'Reply',
    msgsBack: 'Back',
    msgsSend: 'Send',
    msgsSending: 'Sending…',
    msgsSent: 'Sent',
    msgsEmpty: 'Inbox is empty',
    fmInbox: 'Inbox',
    fmMyFolders: 'My folders',
    fmDrafts: 'Drafts',
    fmSentItems: 'Sent',
    fmOutbox: 'Outbox',
    fmSelect: 'Open',
    toPrefix: 'To: ',
    mePrefix: 'Me > ',
    imePy: 'Pinyin',
    imeEn: 'Abc',
    imeNum: '123',
    contactsTitle: 'Contacts',
    contactsCall: 'Call',
    contactsBack: 'Back',
    cOpen: 'Open',
    cNew: 'New contact',
    cDelete: 'Delete contact',
    cEdit: 'Edit',
    cName: 'Name',
    cMobile: 'Mobile',
    cHomeTel: 'Home',
    cEmail: 'E-mail',
    cCompany: 'Company',
    cGroup: 'Group',
    cGroups: ['Friends', 'Family', 'Colleagues', 'VIP'],
    cSaved: 'Saved',
    cEmpty: 'No contacts',
    cNeedName: 'Please enter a name',
    logTitle: 'Log',
    logCall: 'Redial',
    logBack: 'Back',
    logEmpty: 'No calls',
    logMissed: 'missed',
    logReceived: 'received',
    logDialled: 'dialled',
    logEvents: 'Event log',
    logTimers: 'Call timers',
    logEvtSMS: 'SMS',
    logEvtData: 'Data',
    logEvtIn: 'recv',
    logEvtOut: 'sent',
    logEvtEmpty: 'No events',
    logTotalIn: 'All received calls',
    logTotalOut: 'All dialled calls',
    logMissedN: 'Missed calls',
    incomingCall: 'Incoming',
    incomingAnswer: 'Answer',
    incomingReject: 'Reject',
    camTitle: 'Camera',
    camCapture: 'Snap',
    camExit: 'Exit',
    camSaved: 'Saved to gallery',
    camGallery: 'Gallery',
    camEmpty: 'Gallery is empty - take a shot',
    camDelete: 'Delete',
    camDeleted: 'Deleted',
    camFlash: 'Flash',
    camFlashV: ['Auto', 'On', 'Off'],
    snakeOver: (score, record) => (record ? `New best! ${score}` : `Score ${score}`),
    snakePause: 'Pause',
    snakePaused: 'Paused',
    setTitle: 'Settings',
    setWallpaper: 'Wallpaper',
    setKeyBeep: 'Key beep',
    setRingtone: 'Ringtone',
    setActiveStandby: 'Active standby',
    setAutoLock: 'Auto keyguard',
    wallpapers: ['Sky', 'Grass', 'Night'],
    setOn: 'On',
    setOff: 'Off',
    setDone: 'Done',
    setProfiles: 'Profiles',
    setThemes: 'Themes',
    setDateTime: 'Date and time',
    setPhone: 'Phone settings',
    setSecurity: 'Security',
    setFactory: 'Factory settings',
    setRingVolume: 'Ringing volume',
    setVibration: 'Vibration',
    setMsgTone: 'Message alert',
    setWarnTone: 'Warning tones',
    setFontSize: 'Font size',
    fontSizes: ['Normal', 'Small'],
    setHour24: '24-hour clock',
    setHour: 'Clock hour',
    setMinute: 'Clock minute',
    setAutoTime: 'Auto update of time',
    setBrightness: 'Brightness',
    brightnessV: ['Dim', 'Low', 'Bright', 'Brightest'],
    setLanguage: 'Phone language',
    setCallSet: 'Call settings',
    setConnSet: 'Connection settings',
    setCallWaiting: 'Call waiting',
    setCallForward: 'Call forwarding',
    setSendId: 'Send my caller ID',
    setBluetooth: 'Bluetooth',
    setPacketData: 'Packet data',
    packetDataV: ['Always online', 'When needed'],
    setPinReq: 'PIN code request',
    setSecCode: 'Security code',
    codeTitle: 'Enter security code',
    codeOk: 'Security code accepted',
    codeBad: 'Incorrect code',
    resetDone: 'Factory settings restored',
    aboutByMaker: (maker) => `by ${maker}`,
    aboutFirmware: (era) => `Symbian OS 9.1 · S60 3rd · ${era}`,
    aboutBattery: (pct) => `Battery ${pct}%`,
    aboutAnyKey: 'Any key to go back',
    serviceNum: '10086',
    recipient: 'Mom',
    seedWelcome: 'Welcome to GPRS! 0.0KB used this month - surf away.',
    seedMom: 'Dinner this weekend? I learned MMS - shot a photo of the yard flowers, reply to see it.',
    replies: ['OK, got it', 'Remember to eat', 'It is cold, dress warm', 'Less phone, sleep early', 'I saved you dinner', 'Dinner this weekend?'],
    contactsSeed: [
      { name: 'Mom', tel: '13912345678' },
      { name: 'Dad', tel: '13800001111' },
      { name: 'Wei Zhang', tel: '13722223333' },
      { name: 'Hotline', tel: '10086' },
    ],
    profileNames: ['General', 'Silent', 'Meeting', 'Outdoor', 'Pager', 'Offline'],
    calNoEvents: 'No calendar entries for today',
    pmPowerOff: 'Switch off!',
    pmLockKeys: 'Lock keypad',
    pmRemoveCard: 'Remove memory card',
    pmRemoveCardMsg: 'You may now remove the memory card safely.',
    pmProfilesHint: 'Select profile',
    keysLocked: 'Keypad locked',
    optsOpen: 'Open',
    optsChangeView: 'Change view',
    optsMemDetails: 'Memory details',
    optsHelp: 'Help',
    optsExit: 'Exit',
    memDetailsText: 'Phone memory: 41 MB free\nMemory card: 620 MB used of 1024 MB',
    helpText: 'Move with the navigation key, press centre to open, right soft key to go back.',
    viewGrid: 'Grid view',
    viewList: 'List view',
    notAvail: 'Feature not available',
  },
}

/** 当前语言词表 */
export function s60Strings(lang: Lang): S60Strings {
  return S60_STRINGS[lang]
}

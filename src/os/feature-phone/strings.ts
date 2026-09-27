import type { Lang } from '../../i18n'

/**
 * 功能机系统层双语文案。英文按 84px 单色屏宽度精简
 * （12px 字体约 14 个拉丁字符，9px 约 18 个）。
 */
export interface OSStrings {
  menuTitle: string
  menuSelect: string
  menuBack: string
  /** 待机屏运营商名（真机待机显示运营商而非厂牌） */
  operator: string
  idleMenu: string
  /** 待机右软键标签（真机：Names 通讯录） */
  idleNames: string
  dialCall: string
  dialExit: string
  calling: string
  inCall: string
  endCall: string
  /** 短信应用名（收件箱标题用短版） */
  msgsTitle: string
  msgsLoading: string
  msgsSending: string
  msgsSent: string
  inboxLeft: (hasItems: boolean) => string
  inboxRight: (hasItems: boolean) => string
  toPrefix: string
  mePrefix: string
  readReply: string
  readDelete: string
  readConfirmDel: string
  composeSend: string
  composeExit: string
  imePy: string
  imeEn: string
  imeNum: string
  snakeOver: (score: number, record: boolean) => string
  calcTitle: string
  calcHintLeft: string
  calcHintRight: string
  composerTitle: string
  composerRest: string
  composerSave: string
  composerSaved: string
  settingsTitle: string
  settingsKeyBeep: string
  settingsRingtone: string
  settingsFactory: string
  /** 1100 手电筒 */
  flashlightTitle: string
  flashlightHint: string
  settingsOn: string
  settingsOff: string
  settingsDefault: string
  settingsCustom: string
  settingsConfirmTitle: string
  settingsConfirmL1: string
  settingsConfirmL2: string
  settingsConfirmYes: string
  settingsConfirmNo: string
  settingsDoneL1: string
  settingsDoneL2: string
  aboutByMaker: (maker: string) => string
  aboutFirmware: (era: number) => string
  aboutBattery: (pct: number) => string
  aboutAnyKey: string
  /** 通讯录 */
  contactsTitle: string
  contactsCall: string
  contactsBack: string
  contactsEmpty: string
  /** 通话记录 */
  calllogTitle: string
  calllogCall: string
  calllogBack: string
  calllogEmpty: string
  calllogMissed: string
  /** 通话记录五模式 */
  clMissed: string
  clReceived: string
  clDialled: string
  clDelete: string
  clDuration: string
  /** 删除近期记录的四个选项 */
  clDelAll: string
  clDelMissed: string
  clDelReceived: string
  clDelDialled: string
  clDeleted: string
  /** 通话计时页 */
  clDurLast: string
  clDurAll: string
  clDurIn: string
  clDurOut: string
  clClearTimers: string
  clTimersCleared: string
  /** Tones 编辑器 */
  tnRingList: string
  tnVolume: string
  tnAlert: string
  tnMsgList: string
  tnKeyTones: string
  tnWarnTones: string
  tnVibrate: string
  tnAlertRing: string
  tnAlertAscending: string
  tnAlertOnce: string
  tnMyTune: string
  /** 情景模式 */
  pfPersonalise: string
  pfSelected: string
  pfLevel0: string
  pfVol: string
  pfAlert: string
  pfMsg: string
  /** 键盘锁 */
  kgLocked: string
  kgUnlockHint: string
  kgEmergency: string
  kgAutoTitle: string
  /** 闹钟 */
  alSwitch: string
  alSet: string
  alInvalid: string
  /** 秒表 */
  swTitle: string
  swLap: string
  swStart: string
  /** 倒计时 */
  cdTitle: string
  cdStart: string
  cdDone: string
  /** 备忘 */
  rmSubject: string
  rmSave: string
  rmErase: string
  rmAdd: string
  /** 呼叫转移 */
  dvNumber: string
  dvActivate: string
  dvCancel: string
  dvAll: string
  dvBusy: string
  dvNoAnswer: string
  dvReach: string
  dvAvail: string
  /** 时间设置 */
  tsClock: string
  tsDate: string
  tsAuto: string
  /** 通话设置 */
  csRedial: string
  csWaiting: string
  csCallerId: string
  /** 手机设置 */
  psWelcome: string
  psCellInfo: string
  psHelp: string
  psStartupTone: string
  /** 时钟设置 */
  ccFormat: string
  ccDate: string
  /** SIM 服务 */
  simTitle: string
  simToolkit: string
  simInfo: string
  /** OS 级闹钟/倒计时全屏提示 */
  alarmAlert: string
  /** 来电 */
  incomingCall: string
  incomingAnswer: string
  incomingReject: string
  recipient: string
  seedWelcome: string
  seedMom: string
  replies: string[]
  // ---------- 通讯录深化 ----------
  ctSearch: string
  ctAdd: string
  ctEdit: string
  ctDelete: string
  ctSendCard: string
  ctSpeed: string
  ctOptions: string
  ctName: string
  ctNumber: string
  ctSaved: string
  ctErased: string
  ctEraseQ: string
  ctNoName: string
  ctMemory: string
  ctAssign: string
  ctUnassigned: string
  ctCardSent: string
  // ---------- 短信深化 ----------
  msWrite: string
  msInbox: string
  msDrafts: string
  msSent: string
  msOutbox: string
  msPicture: string
  msTemplates: string
  msSmileys: string
  msDelete: string
  msSettings: string
  msChat: string
  msTo: string
  msFind: string
  msDraftSaved: string
  msDelAll: string
  msDelRead: string
  msCenter: string
  msReports: string
  msNoDrafts: string
  msTemplatesList: string[]
  msSmileysList: string[]
  msPicNames: string[]
  // ---------- 聊天 ----------
  chatTitle: string
  chatOnline: string
  chatStart: string
}

export const OS_STRINGS: Record<Lang, OSStrings> = {
  zh: {
    menuTitle: '功能表',
    menuSelect: '选择',
    menuBack: '退出',
    operator: '中国移动',
    idleMenu: '功能表',
    idleNames: '通讯录',
    dialCall: '呼叫',
    dialExit: '退出',
    calling: '呼叫中',
    inCall: '通话中',
    endCall: '结束',
    msgsTitle: '短信',
    msgsLoading: '读取中...',
    msgsSending: '正在发送',
    msgsSent: '已送达',
    inboxLeft: (has) => (has ? '读' : '写'),
    inboxRight: (has) => (has ? '写/退' : '退'),
    toPrefix: '发:',
    mePrefix: '我→',
    readReply: '回复',
    readDelete: '删除',
    readConfirmDel: '再按清除=删除',
    composeSend: '发送',
    composeExit: '退出',
    imePy: '拼音',
    imeEn: '英文',
    imeNum: '数字',
    snakeOver: (score, record) => (record ? `新纪录!${score}分` : `得分${score}`),
    calcTitle: '计算器',
    calcHintLeft: '↑↓运算 =等',
    calcHintRight: '清除长按',
    composerTitle: '作曲家',
    composerRest: '休止',
    composerSave: '存为铃声',
    composerSaved: '已存为铃声',
    settingsTitle: '设置',
    settingsKeyBeep: '按键音',
    settingsRingtone: '铃声',
    settingsFactory: '恢复出厂',
    flashlightTitle: '手电筒',
    flashlightHint: '按任意键关',
    settingsOn: '开',
    settingsOff: '关',
    settingsDefault: '默认',
    settingsCustom: '自编',
    settingsConfirmTitle: '恢复出厂设置',
    settingsConfirmL1: '将清除本机全部',
    settingsConfirmL2: '数据，确定吗？',
    settingsConfirmYes: '确认',
    settingsConfirmNo: '取消',
    settingsDoneL1: '已恢复',
    settingsDoneL2: '出厂设置',
    aboutByMaker: (maker) => `${maker} 出品`,
    aboutFirmware: (era) => `固件 V1.0 · ${era}`,
    aboutBattery: (pct) => `电量 ${pct}%`,
    aboutAnyKey: '按任意键退出',
    contactsTitle: '通讯录',
    contactsCall: '呼叫',
    contactsBack: '返回',
    contactsEmpty: '通讯录为空',
    calllogTitle: '通话记录',
    calllogCall: '重拨',
    calllogBack: '返回',
    calllogEmpty: '无通话记录',
    calllogMissed: '未接',
    clMissed: '未接来电',
    clReceived: '已接来电',
    clDialled: '已拨号码',
    clDelete: '删除近期记录',
    clDuration: '通话计时',
    clDelAll: '全部',
    clDelMissed: '未接',
    clDelReceived: '已接',
    clDelDialled: '已拨',
    clDeleted: '记录已删除',
    clDurLast: '上次',
    clDurAll: '全部',
    clDurIn: '来电',
    clDurOut: '去电',
    clClearTimers: '清零计时器',
    clTimersCleared: '计时器已清零',
    tnRingList: '来电铃声',
    tnVolume: '铃声音量',
    tnAlert: '来电提醒',
    tnMsgList: '短信提示音',
    tnKeyTones: '按键音',
    tnWarnTones: '警告音',
    tnVibrate: '振动',
    tnAlertRing: '连续响铃',
    tnAlertAscending: '渐强',
    tnAlertOnce: '一声提示',
    tnMyTune: '我的曲调',
    pfPersonalise: '个性化',
    pfSelected: '已选择',
    pfLevel0: '静音',
    pfVol: '铃声音量',
    pfAlert: '来电提醒',
    pfMsg: '短信提示音',
    kgLocked: '键盘已锁',
    kgUnlockHint: '按 * 解锁',
    kgEmergency: '紧急呼叫',
    kgAutoTitle: '自动键盘锁',
    alSwitch: '闹钟',
    alSet: '设定时间',
    alInvalid: '时间无效',
    swTitle: '秒表',
    swLap: '计次',
    swStart: '开始',
    cdTitle: '倒计时',
    cdStart: '开始',
    cdDone: '倒计时结束',
    rmSubject: '主题',
    rmSave: '保存',
    rmErase: '删除',
    rmAdd: '添加备忘',
    dvNumber: '号码',
    dvActivate: '启动',
    dvCancel: '全部取消',
    dvAll: '全部转移',
    dvBusy: '占线时',
    dvNoAnswer: '无人接听',
    dvReach: '无法接通',
    dvAvail: '所有来电',
    tsClock: '时钟',
    tsDate: '日期',
    tsAuto: '自动更新',
    csRedial: '自动重拨',
    csWaiting: '呼叫等待',
    csCallerId: '发送本机号',
    psWelcome: '问候语',
    psCellInfo: '小区信息',
    psHelp: '帮助文本',
    psStartupTone: '开机铃声',
    ccFormat: '时制',
    ccDate: '日期格式',
    simTitle: 'SIM 服务',
    simToolkit: 'SIM 应用工具包',
    simInfo: '服务由网络提供',
    alarmAlert: '闹钟',
    incomingCall: '来电',
    incomingAnswer: '接听',
    incomingReject: '挂断',
    recipient: '妈妈',
    seedWelcome: '欢迎使用掌上通讯！本月套餐剩余流量 0.0MB，放心使用。',
    seedMom: '周末回家吃饭吗？给你炖了汤。',
    replies: ['好的，知道了', '记得按时吃饭', '天冷多穿点衣服', '少玩手机，早点睡', '给你留了饭', '周末回家吃饭吗'],
    ctSearch: '查找',
    ctAdd: '新增联系人',
    ctEdit: '编辑',
    ctDelete: '删除',
    ctSendCard: '发送名片',
    ctSpeed: '速拨',
    ctOptions: '设置',
    ctName: '姓名',
    ctNumber: '号码',
    ctSaved: '已保存',
    ctErased: '已删除',
    ctEraseQ: '确认删除？',
    ctNoName: '请输入姓名',
    ctMemory: '存储状态',
    ctAssign: '设定',
    ctUnassigned: '（未设定）',
    ctCardSent: '名片已发送',
    msWrite: '写信息',
    msInbox: '收件箱',
    msDrafts: '草稿',
    msSent: '已发信息',
    msOutbox: '发件箱',
    msPicture: '图片信息',
    msTemplates: '常用短语',
    msSmileys: '表情符号',
    msDelete: '删除信息',
    msSettings: '信息设置',
    msChat: '聊天',
    msTo: '发送至',
    msFind: '查找',
    msDraftSaved: '草稿已存',
    msDelAll: '全部信息',
    msDelRead: '所有已读',
    msCenter: '信息中心',
    msReports: '送达报告',
    msNoDrafts: '无草稿',
    msTemplatesList: [
      '请尽快回电。', '我稍后就到。', '会议改期了。', '生日快乐！', '周末有空吗？',
      '路上注意安全。', '谢谢！', '好的。', '今晚加班，别等我。', '已收到。',
    ],
    msSmileysList: [':-)', ':-(', ':-D', ';-)', ':-O', ':-P', ':-/', '8-)', ":'-(", ':-*'],
    msPicNames: ['图片一', '图片二', '图片三'],
    chatTitle: '聊天',
    chatOnline: '在线',
    chatStart: '输入信息开始聊天',
  },
  en: {
    menuTitle: 'Menu',
    menuSelect: 'Select',
    menuBack: 'Back',
    operator: 'China Mobile',
    idleMenu: 'Menu',
    idleNames: 'Names',
    dialCall: 'Call',
    dialExit: 'Exit',
    calling: 'Calling',
    inCall: 'In call',
    endCall: 'End',
    msgsTitle: 'Msgs',
    msgsLoading: 'Loading...',
    msgsSending: 'Sending',
    msgsSent: 'Sent',
    inboxLeft: (has) => (has ? 'Open' : 'Write'),
    inboxRight: (has) => (has ? 'New/Exit' : 'Exit'),
    toPrefix: 'To:',
    mePrefix: 'Me→',
    readReply: 'Reply',
    readDelete: 'Delete',
    readConfirmDel: 'C again=del',
    composeSend: 'Send',
    composeExit: 'Exit',
    imePy: 'Pinyin',
    imeEn: 'ABC',
    imeNum: '123',
    snakeOver: (score, record) => (record ? `New best! ${score}` : `Score ${score}`),
    calcTitle: 'Calc',
    calcHintLeft: '↑↓op =',
    calcHintRight: 'hold C',
    composerTitle: 'Composer',
    composerRest: 'Rest',
    composerSave: 'Save',
    composerSaved: 'Saved!',
    settingsTitle: 'Settings',
    settingsKeyBeep: 'Key beep',
    settingsRingtone: 'Ringtone',
    settingsFactory: 'Factory reset',
    flashlightTitle: 'Torch',
    flashlightHint: 'Any key off',
    settingsOn: 'On',
    settingsOff: 'Off',
    settingsDefault: 'Default',
    settingsCustom: 'Custom',
    settingsConfirmTitle: 'Factory reset',
    settingsConfirmL1: 'Erases all data',
    settingsConfirmL2: 'Are you sure?',
    settingsConfirmYes: 'Yes',
    settingsConfirmNo: 'No',
    settingsDoneL1: 'Factory reset',
    settingsDoneL2: 'done',
    aboutByMaker: (maker) => `by ${maker}`,
    aboutFirmware: (era) => `FW V1.0 · ${era}`,
    aboutBattery: (pct) => `Batt ${pct}%`,
    aboutAnyKey: 'Any key to exit',
    contactsTitle: 'Contacts',
    contactsCall: 'Call',
    contactsBack: 'Back',
    contactsEmpty: 'Contacts empty',
    calllogTitle: 'Call log',
    calllogCall: 'Redial',
    calllogBack: 'Back',
    calllogEmpty: 'No calls',
    calllogMissed: 'missed',
    clMissed: 'Missed calls',
    clReceived: 'Received calls',
    clDialled: 'Dialled numbers',
    clDelete: 'Delete recent lists',
    clDuration: 'Call duration',
    clDelAll: 'All',
    clDelMissed: 'Missed',
    clDelReceived: 'Received',
    clDelDialled: 'Dialled',
    clDeleted: 'Lists deleted',
    clDurLast: 'Last',
    clDurAll: 'All',
    clDurIn: 'Received',
    clDurOut: 'Dialled',
    clClearTimers: 'Clear timers',
    clTimersCleared: 'Timers cleared',
    tnRingList: 'Ringing tone',
    tnVolume: 'Ringing volume',
    tnAlert: 'Incoming call alert',
    tnMsgList: 'Message alert tone',
    tnKeyTones: 'Keypad tones',
    tnWarnTones: 'Warning tones',
    tnVibrate: 'Vibrating alert',
    tnAlertRing: 'Ring',
    tnAlertAscending: 'Ascending',
    tnAlertOnce: 'Beep once',
    tnMyTune: 'My tune',
    pfPersonalise: 'Personalise',
    pfSelected: 'Selected',
    pfLevel0: 'Silent',
    pfVol: 'Ringing volume',
    pfAlert: 'Incoming alert',
    pfMsg: 'Message tones',
    kgLocked: 'Keypad locked',
    kgUnlockHint: 'Press * to unlock',
    kgEmergency: 'Emergency call',
    kgAutoTitle: 'Automatic keyguard',
    alSwitch: 'Alarm',
    alSet: 'Set time',
    alInvalid: 'Invalid time',
    swTitle: 'Stopwatch',
    swLap: 'Lap',
    swStart: 'Start',
    cdTitle: 'Countdown',
    cdStart: 'Start',
    cdDone: 'Timer done',
    rmSubject: 'Subject',
    rmSave: 'Save',
    rmErase: 'Erase',
    rmAdd: 'Add reminder',
    dvNumber: 'Number',
    dvActivate: 'Activate',
    dvCancel: 'Cancel all',
    dvAll: 'Divert all',
    dvBusy: 'When busy',
    dvNoAnswer: 'No answer',
    dvReach: 'Not reachable',
    dvAvail: 'All incoming',
    tsClock: 'Clock',
    tsDate: 'Date',
    tsAuto: 'Auto update',
    csRedial: 'Automatic redial',
    csWaiting: 'Call waiting',
    csCallerId: 'Send caller ID',
    psWelcome: 'Welcome note',
    psCellInfo: 'Cell info display',
    psHelp: 'Help texts',
    psStartupTone: 'Startup tone',
    ccFormat: 'Time format',
    ccDate: 'Date format',
    simTitle: 'SIM services',
    simToolkit: 'SIM Application Toolkit',
    simInfo: 'Services provided by network',
    alarmAlert: 'Alarm',
    incomingCall: 'Incoming',
    incomingAnswer: 'Answer',
    incomingReject: 'Reject',
    recipient: 'Mom',
    seedWelcome: 'Welcome to PocketLink! 0.0MB data left this month - use freely.',
    seedMom: 'Coming home for dinner this weekend? I made soup.',
    replies: [
      'OK, got it',
      'Remember to eat',
      'It is cold, dress warm',
      'Less phone, sleep early',
      'I saved you dinner',
      'Coming home this wknd?',
    ],
    ctSearch: 'Search',
    ctAdd: 'Add contact',
    ctEdit: 'Edit',
    ctDelete: 'Erase',
    ctSendCard: 'Send card',
    ctSpeed: 'Speed dials',
    ctOptions: 'Options',
    ctName: 'Name',
    ctNumber: 'Number',
    ctSaved: 'Saved',
    ctErased: 'Erased',
    ctEraseQ: 'Erase contact?',
    ctNoName: 'Name required',
    ctMemory: 'Memory status',
    ctAssign: 'Assign',
    ctUnassigned: '(empty)',
    ctCardSent: 'Card sent',
    msWrite: 'Write',
    msInbox: 'Inbox',
    msDrafts: 'Drafts',
    msSent: 'Sent items',
    msOutbox: 'Outbox',
    msPicture: 'Picture msg',
    msTemplates: 'Templates',
    msSmileys: 'Smileys',
    msDelete: 'Delete messages',
    msSettings: 'Message settings',
    msChat: 'Chat',
    msTo: 'Send to',
    msFind: 'Find',
    msDraftSaved: 'Draft saved',
    msDelAll: 'All messages',
    msDelRead: 'All read',
    msCenter: 'Message centre',
    msReports: 'Delivery reports',
    msNoDrafts: 'No drafts',
    msTemplatesList: [
      'Please call back.', 'Be there soon.', 'Meeting rescheduled.', 'Happy birthday!',
      'Free this weekend?', 'Drive safe.', 'Thanks!', 'OK.', 'Working late tonight.', 'Received.',
    ],
    msSmileysList: [':-)', ':-(', ':-D', ';-)', ':-O', ':-P', ':-/', '8-)', ":'-(", ':-*'],
    msPicNames: ['Picture 1', 'Picture 2', 'Picture 3'],
    chatTitle: 'Chat',
    chatOnline: 'online',
    chatStart: 'Type to start chatting',
  },
}

/** 当前语言词表 */
export function osStrings(lang: Lang): OSStrings {
  return OS_STRINGS[lang]
}

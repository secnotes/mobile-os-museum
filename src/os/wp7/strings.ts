import type { Lang } from '../../i18n'

/** Windows Phone 7.5 双语文案（OS 与全部应用共用） */
export interface WPStrings {
  carrier: string
  dataNet: string
  recipient: string
  seedWelcome: string
  seedMom: string
  replies: string[]
  // 锁屏
  lockHint: string
  // 开始屏 / 应用列表
  appListTitle: string
  arrowHint: string
  tileBackCall: string
  tileBackOff: string
  tileBackPeople: string
  // 电话
  phoneTitle: string
  phoneDial: string
  phoneLog: string
  phoneCall: string
  phoneCalling: string
  phoneInCall: string
  phoneEnded: string
  phoneEndCall: string
  phoneLogEmpty: string
  logIncoming: string
  logOutgoing: string
  logMissed: string
  // 信息
  msgTitle: string
  msgEmpty: string
  msgType: string
  msgSend: string
  msgBack: string
  imeZh: string
  imeEn: string
  // 人脉
  peopleTitle: string
  peopleEmpty: string
  peopleCall: string
  peopleSendMsg: string
  // 相机
  cameraHint: string
  cameraSaved: string
  cameraAlbum: string
  // 闹钟
  alarmTitle: string
  alarmDismiss: string
  alarmOn: string
  alarmOff: string
  // 设置
  settingsTitle: string
  accentTitle: string
  ringtoneTitle: string
  aboutTitle: string
  aboutModel: string
  aboutOs: string
  aboutScreen: string
  aboutCamera: string
  aboutBattery: (pct: number) => string
  aboutReset: string
  // 来电
  incomingCall: string
  incomingAnswer: string
  incomingIgnore: string
  // 拼音输入法键面
  imeSpace: string
  imeEnter: string
  imeSymbol: string
  punct: string
  // 设置：双 Pivot
  pivotSystem: string
  pivotApps: string
  setTheme: string
  setSounds: string
  setAirplane: string
  setWifi: string
  setBluetooth: string
  setCellular: string
  setLocation: string
  setBrightness: string
  setLock: string
  setDateTime: string
  setKeyboard: string
  setKeyboardSub: string
  setRegion: string
  setFindPhone: string
  setUpdate: string
  setFeedback: string
  setAppNotify: string
  brightLow: string
  brightMid: string
  brightHigh: string
  pickRingtone: string
  pickSms: string
  pickAlarmSnd: string
  setVibrate: string
  setKeySound: string
  setLockSound: string
  setNotifySound: string
  wifiLocked: string
  wifiLockedSub: string
  wifiOpen: string
  wifiConnected: (name: string) => string
  setPin: string
  lockTimeout: string
  lockTimeoutSub: string
  set24Hour: string
  setAutoTime: string
  setTimeZone: string
  setTimeZoneSub: string
  updateCheck: string
  updateChecking: string
  updateLatest: string
  aboutVersion: string
  aboutCarrier: string
  aboutStorage: string
  resetConfirm: string
  resetNow: string
  resetCancel: string
  pinTitle: string
  pinError: string
  // 计算器
  calcTitle: string
  calcNaN: string
  // 便签
  notesTitle: string
  noteEmpty: string
  // 日历
  calToday: string
  calLater: string
  calMonthNames: string[]
  calWeekDays: string[]
  calEmpty: string
  calNew: string
  // IE
  ieTitle: string
  ieAddress: string
  ieFav: string
  ieBing: string
  ieNews: string
  ieWeather: string
  ieWeatherNow: string
  ieWeatherSub: string
  ieResults: string
  ieNoSignal: string
  ieNewsItems: string[]
  // 图片
  picTitle: string
  picEmpty: string
  picSetLock: string
  picDelete: string
  picCount: (n: number) => string
  picDate: string
  // 搜索
  searchTitle: string
  searchHint: string
  searchDaily: string
  // 音乐+视频 / FM
  musicTitle: string
  musicSongs: string
  musicVideos: string
  musicFm: string
  musicPlay: string
  musicPause: string
  fmTitle: string
  fmPreset: string
  fmNoSignal: string
  fmMhz: (mhz: string) => string
  // 商店
  marketTitle: string
  marketCategories: string[]
  marketInstall: string
  marketInstalling: string
  marketInstalled: string
  marketOpen: string
  marketRated: string
  // 闹钟扩充
  alarmAlarms: string
  alarmWorld: string
  alarmStopwatch: string
  alarmTimer: string
  alarmAdd: string
  alarmNew: string
  alarmEmpty: string
  alarmWeekdays: string[]
  alarmWorldCities: Array<[string, number]>
  swStart: string
  swStop: string
  swLap: string
  swReset: string
  timerSet: string
  timerStart: string
  timerDone: string
  // 游戏中心
  gamesTitle: string
  gamesCollection: string
  gamesSpotlight: string
  gamesXbox: string
  gamesGamer: string
  snakeName: string
  snakeBest: string
  mineName: string
  mineWin: string
  sudokuName: string
  sudokuMistakes: string
  sudokuComplete: string
  sudokuNote: string
  sudokuErase: string
  gameOver: string
  gameNew: string
}

const zh: WPStrings = {
  carrier: '中国移动',
  dataNet: 'EDGE',
  recipient: '妈妈',
  seedWelcome: '欢迎选购诺基亚 Lumia 800！本机已激活，更多精彩请洽 10086。',
  seedMom: '闺女，周末回家吃饭吗？',
  replies: ['好的', '知道了', '行，等下说', '收到！'],
  lockHint: '向上滑动以解锁',
  appListTitle: '应用',
  arrowHint: '应用列表',
  tileBackCall: '无未接',
  tileBackOff: '未开',
  tileBackPeople: '最近更新',
  phoneTitle: '电话',
  phoneDial: '拨号',
  phoneLog: '通话记录',
  phoneCall: '呼叫',
  phoneCalling: '正在呼叫',
  phoneInCall: '通话中',
  phoneEnded: '通话结束',
  phoneEndCall: '挂断',
  phoneLogEmpty: '暂无通话记录',
  logIncoming: '来电',
  logOutgoing: '去电',
  logMissed: '未接',
  msgTitle: '信息',
  msgEmpty: '还没有对话',
  msgType: '输入短信内容',
  msgSend: '发送',
  msgBack: '返回',
  imeZh: '拼',
  imeEn: '英',
  peopleTitle: '人脉',
  peopleEmpty: '没有联系人',
  peopleCall: '呼叫',
  peopleSendMsg: '发信息',
  cameraHint: '点屏幕拍照',
  cameraSaved: '已保存到本机',
  cameraAlbum: '最近拍摄',
  alarmTitle: '闹钟',
  alarmDismiss: '关闭闹钟',
  alarmOn: '开',
  alarmOff: '关',
  settingsTitle: '设置',
  accentTitle: '主题颜色',
  ringtoneTitle: '铃声',
  aboutTitle: '关于',
  aboutModel: '诺基亚 Lumia 800',
  aboutOs: 'Windows Phone 7.5（Mango）',
  aboutScreen: '3.7 英寸 AMOLED · 480×800',
  aboutCamera: '800 万像素 · 卡尔蔡司光学',
  aboutBattery: (pct: number) => `电量 ${pct}%`,
  aboutReset: '恢复出厂设置',
  incomingCall: '来电',
  incomingAnswer: '接听',
  incomingIgnore: '忽略',
  imeSpace: '空格',
  imeEnter: '回车',
  imeSymbol: '符',
  punct: '，。？！',
  pivotSystem: '系统',
  pivotApps: '应用程序',
  setTheme: '主题',
  setSounds: '铃声和声音',
  setAirplane: '飞行模式',
  setWifi: 'Wi-Fi',
  setBluetooth: '蓝牙',
  setCellular: '手机网络',
  setLocation: '位置',
  setBrightness: '亮度',
  setLock: '锁屏',
  setDateTime: '日期和时间',
  setKeyboard: '键盘',
  setKeyboardSub: '中文拼音 / 英文',
  setRegion: '区域和语言',
  setFindPhone: '查找我的手机',
  setUpdate: '手机更新',
  setFeedback: '发送反馈',
  setAppNotify: '通知',
  brightLow: '低',
  brightMid: '中',
  brightHigh: '高',
  pickRingtone: '来电铃声',
  pickSms: '短信提示音',
  pickAlarmSnd: '闹钟铃声',
  setVibrate: '振动',
  setKeySound: '按键音',
  setLockSound: '锁定和解锁音',
  setNotifySound: '其他通知',
  wifiLocked: '需要密码',
  wifiLockedSub: '已加密',
  wifiOpen: '开放',
  wifiConnected: (name: string) => `已连接到 ${name}`,
  setPin: '密码',
  lockTimeout: '屏幕超时',
  lockTimeoutSub: '1 分钟',
  set24Hour: '24 小时制',
  setAutoTime: '自动设置',
  setTimeZone: '时区',
  setTimeZoneSub: '(UTC+08:00) 北京',
  updateCheck: '检查更新',
  updateChecking: '正在检查…',
  updateLatest: '您的手机已是最新',
  aboutVersion: 'OS 版本',
  aboutCarrier: '运营商',
  aboutStorage: '总存储容量',
  resetConfirm: '将清除本手机上的全部数据，且无法撤销。',
  resetNow: '确认恢复出厂设置',
  resetCancel: '取消',
  pinTitle: '输入密码',
  pinError: '密码错误',
  calcTitle: '计算器',
  calcNaN: '无法除以 0',
  notesTitle: '便签',
  noteEmpty: '在此输入',
  calToday: '今天 · 班',
  calLater: '家庭聚会',
  calMonthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  calWeekDays: ['一', '二', '三', '四', '五', '六', '日'],
  calEmpty: '当天没有事项',
  calNew: '新建事项',
  ieTitle: 'Internet Explorer',
  ieAddress: '输入地址',
  ieFav: '收藏夹',
  ieBing: 'Bing',
  ieNews: '人民网 · 新闻',
  ieWeather: '天气',
  ieWeatherNow: '26°C',
  ieWeatherSub: '北京 · 晴转多云，东南风 2 级',
  ieResults: '必应搜索',
  ieNoSignal: '当前为离线演示页',
  ieNewsItems: [
    '我国成功发射新一代通信技术试验卫星',
    '北方多地迎来入秋以来最强冷空气',
    '国产大飞机新增三条国际航线',
    '移动互联网用户规模突破十二亿',
  ],
  picTitle: '图片',
  picEmpty: '还没有照片，快用相机拍一张吧',
  picSetLock: '设为锁屏背景',
  picDelete: '删除',
  picCount: (n: number) => `${n} 张照片`,
  picDate: '拍摄日期',
  searchTitle: '搜索',
  searchHint: '输入搜索内容',
  searchDaily: '每日图片',
  musicTitle: '音乐 + 视频',
  musicSongs: '音乐',
  musicVideos: '视频',
  musicFm: '收音机',
  musicPlay: '播放',
  musicPause: '暂停',
  fmTitle: '收音机',
  fmPreset: '预设电台',
  fmNoSignal: '正在调谐…',
  fmMhz: (mhz: string) => `${mhz} MHz`,
  marketTitle: '商店',
  marketCategories: ['应用', '游戏', '音乐', '推荐'],
  marketInstall: '安装',
  marketInstalling: '正在下载…',
  marketInstalled: '已安装',
  marketOpen: '打开',
  marketRated: '评分',
  alarmAlarms: '闹钟',
  alarmWorld: '世界时钟',
  alarmStopwatch: '秒表',
  alarmTimer: '倒计时',
  alarmAdd: '新建闹钟',
  alarmNew: '新建闹钟',
  alarmEmpty: '还没有闹钟',
  alarmWeekdays: ['一', '二', '三', '四', '五', '六', '日'],
  alarmWorldCities: [['北京', 8], ['伦敦', 0], ['纽约', -5], ['东京', 9], ['巴黎', 1], ['悉尼', 10]],
  swStart: '开始',
  swStop: '停止',
  swLap: '分圈',
  swReset: '重置',
  timerSet: '设置',
  timerStart: '开始',
  timerDone: '时间到',
  gamesTitle: '游戏',
  gamesCollection: '收藏',
  gamesSpotlight: '焦点',
  gamesXbox: 'XBOX LIVE',
  gamesGamer: '玩家',
  snakeName: '贪吃蛇',
  snakeBest: '最高分',
  mineName: '扫雷',
  mineWin: '全部排除',
  sudokuName: '数独',
  sudokuMistakes: '错次',
  sudokuComplete: '完成',
  sudokuNote: '笔记',
  sudokuErase: '清除',
  gameOver: '游戏结束',
  gameNew: '再来一局',
}

const en: WPStrings = {
  carrier: 'China Mobile',
  dataNet: 'EDGE',
  recipient: 'Mom',
  seedWelcome: 'Welcome to Nokia Lumia 800! Dial 10086 for more services.',
  seedMom: 'Coming home for dinner this weekend?',
  replies: ['OK', 'Got it', 'Sure, talk later', 'Received!'],
  lockHint: 'Swipe up to unlock',
  appListTitle: 'applications',
  arrowHint: 'App list',
  tileBackCall: 'No missed',
  tileBackOff: 'Off',
  tileBackPeople: "What's new",
  phoneTitle: 'Phone',
  phoneDial: 'dialer',
  phoneLog: 'history',
  phoneCall: 'call',
  phoneCalling: 'Calling',
  phoneInCall: 'In call',
  phoneEnded: 'Call ended',
  phoneEndCall: 'end call',
  phoneLogEmpty: 'No calls yet',
  logIncoming: 'Incoming',
  logOutgoing: 'Outgoing',
  logMissed: 'Missed',
  msgTitle: 'Messaging',
  msgEmpty: 'No conversations yet',
  msgType: 'Type a message',
  msgSend: 'send',
  msgBack: 'back',
  imeZh: '拼',
  imeEn: 'EN',
  peopleTitle: 'People',
  peopleEmpty: 'No contacts',
  peopleCall: 'call',
  peopleSendMsg: 'text',
  cameraHint: 'Tap screen to shoot',
  cameraSaved: 'Saved to phone',
  cameraAlbum: 'Recent',
  alarmTitle: 'Alarms',
  alarmDismiss: 'Dismiss',
  alarmOn: 'on',
  alarmOff: 'off',
  settingsTitle: 'settings',
  accentTitle: 'Theme color',
  ringtoneTitle: 'Ringtone',
  aboutTitle: 'about',
  aboutModel: 'Nokia Lumia 800',
  aboutOs: 'Windows Phone 7.5 (Mango)',
  aboutScreen: '3.7" AMOLED · 480×800',
  aboutCamera: '8 MP · Carl Zeiss optics',
  aboutBattery: (pct: number) => `Battery ${pct}%`,
  aboutReset: 'Reset to factory defaults',
  incomingCall: 'Incoming call',
  incomingAnswer: 'answer',
  incomingIgnore: 'ignore',
  imeSpace: 'space',
  imeEnter: 'enter',
  imeSymbol: 'sym',
  punct: '.,?!',
  pivotSystem: 'system',
  pivotApps: 'applications',
  setTheme: 'theme',
  setSounds: 'ringtones & sounds',
  setAirplane: 'airplane mode',
  setWifi: 'Wi-Fi',
  setBluetooth: 'Bluetooth',
  setCellular: 'cellular',
  setLocation: 'location',
  setBrightness: 'brightness',
  setLock: 'lock screen',
  setDateTime: 'date & time',
  setKeyboard: 'keyboard',
  setKeyboardSub: 'Chinese pinyin / English',
  setRegion: 'region & language',
  setFindPhone: 'find my phone',
  setUpdate: 'phone update',
  setFeedback: 'send feedback',
  setAppNotify: 'Notifications',
  brightLow: 'low',
  brightMid: 'medium',
  brightHigh: 'high',
  pickRingtone: 'Ringtone',
  pickSms: 'New text message',
  pickAlarmSnd: 'Alarm sound',
  setVibrate: 'Vibrate',
  setKeySound: 'Key press',
  setLockSound: 'Lock and unlock sounds',
  setNotifySound: 'Other notifications',
  wifiLocked: 'Secured',
  wifiLockedSub: 'Encrypted',
  wifiOpen: 'Open',
  wifiConnected: (name: string) => `Connected to ${name}`,
  setPin: 'Password',
  lockTimeout: 'Screen time-out',
  lockTimeoutSub: '1 minute',
  set24Hour: '24-hour format',
  setAutoTime: 'Set automatically',
  setTimeZone: 'Time zone',
  setTimeZoneSub: '(UTC+08:00) Beijing',
  updateCheck: 'Check for updates',
  updateChecking: 'Checking…',
  updateLatest: 'Your phone is up to date',
  aboutVersion: 'OS version',
  aboutCarrier: 'Operator',
  aboutStorage: 'Total storage',
  resetConfirm: 'All data on this phone will be erased. This cannot be undone.',
  resetNow: 'Reset your phone',
  resetCancel: 'Cancel',
  pinTitle: 'Enter PIN',
  pinError: 'Wrong PIN',
  calcTitle: 'calculator',
  calcNaN: 'Cannot divide by zero',
  notesTitle: 'notes',
  noteEmpty: 'Type here',
  calToday: 'Work today',
  calLater: 'Family gathering',
  calMonthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  calWeekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  calEmpty: 'No events this day',
  calNew: 'New event',
  ieTitle: 'Internet Explorer',
  ieAddress: 'Enter address',
  ieFav: 'Favorites',
  ieBing: 'Bing',
  ieNews: 'People.cn · News',
  ieWeather: 'Weather',
  ieWeatherNow: '79°F',
  ieWeatherSub: 'Beijing · Sunny to cloudy, SE wind',
  ieResults: 'Bing search',
  ieNoSignal: 'Offline demo page',
  ieNewsItems: [
    'New communications satellite successfully launched',
    'Strongest cold front of autumn sweeps the north',
    'Domestic jet adds three international routes',
    'Mobile internet users top 1.2 billion',
  ],
  picTitle: 'Pictures',
  picEmpty: 'No photos yet — take one with the camera',
  picSetLock: 'Use as lock screen',
  picDelete: 'Delete',
  picCount: (n: number) => `${n} photos`,
  picDate: 'Date taken',
  searchTitle: 'Search',
  searchHint: 'Type to search',
  searchDaily: "Image of the day",
  musicTitle: 'Music + Videos',
  musicSongs: 'Music',
  musicVideos: 'Videos',
  musicFm: 'Radio',
  musicPlay: 'Play',
  musicPause: 'Pause',
  fmTitle: 'Radio',
  fmPreset: 'Presets',
  fmNoSignal: 'Tuning…',
  fmMhz: (mhz: string) => `${mhz} MHz`,
  marketTitle: 'Marketplace',
  marketCategories: ['Apps', 'Games', 'Music', 'Featured'],
  marketInstall: 'Install',
  marketInstalling: 'Downloading…',
  marketInstalled: 'Installed',
  marketOpen: 'Open',
  marketRated: 'Rating',
  alarmAlarms: 'Alarms',
  alarmWorld: 'World clock',
  alarmStopwatch: 'Stopwatch',
  alarmTimer: 'Timer',
  alarmAdd: 'New alarm',
  alarmNew: 'New alarm',
  alarmEmpty: 'No alarms',
  alarmWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  alarmWorldCities: [['Beijing', 8], ['London', 0], ['New York', -5], ['Tokyo', 9], ['Paris', 1], ['Sydney', 10]],
  swStart: 'Start',
  swStop: 'Stop',
  swLap: 'Lap',
  swReset: 'Reset',
  timerSet: 'Set',
  timerStart: 'Start',
  timerDone: "Time's up",
  gamesTitle: 'Games',
  gamesCollection: 'Collection',
  gamesSpotlight: 'Spotlight',
  gamesXbox: 'XBOX LIVE',
  gamesGamer: 'Gamer',
  snakeName: 'Snake',
  snakeBest: 'Best',
  mineName: 'Minesweeper',
  mineWin: 'All clear',
  sudokuName: 'Sudoku',
  sudokuMistakes: 'Errors',
  sudokuComplete: 'Complete',
  sudokuNote: 'Notes',
  sudokuErase: 'Erase',
  gameOver: 'Game over',
  gameNew: 'Play again',
}

export function wpStrings(lang: Lang): WPStrings {
  return lang === 'en' ? en : zh
}

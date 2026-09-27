import type { Lang } from '../../i18n'

/**
 * BlackBerry Bold 9000 文案（zh/en）。
 */
export interface BBStrings {
  carrier: string
  // 应用名
  apps: Record<string, string>
  // 通用
  menu: string
  back: string
  ok: string
  cancel: string
  save: string
  delete: string
  close: string
  yes: string
  no: string
  on: string
  off: string
  empty: string
  unread: (n: number) => string
  // 开机/锁屏
  bootLogo: string
  locked: string
  unlockHint: string
  // 主屏
  homeDate: (d: Date) => string
  // Messages
  msgWelcome: string
  msgMom: string
  msgMomReply: string[]
  replies: string[]
  compose: string
  to: string
  subject: string
  send: string
  sentItems: string
  // Contacts
  contacts: string
  // 通话
  callLog: string
  missed: string
  received: string
  dialled: string
  calling: string
  connected: string
  // Browser
  bookmarks: string
  // Media
  music: string
  pictures: string
  videos: string
  voiceNotes: string
  nowPlaying: string
  // Camera
  capture: string
  photos: (n: number) => string
  // BBM
  bbm: string
  available: string
  // Options
  options: string
  ringTone: string
  language: string
  about: string
  // Clock
  alarm: string
  stopwatch: string
  // Memo/Tasks
  memopad: string
  tasks: string
  // Brick Breaker
  breaker: string
  score: string
  newHigh: string
  gameOver: string
  launch: string
  // Help
  help: string
  helpText: string
}

const APPS_ZH: Record<string, string> = {
  messages: '消息', calendar: '日历', contacts: '联系人', browser: '浏览器',
  media: '媒体', camera: '相机', bbm: 'BBM', phone: '电话',
  options: '选项', search: '搜索', help: '帮助', calculator: '计算器',
  clock: '时钟', memopad: '记事本', tasks: '任务', breaker: '打砖块',
}

const APPS_EN: Record<string, string> = {
  messages: 'Messages', calendar: 'Calendar', contacts: 'Contacts', browser: 'Browser',
  media: 'Media', camera: 'Camera', bbm: 'BBM', phone: 'Phone',
  options: 'Options', search: 'Search', help: 'Help', calculator: 'Calculator',
  clock: 'Clock', memopad: 'MemoPad', tasks: 'Tasks', breaker: 'Brick Breaker',
}

const ZH: BBStrings = {
  carrier: 'AT&T',
  apps: APPS_ZH,
  menu: '菜单', back: '返回', ok: '确定', cancel: '取消', save: '保存',
  delete: '删除', close: '关闭', yes: '是', no: '否', on: '开', off: '关',
  empty: '(空)', unread: (n) => `${n} 封未读`,
  bootLogo: 'BlackBerry',
  locked: '键盘已锁定', unlockHint: '按 (*) + 拨号键 解锁',
  homeDate: (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
  msgWelcome: '欢迎使用 BlackBerry！打开帮助了解更多。',
  msgMom: '儿子，这周末回家吃饭吗？',
  msgMomReply: ['路上小心。', '好，等你。', '我让爸爸去接你。'],
  replies: ['路上小心。', '好的，知道了。', '我让爸爸去接你。', '别太晚，注意安全。'],
  compose: '撰写', to: '收件人', subject: '主题', send: '发送', sentItems: '已发送',
  contacts: '联系人',
  callLog: '通话记录', missed: '未接', received: '已接', dialled: '已拨',
  calling: '正在呼叫…', connected: '通话中',
  bookmarks: '书签',
  music: '音乐', pictures: '图片', videos: '视频', voiceNotes: '语音备忘',
  nowPlaying: '正在播放',
  capture: '拍照', photos: (n) => `${n} 张照片`,
  bbm: 'BlackBerry Messenger', available: '可用',
  options: '选项', ringTone: '铃声', language: '语言', about: '关于',
  alarm: '闹钟', stopwatch: '秒表',
  memopad: '记事本', tasks: '任务',
  breaker: '打砖块', score: '得分', newHigh: '新纪录！', gameOver: '游戏结束',
  launch: '发球',
  help: '帮助',
  helpText:
    '轨迹球移动焦点，按下确认；黑莓键打开菜单，返回键回上一级。' +
    '在主屏直接键入姓名可搜索联系人，按拨号键打电话。',
}

const EN: BBStrings = {
  carrier: 'AT&T',
  apps: APPS_EN,
  menu: 'Menu', back: 'Back', ok: 'OK', cancel: 'Cancel', save: 'Save',
  delete: 'Delete', close: 'Close', yes: 'Yes', no: 'No', on: 'On', off: 'Off',
  empty: '(Empty)', unread: (n) => `${n} unread`,
  bootLogo: 'BlackBerry',
  locked: 'Keyboard locked', unlockHint: 'Press (*) + Send to unlock',
  homeDate: (d) =>
    d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  msgWelcome: 'Welcome to your BlackBerry! Open Help to learn more.',
  msgMom: 'Are you coming home for dinner this weekend?',
  msgMomReply: ['Drive safe.', 'OK, see you then.', "I'll send Dad to pick you up."],
  replies: ['Drive safe.', 'OK, got it.', "I'll send Dad to pick you up.", "Don't be late."],
  compose: 'Compose', to: 'To', subject: 'Subject', send: 'Send', sentItems: 'Sent',
  contacts: 'Contacts',
  callLog: 'Call Log', missed: 'Missed', received: 'Received', dialled: 'Dialled',
  calling: 'Calling…', connected: 'Connected',
  bookmarks: 'Bookmarks',
  music: 'Music', pictures: 'Pictures', videos: 'Videos', voiceNotes: 'Voice Notes',
  nowPlaying: 'Now Playing',
  capture: 'Capture', photos: (n) => `${n} photos`,
  bbm: 'BlackBerry Messenger', available: 'Available',
  options: 'Options', ringTone: 'Ring Tone', language: 'Language', about: 'About',
  alarm: 'Alarm', stopwatch: 'Stopwatch',
  memopad: 'MemoPad', tasks: 'Tasks',
  breaker: 'Brick Breaker', score: 'Score', newHigh: 'New high score!',
  gameOver: 'Game Over', launch: 'Launch',
  help: 'Help',
  helpText:
    'Roll the trackball to move focus and click to select. The BlackBerry key opens menus, ' +
    'the Back key goes back. Type a name on the Home screen to search contacts, press Send to call.',
}

export function bbStrings(lang: Lang): BBStrings {
  return lang === 'en' ? EN : ZH
}

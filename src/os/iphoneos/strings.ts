import type { Lang } from '../../i18n'

/** iPhone OS 1.0 全部界面词条 */
export interface IpStrings {
  carrier: string
  unlock: string
  slideAnswer: string
  // Springboard 应用名
  apps: {
    text: string; calendar: string; photos: string; camera: string
    youtube: string; stocks: string; maps: string; weather: string
    clock: string; calculator: string; notes: string; settings: string
    phone: string; mail: string; safari: string; ipod: string
  }
  // Phone
  favorites: string; recents: string; contacts: string; keypad: string; voicemail: string
  addContact: string; missed: string; all: string
  voicemailGreeting: string; visualVoicemail: string
  voicemailNames: [string, string, string, string]
  // Text
  newMessage: string; sendButton: string; recipient: string; textPlaceholder: string
  // Mail
  inboxes: string; inbox: string; sent: string; drafts: string; trash: string
  mailSubject: string; to: string; from: string; compose: string; send: string; cancel: string
  noMail: string
  // Calendar
  weekdayMin: [string, string, string, string, string, string, string]
  weekdayLong: [string, string, string, string, string, string, string]
  months: [string, string, string, string, string, string, string, string, string, string, string, string]
  noEvents: string; allDay: string
  calToday: string; calList: string; calDay: string; calMonth: string
  // Photos
  cameraRoll: string; photoLibrary: string; nPhotos: string
  // Camera
  cameraReady: string
  // YouTube
  featured: string; mostViewed: string; videos: [string, string, string]
  // Stocks
  stockNames: [string, string, string, string, string]
  // Maps
  mapsSearch: string; currentLocation: string; droppedPin: string
  // Weather
  weatherCity: string; weatherCities: [string, string]; today: string
  // Clock
  worldClock: string; alarms: string; stopwatch: string; timer: string
  start: string; stop: string; lap: string; reset: string
  hour: string; minute: string
  today2: string
  // Notes
  notesTitle: string; notesPlaceholder: string
  // Settings
  airplane: string; wifi: string; bluetooth: string; sounds: string; brightness: string; general: string
  about: string; dateTime: string; international: string; autoLock: string
  on: string; off: string; language: string; sounds2: string
  ringtones: string; ringtoneNames: [string, string, string, string]
  vibRing: string; vibSilent: string
  wifiNetworks: [string, string]
  setWallpaper: string; wallpaperNames: [string, string, string]
  mailFetch: string; mailBcc: string
  callWaiting: string; callerId: string
  js: string; blockPlugins: string; cookies: string
  soundCheck: string; enhance: string
  // Safari
  search: string; bookmarks: string; google: string
  // iPod
  playlists: string; artists: string; songs: string; videosTab: string; nowPlaying: string
  trackNames: [string, string, string, string]
  artistName: string; albumName: string
  // Incoming / in-call
  answer: string; decline: string; callEnded: string
  callFailed: string; calling: string
  mute: string; speaker: string; addCall: string; hold: string; resume: string
  // misc
  back: string; edit: string; done: string; delete: string; ok: string
  clear: string; view: string; close: string
  // power
  slideOff: string
  // emergency / alert
  newMessageAlert: string; alertTitle: string
}

const zh: IpStrings = {
  carrier: 'AT&T',
  unlock: '滑动来解锁',
  slideAnswer: '滑动来接听',
  apps: {
    text: '短信', calendar: '日历', photos: '照片', camera: '相机',
    youtube: 'YouTube', stocks: '股票', maps: '地图', weather: '天气',
    clock: '时钟', calculator: '计算器', notes: '备忘录', settings: '设置',
    phone: '电话', mail: '邮件', safari: 'Safari', ipod: 'iPod',
  },
  favorites: '个人收藏', recents: '最近通话', contacts: '通讯录', keypad: '拨号键盘', voicemail: '语音信箱',
  addContact: '添加联系人', missed: '未接', all: '全部',
  voicemailGreeting: '语音信箱', visualVoicemail: '可视语音信箱',
  voicemailNames: ['妈妈', '王老师', '李雷', '快递'],
  newMessage: '新信息', sendButton: '发送', recipient: '收件人', textPlaceholder: '信息',
  inboxes: '收件箱', inbox: '收件箱', sent: '已发送', drafts: '草稿', trash: '废件箱',
  mailSubject: '主题', to: '收件人', from: '发件人', compose: '写邮件', send: '发送', cancel: '取消',
  noMail: '没有邮件',
  weekdayMin: ['日', '一', '二', '三', '四', '五', '六'],
  weekdayLong: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
  months: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
  noEvents: '无事件', allDay: '全天',
  calToday: '今天', calList: '列表', calDay: '日', calMonth: '月',
  cameraRoll: '相机胶卷', photoLibrary: '照片图库', nPhotos: '张照片',
  cameraReady: '准备拍照',
  featured: '精选', mostViewed: '最多观看',
  videos: ['2007 Macworld 主题演讲', 'iPhone 广告 Get a Mac', 'Silent Night 民谣现场'],
  stockNames: ['AAPL', 'GOOG', 'MSFT', 'YHOO', 'NOK'],
  mapsSearch: '搜索地址', currentLocation: '当前位置', droppedPin: '已放置大头针',
  weatherCity: '库比蒂诺', weatherCities: ['库比蒂诺', '北京'], today: '今天',
  worldClock: '世界时钟', alarms: '闹钟', stopwatch: '秒表', timer: '计时器',
  start: '启动', stop: '停止', lap: '计次', reset: '复位',
  hour: '小时', minute: '分钟',
  today2: '今天',
  notesTitle: '备忘录', notesPlaceholder: '输入备忘录内容…',
  airplane: '飞行模式', wifi: '无线局域网', bluetooth: '蓝牙', sounds: '声音', brightness: '亮度', general: '通用',
  about: '关于本机', dateTime: '日期与时间', international: '多语言环境', autoLock: '自动锁定',
  on: '开', off: '关', language: '语言', sounds2: '声音',
  ringtones: '电话铃声', ringtoneNames: ['马林巴琴', '木琴', '门铃', '蟋蟀'],
  vibRing: '响铃模式振动', vibSilent: '静音模式振动',
  wifiNetworks: ['Apple-Network', 'ChinaMobile-Guest'],
  setWallpaper: '壁纸', wallpaperNames: ['地球', '水波', '纯黑'],
  mailFetch: '获取新数据', mailBcc: '密送自己',
  callWaiting: '呼叫等待', callerId: '显示本机号码',
  js: 'JavaScript', blockPlugins: '阻止插件', cookies: '接受 Cookie',
  soundCheck: '音量平衡', enhance: '自动增强',
  search: '搜索', bookmarks: '书签', google: 'Google',
  playlists: '播放列表', artists: '表演者', songs: '歌曲', videosTab: '视频', nowPlaying: '正在播放',
  trackNames: ['Beautiful Day', 'Hey Jude', 'Mr. Tambourine Man', 'Scarborough Fair'],
  artistName: 'U2', albumName: 'All That You Can’t Leave Behind',
  answer: '接听', decline: '挂断', callEnded: '通话已结束',
  callFailed: '呼叫失败', calling: '正在呼叫',
  mute: '静音', speaker: '免提', addCall: '添加通话', hold: '等待', resume: '恢复',
  back: '返回', edit: '编辑', done: '完成', delete: '删除', ok: '好',
  clear: '清除', view: '查看', close: '关闭',
  slideOff: '滑动来关机',
  newMessageAlert: '新信息', alertTitle: '提醒',
}

const en: IpStrings = {
  carrier: 'AT&T',
  unlock: 'slide to unlock',
  slideAnswer: 'slide to answer',
  apps: {
    text: 'Text', calendar: 'Calendar', photos: 'Photos', camera: 'Camera',
    youtube: 'YouTube', stocks: 'Stocks', maps: 'Maps', weather: 'Weather',
    clock: 'Clock', calculator: 'Calculator', notes: 'Notes', settings: 'Settings',
    phone: 'Phone', mail: 'Mail', safari: 'Safari', ipod: 'iPod',
  },
  favorites: 'Favorites', recents: 'Recents', contacts: 'Contacts', keypad: 'Keypad', voicemail: 'Voicemail',
  addContact: 'Add Contact', missed: 'Missed', all: 'All',
  voicemailGreeting: 'Voicemail', visualVoicemail: 'Visual Voicemail',
  voicemailNames: ['Mom', 'Mr. Wang', 'Li Lei', 'Courier'],
  newMessage: 'New Message', sendButton: 'Send', recipient: 'To:', textPlaceholder: 'SMS',
  inboxes: 'Inbox', inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', trash: 'Trash',
  mailSubject: 'Subject', to: 'To', from: 'From', compose: 'Compose', send: 'Send', cancel: 'Cancel',
  noMail: 'No Mail',
  weekdayMin: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  weekdayLong: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  noEvents: 'No Events', allDay: 'all-day',
  calToday: 'Today', calList: 'List', calDay: 'Day', calMonth: 'Month',
  cameraRoll: 'Camera Roll', photoLibrary: 'Photo Library', nPhotos: 'Photos',
  cameraReady: 'Ready',
  featured: 'Featured', mostViewed: 'Most Viewed',
  videos: ['Macworld 2007 Keynote', 'iPhone — Get a Mac Ad', 'Silent Night Live Folk'],
  stockNames: ['AAPL', 'GOOG', 'MSFT', 'YHOO', 'NOK'],
  mapsSearch: 'Search', currentLocation: 'Current Location', droppedPin: 'Dropped Pin',
  weatherCity: 'Cupertino', weatherCities: ['Cupertino', 'Beijing'], today: 'Today',
  worldClock: 'World Clock', alarms: 'Alarm', stopwatch: 'Stopwatch', timer: 'Timer',
  start: 'Start', stop: 'Stop', lap: 'Lap', reset: 'Reset',
  hour: 'hr', minute: 'min',
  today2: 'Today',
  notesTitle: 'Notes', notesPlaceholder: 'Type a note…',
  airplane: 'Airplane Mode', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', sounds: 'Sounds', brightness: 'Brightness', general: 'General',
  about: 'About', dateTime: 'Date & Time', international: 'International', autoLock: 'Auto-Lock',
  on: 'on', off: 'off', language: 'Language', sounds2: 'Sounds',
  ringtones: 'Ringtone', ringtoneNames: ['Marimba', 'Xylophone', 'Doorbell', 'Crickets'],
  vibRing: 'Vibrate on Ring', vibSilent: 'Vibrate on Silent',
  wifiNetworks: ['Apple-Network', 'ChinaMobile-Guest'],
  setWallpaper: 'Wallpaper', wallpaperNames: ['Earth', 'Aqua', 'Black'],
  mailFetch: 'Fetch New Data', mailBcc: 'Always Bcc Myself',
  callWaiting: 'Call Waiting', callerId: 'Show My Caller ID',
  js: 'JavaScript', blockPlugins: 'Block Plug-ins', cookies: 'Accept Cookies',
  soundCheck: 'Sound Check', enhance: 'Enhance',
  search: 'Search', bookmarks: 'Bookmarks', google: 'Google',
  playlists: 'Playlists', artists: 'Artists', songs: 'Songs', videosTab: 'Videos', nowPlaying: 'Now Playing',
  trackNames: ['Beautiful Day', 'Hey Jude', 'Mr. Tambourine Man', 'Scarborough Fair'],
  artistName: 'U2', albumName: 'All That You Can’t Leave Behind',
  answer: 'Answer', decline: 'Decline', callEnded: 'Call Ended',
  callFailed: 'Call Failed', calling: 'Calling',
  mute: 'Mute', speaker: 'Speaker', addCall: 'Add Call', hold: 'Hold', resume: 'Resume',
  back: 'Back', edit: 'Edit', done: 'Done', delete: 'Delete', ok: 'OK',
  clear: 'Clear', view: 'View', close: 'Close',
  slideOff: 'slide to power off',
  newMessageAlert: 'New Message', alertTitle: 'Alert',
}

export function ipStrings(lang: Lang): IpStrings {
  return lang === 'en' ? en : zh
}

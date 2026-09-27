import type { Lang } from '../../i18n'

/** Android 1.0 系统层双语文案 */
export interface AndroidStrings {
  carrier: string
  lockHint: (stage: number) => string
  drawerTitle: string
  searchWidget: string
  menuAdd: string
  menuNotifications: string
  menuWallpaper: string
  menuSettings: string
  menuAbout: string
  searchHint: string
  searchGo: string
  shadeTitle: string
  shadeNewSms: string
  shadeEmpty: string
  shadeClear: string
  alarmRing: string
  alarmDismiss: string
  // Alarm Clock（深色多闹钟）
  aAdd: string
  aRepeat: string
  aSound: string
  aLabel: string
  aRemove: string
  aTime: string
  aOnce: string
  aEveryday: string
  aWeekdays: string
  aWeekends: string
  aDaysShort: string[]
  aSnooze: string
  aDismiss: string
  aSnoozed: string
  aAlertTitle: string
  aNoAlarms: string
  aLabelDefault: string
  aOff: string
  wallpaperNames: string[]
  settingsTitle: string
  settingsWallpaper: string
  settingsSound: string
  settingsAbout: string
  settingsOn: string
  settingsOff: string
  /** Android 1.0 设置七大项 */
  setWireless: string
  setCall: string
  setSoundDisplay: string
  setSync: string
  setSd: string
  setDateTime: string
  setLocale: string
  wirelessWifi: string
  wirelessBt: string
  wirelessAirplane: string
  wirelessNet: string
  callVoicemail: string
  callForward: string
  sdSilent: string
  sdHaptic: string
  sdTimeout: string
  syncGmail: string
  syncCalendar: string
  syncContacts: string
  syncLast: (what: string) => string
  sdTotal: string
  sdAvail: string
  sdUnmount: string
  sdUnmounted: string
  dtAuto: string
  dtNow: (d: string, t: string) => string
  dtZone: string
  dt24h: string
  localeZh: string
  localeEn: string
  /** 安全和位置（真机第 8 大项） */
  setSecurity: string
  secWifiLoc: string
  secGps: string
  secPattern: string
  secPatternOff: string
  secPatternHint: string
  /** 声音和显示扩充 */
  sdRingtone: string
  sdSdNotify: string
  sdUnlockSound: string
  sdBrightness: string
  sdRotate: string
  ringtoneNames: string[]
  aboutTitle: string
  aboutModel: string
  aboutFirmware: string
  aboutKernel: string
  aboutBuild: string
  aboutBattery: (pct: number) => string
  // ===== 真机八项设置：钻取页文案 =====
  btnOk: string
  btnCancel: string
  // 1 Wireless controls
  wAirplane: string
  wWifi: string
  wWifiSet: string
  wBt: string
  wBtSet: string
  wMobile: string
  // Wi-Fi 设置
  wfNotify: string
  wfAps: ReadonlyArray<{ name: string; sec: boolean }>
  wfPassTitle: string
  wfConnecting: (ap: string) => string
  wfConnected: (ap: string) => string
  // 蓝牙设置
  btDeviceName: string
  btDiscoverable: string
  btScan: string
  btPaired: string
  btScanning: string
  btFound: (d: string) => string
  btFakeDevice: string
  // 移动网络
  mRoaming: string
  m2g: string
  mApn: string
  mOperators: string
  mSearching: string
  mOperatorFound: string
  // 2 Call settings
  cVmService: string
  cVmSettings: string
  cWaiting: string
  cCallerId: string
  cIdDefault: string
  cIdHide: string
  cIdShow: string
  fwdTitle: string
  fwdAlways: string
  fwdBusy: string
  fwdUnanswered: string
  fwdUnreachable: string
  // 3 Sound & display 补充
  sdVibrate: string
  sdTones: string
  sdAnimation: string
  brTitle: string
  brHint: string
  toTitle: string
  toLabels: string[]
  anTitle: string
  anNone: string
  anSome: string
  anAll: string
  // 4 Data synchronization 补充
  syBg: string
  syAuto: string
  sySyncNow: string
  sySyncing: string
  syDone: string
  syNever: string
  // 5 Security & location 补充
  seSetPattern: string
  seSimLock: string
  seShowPw: string
  patDraw: string
  patContinue: string
  patRedraw: string
  patMatchFail: string
  patTooShort: string
  patChange: string
  patDisable: string
  /** 图案录制成功 Toast */
  patSaved: string
  /** 图案关闭成功 Toast */
  patRemoved: string
  patEmergency: string
  simLockRow: string
  simChangePin: string
  simPinPrompt: string
  simWrong: string
  simPinChanged: string
  // 6 Applications
  apUnknown: string
  apManage: string
  apRunning: string
  apDev: string
  mngForceStop: string
  mngUninstall: string
  mngClearData: string
  mngClearCache: string
  mngSize: (mb: number) => string
  mngAppInfo: string
  mngStopped: string
  mngUninstalled: (name: string) => string
  mngCleared: string
  svcStop: string
  svcItems: ReadonlyArray<{ name: string; sub: string }>
  svcStopped: (name: string) => string
  devUsb: string
  devStay: string
  devMock: string
  // 7 SD card
  sdFormat: string
  sdIntAvail: string
  sdFormatMsg: string
  sdFormatDone: string
  sdUnmountMsg: string
  // 8 About phone 补充
  abUpdates: string
  abStatus: string
  abBaseband: string
  abChecking: string
  abUpToDate: string
  stBatteryState: string
  stCharging: string
  stDischarging: string
  stSignal: string
  stService: string
  stRoaming: string
  stMobileState: string
  stImei: string
  stImeiSv: string
  stNumber: string
  // Factory data reset
  frTitle: string
  frWarn: string
  frReset: string
  frDone: string
  dialerTitle: string
  dialerHint: string
  dialerCall: string
  dialerClear: string
  calling: string
  inCall: string
  endCall: string
  callEnded: string
  // ===== 通话中 MENU 控件（Dialpad/Speaker/Mute/Hold/Add call） =====
  icDialpad: string
  icSpeaker: string
  icMute: string
  icHold: string
  icAddCall: string
  icAddHint: string
  icCalling: string
  icAdded: string
  icHeld: string
  icParty: (n: string) => string
  /** 拨号盘顶部的两个 tab 标签 */
  tabDial: string
  tabCallLog: string
  /** Call Log tab：来电/去电/未接 */
  callLogIncoming: string
  callLogOutgoing: string
  callLogMissed: string
  callLogEmpty: string
  incomingCall: string
  incomingAnswer: string
  incomingReject: string
  msgsTitle: string
  msgsThreads: string
  msgsEmpty: string
  msgsInputHint: string
  msgsSend: string
  msgsSending: string
  msgsSent: string
  msgsMe: string
  /** 会话内 MENU：添加主题（MMS）/ 删除会话；会话列表 MENU */
  mAddSubject: string
  mDeleteThread: string
  mMarkAllRead: string
  mDeleteAll: string
  mSubjectLabel: string
  mThreadDeleted: string
  mAllDeleted: string
  mConfirmDelete: string
  mConfirmDeleteAll: string
  mSentAt: (t: string) => string
  browserTitle: string
  browserUrl: string
  brBookmarks: string
  brNewWindow: string
  brAddBookmark: string
  brRefresh: string
  brAboutBlank: string
  brUrlHint: string
  brAdded: string
  browserLoading: string
  browserSearch: string
  browserResult1: string
  browserResult2: string
  browserDone: string
  clockTitle: string
  recipient: string
  calcTitle: string
  calcHint: string
  calendarTitle: string
  calendarEvent: string
  calendarNoEvent: string
  cameraTitle: string
  cameraHint: string
  cameraSaved: string
  cameraZoom: (z: number) => string
  contactsTitle: string
  contactMom: string
  contactGoogle: string
  contactTmo: string
  contactsCall: string
  gmailTitle: string
  gmailInbox: string
  gmailStarred: string
  gmailSent: string
  gmailEmpty: string
  gmailSynced: string
  gmailFrom1: string
  gmailSubj1: string
  gmailBody1: string
  gmailFrom2: string
  gmailSubj2: string
  gmailBody2: string
  mapsTitle: string
  mapsHint: string
  mapsPlace: string
  mapsSearchHint: string
  mapsSatellite: string
  mapsTraffic: string
  mapsMyLocation: string
  musicTitle: string
  musicPlaying: string
  musicPaused: string
  /** Music 媒体库（2×2 入口 / 列表 / Now playing） */
  muArtists: string
  muAlbums: string
  muSongs: string
  muPlaylists: string
  muAllSongs: string
  muRecentlyAdded: string
  muUnknownAlbum: string
  muShuffle: string
  muRepeat: string
  muRepeatAll: string
  muRepeatOne: string
  muAddToPlaylist: string
  muNewPlaylist: string
  muPlaylistName: string
  muPartyShuffle: string
  muLibrary: string
  muAdded: string
  picturesTitle: string
  picturesEmpty: string
  picDelete: string
  picSetWallpaper: string
  picSetContact: string
  picPickContact: string
  picDeletedToast: string
  picWallpaperToast: string
  picContactToast: (name: string) => string
  /** Android Market（G1 预装，2008-10-22 上线） */
  marketTitle: string
  marketFree: string
  marketBy: (dev: string) => string
  marketInstall: string
  marketInstalled: string
  marketItems: Array<{ name: string; dev: string; desc: string; price: string }>
  marketStars: (n: number) => string
  /** Market 1.0 深色 BETA 版：精选轮播 / 分类 / 权限 / 下载安装 */
  mkBeta: string
  mkFeatured: string
  mkAllApps: string
  mkAllGames: string
  mkDownloads: string
  mkPermTitle: string
  mkPermNetwork: string
  mkPermStorage: string
  mkPermLocation: string
  mkPermContacts: string
  mkDownloading: string
  mkInstalling: string
  mkInstalledToast: string
  mkUninstall: string
  mkOpen: string
  mkOk: string
  mkCancel: string
  /** YouTube（G1 预装） */
  ytTitle: string
  ytVideos: Array<{ title: string; by: string; scene: 'zoo' | 'dance' | 'kids' }>
  ytViews: (n: string) => string
  ytPause: string
  ytBuf: string
  ytReplay: string
  /** Amazon MP3（G1 预装） */
  amzTitle: string
  amzSongs: Array<{ title: string; artist: string }>
  amzPrice: string
  amzBuy: string
  amzBought: string
  amzToMusic: string
  /** IM（G1 预装，支持 Google Talk） */
  imTitle: string
  imOnline: string
  imAway: string
  imOffline: string
  imBuddies: Array<{ name: string; status: 'on' | 'away' | 'off' }>
  imInputHint: string
  imOfflineNote: string
  imReplies: string[]
  /** Email（POP/IMAP 客户端） */
  emailTitle: string
  emailSetup: string
  emailAddr: string
  emailPass: string
  emailNext: string
  emailChecking: string
  emailInbox: string
  emailSeeds: Array<{ from: string; subj: string; body: string }>
  /** Voice Dialer */
  vdListening: string
  vdHint: string
  vdRecognized: string
  vdNoMatch: string
  vdTapBack: string
  /** Add to Home 对话框 */
  addTitle: string
  dApplication: string
  dShortcut: string
  dWidget: string
  dWallpaper: string
  dContact: string
  /** 搜索挂件右侧按钮文字 */
  dSearchBtn: string
  wClock: string
  wPictureFrame: string
  wSearch: string
  wPictures: string
  wPurchased: string
  wWallpaperGallery: string
  /** Recent apps */
  recentTitle: string
  recentEmpty: string
  /** Global actions */
  actionsTitle: string
  silentMode: string
  powerOff: string
  /** 锁屏补充 */
  lockCharging: string
  lockNextAlarm: (t: string) => string
  lockDate: (d: Date) => string
  /** 通知栏补充 */
  shadeOngoing: string
  shadeNotifications: string
  shadeClearAll: string
  shadeMissedCall: string
  shadeFullDate: (d: Date) => string
  seedWelcome: string
  seedMom: string
  replies: string[]
}

export const ANDROID_STRINGS: Record<Lang, AndroidStrings> = {
  zh: {
    carrier: 'T-Mobile',
    lockHint: (stage) => (stage === 0 ? '按 MENU 键解锁' : '再按一次 MENU'),
    drawerTitle: '所有应用',
    searchWidget: 'Google  搜索…',
    menuAdd: '添加',
    menuNotifications: '通知',
    menuWallpaper: '壁纸',
    menuSettings: '设置',
    menuAbout: '关于手机',
    searchHint: 'Google 搜索',
    searchGo: '搜索',
    shadeTitle: '正在进行',
    shadeNewSms: '新短信 · 妈妈',
    shadeEmpty: '暂无通知',
    shadeClear: '清除通知',
    alarmRing: '闹钟响了！',
    alarmDismiss: '按任意键关闭',
    aAdd: '添加闹钟',
    aRepeat: '重复',
    aSound: '铃声',
    aLabel: '标签',
    aRemove: '删除闹钟',
    aTime: '时间',
    aOnce: '仅一次',
    aEveryday: '每天',
    aWeekdays: '工作日',
    aWeekends: '周末',
    aDaysShort: ['一', '二', '三', '四', '五', '六', '日'],
    aSnooze: '贪睡',
    aDismiss: '关闭',
    aSnoozed: '已贪睡，5 分钟后再响',
    aAlertTitle: '闹钟',
    aNoAlarms: '没有闹钟',
    aLabelDefault: '闹钟',
    aOff: '已关闭',
    wallpaperNames: ['经典蓝', 'Android 绿', '暗夜'],
    settingsTitle: '设置',
    settingsWallpaper: '壁纸',
    settingsSound: '提示音',
    settingsAbout: '关于手机',
    settingsOn: '开',
    settingsOff: '关',
    setWireless: '无线控制',
    setCall: '通话设置',
    setSoundDisplay: '声音和显示',
    setSync: '数据同步',
    setSd: 'SD 卡',
    setDateTime: '日期和时间',
    setLocale: '语言和区域',
    wirelessWifi: 'WLAN',
    wirelessBt: '蓝牙',
    wirelessAirplane: '飞行模式',
    wirelessNet: '移动网络 · T-Mobile 已连接',
    callVoicemail: '语音信箱号码',
    callForward: '呼叫转移 · 已关闭',
    sdSilent: '静音模式',
    sdHaptic: '触感反馈',
    sdTimeout: '屏幕待机 · 1 分钟',
    syncGmail: 'Gmail',
    syncCalendar: '日历',
    syncContacts: '联系人',
    syncLast: (what) => `${what} · 上次同步 10:00`,
    sdTotal: '总容量 1 GB',
    sdAvail: '可用空间',
    sdUnmount: '卸载 SD 卡',
    sdUnmounted: 'SD 卡已卸载 · 可安全移除',
    dtAuto: '自动（网络提供）',
    dtNow: (d, t) => `${d} ${t}`,
    dtZone: '时区 GMT+8:00 北京',
    dt24h: '使用 24 小时制',
    localeZh: '中文',
    localeEn: 'English',
    setSecurity: '安全和位置',
    secWifiLoc: '使用无线网络的位置',
    secGps: '启用 GPS 卫星',
    secPattern: '屏幕解锁图案',
    secPatternOff: '无图案 · 已停用',
    secPatternHint: '绘制图案连接至少 4 个点',
    sdRingtone: '手机铃声',
    sdSdNotify: 'SD 卡通知',
    sdUnlockSound: '屏幕解锁提示音',
    sdBrightness: '显示亮度 · 中',
    sdRotate: '自动旋转屏幕',
    ringtoneNames: ['经典', '数字', '水滴', '欢快'],
    aboutTitle: '关于手机',
    aboutModel: '机型 T-Mobile G1（HTC Dream）',
    aboutFirmware: '固件版本 Android 1.0',
    aboutKernel: '内核 2.6.25-01143-gfc99b4e',
    aboutBuild: '版本号 dream_devphone-userdebug 1.0 TC4',
    aboutBattery: (pct) => `电量 ${pct}%`,
    btnOk: '确定',
    btnCancel: '取消',
    wAirplane: '飞行模式',
    wWifi: 'WLAN',
    wWifiSet: 'WLAN 设置',
    wBt: '蓝牙',
    wBtSet: '蓝牙设置',
    wMobile: '移动网络',
    wfNotify: '网络通知',
    wfAps: [
      { name: 'AndroidLab', sec: true },
      { name: 'linksys', sec: true },
      { name: 'T-Mobile HotSpot', sec: false },
      { name: 'guest-net', sec: false },
    ],
    wfPassTitle: '输入密码',
    wfConnecting: (ap) => `正在连接 ${ap}…`,
    wfConnected: (ap) => `已连接到 ${ap}`,
    btDeviceName: '设备名称',
    btDiscoverable: '可检测',
    btScan: '扫描查找设备',
    btPaired: '蓝牙耳机 Plantronics 520',
    btScanning: '正在扫描蓝牙设备…',
    btFound: (d) => `找到设备：${d}`,
    btFakeDevice: 'HTC Magic',
    mRoaming: '数据漫游',
    m2g: '仅使用 2G 网络',
    mApn: '接入点名称',
    mOperators: '网络运营商',
    mSearching: '正在搜索可用网络…',
    mOperatorFound: '已在网络上注册：T-Mobile',
    cVmService: '语音信箱服务',
    cVmSettings: '语音信箱设置',
    cWaiting: '呼叫等待',
    cCallerId: '发送本机号码',
    cIdDefault: '网络默认',
    cIdHide: '隐藏号码',
    cIdShow: '显示号码',
    fwdTitle: '呼叫转移',
    fwdAlways: '始终转移',
    fwdBusy: '占线时转移',
    fwdUnanswered: '无人接听时转移',
    fwdUnreachable: '无法接通时转移',
    sdVibrate: '振动',
    sdTones: '按键操作音',
    sdAnimation: '动画',
    brTitle: '亮度',
    brHint: '方向键调节 · 确定保存',
    toTitle: '屏幕待机',
    toLabels: ['15 秒', '30 秒', '1 分钟', '2 分钟', '10 分钟', '30 分钟'],
    anTitle: '动画',
    anNone: '无动画',
    anSome: '部分动画',
    anAll: '所有动画',
    syBg: '后台数据',
    syAuto: '自动同步',
    sySyncNow: '立即同步',
    sySyncing: '正在同步…',
    syDone: '同步已完成',
    syNever: '从未',
    seSetPattern: '设置解锁图案',
    seSimLock: '设置 SIM 卡锁定',
    seShowPw: '显示密码',
    patDraw: '请绘制图案',
    patContinue: '继续',
    patRedraw: '请再次绘制图案进行确认',
    patMatchFail: '两次绘制的图案不一致，请重试',
    patTooShort: '图案至少连接 4 个点',
    patChange: '更改解锁图案',
    patDisable: '关闭解锁图案',
    patSaved: '解锁图案已设置',
    patRemoved: '解锁图案已关闭',
    patEmergency: '紧急呼叫',
    simLockRow: '锁定 SIM 卡',
    simChangePin: '更改 SIM 卡 PIN',
    simPinPrompt: '请输入 SIM PIN（演示码 1234）',
    simWrong: 'PIN 不正确',
    simPinChanged: 'SIM PIN 已更改',
    apUnknown: '未知来源',
    apManage: '管理应用程序',
    apRunning: '正在运行的服务',
    apDev: '开发',
    mngForceStop: '强制停止',
    mngUninstall: '卸载',
    mngClearData: '清除数据',
    mngClearCache: '清除缓存',
    mngSize: (mb) => `应用程序 · ${mb} MB`,
    mngAppInfo: '应用程序信息',
    mngStopped: '已强制停止',
    mngUninstalled: (name) => `已卸载 ${name}`,
    mngCleared: '数据已清除',
    svcStop: '停止',
    svcItems: [
      { name: '状态栏', sub: '系统进程 · 4 MB' },
      { name: 'Google 服务', sub: 'com.google.process.gapps · 12 MB' },
      { name: 'Gmail', sub: '邮件同步服务 · 8 MB' },
      { name: '电话存储', sub: '系统进程 · 2 MB' },
    ],
    svcStopped: (name) => `已停止：${name}`,
    devUsb: 'USB 调试',
    devStay: '保持唤醒状态',
    devMock: '允许模拟位置',
    sdFormat: '格式化 SD 卡',
    sdIntAvail: '内部存储空间可用',
    sdFormatMsg: '格式化将清除 SD 卡上的全部数据，确定继续？',
    sdFormatDone: 'SD 卡已格式化',
    sdUnmountMsg: '卸载后可安全移除 SD 卡，确定继续？',
    abUpdates: '系统更新',
    abStatus: '状态',
    abBaseband: '基带版本 62.50SC.20.17H_2.22.19.26I',
    abChecking: '正在检查更新…',
    abUpToDate: '你的系统已是最新版本',
    stBatteryState: '电池状态',
    stCharging: '充电中',
    stDischarging: '未充电',
    stSignal: '信号强度',
    stService: '服务状态',
    stRoaming: '漫游',
    stMobileState: '移动网络状态',
    stImei: 'IMEI',
    stImeiSv: 'IMEISV',
    stNumber: '本机号码',
    frTitle: '恢复出厂设置',
    frWarn: '将清除手机上的全部数据：Google 账户、系统与应用程序设置、已下载应用程序，以及媒体文件。清除后手机将重启。',
    frReset: '重置手机',
    frDone: '正在清除数据…',
    dialerTitle: '电话',
    dialerHint: '输入号码后按呼叫键',
    dialerCall: '呼叫',
    dialerClear: '清空',
    calling: '正在呼出…',
    inCall: '通话中',
    endCall: '按挂断键结束',
    callEnded: '通话结束',
    icDialpad: '拨号键盘',
    icSpeaker: '扬声器',
    icMute: '静音',
    icHold: '保持',
    icAddCall: '添加通话',
    icAddHint: '输入要添加的号码',
    icCalling: '正在呼出…',
    icAdded: '已加入通话',
    icHeld: '已保持',
    icParty: (n) => `多方 · ${n}`,
    tabDial: '拨号',
    tabCallLog: '通话记录',
    callLogIncoming: '来电',
    callLogOutgoing: '去电',
    callLogMissed: '未接',
    callLogEmpty: '暂无通话记录',
    incomingCall: '来电',
    incomingAnswer: '接听',
    incomingReject: '拒接',
    msgsTitle: '信息',
    msgsThreads: '会话',
    msgsEmpty: '暂无会话',
    msgsInputHint: '输入信息…（全键盘）',
    msgsSend: '发送',
    msgsSending: '正在发送…',
    msgsSent: '已发送',
    msgsMe: '我',
    mAddSubject: '添加主题',
    mDeleteThread: '删除会话',
    mMarkAllRead: '全部标记已读',
    mDeleteAll: '删除全部会话',
    mSubjectLabel: '主题',
    mThreadDeleted: '会话已删除',
    mAllDeleted: '全部会话已删除',
    mConfirmDelete: '确定删除此会话？',
    mConfirmDeleteAll: '确定删除全部会话？',
    mSentAt: (t) => t,
    browserTitle: '浏览器',
    browserUrl: 'www.google.com',
    brBookmarks: '书签',
    brNewWindow: '新窗口',
    brAddBookmark: '添加书签',
    brRefresh: '刷新',
    brAboutBlank: 'about:blank',
    brUrlHint: '输入网址',
    brAdded: '书签已添加',
    browserLoading: '载入中…',
    browserSearch: 'Google 搜索',
    browserResult1: 'Android — 开源移动系统',
    browserResult2: 'T-Mobile G1 发布会实录',
    browserDone: '已到达页面底部',
    clockTitle: '闹钟',
    recipient: '妈妈',
    calcTitle: '计算器',
    calcHint: 'm=− p=+ · 点按按钮也可',
    calendarTitle: '日历',
    calendarEvent: 'T-Mobile G1 发布',
    calendarNoEvent: '无日程',
    cameraTitle: '相机',
    cameraHint: '确认键 / 轨迹球拍照',
    cameraSaved: '已保存到图片',
    cameraZoom: (z) => `${z}×`,
    contactsTitle: '名片夹',
    contactMom: '妈妈',
    contactGoogle: 'Google 同步',
    contactTmo: 'T-Mobile 客服',
    contactsCall: '呼叫',
    gmailTitle: 'Gmail',
    gmailInbox: '收件箱',
    gmailStarred: '已加星标',
    gmailSent: '已发送',
    gmailEmpty: '没有邮件',
    gmailSynced: '同步于',
    gmailFrom1: 'Google',
    gmailSubj1: '欢迎使用 Gmail',
    gmailBody1: '你的 Gmail 已随 Google 账户同步到 G1。邮件推送随时待命，搜索框就在收件箱顶部。',
    gmailFrom2: 'T-Mobile',
    gmailSubj2: '你的 G1 已就绪',
    gmailBody2: '感谢选择 T-Mobile G1！本月话费与流量详情请登录 my.t-mobile.com 查看。',
    mapsTitle: '地图',
    mapsHint: '轨迹球移动 · * # 缩放',
    mapsPlace: 'T-Mobile 大厦',
    mapsSearchHint: '搜索地图',
    mapsSatellite: '卫星',
    mapsTraffic: '路况',
    mapsMyLocation: '我的位置',
    musicTitle: '音乐',
    musicPlaying: '正在播放',
    musicPaused: '已暂停',
    muArtists: '艺术家',
    muAlbums: '专辑',
    muSongs: '歌曲',
    muPlaylists: '播放列表',
    muAllSongs: '全部歌曲',
    muRecentlyAdded: '最近添加',
    muUnknownAlbum: '未知专辑',
    muShuffle: '随机播放',
    muRepeat: '重复',
    muRepeatAll: '全部重复',
    muRepeatOne: '单曲重复',
    muAddToPlaylist: '添加到播放列表',
    muNewPlaylist: '新建播放列表',
    muPlaylistName: '播放列表名称',
    muPartyShuffle: '派对随机',
    muLibrary: '媒体库',
    muAdded: '已添加到播放列表',
    picturesTitle: '图片',
    picturesEmpty: '暂无照片 · 打开相机拍一张',
    picDelete: '删除图片',
    picSetWallpaper: '设为壁纸',
    picSetContact: '设为联系人头像',
    picPickContact: '选择联系人',
    picDeletedToast: '图片已删除',
    picWallpaperToast: '壁纸已设置',
    picContactToast: (name) => `已设为 ${name} 的头像`,
    marketTitle: 'Android Market',
    marketFree: '免费',
    marketBy: (dev) => `开发者 ${dev}`,
    marketInstall: '安装',
    marketInstalled: '已安装',
    marketItems: [
      { name: 'ShopSavvy', dev: 'Big in Japan', desc: '扫描条形码，比价全网商店。G1 发布会上的明星演示应用。', price: '免费' },
      { name: 'Ringdroid', dev: 'Ringdroid 开发组', desc: '在手机上剪辑 MP3 做铃声，开源免费。', price: '免费' },
      { name: 'Bonsai Blast', dev: 'Glu Mobile', desc: '禅意弹珠台，沿途闯关收集宝珠。', price: '$4.99' },
      { name: 'Pac-Man', dev: 'Namco', desc: '街机经典的完整移植，支持轨迹球。', price: '$9.99' },
      { name: 'Shazam', dev: 'Shazam Entertainment', desc: '几秒识别身边正在播放的音乐，给出歌名与专辑。', price: '免费' },
      { name: 'Abduction!', dev: 'Psym Mobile', desc: '奶牛蹦跳躲避外星飞碟，轨迹球控制跳跃。', price: '免费' },
    ],
    marketStars: (n) => `${n} 颗星`,
    mkBeta: 'BETA',
    mkFeatured: '精选',
    mkAllApps: '所有应用程序',
    mkAllGames: '所有游戏',
    mkDownloads: '我的下载',
    mkPermTitle: '该应用有权访问：',
    mkPermNetwork: '网络通信（完全互联网访问）',
    mkPermStorage: '存储（修改/删除 SD 卡内容）',
    mkPermLocation: '位置（精确 GPS 位置）',
    mkPermContacts: '个人信息（读取联系人数据）',
    mkDownloading: '正在下载…',
    mkInstalling: '正在安装…',
    mkInstalledToast: '应用程序已安装',
    mkUninstall: '卸载',
    mkOpen: '打开',
    mkOk: '确定',
    mkCancel: '取消',
    ytTitle: 'YouTube',
    ytVideos: [
      { title: 'Me at the zoo', by: 'jawed', scene: 'zoo' },
      { title: 'Evolution of Dance', by: 'judson laipply', scene: 'dance' },
      { title: 'Charlie bit my finger', by: 'HDCYT', scene: 'kids' },
    ],
    ytViews: (n) => `${n} 次观看`,
    ytPause: '按 OK 暂停',
    ytBuf: '缓冲中…',
    ytReplay: '重新播放',
    amzTitle: 'Amazon MP3',
    amzSongs: [
      { title: 'Sideloader', artist: 'The QWERTY Keys' },
      { title: '3.2 Inches of Love', artist: 'Capacitive' },
    ],
    amzPrice: '$0.89',
    amzBuy: '购买',
    amzBought: '已购买',
    amzToMusic: '已下载 · 请到「音乐」播放',
    imTitle: 'IM',
    imOnline: '在线',
    imAway: '离开',
    imOffline: '离线',
    imBuddies: [
      { name: '妈妈', status: 'on' },
      { name: '张伟', status: 'on' },
      { name: 'Google 同事', status: 'away' },
      { name: '小李', status: 'off' },
    ],
    imInputHint: '输入消息，回车发送',
    imOfflineNote: '对方离线，消息将在其上线后送达',
    imReplies: ['好呀～', '收到！', '哈哈，G1 的键盘真好用', '一会儿聊，在开会'],
    emailTitle: '电子邮件',
    emailSetup: '账户设置',
    emailAddr: '邮箱地址',
    emailPass: '密码',
    emailNext: '下一步',
    emailChecking: '正在检查服务器设置…',
    emailInbox: '收件箱',
    emailSeeds: [
      {
        from: '邮件管理员',
        subj: '欢迎使用电子邮件',
        body: '你的 POP/IMAP 账户已设置完成。从此在 G1 上即可收取工作邮件，附件与文件夹保持同步。',
      },
      {
        from: '人力资源部',
        subj: '下周例会安排',
        body: '下周一上午十点例会照常，请提前准备季度小结。会议室改到三楼东侧，请相互转告。',
      },
      {
        from: '老同学',
        subj: '周末聚会照片',
        body: '上周聚会的照片已经打包发你，注意查收。下次人齐再约，期待！',
      },
    ],
    vdListening: '正在聆听…',
    vdHint: '请说出联系人姓名',
    vdRecognized: '识别到以下联系人',
    vdNoMatch: '未找到匹配的联系人',
    vdTapBack: '按返回键退出',
    addTitle: '添加到主屏幕',
    dApplication: '应用程序',
    dShortcut: '快捷方式',
    dWidget: '窗口小部件',
    dWallpaper: '壁纸',
    dContact: '联系人',
    dSearchBtn: '搜索',
    wClock: '时钟',
    wPictureFrame: '相框',
    wSearch: '搜索',
    wPictures: '图片',
    wPurchased: '已购图片',
    wWallpaperGallery: '壁纸库',
    recentTitle: '最近使用的应用',
    recentEmpty: '无最近使用的应用',
    actionsTitle: '手机选项',
    silentMode: '静音模式',
    powerOff: '关闭手机',
    lockCharging: '充电中',
    lockNextAlarm: (t) => `闹钟：${t}`,
    lockDate: (d) => `${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`,
    shadeOngoing: '正在进行',
    shadeNotifications: '通知',
    shadeClearAll: '清除通知',
    shadeMissedCall: '未接来电',
    shadeFullDate: (d) =>
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`,
    seedWelcome: '欢迎使用 Android！你的 Google 账户已同步，Gmail 随时待命。',
    seedMom: '新手机用得惯吗？全键盘打字别太快，妈看着晕。',
    replies: ['好的，知道了', '记得按时吃饭', '天冷多穿点衣服', '少玩手机，早点睡', '给你留了饭', '周末回家吃饭吗'],
  },
  en: {
    carrier: 'T-Mobile',
    lockHint: (stage) => (stage === 0 ? 'Press MENU to unlock' : 'Press MENU again'),
    drawerTitle: 'All apps',
    searchWidget: 'Google  Search…',
    menuAdd: 'Add',
    menuNotifications: 'Notifications',
    menuWallpaper: 'Wallpaper',
    menuSettings: 'Settings',
    menuAbout: 'About phone',
    searchHint: 'Google search',
    searchGo: 'Go',
    shadeTitle: 'Ongoing',
    shadeNewSms: 'New message · Mom',
    shadeEmpty: 'No notifications',
    shadeClear: 'Clear notifications',
    alarmRing: 'Alarm!',
    alarmDismiss: 'Press any key to dismiss',
    aAdd: 'Add alarm',
    aRepeat: 'Repeat',
    aSound: 'Ringtone',
    aLabel: 'Label',
    aRemove: 'Remove alarm',
    aTime: 'Time',
    aOnce: 'Once',
    aEveryday: 'Every day',
    aWeekdays: 'Weekdays',
    aWeekends: 'Weekends',
    aDaysShort: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    aSnooze: 'Snooze',
    aDismiss: 'Dismiss',
    aSnoozed: 'Snoozed — ringing again in 5 min',
    aAlertTitle: 'Alarm',
    aNoAlarms: 'No alarms',
    aLabelDefault: 'Alarm',
    aOff: 'Off',
    wallpaperNames: ['Classic blue', 'Android green', 'Midnight'],
    settingsTitle: 'Settings',
    settingsWallpaper: 'Wallpaper',
    settingsSound: 'Audible tones',
    settingsAbout: 'About phone',
    settingsOn: 'On',
    settingsOff: 'Off',
    setWireless: 'Wireless controls',
    setCall: 'Call settings',
    setSoundDisplay: 'Sound & display',
    setSync: 'Data synchronization',
    setSd: 'SD card',
    setDateTime: 'Date & time',
    setLocale: 'Locale & text',
    wirelessWifi: 'Wi-Fi',
    wirelessBt: 'Bluetooth',
    wirelessAirplane: 'Airplane mode',
    wirelessNet: 'Mobile network · T-Mobile connected',
    callVoicemail: 'Voicemail number',
    callForward: 'Call forwarding · Off',
    sdSilent: 'Silent mode',
    sdHaptic: 'Haptic feedback',
    sdTimeout: 'Screen timeout · 1 minute',
    syncGmail: 'Gmail',
    syncCalendar: 'Calendar',
    syncContacts: 'Contacts',
    syncLast: (what) => `${what} · last sync 10:00`,
    sdTotal: 'Total space 1 GB',
    sdAvail: 'Available space',
    sdUnmount: 'Unmount SD card',
    sdUnmounted: 'SD card unmounted · safe to remove',
    dtAuto: 'Automatic (network-provided)',
    dtNow: (d, t) => `${d} ${t}`,
    dtZone: 'Time zone GMT+8:00 Beijing',
    dt24h: 'Use 24-hour format',
    localeZh: '中文',
    localeEn: 'English',
    setSecurity: 'Security & location',
    secWifiLoc: 'Use wireless networks',
    secGps: 'Enable GPS satellites',
    secPattern: 'Screen unlock pattern',
    secPatternOff: 'None · disabled',
    secPatternHint: 'Connect at least 4 dots',
    sdRingtone: 'Phone ringtone',
    sdSdNotify: 'SD card notifications',
    sdUnlockSound: 'Screen unlock sound',
    sdBrightness: 'Brightness · medium',
    sdRotate: 'Auto-rotate screen',
    ringtoneNames: ['Classic', 'Digital', 'Water drop', 'Playful'],
    aboutTitle: 'About phone',
    aboutModel: 'Model T-Mobile G1 (HTC Dream)',
    aboutFirmware: 'Firmware Android 1.0',
    aboutKernel: 'Kernel 2.6.25-01143-gfc99b4e',
    aboutBuild: 'Build dream_devphone-userdebug 1.0 TC4',
    aboutBattery: (pct) => `Battery ${pct}%`,
    btnOk: 'OK',
    btnCancel: 'Cancel',
    wAirplane: 'Airplane mode',
    wWifi: 'Wi-Fi',
    wWifiSet: 'Wi-Fi settings',
    wBt: 'Bluetooth',
    wBtSet: 'Bluetooth settings',
    wMobile: 'Mobile networks',
    wfNotify: 'Network notification',
    wfAps: [
      { name: 'AndroidLab', sec: true },
      { name: 'linksys', sec: true },
      { name: 'T-Mobile HotSpot', sec: false },
      { name: 'guest-net', sec: false },
    ],
    wfPassTitle: 'Enter password',
    wfConnecting: (ap) => `Connecting to ${ap}…`,
    wfConnected: (ap) => `Connected to ${ap}`,
    btDeviceName: 'Device name',
    btDiscoverable: 'Discoverable',
    btScan: 'Scan for devices',
    btPaired: 'Plantronics 520 (headset)',
    btScanning: 'Scanning for Bluetooth devices…',
    btFound: (d) => `Found device: ${d}`,
    btFakeDevice: 'HTC Magic',
    mRoaming: 'Data roaming',
    m2g: 'Use only 2G networks',
    mApn: 'Access point names',
    mOperators: 'Network operators',
    mSearching: 'Searching for available networks…',
    mOperatorFound: 'Registered on network: T-Mobile',
    cVmService: 'Voicemail service',
    cVmSettings: 'Voicemail settings',
    cWaiting: 'Call waiting',
    cCallerId: 'Caller ID',
    cIdDefault: 'Network default',
    cIdHide: 'Hide number',
    cIdShow: 'Show number',
    fwdTitle: 'Call forwarding',
    fwdAlways: 'Always forward',
    fwdBusy: 'Forward when busy',
    fwdUnanswered: 'Forward when unanswered',
    fwdUnreachable: 'Forward when unreachable',
    sdVibrate: 'Vibrate',
    sdTones: 'Audible touch tones',
    sdAnimation: 'Animation',
    brTitle: 'Brightness',
    brHint: 'D-pad to adjust · OK to save',
    toTitle: 'Screen timeout',
    toLabels: ['15 seconds', '30 seconds', '1 minute', '2 minutes', '10 minutes', '30 minutes'],
    anTitle: 'Animation',
    anNone: 'No animations',
    anSome: 'Some animations',
    anAll: 'All animations',
    syBg: 'Background data',
    syAuto: 'Auto-sync',
    sySyncNow: 'Sync now',
    sySyncing: 'Syncing…',
    syDone: 'Sync complete',
    syNever: 'Never',
    seSetPattern: 'Set unlock pattern',
    seSimLock: 'Set up SIM card lock',
    seShowPw: 'Visible passwords',
    patDraw: 'Draw an unlock pattern',
    patContinue: 'Continue',
    patRedraw: 'Draw pattern again to confirm',
    patMatchFail: 'Patterns do not match. Try again',
    patTooShort: 'Connect at least 4 dots',
    patChange: 'Change unlock pattern',
    patDisable: 'Disable unlock pattern',
    patSaved: 'Unlock pattern saved',
    patRemoved: 'Unlock pattern disabled',
    patEmergency: 'Emergency call',
    simLockRow: 'Lock SIM card',
    simChangePin: 'Change SIM PIN',
    simPinPrompt: 'Enter SIM PIN (demo PIN: 1234)',
    simWrong: 'Incorrect PIN',
    simPinChanged: 'SIM PIN changed',
    apUnknown: 'Unknown sources',
    apManage: 'Manage applications',
    apRunning: 'Running services',
    apDev: 'Development',
    mngForceStop: 'Force stop',
    mngUninstall: 'Uninstall',
    mngClearData: 'Clear data',
    mngClearCache: 'Clear cache',
    mngSize: (mb) => `Application · ${mb} MB`,
    mngAppInfo: 'Application info',
    mngStopped: 'Force stopped',
    mngUninstalled: (name) => `Uninstalled ${name}`,
    mngCleared: 'Data cleared',
    svcStop: 'Stop',
    svcItems: [
      { name: 'Status Bar', sub: 'system · 4 MB' },
      { name: 'Google Services', sub: 'com.google.process.gapps · 12 MB' },
      { name: 'Gmail', sub: 'mail sync service · 8 MB' },
      { name: 'Dialer Storage', sub: 'system · 2 MB' },
    ],
    svcStopped: (name) => `Stopped: ${name}`,
    devUsb: 'USB debugging',
    devStay: 'Stay awake',
    devMock: 'Allow mock locations',
    sdFormat: 'Format SD card',
    sdIntAvail: 'Internal phone storage available',
    sdFormatMsg: 'Formatting erases all data on the SD card. Continue?',
    sdFormatDone: 'SD card formatted',
    sdUnmountMsg: 'You can safely remove the SD card after unmounting. Continue?',
    abUpdates: 'System updates',
    abStatus: 'Status',
    abBaseband: 'Baseband 62.50SC.20.17H_2.22.19.26I',
    abChecking: 'Checking for updates…',
    abUpToDate: 'Your system is up to date',
    stBatteryState: 'Battery status',
    stCharging: 'Charging',
    stDischarging: 'Discharging',
    stSignal: 'Signal strength',
    stService: 'Service',
    stRoaming: 'Roaming',
    stMobileState: 'Mobile network state',
    stImei: 'IMEI',
    stImeiSv: 'IMEISV',
    stNumber: 'My phone number',
    frTitle: 'Factory data reset',
    frWarn: 'This erases all data on the phone: your Google account, system and application settings, downloaded applications, and media files. The phone will restart afterwards.',
    frReset: 'Reset phone',
    frDone: 'Clearing data…',
    dialerTitle: 'Phone',
    dialerHint: 'Type a number, press CALL',
    dialerCall: 'Call',
    dialerClear: 'Clear',
    calling: 'Calling…',
    inCall: 'In call',
    endCall: 'Press END to hang up',
    callEnded: 'Call ended',
    icDialpad: 'Dialpad',
    icSpeaker: 'Speaker',
    icMute: 'Mute',
    icHold: 'Hold',
    icAddCall: 'Add call',
    icAddHint: 'Type number to add',
    icCalling: 'Calling…',
    icAdded: 'Call joined',
    icHeld: 'On hold',
    icParty: (n) => `Conference · ${n}`,
    tabDial: 'Dialer',
    tabCallLog: 'Call log',
    callLogIncoming: 'Incoming',
    callLogOutgoing: 'Outgoing',
    callLogMissed: 'Missed',
    callLogEmpty: 'No call log yet',
    incomingCall: 'Incoming call',
    incomingAnswer: 'Answer',
    incomingReject: 'Reject',
    msgsTitle: 'Messaging',
    msgsThreads: 'Threads',
    msgsEmpty: 'No threads yet',
    msgsInputHint: 'Type a message… (QWERTY)',
    msgsSend: 'Send',
    msgsSending: 'Sending…',
    msgsSent: 'Sent',
    msgsMe: 'Me',
    mAddSubject: 'Add subject',
    mDeleteThread: 'Delete thread',
    mMarkAllRead: 'Mark all read',
    mDeleteAll: 'Delete all threads',
    mSubjectLabel: 'Subject',
    mThreadDeleted: 'Thread deleted',
    mAllDeleted: 'All threads deleted',
    mConfirmDelete: 'Delete this thread?',
    mConfirmDeleteAll: 'Delete all threads?',
    mSentAt: (t) => t,
    browserTitle: 'Browser',
    browserUrl: 'www.google.com',
    brBookmarks: 'Bookmarks',
    brNewWindow: 'New window',
    brAddBookmark: 'Add bookmark',
    brRefresh: 'Refresh',
    brAboutBlank: 'about:blank',
    brUrlHint: 'Enter address',
    brAdded: 'Bookmark added',
    browserLoading: 'Loading…',
    browserSearch: 'Google Search',
    browserResult1: 'Android — the open mobile platform',
    browserResult2: 'T-Mobile G1 launch event, as it happened',
    browserDone: 'End of page',
    clockTitle: 'Alarm Clock',
    recipient: 'Mom',
    calcTitle: 'Calculator',
    calcHint: 'm=− p=+ · or tap buttons',
    calendarTitle: 'Calendar',
    calendarEvent: 'T-Mobile G1 launch',
    calendarNoEvent: 'No events',
    cameraTitle: 'Camera',
    cameraHint: 'OK / trackball to shoot',
    cameraSaved: 'Saved to Pictures',
    cameraZoom: (z) => `${z}×`,
    contactsTitle: 'Contacts',
    contactMom: 'Mom',
    contactGoogle: 'Google Sync',
    contactTmo: 'T-Mobile Care',
    contactsCall: 'Call',
    gmailTitle: 'Gmail',
    gmailInbox: 'Inbox',
    gmailStarred: 'Starred',
    gmailSent: 'Sent',
    gmailEmpty: 'No mail',
    gmailSynced: 'Synced at',
    gmailFrom1: 'Google',
    gmailSubj1: 'Welcome to Gmail',
    gmailBody1: 'Your Gmail is synced to the G1 with your Google account. Push mail at the ready, search right at the top of the inbox.',
    gmailFrom2: 'T-Mobile',
    gmailSubj2: 'Your G1 is ready',
    gmailBody2: 'Thanks for choosing the T-Mobile G1! Billing and data details at my.t-mobile.com.',
    mapsTitle: 'Maps',
    mapsHint: 'Trackball pan · * # zoom',
    mapsPlace: 'T-Mobile Plaza',
    mapsSearchHint: 'Search maps',
    mapsSatellite: 'Satellite',
    mapsTraffic: 'Traffic',
    mapsMyLocation: 'My Location',
    musicTitle: 'Music',
    musicPlaying: 'Now playing',
    musicPaused: 'Paused',
    muArtists: 'Artists',
    muAlbums: 'Albums',
    muSongs: 'Songs',
    muPlaylists: 'Playlists',
    muAllSongs: 'All songs',
    muRecentlyAdded: 'Recently added',
    muUnknownAlbum: 'Unknown album',
    muShuffle: 'Shuffle',
    muRepeat: 'Repeat',
    muRepeatAll: 'Repeat all',
    muRepeatOne: 'Repeat one',
    muAddToPlaylist: 'Add to playlist',
    muNewPlaylist: 'New playlist',
    muPlaylistName: 'Playlist name',
    muPartyShuffle: 'Party shuffle',
    muLibrary: 'Library',
    muAdded: 'Added to playlist',
    picturesTitle: 'Pictures',
    picturesEmpty: 'No photos yet · try Camera',
    picDelete: 'Delete picture',
    picSetWallpaper: 'Set as wallpaper',
    picSetContact: 'Set as contact photo',
    picPickContact: 'Choose a contact',
    picDeletedToast: 'Picture deleted',
    picWallpaperToast: 'Wallpaper set',
    picContactToast: (name) => `Set as ${name}'s photo`,
    marketTitle: 'Android Market',
    marketFree: 'FREE',
    marketBy: (dev) => `by ${dev}`,
    marketInstall: 'Install',
    marketInstalled: 'Installed',
    marketItems: [
      { name: 'ShopSavvy', dev: 'Big in Japan', desc: 'Scan barcodes and compare prices across stores. Star of the G1 launch demo.', price: 'FREE' },
      { name: 'Ringdroid', dev: 'Ringdroid Team', desc: 'Edit MP3s into ringtones right on your phone. Open source.', price: 'FREE' },
      { name: 'Bonsai Blast', dev: 'Glu Mobile', desc: 'Marble-blasting zen puzzle across many levels.', price: '$4.99' },
      { name: 'Pac-Man', dev: 'Namco', desc: 'The arcade classic, fully ported with trackball support.', price: '$9.99' },
      { name: 'Shazam', dev: 'Shazam Entertainment', desc: 'Identify music playing nearby in seconds with title and album.', price: 'FREE' },
      { name: 'Abduction!', dev: 'Psym Mobile', desc: 'Bounce the cow past alien UFOs; jump with the trackball.', price: 'FREE' },
    ],
    marketStars: (n) => `${n} stars`,
    mkBeta: 'BETA',
    mkFeatured: 'Featured',
    mkAllApps: 'All applications',
    mkAllGames: 'All games',
    mkDownloads: 'My downloads',
    mkPermTitle: 'This application has access to:',
    mkPermNetwork: 'Network communication (full Internet access)',
    mkPermStorage: 'Storage (modify/delete SD card contents)',
    mkPermLocation: 'Location (fine GPS location)',
    mkPermContacts: 'Personal info (read contact data)',
    mkDownloading: 'Downloading…',
    mkInstalling: 'Installing…',
    mkInstalledToast: 'Application installed',
    mkUninstall: 'Uninstall',
    mkOpen: 'Open',
    mkOk: 'OK',
    mkCancel: 'Cancel',
    ytTitle: 'YouTube',
    ytVideos: [
      { title: 'Me at the zoo', by: 'jawed', scene: 'zoo' },
      { title: 'Evolution of Dance', by: 'judson laipply', scene: 'dance' },
      { title: 'Charlie bit my finger', by: 'HDCYT', scene: 'kids' },
    ],
    ytViews: (n) => `${n} views`,
    ytPause: 'Press OK to pause',
    ytBuf: 'Buffering…',
    ytReplay: 'Replay',
    amzTitle: 'Amazon MP3',
    amzSongs: [
      { title: 'Sideloader', artist: 'The QWERTY Keys' },
      { title: '3.2 Inches of Love', artist: 'Capacitive' },
    ],
    amzPrice: '$0.89',
    amzBuy: 'Buy',
    amzBought: 'Purchased',
    amzToMusic: 'Downloaded · play it in Music',
    imTitle: 'IM',
    imOnline: 'Available',
    imAway: 'Away',
    imOffline: 'Offline',
    imBuddies: [
      { name: 'Mom', status: 'on' },
      { name: 'Wei', status: 'on' },
      { name: 'Google coworker', status: 'away' },
      { name: 'Li', status: 'off' },
    ],
    imInputHint: 'Type a message, Enter to send',
    imOfflineNote: 'Recipient is offline; message will be delivered later',
    imReplies: ['Sure!', 'Got it', 'Haha, this G1 keyboard is great', 'Talk later, in a meeting'],
    emailTitle: 'Email',
    emailSetup: 'Account setup',
    emailAddr: 'Email address',
    emailPass: 'Password',
    emailNext: 'Next',
    emailChecking: 'Checking server settings…',
    emailInbox: 'Inbox',
    emailSeeds: [
      {
        from: 'Mail Administrator',
        subj: 'Welcome to Email',
        body: 'Your POP/IMAP account is set up. Work mail now arrives on your G1, with folders and attachments in sync.',
      },
      {
        from: 'Human Resources',
        subj: 'Weekly meeting next Monday',
        body: 'The regular meeting is on Monday at 10 AM. Please prepare your quarterly notes. Room changed to the east side, third floor.',
      },
      {
        from: 'Old Classmate',
        subj: 'Photos from the weekend',
        body: 'Photos from last weekend are attached. Let’s get everyone together again soon!',
      },
    ],
    vdListening: 'Listening…',
    vdHint: 'Say a contact name',
    vdRecognized: 'Did you mean…',
    vdNoMatch: 'No matching contacts found',
    vdTapBack: 'Press BACK to exit',
    addTitle: 'Add to Home',
    dApplication: 'Application',
    dShortcut: 'Shortcut',
    dWidget: 'Widget',
    dWallpaper: 'Wallpaper',
    dContact: 'Contact',
    dSearchBtn: 'Search',
    wClock: 'Clock',
    wPictureFrame: 'Picture frame',
    wSearch: 'Search',
    wPictures: 'Pictures',
    wPurchased: 'Purchased pictures',
    wWallpaperGallery: 'Wallpaper gallery',
    recentTitle: 'Recent apps',
    recentEmpty: 'No recent apps',
    actionsTitle: 'Phone options',
    silentMode: 'Silent mode',
    powerOff: 'Power off',
    lockCharging: 'Charging',
    lockNextAlarm: (t) => `Alarm: ${t}`,
    lockDate: (d) =>
      `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}, ${d.getMonth() + 1}/${d.getDate()}`,
    shadeOngoing: 'Ongoing',
    shadeNotifications: 'Notifications',
    shadeClearAll: 'Clear notifications',
    shadeMissedCall: 'Missed call',
    shadeFullDate: (d) =>
      `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}, ${d.getFullYear()}, ${['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()]} ${d.getDate()}`,
    seedWelcome: 'Welcome to Android! Your Google account is synced, Gmail at the ready.',
    seedMom: 'Getting used to the new phone? Slow down on that keyboard, dear.',
    replies: ['OK, got it', 'Remember to eat', 'It is cold, dress warm', 'Less phone, sleep early', 'I saved you dinner', 'Coming home this wknd?'],
  },
}

/** 当前语言词表 */
export function androidStrings(lang: Lang): AndroidStrings {
  return ANDROID_STRINGS[lang]
}

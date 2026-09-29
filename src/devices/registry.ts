import type { DeviceProfile, PhoneOSFactory } from '../kernel/types'
import { S60_PALETTE } from '../os/s60/palette'
import { ANDROID_PALETTE } from '../os/android/palette'
import { WP7_PALETTE } from '../os/wp7/palette'
import { IPHONE_PALETTE } from '../os/iphoneos/palette'
import { BB_PALETTE } from '../os/blackberry/palette'

/**
 * ★ 设备注册表 —— 新增一台手机只需：
 *   1. 在 DEVICES 里加一份 DeviceProfile（换壳换屏换年代，复用现有系统）
 *   2. 若是新系统，在 src/os/ 下建目录并在 loadOS 里加一行
 */
export const DEVICES: DeviceProfile[] = [
  {
    id: 'motorola-brick',
    name: '摩托罗拉 3200',
    maker: 'Motorola',
    era: 1992,
    tagline: '一个月工资的移动身份',
    description:
      '1992 年的移动通讯启蒙：炭黑机身、外置天线、黄绿背光的小屏。' +
      '那个年代这台机器要一个月工资，打电话按分钟计费，是一件有仪式感的事。' +
      '数字键直接拨号，绿色键呼叫 —— 也试着给妈妈发条短信，那年头一条一毛钱。',
    specs: ['72×48 黄绿背光屏', '外置天线', '750mAh：待机 8h·通话 30–60min', '约 310 克'],
    en: {
      name: 'Motorola 3200',
      tagline: "A month's salary, held to your ear",
      description:
        'Mobile telephony, circa 1992: charcoal body, external antenna, a small amber-green screen. ' +
        'It cost a month\'s wage and calls were billed by the minute, so phoning someone was an event. ' +
        'Dial straight from the keypad and hit the green key — and try texting Mom, at a dime a pop.',
      specs: ['72×48 amber-green LCD', 'External antenna', '750mAh: 8h standby · 30–60 min talk', '~310 g'],
    },
    os: 'brick-phone',
    screen: { w: 72, h: 48, scale: 5, bg: '#c2c7a4', fg: '#26301f' },
    shell: {
      body: '#26292d',
      bodyEdge: '#181a1d',
      bezel: '#0f1113',
      button: '#2f3338',
      buttonText: '#d5dade',
      layout: 'brick',
    },
  },
  {
    id: 'nokia-n73',
    name: '诺基亚 N73',
    maker: 'Nokia',
    era: 2006,
    tagline: '口袋里的个人电脑',
    description:
      '2006 年的智能手机：240×320 彩色 TFT、S60 宫格菜单、摇杆导航。' +
      '这年头手机开始像一台小电脑 —— 有电话本、能拍照、装得下贪吃蛇的高清版。' +
      '摇杆在桌面图标间游走，试试用 320 万像素"相机"拍一张 generative 风景照。',
    specs: ['240×320 彩色 TFT', 'S60 宫格菜单', '320 万像素相机', '双扬声器'],
    en: {
      name: 'Nokia N73',
      tagline: 'A personal computer in your pocket',
      description:
        'The smartphone, circa 2006: a 240×320 color TFT, an S60 icon grid, joystick navigation. ' +
        'Phones were becoming little computers — a contacts book, a camera, and Snake in glorious color. ' +
        'Wander the joystick across the home screen and try snapping a generative landscape with the 3-megapixel "camera".',
      specs: ['240×320 color TFT', 'S60 icon grid', '3 MP camera', 'Dual speakers'],
    },
    os: 's60',
    screen: {
      w: 240,
      h: 320,
      scale: 1.5,
      bg: '#dfe5ea',
      palette: S60_PALETTE,
      fontFamily: 'Droid Sans',
      fontFiles: [
        { family: 'Droid Sans', url: 'g1/fonts/DroidSans.ttf' },
        { family: 'Droid Sans', weight: 'bold', url: 'g1/fonts/DroidSans-Bold.ttf' },
        { family: 'Droid Sans Fallback', url: 'g1/fonts/DroidSansFallback.ttf' },
      ],
    },
    shell: {
      body: '#b8bcc0',
      bodyEdge: '#8a8e92',
      bezel: '#3a3e42',
      button: '#4c5054',
      buttonText: '#e7ecf1',
      layout: 's60',
    },
  },
  {
    id: 'htc-dream',
    name: 'HTC Dream（T-Mobile G1）',
    maker: 'HTC',
    era: 2008,
    tagline: '第一台 Android 手机',
    description:
      '2008 年 10 月，Android 纪元的起点：3.2 英寸电容触屏 + 滑出式 QWERTY 全键盘 + 轨迹球，' +
      '下巴微微上翘的它开启了此后十几年的移动时代。黑底白字的 ANDROID 开机画面、' +
      '下拉通知栏、Google 搜索框的桌面 —— 都从这里开始。用全键盘给妈妈回条短信吧。',
    specs: ['320×480 HVGA 触屏', 'Android 1.0', '侧滑 QWERTY 全键盘', '轨迹球导航'],
    en: {
      name: 'HTC Dream (T-Mobile G1)',
      tagline: 'The first Android phone',
      description:
        'October 2008: the dawn of Android. A 3.2-inch capacitive screen, a slide-out QWERTY keyboard, ' +
        'a trackball, and that upturned chin — this is where the mobile era as we know it began. ' +
        'The ANDROID boot splash, the pull-down shade, the Google search widget on the home screen all start here. ' +
        'Slide the keyboard and text Mom.',
      specs: ['320×480 HVGA touch', 'Android 1.0', 'Slide-out QWERTY', 'Trackball nav'],
    },
    os: 'android',
    screen: {
      w: 320,
      h: 480,
      scale: 1.1,
      bg: '#000000', // 关机/LCD 未点亮 = 黑
      palette: ANDROID_PALETTE,
      touch: true,
      fontFamily: 'Droid Sans',
      fontFiles: [
        { family: 'Droid Sans', url: 'g1/fonts/DroidSans.ttf' },
        { family: 'Droid Sans', weight: 'bold', url: 'g1/fonts/DroidSans-Bold.ttf' },
        { family: 'Droid Sans Fallback', url: 'g1/fonts/DroidSansFallback.ttf' },
      ],
    },
    shell: {
      body: '#3a3d42',
      bodyEdge: '#26282c',
      bezel: '#17181b',
      button: '#4a4e55',
      buttonText: '#e8ebef',
      layout: 'g1',
      brandLabel: 'T · Mobile',
    },
  },
  {
    id: 'nokia-3310',
    name: '诺基亚 3310',
    maker: 'Nokia',
    era: 2000,
    tagline: '砸核桃的单色屏传奇',
    description:
      '千禧年的功能机黄金年代：84×48 单色屏、一周一充、口袋里的贪吃蛇。' +
      '按实体的方向键和九宫格键盘操作，试着用 T9 拼音给妈妈发条短信。',
    specs: ['84×48 单色 LCD', 'T9 拼音输入法', '内置贪吃蛇', '待机 245 小时'],
    en: {
      name: 'Nokia 3310',
      tagline: 'The monochrome legend that cracked walnuts',
      description:
        'The golden age of feature phones, circa 2000: an 84×48 monochrome screen, a week per charge, ' +
        'Snake in your pocket. Drive it with the D-pad and the physical keypad — and try texting Mom with T9 pinyin.',
      specs: ['84×48 monochrome LCD', 'T9 pinyin input', 'Built-in Snake', '245 h standby'],
    },
    os: 'feature-phone',
    screen: { w: 84, h: 48, scale: 5 },
    shell: {
      body: '#3a5b78',
      bodyEdge: '#2b455b',
      bezel: '#1d2b36',
      button: '#2b455b',
      buttonText: '#cfe3ee',
      layout: 'n3310',
    },
  },
  {
    id: 'nokia-1100',
    name: '诺基亚 1100',
    maker: 'Nokia',
    era: 2003,
    tagline: '史上最畅销的手机',
    description:
      '2003 年的入门传奇：96×65 绿背光单色屏、防尘防震键盘，仅 86 克。' +
      '它为新兴市场而生，简单到只剩可靠 —— 最终卖出 2.5 亿台，是手机史上最畅销的型号。' +
      '和 3310 一样按数字直接拨号，贪吃蛇 II 穿墙而行。',
    specs: ['96×65 绿背光单色屏', 'T9 拼音输入法', '贪吃蛇 II', '86 克·2.5 亿台销量'],
    en: {
      name: 'Nokia 1100',
      tagline: 'The best-selling phone ever',
      description:
        'The entry-level legend, circa 2003: a 96×65 green-backlit screen, a dust- and shock-proof keypad, just 86 g. ' +
        'Built for emerging markets, simple to a fault — it went on to sell 250 million units, ' +
        'the best-selling phone model in history. Dial straight from the keypad like the 3310, and Snake II wraps through the walls.',
      specs: ['96×65 green-backlit LCD', 'T9 pinyin input', 'Snake II', '86 g · 250 M sold'],
    },
    os: 'feature-phone',
    screen: { w: 96, h: 65, scale: 5, bg: '#b9c9a5', fg: '#232b1a' },
    shell: {
      body: '#585d63',
      bodyEdge: '#3d4147',
      bezel: '#24272b',
      button: '#6a7076',
      buttonText: '#e6eaee',
      layout: 'n1100',
    },
    flashlight: true,
  },
  {
    id: 'nokia-lumia-800',
    name: '诺基亚 Lumia 800',
    maker: 'Nokia',
    era: 2011,
    tagline: '一整块聚碳酸酯的 Metro',
    description:
      '2011 年诺基亚押注 Windows Phone 的旗舰：3.7 英寸 AMOLED 弧面屏，' +
      '一体成型的青色聚碳酸酯机身。纯黑底色、白色细体字、钴蓝瓷贴 —— ' +
      'Metro 界面把排版当设计，没有壁纸没有圆角没有阴影。' +
      '上滑解锁，在瓷贴间点按，用屏幕上的全拼键盘给妈妈回条短信，' +
      '再到设置里换一种强调色，整台手机随之变色。',
    specs: ['480×800 WVGA AMOLED 触屏', 'Windows Phone 7.5（Mango）', '800 万像素·卡尔蔡司', '一体聚碳酸酯机身'],
    en: {
      name: 'Nokia Lumia 800',
      tagline: 'A solid block of polycarbonate Metro',
      description:
        "Nokia's Windows Phone flagship, late 2011: a 3.7-inch curved AMOLED fused into a single " +
        'block of cyan polycarbonate. Pure black canvas, thin white type, cobalt tiles — ' +
        'Metro design treated typography as the design: no wallpaper, no rounded corners, no shadows. ' +
        'Swipe up to unlock, tap the tiles, text Mom on the on-screen pinyin keyboard, ' +
        'then switch the accent color in Settings and watch the whole phone change.',
      specs: ['480×800 WVGA AMOLED touch', 'Windows Phone 7.5 (Mango)', '8 MP · Carl Zeiss', 'Unibody polycarbonate'],
    },
    os: 'wp7',
    screen: {
      w: 480,
      h: 800,
      scale: 0.8,
      bg: '#000000',
      palette: WP7_PALETTE,
      touch: true,
      fontFamily: 'Open Sans',
      fontFiles: [
        { family: 'Open Sans', weight: '300', url: 'wp7/fonts/OpenSans-Light.ttf' },
        { family: 'Open Sans', url: 'wp7/fonts/OpenSans-Regular.ttf' },
        { family: 'Open Sans', weight: '600', url: 'wp7/fonts/OpenSans-Semibold.ttf' },
        { family: 'Droid Sans Fallback', url: 'g1/fonts/DroidSansFallback.ttf' },
      ],
    },
    shell: {
      body: '#1274a3',
      bodyEdge: '#0c5578',
      bezel: '#0a0c0e',
      button: '#0e5378',
      buttonText: '#e8f4fb',
      layout: 'wp7',
      brandLabel: 'NOKIA',
    },
  },
  {
    id: 'apple-iphone-2g',
    name: '苹果 iPhone 2G',
    maker: 'Apple',
    era: 2007,
    tagline: '重新发明手机',
    description:
      '2007 年 1 月 9 日，乔布斯说「今天，苹果重新发明了手机」：' +
      '3.5 英寸 Multi-Touch 电容屏，一个 Home 键取代整副键盘；' +
      '金属机身、黑色玻璃面板，运行 iPhone OS 1.0。滑动来解锁，' +
      '在 Springboard 上点开短信、iPod 和 Safari，用屏幕键盘给妈妈回条信息。',
    specs: ['320×480 Multi-Touch 触屏', 'iPhone OS 1.0', '200 万像素相机', '8 GB · EDGE · Wi-Fi'],
    en: {
      name: 'Apple iPhone 2G',
      tagline: 'The phone, reinvented',
      description:
        'On January 9, 2007, Steve Jobs declared: "Today, Apple reinvents the phone." ' +
        'A 3.5-inch Multi-Touch screen and one Home button replaced the entire keyboard; ' +
        'an aluminum back, a black glass face, running iPhone OS 1.0. Slide to unlock, ' +
        'tap through Text, iPod and Safari on the Springboard, and message Mom from the on-screen keyboard.',
      specs: ['320×480 Multi-Touch touch', 'iPhone OS 1.0', '2 MP camera', '8 GB · EDGE · Wi-Fi'],
    },
    os: 'iphoneos',
    screen: {
      w: 320,
      h: 480,
      scale: 1.1,
      bg: '#000000',
      palette: IPHONE_PALETTE,
      touch: true,
      fontFamily: 'iPhone Sans',
      fontFiles: [
        { family: 'iPhone Sans', url: 'iphone/fonts/Heros-Regular.otf' },
        { family: 'iPhone Sans', weight: '700', url: 'iphone/fonts/Heros-Bold.otf' },
        { family: 'Droid Sans Fallback', url: 'g1/fonts/DroidSansFallback.ttf' },
      ],
    },
    shell: {
      body: '#b9bec4',
      bodyEdge: '#8e949b',
      bezel: '#050505',
      button: '#1c1d1f',
      buttonText: '#d8d8d8',
      layout: 'iphone',
    },
  },
  {
    id: 'blackberry-bold-9000',
    name: '黑莓 Bold 9000',
    maker: 'BlackBerry',
    era: 2008,
    tagline: 'CrackBerry 时代的王座',
    description:
      '2008 年的黑莓旗舰：2.6 英寸 480×320 半 VGA 屏、感光轨迹球、珍珠式全 QWERTY 键盘，' +
      '镀铬边框包裹真皮后盖。BlackBerry OS 4.6 带来新的 Precision 主题与 BBM——' +
      '滚动轨迹球选图标，按黑莓键打开菜单，用全键盘给妈妈回封邮件般讲究的短信。',
    specs: ['480×320 半 VGA TFT', 'BlackBerry OS 4.6', '200 万像素相机', '3G · Wi-Fi · GPS · BBM'],
    en: {
      name: 'BlackBerry Bold 9000',
      tagline: 'The throne of the CrackBerry era',
      description:
        'The 2008 flagship: a 2.6-inch 480×320 half-VGA display, a light-sensing trackball, ' +
        'a pearl-QWERTY keyboard, and a chrome frame wrapped in stitched leather. ' +
        'BlackBerry OS 4.6 brought the Precision theme and BBM — roll the trackball, ' +
        'hit the BlackBerry key for menus, and answer Mom from the full keyboard.',
      specs: ['480×320 half-VGA TFT', 'BlackBerry OS 4.6', '2 MP camera', '3G · Wi-Fi · GPS · BBM'],
    },
    os: 'blackberry',
    screen: {
      w: 480,
      h: 320,
      scale: 1.5,
      bg: '#FFFFFF',
      // 真机非触屏；pointer 仅表示博物馆内可用鼠标点按操作
      pointer: true,
      palette: BB_PALETTE,
      fontFamily: 'BB Alpha Sans',
      fontFiles: [
        { family: 'BB Alpha Sans', url: 'iphone/fonts/Heros-Regular.otf' },
        { family: 'BB Alpha Sans', weight: '700', url: 'iphone/fonts/Heros-Bold.otf' },
        { family: 'Droid Sans Fallback', url: 'g1/fonts/DroidSansFallback.ttf' },
      ],
    },
    shell: {
      body: '#1c1c1f',
      bodyEdge: '#0c0c0d',
      bezel: '#0a0a0b',
      button: '#26262a',
      buttonText: '#d8dade',
      layout: 'blackberry',
      brandLabel: 'blackberry',
    },
  },
]

export function getDevice(id: string): DeviceProfile | undefined {
  return DEVICES.find((d) => d.id === id)
}

/** 按系统包懒加载 OS（自动拆分 chunk，点开展品才下载） */
export async function loadOS(osId: string): Promise<PhoneOSFactory> {
  switch (osId) {
    case 'feature-phone':
      return (await import('../os/feature-phone')).default
    case 'brick-phone':
      return (await import('../os/brick-phone')).default
    case 's60':
      return (await import('../os/s60')).default
    case 'android':
      return (await import('../os/android')).default
    case 'wp7':
      return (await import('../os/wp7')).default
    case 'iphoneos':
      return (await import('../os/iphoneos')).default
    case 'blackberry':
      return (await import('../os/blackberry')).default
    default:
      throw new Error(`未知系统: ${osId}`)
  }
}

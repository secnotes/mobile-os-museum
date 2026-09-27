/**
 * 展馆层双语。藏品手机本体保持中文 —— 它是"展品"
 * （T9 拼音、中文短信即其核心体验），如同博物馆实物不随界面语言变化。
 */
export type Lang = 'zh' | 'en'
export type Theme = 'dark' | 'light'

export interface Strings {
  docTitle: string
  title: string
  sub: string
  intro: string
  bootBtn: string
  backToGallery: string
  notFound: string
  legendTitle: string
  /** [按键, 说明] 对 */
  legendItems: ReadonlyArray<readonly [string, string]>
  /** 全键盘机型（G1）的图例 */
  legendItemsQwerty: ReadonlyArray<readonly [string, string]>
  hintQwerty: string
  /** 黑莓（轨迹球 + 全 QWERTY）的图例 */
  legendItemsBb: ReadonlyArray<readonly [string, string]>
  hintBb: string
  /** 电容键触屏机型（WP7）的图例 */
  legendItemsWp7: ReadonlyArray<readonly [string, string]>
  hintWp7: string
  /** 纯触屏机型（iPhone）的图例 */
  legendItemsTouch: ReadonlyArray<readonly [string, string]>
  legendTitleTouch: string
  hintTouch: string
  hint: string
  toTop: string
  scenarioEditor: string
  footer: string
  toc: string
}

export const STRINGS: Record<Lang, Strings> = {
  zh: {
    docTitle: '掌上博物馆 · Mobile OS Museum',
    title: '掌上博物馆',
    sub: 'Mobile OS Museum',
    intro:
      '在浏览器里重新点亮那些经典手机。单色屏、实体键盘、T9 拼音、贪吃蛇——' +
      '纯前端模拟，无需安装，数据保存在你自己的浏览器里。',
    bootBtn: '开机体验 →',
    backToGallery: '← 返回展馆',
    notFound: '未找到这台设备',
    legendTitle: '⌨ 键盘映射（也可直接点手机按键）',
    legendItems: [
      ['数字键', '打字/拨号'],
      ['方向键', '导航/贪吃蛇'],
      ['Enter', '确认键'],
      ['Esc', '红色返回键'],
      ['Backspace', '清除键（长按全清）'],
      ['Q / W', '左 / 右软键'],
      ['- / =', '星号键 / 井号键'],
      ['P', '电源键'],
    ],
    hint: '提示：按 P 键开机 · 短信用 T9 拼音输入 · 发出去的信会有回音',
    legendItemsQwerty: [
      ['A–Z / 数字', '全键盘打字（发短信试试）'],
      ['方向键', '轨迹球'],
      ['Enter', '轨迹球按下'],
      ['Esc', '返回键'],
      ['F1 / F2', '呼叫 / 挂断（绿/红键）'],
      ['F3 / F4', '主页 / 菜单'],
      ['Backspace', '删除字符'],
      ['P', '电源键'],
    ],
    hintQwerty: '提示：按 P 开机 · 按 F4（菜单）两次解锁 · 用全键盘给妈妈回短信',
    legendItemsBb: [
      ['A–Z / 数字', '全键盘打字（发短信试试）'],
      ['方向键 / Enter', '轨迹球移动 / 按下确认'],
      ['Esc', '返回键'],
      ['F1 / F2', '呼叫 / 挂断（绿/红键）'],
      ['F4', '黑莓菜单键'],
      ['F7', '顶部静音键：锁定 / 解锁键盘'],
      ['Backspace', '删除字符'],
      ['F6', '电源键'],
    ],
    hintBb: '提示：按 F6 开机 · F7 锁定/解锁键盘 · 滚动轨迹球选图标，黑莓键打开菜单',
    legendItemsWp7: [
      ['F6 / F2', '电源键 / 开机'],
      ['Enter', '确认（锁屏/瓷贴处进应用列表）'],
      ['Esc', '返回键 ‹'],
      ['F3', 'Windows 开始键（回开始屏）'],
      ['F5', '搜索键'],
      ['A–Z / 数字', '直接输入（拼音短信试试）'],
      ['Backspace', '删除字符'],
      ['拖拽画布', '滑动（锁屏上滑解锁）'],
    ],
    hintWp7: '提示：按 F6 开机 · 锁屏向上滑动解锁 · 屏幕键盘支持全拼输入 · 来电默认诺基亚铃声',
    legendTitleTouch: '✆ 触屏操作提示（也可直接点手机按键）',
    legendItemsTouch: [
      ['点按屏幕', '点图标与按钮操作'],
      ['拖拽画布', '滑动列表与翻页'],
      ['Home 圆钮', '回主屏幕'],
      ['F3', 'Home 键（键盘备用）'],
      ['P', '电源 / 锁屏'],
      ['滑动解锁', '锁屏拖动画条开机'],
      ['屏幕键盘', '点输入框即弹出'],
    ],
    hintTouch: '提示：按 P 键开机 · 锁屏拖动画条解锁 · 点屏幕键盘给妈妈回短信',
    toTop: '回到顶部',
    scenarioEditor: '情景编排',
    footer: '馆藏 8 台设备 · 1992–2011',
    toc: '目录',
  },
  en: {
    docTitle: 'Mobile OS Museum · 掌上博物馆',
    title: 'Mobile OS Museum',
    sub: '掌上博物馆',
    intro:
      'Relight the classic phones of yesteryear — monochrome screens, physical keypads, ' +
      'T9 input and Snake. Pure front-end simulation: nothing to install, and your data never leaves your browser.',
    bootBtn: 'Power on →',
    backToGallery: '← Back to gallery',
    notFound: 'Device not found',
    legendTitle: '⌨ Key mapping (or tap the keys on the phone)',
    legendItems: [
      ['Digits', 'typing & dialing'],
      ['Arrows', 'navigate & play Snake'],
      ['Enter', 'confirm'],
      ['Esc', 'red back key'],
      ['Backspace', 'clear (hold to clear all)'],
      ['Q / W', 'left / right soft key'],
      ['- / =', 'star / hash key'],
      ['P', 'power'],
    ],
    hint: 'Tip: press P to power on · Messages uses T9 pinyin · every message you send gets a reply',
    legendItemsQwerty: [
      ['A–Z / digits', 'type on the QWERTY keyboard'],
      ['Arrows', 'trackball'],
      ['Enter', 'trackball press'],
      ['Esc', 'back key'],
      ['F1 / F2', 'call / end (green / red)'],
      ['F3 / F4', 'home / menu'],
      ['Backspace', 'delete character'],
      ['P', 'power'],
    ],
    hintQwerty: 'Tip: press P to power on · press F4 (menu) twice to unlock · text Mom on the QWERTY keyboard',
    legendItemsBb: [
      ['A–Z / digits', 'type on the QWERTY keyboard'],
      ['Arrows / Enter', 'trackball move / press to select'],
      ['Esc', 'back key'],
      ['F1 / F2', 'call / end (green / red)'],
      ['F4', 'BlackBerry menu key'],
      ['F7', 'top mute key: lock / unlock keyboard'],
      ['Backspace', 'delete character'],
      ['F6', 'power'],
    ],
    hintBb: 'Tip: press F6 to power on · F7 locks/unlocks the keyboard · roll the trackball, use the BlackBerry key for menus',
    legendItemsWp7: [
      ['F6 / F2', 'power / power on'],
      ['Enter', 'confirm (opens app list)'],
      ['Esc', 'back key ‹'],
      ['F3', 'Windows Start key (back to Start)'],
      ['F5', 'search key'],
      ['A–Z / digits', 'direct input (try pinyin texting)'],
      ['Backspace', 'delete character'],
      ['drag canvas', 'swipe (swipe up to unlock)'],
    ],
    hintWp7: 'Tip: press F6 to power on · swipe up to unlock · the on-screen keyboard does full pinyin · incoming calls ring the Nokia tune',
    legendTitleTouch: '✆ Touchscreen guide (or use the keys on the phone)',
    legendItemsTouch: [
      ['Tap screen', 'tap icons and buttons'],
      ['Drag canvas', 'scroll lists and pages'],
      ['Home button', 'back to Home screen'],
      ['F3', 'Home key (keyboard fallback)'],
      ['P', 'power / sleep'],
      ['slide to unlock', 'drag the lock screen slider'],
      ['on-screen keyboard', 'pops up when you tap a field'],
    ],
    hintTouch: 'Tip: press P to power on · drag the slider to unlock · tap the on-screen keyboard to text Mom',
    toTop: 'Back to top',
    scenarioEditor: 'Scenario editor',
    footer: '8 devices in the collection · 1992–2011',
    toc: 'Contents',
  },
}

/** 语言 + 主题偏好（App 持有，注入各页面） */
export interface Prefs {
  lang: Lang
  theme: Theme
  setLang: (l: Lang) => void
  setTheme: (t: Theme) => void
}

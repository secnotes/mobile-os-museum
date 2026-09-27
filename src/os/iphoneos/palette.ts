/**
 * iPhone OS 1.0 调色板。
 * 真机为 18-bit（262,144 色）LCD；缓冲是 Uint8Array，最多 256 个索引，
 * 因此渐变控件（导航栏/键盘/Dock/按钮…）用 6–14 级阶梯色模拟。
 */

function hex2rgb(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
function rgb2hex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}
function lerpHex(a: string, b: string, t: number): string {
  const ca = hex2rgb(a), cb = hex2rgb(b)
  return rgb2hex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t)
}
/** 从 a 到 b 的 n 级阶梯（含两端） */
function ramp(a: string, b: string, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(lerpHex(a, b, n === 1 ? 0 : i / (n - 1)))
  return out
}

const SOLID_DEFS = {
  BLACK: '#000000',
  WHITE: '#ffffff',
  INK: '#1c1c1c', // 深色正文
  GRAY2: '#4d4d4d',
  GRAY3: '#808080',
  GRAY4: '#ababab',
  GRAY5: '#c9c9c9',
  GRAY6: '#dcdcdc',
  GRAY7: '#efeff4',
  BLUE: '#1671e0', // iPhone 链接/选中蓝
  BLUE_D: '#0c47a8',
  BLUE_H: '#549bff',
  GREEN: '#44c04a', // 接听/SMS 绿
  GREEN_D: '#27883a',
  RED: '#e02d2a', // 挂断/拒绝
  RED_D: '#9c201a',
  ORANGE: '#ff9500',
  YELLOW: '#ffd200',
  NOTES_BG: '#fffce0', // 备忘录纸
  BADGE_RED: '#f3102f', // Springboard 角标
  KB_BG: '#c9ccd3', // 键盘底/分组列表底
  MAP_PARK: '#bfe3a8',
  MAP_LAND: '#f3f0e7',
  MAP_WATER: '#a5cdf2',
  MAP_HWY: '#f7c14d',
  PURPLE: '#8e5cb5',
  PINK: '#e25aa7',
  YT_RED: '#c43020',
  CAM_GRAY: '#595959',
  SET_GRAY: '#7b838c',
  CALC_DARK: '#3d3d3d',
  CALC_LCD: '#98a08d',
  SEARCH_BG: '#e1e3e7',
  HDR_GRAY: '#64646b', // 分组小节标题灰
  SLIDER_TRACK: '#3d3d3d',
  LABEL_GRAY: '#8a8a8a', // slide to unlock
  GLASS: '#30343a', // 关机屏玻璃反光
  // 真机图标新增色
  SUN_CORE: '#3b2410', // 向日葵花盘
  SUN_INNER: '#5c3f1c',
  STEM: '#5d9b2e',
  TV_BODY: '#c7a26b', // YouTube 老电视壳
  TV_DARK: '#6e4f24',
  CALC_BR: '#503d26', // 计算器深棕圆钮
  NOTES_TOP: '#8c5f3c', // 备忘录棕色顶
  NOTES_LINE: '#e2cd62',
  GEAR_IN: '#5d5d63', // Settings 内部深色
  SHIELD_BLUE: '#2b5797', // 公路盾
  GLOW_OUT: '#ff9a3c', // 天气太阳光晕
  GLOW_MID: '#ffd24a',
  GLOW_IN: '#fff3b0',
  PETAL: '#ffd629',
  MESH_D: '#585858',
  MESH_L: '#b2b2b2',
  // 锁屏地球壁纸
  EARTH_OC: '#1d4e8f',
  EARTH_OC2: '#2f74b8',
  EARTH_LD1: '#3a7536',
  EARTH_LD2: '#7fa24c',
  EARTH_LD3: '#b39a5d',
  EARTH_ICE: '#e6eef3',
  EARTH_RIM: '#5a8fd0',
} as const

const RAMP_DEFS: Record<string, string[]> = {
  // 蓝色导航栏：真机 1.0 深色亮泽蓝（顶偏亮、底深蓝 + gloss）
  NAV: ramp('#7094c2', '#2a4a75', 12),
  // 黑色标签栏/底部工具条
  TAB: ramp('#5a5a5a', '#0c0c0c', 8),
  // 浅色状态栏（应用内）
  STAT_L: ramp('#f6f6f6', '#b6b6b6', 8),
  // 白色键盘键面
  KEY: ramp('#ffffff', '#c2c2c2', 6),
  // Springboard Dock：半透明磨砂黑（用不透明灰阶模拟）
  DOCK: ramp('#767676', '#0a0a0a', 8),
  RED_BTN: ramp('#ef6a5b', '#a81d13', 8),
  GREEN_BTN: ramp('#7fd16e', '#23802a', 8),
  BLUE_BTN: ramp('#6fa5f5', '#144cab', 10),
  SKY: ramp('#79ade4', '#245ea6', 8),
  CALC_ORANGE: ramp('#ffb466', '#e07b00', 6),
  CALC_DARKB: ramp('#7d7d7d', '#3d3d3d', 6),
  IPOD: ramp('#8e5cb5', '#e25aa7', 8),
  // 锁屏顶部/底部渐变（压暗壁纸）
  LOCK_V: ramp('#4a4a4a', '#000000', 6),
  // —— 真机 Springboard 图标用 ——
  SILVER: ramp('#eef0f4', '#92949c', 8), // Camera/Calculator/Settings 金属底
  GREEN_SB: ramp('#8bda78', '#1e9626', 8), // Text 绿
  GREEN_DK: ramp('#82d46f', '#0f8a1d', 8), // Phone dock 绿
  SKY_PHO: ramp('#c3e2f6', '#63a2dd', 8), // Photos 蓝天
  STOCKS_BLUE: ramp('#83b4ee', '#1b4e9c', 8),
  WEATHER_BLUE: ramp('#4f9ce0', '#13508f', 8),
  MAIL_SKY: ramp('#a9cff2', '#4086c8', 8), // Mail/Safari 蓝
  IPOD_ORG: ramp('#ffc8a2', '#ff7a00', 8), // iPod 橙
  TV_SCR: ramp('#a7b392', '#5d6c52', 8),
  // Settings 石墨灰导航栏（真机 1.0 设置应用专属灰条）
  SET_NAV: ramp('#c2c8cf', '#545c66', 8),
  CAL_NAV: ramp('#b9c3d2', '#64728c', 10), // Calendar 蓝钢导航/工具栏
}

const palette: Array<string | null> = [null] // 0 = 透明/底

type RampRange = readonly [number, number] // [起始索引, 级数]

const solidIndex: Record<string, number> = {}
const rampIndex: Record<string, RampRange> = {}

for (const [name, hex] of Object.entries(SOLID_DEFS)) {
  solidIndex[name] = palette.length
  palette.push(hex)
}
for (const [name, colors] of Object.entries(RAMP_DEFS)) {
  const start = palette.length
  palette.push(...colors)
  rampIndex[name] = [start, colors.length] as const
}

/** 单色索引 */
export const C = solidIndex as { readonly [K in keyof typeof SOLID_DEFS]: number }
/** 渐变阶梯：[起始索引, 级数] */
export const R = rampIndex as { readonly [K in keyof typeof RAMP_DEFS]: RampRange }

export const IPHONE_PALETTE: ReadonlyArray<string | null> = palette

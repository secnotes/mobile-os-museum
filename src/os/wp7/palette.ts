/**
 * Windows Phone 7.5（Mango）Metro 调色板：索引 0 固定为底色（null，纯黑）。
 * Metro 的构成只有三样：纯黑背景、白色 Segoe WP 细体字、强调色瓷贴 ——
 * 这里收录 Mango 的 10 个主题强调色（hex 严格对齐真机），全部可动态切换。
 */
export const WP7_PALETTE: ReadonlyArray<string | null> = [
  null, // 0 底色（纯黑，见 profile.screen.bg）
  '#000000', // 1 BLACK 纯黑
  '#ffffff', // 2 WHITE 纯白
  '#8a8a8a', // 3 GRAY 次级灰
  '#2a2a2a', // 4 DIM 暗灰（虚拟键盘键面/次要按钮）
  '#1ba1e2', // 5 BLUE 蓝（Lumia 800 出厂默认强调色）
  '#e51400', // 6 RED 红（挂断/未接）
  '#d80073', // 7 MAGENTA 洋红
  '#f09609', // 8 MANGO 芒果橙（Mango 之名）
  '#a2c139', // 9 LIME 青柠
  '#00aba9', // 10 TEAL 水鸭青
  '#a200ff', // 11 PURPLE 紫
  '#e671b8', // 12 PINK 粉
  '#a05000', // 13 BROWN 棕
  '#339933', // 14 GREEN 绿
  '#647687', // 15 STEEL 钢灰（非强调色，杂项图标用）
]

/** 调色板索引速记 */
export const C = {
  BG: 0,
  BLACK: 1,
  WHITE: 2,
  GRAY: 3,
  DIM: 4,
  BLUE: 5,
  RED: 6,
  MAGENTA: 7,
  MANGO: 8,
  LIME: 9,
  TEAL: 10,
  PURPLE: 11,
  PINK: 12,
  BROWN: 13,
  GREEN: 14,
  STEEL: 15,
} as const

/** Mango 的 10 个主题强调色（设置里切换，瓷贴/高亮全部跟随），按真机网格顺序 */
export const ACCENTS: ReadonlyArray<{ idx: number; zh: string; en: string }> = [
  { idx: C.BLUE, zh: '蓝色', en: 'blue' },
  { idx: C.BROWN, zh: '棕色', en: 'brown' },
  { idx: C.GREEN, zh: '绿色', en: 'green' },
  { idx: C.LIME, zh: '青柠', en: 'lime' },
  { idx: C.MAGENTA, zh: '洋红', en: 'magenta' },
  { idx: C.MANGO, zh: '芒果', en: 'mango' },
  { idx: C.PINK, zh: '粉红', en: 'pink' },
  { idx: C.PURPLE, zh: '紫色', en: 'purple' },
  { idx: C.RED, zh: '红色', en: 'red' },
  { idx: C.TEAL, zh: '水鸭青', en: 'teal' },
]

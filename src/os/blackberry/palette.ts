/**
 * BlackBerry Bold 9000 调色板（BlackBerry OS 4.6 / Precision 主题）。
 * Screen 索引 0 = 底色；BB_PALETTE[0] 为 null。
 */
export const BB_PALETTE: ReadonlyArray<string | null> = [
  null,        // 0 底色（白）
  '#FFFFFF',   // 1 WHITE
  '#1A1A1A',   // 2 INK
  '#F4F4F4',   // 3 G1
  '#E6E6E6',   // 4 G2
  '#D2D2D2',   // 5 G3
  '#B4B4B4',   // 6 G4
  '#8C8C8C',   // 7 G5
  '#646464',   // 8 G6
  '#3E3E3E',   // 9 G7
  '#222222',   // 10 G8
  '#1458C9',   // 11 SELECT（轨迹球选中蓝）
  '#3F7FDC',   // 12 SEL_L
  '#0B57D0',   // 13 LINK
  '#2E9E4F',   // 14 GREEN
  '#1F7A3C',   // 15 GREEN_D
  '#C92626',   // 16 RED
  '#8E1A1A',   // 17 RED_D
  '#FF1A1A',   // 18 LED
  '#E8B53C',   // 19 YELLOW
  '#E07B1E',   // 20 ORANGE
  '#0B2350',   // 21 WP0
  '#12356B',   // 22 WP1
  '#1E5E9E',   // 23 WP2
  '#2E86C4',   // 24 WP3
  '#5FA8DC',   // 25 WP4
  '#0E4E8C',   // 26 BAR_BLUE
  '#1C7BD8',   // 27 BTN_BLUE
  '#CDE2F7',   // 28 FIELD_BG
  '#C2185B',   // 29 MAGENTA
  '#6A3FA0',   // 30 PURPLE
  '#179AA8',   // 31 CYAN
  '#7A4A21',   // 32 BROWN
  '#F2A900',   // 33 GOLD
]

/** 单色索引（0 为底色） */
export const C = {
  WHITE: 1,
  INK: 2,
  G1: 3,
  G2: 4,
  G3: 5,
  G4: 6,
  G5: 7,
  G6: 8,
  G7: 9,
  G8: 10,
  SELECT: 11,
  SEL_L: 12,
  LINK: 13,
  GREEN: 14,
  GREEN_D: 15,
  RED: 16,
  RED_D: 17,
  LED: 18,
  YELLOW: 19,
  ORANGE: 20,
  WP0: 21,
  WP1: 22,
  WP2: 23,
  WP3: 24,
  WP4: 25,
  BAR_BLUE: 26,
  BTN_BLUE: 27,
  FIELD_BG: 28,
  MAGENTA: 29,
  PURPLE: 30,
  CYAN: 31,
  BROWN: 32,
  GOLD: 33,
} as const

/** 阶梯 [起始索引, 级数] */
export const R = {
  WALLPAPER: [C.WP0, 5] as const,
}

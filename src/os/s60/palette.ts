/**
 * S60 彩屏调色板：索引 0 固定为底色（null）。
 * 机型画像（registry）与系统/应用（os/s60）共用这一份，
 * 保证 palette 顺序与 C 常量一致。
 */
export const S60_PALETTE: ReadonlyArray<string | null> = [
  null, // 0 底色（浅灰蓝，见 profile.screen.bg）
  '#1c232b', // 1 INK 深墨（默认前景/正文）
  '#f4f7fa', // 2 WHITE 白
  '#2f6fd0', // 3 BLUE 选中高亮 / 主色
  '#5f9be8', // 4 SKY 亮蓝
  '#d9b44a', // 5 AMBER 琥珀（太阳/高亮字）
  '#4e9b4e', // 6 GREEN 绿（草地/成功）
  '#c44e3d', // 7 RED 红（删除/录制）
  '#7d8590', // 8 GRAY 灰（次级文字）
  '#9fd0f5', // 9 PALE 淡天蓝（壁纸亮部）
  '#173a63', // 10 NAVY 深藏青（壁纸暗部/标题栏）
  '#2c2f33', // 11 DARK 深灰（软键栏）
  '#f0cfbd', // 12 SKIN_L 肤色-亮（原版开机动画手的亮部）
  '#cf916b', // 13 SKIN_M 肤色-中
  '#b57552', // 14 SKIN_D 肤色-暗（手的阴影/轮廓）
  '#7ccaff', // 15 CYAN 浅青（宫格/待机图标选中块，半透明浅青近似）
]

/** 调色板索引速记 */
export const C = {
  BG: 0,
  INK: 1,
  WHITE: 2,
  BLUE: 3,
  SKY: 4,
  AMBER: 5,
  GREEN: 6,
  RED: 7,
  GRAY: 8,
  PALE: 9,
  NAVY: 10,
  DARK: 11,
  SKIN_L: 12,
  SKIN_M: 13,
  SKIN_D: 14,
  CYAN: 15,
} as const

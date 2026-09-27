/**
 * Android 1.0 调色板：索引 0 固定为底色（null）。
 * 机型画像（registry）与系统/应用（os/android）共用这一份，
 * 保证 palette 顺序与 C 常量一致。
 */
export const ANDROID_PALETTE: ReadonlyArray<string | null> = [
  null, // 0 底色（浅灰白，见 profile.screen.bg）
  '#1a1a1a', // 1 INK 正文黑
  '#ffffff', // 2 WHITE 纯白
  '#a4c639', // 3 GREEN Android 绿（品牌色）
  '#5b8ac6', // 4 BLUE 链接/选中蓝
  '#e8a23d', // 5 AMBER 琥珀（未读/高亮）
  '#3d5c1b', // 6 DGREEN 深绿（草地壁纸/通话）
  '#c04a3a', // 7 RED 红（挂断/删除）
  '#8a8a8a', // 8 GRAY 次级灰
  '#d6d6d6', // 9 PALE 浅灰（控件底/分隔线）
  '#101010', // 10 BAR 状态栏黑
  '#2e3192', // 11 NAVY 壁纸深蓝
  '#e20074', // 12 MAGENTA T-Mobile 品牌洋红（开机闪屏）
  '#c2dd6e', // 13 LGREEN 浅绿（图标高光）
  '#8fb4dc', // 14 LBLUE 浅蓝（图标高光）
  '#f2c48a', // 15 LAMBER 浅琥珀（图标高光）
  '#ff9b00', // 16 ORANGE 真机橙（对话框选中/聚焦）
  '#6f6f6f', // 17 METAL 中灰金属（MALMO 表圈阴影）
  '#262626', // 18 PANEL 深灰面板（通知栏分区）
  '#ecfbff', // 19 MSGIN 短信收件行浅蓝底（真机 1.0 会话全宽行）
  '#7d9db5', // 20 TSTAMP 半透明感时间戳蓝灰
  '#d9534f', // 21 DARKRED 删除按钮深红
]

/** 调色板索引速记 */
export const C = {
  BG: 0,
  INK: 1,
  WHITE: 2,
  GREEN: 3,
  BLUE: 4,
  AMBER: 5,
  DGREEN: 6,
  RED: 7,
  GRAY: 8,
  PALE: 9,
  BAR: 10,
  NAVY: 11,
  MAGENTA: 12,
  LGREEN: 13,
  LBLUE: 14,
  LAMBER: 15,
  ORANGE: 16,
  METAL: 17,
  PANEL: 18,
  MSGIN: 19,
  TSTAMP: 20,
  DARKRED: 21,
} as const

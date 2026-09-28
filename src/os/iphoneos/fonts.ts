/**
 * iPhone OS 字体栈：真机为 Helvetica / Helvetica Bold。
 * 优先命中系统真机 Helvetica Neue / Helvetica / Arial（Apple 设备自带），
 * 其次 TeX Gyre Heros（Helvetica 度量克隆，以 "iPhone Sans" 之名载入，作跨平台兜底）。
 * 中文回落 Droid Sans Fallback（真机 1.0 无中文输入法，但可显示中文）。
 */
export const F_REG = (px: number) =>
  `${px}px "Helvetica Neue","Helvetica","Arial","iPhone Sans","Droid Sans Fallback",sans-serif`
export const F_BOLD = (px: number) =>
  `700 ${px}px "Helvetica Neue","Helvetica","Arial","iPhone Sans","Droid Sans Fallback",sans-serif`

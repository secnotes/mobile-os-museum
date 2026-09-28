/**
 * iPhone OS 字体栈：真机为 Helvetica / Helvetica Bold。
 * TeX Gyre Heros 是 Helvetica 的自由度量克隆，以 "iPhone Sans" 之名载入并优先使用——
 * 度量跨平台一致，避免系统 Helvetica Neue 在不同机器上字宽/基线漂移导致状态栏错位与截断。
 * 中文回落 Droid Sans Fallback（真机 1.0 无中文输入法，但可显示中文）。
 */
export const F_REG = (px: number) => `${px}px "iPhone Sans","Droid Sans Fallback",sans-serif`
export const F_BOLD = (px: number) => `700 ${px}px "iPhone Sans","Droid Sans Fallback",sans-serif`

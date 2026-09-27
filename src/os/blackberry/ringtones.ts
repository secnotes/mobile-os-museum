/**
 * BlackBerry 来电铃声（均为公有域旋律）。[midi, 拍数]，0 = 休止。
 * 真实 BB 铃声多为短循环；这里每首取 8–16 小节，播放时 loop。
 */

export interface RingtoneDef {
  zh: string
  en: string
  notes: ReadonlyArray<readonly [number, number]>
}

const REST: [number, number] = [0, 1]

/** 经典座机双铃振铃（两音急颤） */
const CLASSIC: ReadonlyArray<readonly [number, number]> = [
  [76, 0.5], [69, 0.5], [76, 0.5], [69, 0.5], [76, 0.5], [69, 0.5],
  [0, 1.5],
]
/** 欢乐颂 */
const ODE: ReadonlyArray<readonly [number, number]> = [
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [64, 1.5], [62, 0.5], [62, 2],
]
/** 绿袖子 */
const GREENS: ReadonlyArray<readonly [number, number]> = [
  [69, 1], [72, 0.5], [71, 0.5], [70, 0.5], [69, 0.5], [67, 1], [69, 1],
  [65, 1], [67, 0.5], [64, 0.5], [62, 1], [64, 1], [0, 1],
]
/** 致爱丽丝（开头） */
const ELISE: ReadonlyArray<readonly [number, number]> = [
  [76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5], [74, 0.5],
  [72, 0.5], [71, 1], [0, 1],
]
/** 扬基歌 */
const YANKEE: ReadonlyArray<readonly [number, number]> = [
  [67, 0.75], [67, 0.25], [67, 1], [67, 0.75], [67, 0.25], [67, 1],
  [67, 0.75], [69, 0.25], [72, 1.5], [71, 0.5], [69, 1],
]
/** 小星星 */
const TWINKLE: ReadonlyArray<readonly [number, number]> = [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
]
/** 铃儿响叮当 */
const BELLS: ReadonlyArray<readonly [number, number]> = [
  [64, 1], [64, 1], [64, 2], [64, 1], [64, 1], [64, 2],
  [64, 1], [67, 1], [60, 1.5], [62, 0.5], [64, 4],
]
/** 两只老虎（Frère Jacques） */
const JACQUES: ReadonlyArray<readonly [number, number]> = [
  [60, 1], [62, 1], [64, 1], [60, 1], [60, 1], [62, 1], [64, 1], [60, 1],
  [64, 1], [65, 1], [67, 2], [0, 1],
]
/** 友谊地久天长 */
const AULD: ReadonlyArray<readonly [number, number]> = [
  [67, 1.5], [65, 0.5], [64, 1], [62, 1],
  [60, 1.5], [62, 0.5], [64, 1], [64, 1],
  [64, 1.5], [67, 0.5], [69, 1], [67, 1],
  [64, 1.5], [62, 0.5], [60, 2],
]
/** BB 提示式短音（上行琶音） */
const CHIME: ReadonlyArray<readonly [number, number]> = [
  [64, 0.5], [67, 0.5], [72, 0.5], [76, 1], [0, 1],
]

export const RINGTONES: ReadonlyArray<RingtoneDef> = [
  { zh: '经典铃声', en: 'Classic', notes: CLASSIC },
  { zh: '欢乐颂', en: 'Ode to Joy', notes: ODE },
  { zh: '绿袖子', en: 'Greensleeves', notes: GREENS },
  { zh: '致爱丽丝', en: 'Fur Elise', notes: ELISE },
  { zh: '扬基歌', en: 'Yankee Doodle', notes: YANKEE },
  { zh: '小星星', en: 'Twinkle', notes: TWINKLE },
  { zh: '铃儿响叮当', en: 'Jingle Bells', notes: BELLS },
  { zh: '两只老虎', en: 'Frere Jacques', notes: JACQUES },
  { zh: '友谊地久天长', en: 'Auld Lang Syne', notes: AULD },
  { zh: 'BB 风铃', en: 'BB Chime', notes: CHIME },
]

/** 信息提示音（短促，不循环） */
export const MSG_TONE: ReadonlyArray<readonly [number, number]> = [
  [79, 0.25], [84, 0.25],
]

/** 简易闹钟铃（公有域小号风格旋律循环） */
export const ALARM_NOTES: ReadonlyArray<readonly [number, number]> = [
  [76, 0.25], [76, 0.25], [76, 0.25], [0, 0.25],
  [79, 0.25], [79, 0.25], [79, 0.25], [0, 0.25],
]

export { REST }

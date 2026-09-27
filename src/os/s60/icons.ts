/**
 * N73 功能表图标库：全部程序绘制，40×40 逻辑栅格。
 * 同一份画法经 ScaleScreen 缩放用于宫格（40）与待机活动插件（30）。
 */
import type { Screen } from '../../hal/screen'
import { C } from './palette'

/** 图标绘制所需的 Screen 子集 */
export interface IconTarget {
  fillRect(x: number, y: number, w: number, h: number, v?: number): void
  pset(x: number, y: number, v?: number): void
  line(x0: number, y0: number, x1: number, y1: number, v?: number): void
  text(x: number, y: number, s: string, o?: { size?: number; color?: number }): number
}

/** 坐标与尺寸按 k 缩放、平移到 (ox,oy) 的 Screen 适配 */
export class ScaleScreen implements IconTarget {
  constructor(
    private s: Screen,
    private ox: number,
    private oy: number,
    private k: number,
  ) {}
  private rx(v: number) { return this.ox + Math.round(v * this.k) }
  private ry(v: number) { return this.oy + Math.round(v * this.k) }
  private rw(v: number) { return Math.max(1, Math.round(v * this.k)) }
  fillRect(x: number, y: number, w: number, h: number, v: number = 1) {
    this.s.fillRect(this.rx(x), this.ry(y), this.rw(w), this.rw(h), v)
  }
  pset(x: number, y: number, v: number = 1) { this.s.pset(this.rx(x), this.ry(y), v) }
  line(x0: number, y0: number, x1: number, y1: number, v: number = 1) {
    this.s.line(this.rx(x0), this.ry(y0), this.rx(x1), this.ry(y1), v)
  }
  text(x: number, y: number, str: string, o: { size?: number; color?: number } = {}) {
    return this.s.text(this.rx(x), this.ry(y), str, { size: Math.max(6, Math.round((o.size ?? 9) * this.k)), color: o.color })
  }
}

/* ---------- 40 栅格内的基础图元 ---------- */

/** 圆角矩形（去四角像素） */
function rr(g: IconTarget, x: number, y: number, w: number, h: number, r: number, c: number) {
  g.fillRect(x, y + r, w, h - 2 * r, c)
  g.fillRect(x + r, y, w - 2 * r, r, c)
  g.fillRect(x + r, y + h - r, w - 2 * r, r, c)
}

function disc(g: IconTarget, cx: number, cy: number, r: number, c: number) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) g.pset(cx + dx, cy + dy, c)
}

function ring(g: IconTarget, cx: number, cy: number, r: number, c: number) {
  for (let t = 0; t < 360; t += 4) {
    const a = (t * Math.PI) / 180
    g.pset(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), c)
  }
}

/** 向下箭头（x,y 为包围盒左上，w,h 尺寸） */
function downArrow(g: IconTarget, x: number, y: number, w: number, h: number, c: number) {
  const stemW = Math.max(2, Math.round(w / 4))
  const stemH = Math.max(3, h - Math.round(w / 2))
  g.fillRect(x + ((w - stemW) >> 1), y, stemW, stemH, c)
  const tipY = y + stemH
  for (let i = 0; i < h - stemH; i++) {
    const inset = (h - stemH) - 1 - i
    g.fillRect(x + inset, tipY + i, w - 2 * inset, 1, c)
  }
}

/** 黄色文件夹底（AMBER） */
function folder(g: IconTarget) {
  rr(g, 2, 12, 36, 24, 3, C.AMBER)
  rr(g, 2, 8, 14, 8, 2, C.AMBER)
  g.fillRect(2, 12, 14, 4, C.AMBER)
  g.fillRect(4, 14, 32, 2, C.WHITE)
  g.fillRect(4, 32, 32, 2, C.GRAY)
}

/** 右下角 15×15 徽标 */
function badge(g: IconTarget, bg: number) {
  rr(g, 23, 23, 15, 15, 3, bg)
  g.pset(23, 23, C.WHITE); g.pset(37, 23, C.WHITE); g.pset(23, 37, C.WHITE); g.pset(37, 37, C.WHITE)
}

/* ---------- 顶级图标 ---------- */

function contactsIcon(g: IconTarget) {
  rr(g, 6, 4, 28, 33, 3, C.BLUE)
  g.fillRect(6, 30, 28, 7, C.NAVY)
  // 白色人像：头 + 肩
  disc(g, 20, 15, 5, C.WHITE)
  g.fillRect(12, 25, 16, 2, C.WHITE)
  g.fillRect(14, 27, 12, 2, C.WHITE)
  g.fillRect(16, 29, 8, 2, C.WHITE)
}

function messagesIcon(g: IconTarget) {
  g.fillRect(5, 12, 30, 18, C.AMBER)
  g.line(5, 12, 20, 22, C.INK)
  g.line(35, 12, 20, 22, C.INK)
  g.line(5, 30, 20, 21, C.INK)
  g.line(35, 30, 20, 21, C.INK)
  g.fillRect(5, 28, 30, 2, C.GRAY)
}

function calendarIcon(g: IconTarget) {
  g.fillRect(6, 8, 28, 28, C.WHITE)
  g.fillRect(6, 8, 28, 7, C.RED)
  for (const x of [10, 16, 22, 28]) g.pset(x, 11, C.WHITE)
  g.text(11, 19, '30', { size: 13, color: C.RED })
}

function noteShape(g: IconTarget, c: number) {
  g.fillRect(25, 5, 3, 21, c)
  g.fillRect(18, 5, 10, 4, c)
  disc(g, 18, 26, 5, c)
}

function playerIcon(g: IconTarget) {
  noteShape(g, C.RED)
  disc(g, 31, 31, 8, C.SKY)
  g.fillRect(28, 27, 2, 8, C.WHITE)
  g.fillRect(30, 27, 2, 8, C.WHITE)
  g.fillRect(32, 29, 2, 4, C.WHITE)
  g.fillRect(34, 30, 2, 2, C.WHITE)
}

function mediaIcon(g: IconTarget) {
  g.fillRect(5, 8, 24, 5, C.RED)
  g.line(6, 12, 10, 8, C.WHITE); g.line(14, 12, 18, 8, C.WHITE); g.line(22, 12, 26, 8, C.WHITE)
  rr(g, 5, 11, 30, 24, 3, C.RED)
  g.fillRect(9, 15, 6, 8, C.WHITE)
  g.fillRect(17, 15, 6, 8, C.WHITE)
  g.fillRect(25, 15, 6, 8, C.WHITE)
  g.pset(11, 31, C.INK); g.pset(20, 31, C.INK); g.pset(29, 31, C.INK)
}

function gamesIcon(g: IconTarget) {
  folder(g)
  badge(g, C.GREEN)
  g.line(26, 27, 34, 27, C.WHITE)
  g.line(34, 27, 34, 31, C.WHITE)
  g.line(34, 31, 28, 31, C.WHITE)
  g.line(28, 31, 28, 34, C.WHITE)
  g.line(28, 34, 35, 34, C.WHITE)
}

function serviceIcon(g: IconTarget) {
  disc(g, 20, 20, 12, C.BLUE)
  g.line(20, 8, 20, 32, C.SKY)
  g.line(9, 20, 31, 20, C.SKY)
  ring(g, 20, 20, 7, C.SKY)
  g.pset(16, 15, C.GREEN); g.pset(17, 15, C.GREEN); g.pset(15, 16, C.GREEN)
  g.pset(24, 24, C.GREEN); g.pset(25, 24, C.GREEN); g.pset(23, 25, C.GREEN); g.pset(26, 25, C.GREEN)
}

function downloadsIcon(g: IconTarget) {
  rr(g, 9, 14, 22, 20, 2, C.GRAY)
  g.fillRect(9, 14, 22, 5, C.AMBER)
  g.fillRect(18, 14, 4, 20, C.DARK)
  badge(g, C.BLUE)
  downArrow(g, 28, 26, 6, 9, C.WHITE)
}

function toolsIcon(g: IconTarget) {
  folder(g)
  badge(g, C.GRAY)
  g.line(26, 35, 34, 27, C.WHITE)
  g.pset(34, 27, C.WHITE); g.pset(35, 28, C.WHITE)
  g.line(26, 29, 29, 26, C.WHITE)
}

function appsIcon(g: IconTarget) {
  folder(g)
  badge(g, C.RED)
  g.line(26, 27, 34, 27, C.WHITE)
  g.line(34, 27, 34, 31, C.WHITE)
  g.line(34, 31, 28, 31, C.WHITE)
  g.line(28, 31, 28, 34, C.WHITE)
  g.line(28, 34, 35, 34, C.WHITE)
}

function officeIcon(g: IconTarget) {
  folder(g)
  badge(g, C.WHITE)
  g.fillRect(27, 27, 8, 1, C.INK)
  g.fillRect(27, 30, 8, 1, C.INK)
  g.fillRect(27, 33, 6, 1, C.INK)
}

function avIcon(g: IconTarget) {
  g.fillRect(4, 7, 32, 6, C.AMBER)
  g.line(6, 12, 10, 7, C.INK); g.line(14, 12, 18, 7, C.INK)
  g.line(22, 12, 26, 7, C.INK); g.line(30, 12, 34, 7, C.INK)
  rr(g, 5, 11, 30, 22, 2, C.DARK)
  g.fillRect(17, 17, 2, 10, C.WHITE)
  g.fillRect(19, 17, 2, 10, C.WHITE)
  g.fillRect(21, 19, 2, 6, C.WHITE)
  g.fillRect(23, 20, 2, 4, C.WHITE)
}

/* ---------- 多媒体 文件夹 ---------- */

function cameraIcon(g: IconTarget) {
  g.fillRect(12, 10, 16, 5, C.GRAY)
  rr(g, 3, 13, 34, 19, 2, C.WHITE)
  disc(g, 20, 22, 8, C.GRAY)
  disc(g, 20, 22, 5, C.INK)
  disc(g, 20, 22, 2, C.SKY)
  g.pset(31, 16, C.GREEN)
}

function camcorderIcon(g: IconTarget) {
  rr(g, 3, 13, 24, 17, 2, C.GRAY)
  disc(g, 15, 21, 5, C.INK)
  disc(g, 14, 20, 2, C.SKY)
  g.pset(30, 22, C.AMBER)
  g.fillRect(29, 23, 3, 1, C.AMBER)
  g.fillRect(28, 24, 5, 2, C.AMBER)
  g.fillRect(28, 26, 5, 1, C.AMBER)
  g.fillRect(29, 27, 3, 1, C.AMBER)
}

function picturesIcon(g: IconTarget) {
  g.fillRect(5, 9, 30, 24, C.WHITE)
  g.fillRect(5, 9, 30, 2, C.GRAY); g.fillRect(5, 31, 30, 2, C.GRAY)
  g.fillRect(5, 9, 2, 24, C.GRAY); g.fillRect(33, 9, 2, 24, C.GRAY)
  disc(g, 12, 15, 3, C.AMBER)
  g.fillRect(8, 28, 9, 1, C.GREEN); g.fillRect(10, 27, 5, 1, C.GREEN)
  g.fillRect(11, 26, 3, 1, C.GREEN); g.pset(12, 25, C.GREEN)
  g.fillRect(24, 28, 8, 1, C.GREEN); g.fillRect(26, 27, 4, 1, C.GREEN)
  g.fillRect(27, 26, 2, 1, C.GREEN)
}

function videoClipsIcon(g: IconTarget) {
  g.fillRect(4, 8, 28, 5, C.AMBER)
  rr(g, 4, 10, 32, 23, 2, C.RED)
  g.fillRect(8, 15, 5, 8, C.WHITE)
  g.fillRect(16, 15, 5, 8, C.WHITE)
  g.fillRect(24, 15, 5, 8, C.WHITE)
}

function tracksIcon(g: IconTarget) { noteShape(g, C.BLUE) }

function soundsIcon(g: IconTarget) {
  const hs = [3, 6, 9, 5, 11, 7, 12, 6, 9, 4]
  hs.forEach((h, i) => g.fillRect(6 + i * 3, 21 - h, 2, h, C.SKY))
  g.line(5, 21, 35, 21, C.GRAY)
}

function streamingIcon(g: IconTarget) {
  disc(g, 16, 22, 9, C.BLUE)
  g.line(16, 13, 16, 31, C.SKY); g.line(8, 22, 24, 22, C.SKY)
  g.fillRect(26, 12, 7, 5, C.GRAY)
  g.fillRect(28, 17, 7, 5, C.GRAY)
}

/* ---------- 下载 ---------- */

function catalogIcon(g: IconTarget) {
  rr(g, 2, 12, 36, 24, 3, C.GREEN)
  rr(g, 2, 8, 14, 8, 2, C.GREEN)
  g.fillRect(2, 12, 14, 4, C.GREEN)
  downArrow(g, 16, 14, 8, 13, C.WHITE)
}

/* ---------- 工具 ---------- */

function filemanIcon(g: IconTarget) {
  folder(g)
  badge(g, C.BLUE)
  g.fillRect(27, 28, 8, 6, C.WHITE)
  g.pset(30, 27, C.WHITE)
}

function calcIcon(g: IconTarget) {
  rr(g, 8, 5, 24, 30, 3, C.GRAY)
  g.fillRect(11, 8, 18, 7, C.GREEN)
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) g.pset(12 + i * 6, 19 + j * 5, C.INK)
}

function notesIcon(g: IconTarget) {
  rr(g, 6, 5, 26, 30, 2, C.WHITE)
  for (const y of [12, 17, 22, 27]) g.fillRect(10, y, 16, 1, C.GRAY)
  g.line(29, 33, 35, 27, C.AMBER)
  g.pset(35, 27, C.INK)
}

function clockIcon(g: IconTarget) {
  disc(g, 20, 20, 13, C.WHITE)
  ring(g, 20, 20, 13, C.GRAY)
  g.line(20, 20, 20, 11, C.INK)
  g.line(20, 20, 27, 23, C.INK)
  g.pset(20, 20, C.INK)
}

function converterIcon(g: IconTarget) {
  rr(g, 5, 15, 30, 11, 2, C.AMBER)
  for (let i = 0; i < 4; i++) g.fillRect(8 + i * 7, 15, 1, 3, C.INK)
  g.pset(12, 12, C.SKY); g.fillRect(11, 13, 3, 1, C.SKY)
  g.pset(28, 12, C.SKY); g.fillRect(27, 13, 3, 1, C.SKY)
}

function dictionaryIcon(g: IconTarget) {
  rr(g, 5, 6, 30, 28, 3, C.BLUE)
  g.text(13, 13, 'A', { size: 14, color: C.WHITE })
  g.fillRect(7, 32, 26, 2, C.WHITE)
}

function appmgrIcon(g: IconTarget) {
  disc(g, 15, 17, 7, C.AMBER)
  g.fillRect(14, 8, 2, 3, C.AMBER); g.fillRect(14, 23, 2, 3, C.AMBER)
  g.fillRect(6, 16, 3, 2, C.AMBER); g.fillRect(21, 16, 3, 2, C.AMBER)
  disc(g, 15, 17, 3, C.DARK)
  disc(g, 27, 26, 5, C.GRAY)
  g.fillRect(26, 20, 2, 2, C.GRAY); g.pset(32, 26, C.GRAY)
  g.pset(27, 31, C.GRAY); g.pset(22, 26, C.GRAY)
}

function bluetoothIcon(g: IconTarget) {
  rr(g, 6, 6, 28, 28, 5, C.BLUE)
  g.line(20, 11, 20, 29, C.WHITE)
  g.line(20, 14, 15, 17, C.WHITE); g.line(20, 14, 25, 17, C.WHITE)
  g.line(20, 26, 16, 22, C.WHITE); g.line(20, 26, 24, 22, C.WHITE)
}

function connmgrIcon(g: IconTarget) {
  rr(g, 8, 10, 10, 16, 2, C.INK)
  rr(g, 22, 14, 10, 16, 2, C.INK)
  g.pset(13, 13, C.SKY); g.pset(27, 17, C.SKY)
  g.pset(18, 19, C.SKY); g.pset(22, 21, C.SKY)
  g.pset(19, 22, C.SKY); g.pset(21, 24, C.SKY)
}

function memcardIcon(g: IconTarget) {
  rr(g, 4, 11, 32, 20, 2, C.GRAY)
  g.fillRect(30, 11, 5, 6, C.DARK)
  g.fillRect(8, 13, 5, 3, C.INK); g.fillRect(15, 13, 5, 3, C.INK)
  g.fillRect(10, 22, 20, 1, C.WHITE); g.fillRect(10, 25, 14, 1, C.WHITE)
}

function profilesIcon(g: IconTarget) {
  g.fillRect(9, 9, 11, 10, C.BLUE); g.fillRect(21, 9, 11, 10, C.AMBER)
  g.fillRect(9, 21, 11, 10, C.GREEN); g.fillRect(21, 21, 11, 10, C.RED)
  ring(g, 20, 20, 13, C.GRAY)
}

function themesIcon(g: IconTarget) {
  rr(g, 6, 6, 28, 28, 4, C.WHITE)
  disc(g, 13, 13, 3, C.RED); disc(g, 27, 13, 3, C.BLUE)
  disc(g, 13, 27, 3, C.GREEN); disc(g, 27, 27, 3, C.AMBER)
}

function settingsIcon(g: IconTarget) {
  disc(g, 20, 20, 10, C.GRAY)
  for (let t = 0; t < 360; t += 45) {
    const a = (t * Math.PI) / 180
    g.pset(20 + Math.round(Math.cos(a) * 12), 20 + Math.round(Math.sin(a) * 12), C.GRAY)
  }
  disc(g, 20, 20, 4, C.INK)
}

function speedDialIcon(g: IconTarget) {
  g.fillRect(9, 16, 22, 6, C.BLUE)
  g.fillRect(9, 13, 5, 4, C.BLUE); g.fillRect(26, 21, 5, 4, C.BLUE)
  g.text(14, 24, '1', { size: 10, color: C.WHITE })
}

function syncIcon(g: IconTarget) {
  ring(g, 20, 20, 9, C.GREEN)
  g.pset(29, 18, C.GREEN); g.pset(30, 19, C.GREEN); g.pset(29, 20, C.GREEN)
  ring(g, 20, 22, 6, C.BLUE)
  g.pset(13, 25, C.BLUE); g.pset(12, 24, C.BLUE); g.pset(13, 23, C.BLUE)
}

function voiceTagsIcon(g: IconTarget) {
  rr(g, 16, 8, 8, 14, 3, C.INK)
  g.line(20, 22, 20, 28, C.GRAY)
  g.fillRect(14, 28, 12, 2, C.GRAY)
  ring(g, 20, 16, 10, C.SKY)
}

function voicemailIcon(g: IconTarget) {
  rr(g, 6, 11, 28, 19, 2, C.INK)
  disc(g, 14, 20, 4, C.WHITE); disc(g, 26, 20, 4, C.WHITE)
  g.pset(14, 20, C.AMBER); g.pset(26, 20, C.AMBER)
  g.line(14, 24, 26, 24, C.AMBER)
}

function tones3dIcon(g: IconTarget) {
  g.fillRect(8, 16, 7, 8, C.INK)
  g.fillRect(15, 13, 4, 14, C.INK)
  ring(g, 26, 20, 4, C.SKY); ring(g, 28, 20, 7, C.BLUE); ring(g, 30, 20, 10, C.SKY)
}

function logIcon(g: IconTarget) {
  g.fillRect(9, 18, 22, 6, C.GREEN)
  g.fillRect(9, 15, 4, 4, C.GREEN); g.fillRect(27, 23, 4, 4, C.GREEN)
  ring(g, 28, 12, 4, C.INK)
  g.line(28, 12, 28, 10, C.INK); g.line(28, 12, 30, 12, C.INK)
}

/* ---------- 办公 / 影音 ---------- */

function quickofficeIcon(g: IconTarget) {
  rr(g, 7, 6, 26, 30, 2, C.WHITE)
  g.fillRect(25, 6, 8, 8, C.GRAY)
  g.text(10, 11, 'Q', { size: 16, color: C.BLUE })
  g.fillRect(11, 27, 18, 1, C.GRAY); g.fillRect(11, 30, 14, 1, C.GRAY)
}

function realplayerIcon(g: IconTarget) {
  rr(g, 5, 8, 30, 24, 4, C.NAVY)
  g.pset(18, 16, C.AMBER)
  g.fillRect(17, 17, 3, 2, C.AMBER)
  g.fillRect(16, 19, 5, 6, C.AMBER)
  g.fillRect(17, 25, 3, 2, C.AMBER)
  g.fillRect(19, 19, 2, 6, C.SKY)
  g.fillRect(21, 20, 2, 4, C.SKY)
  g.fillRect(23, 21, 2, 2, C.SKY)
}

function visualRadioIcon(g: IconTarget) {
  g.line(32, 13, 37, 6, C.GRAY)
  rr(g, 5, 13, 30, 18, 3, C.AMBER)
  g.fillRect(8, 16, 12, 5, C.SKY)
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++) g.pset(24 + i * 3, 23 + j * 3, C.INK)
}

/* ---------- 注册表 ---------- */

export type IconName =
  | 'contacts' | 'messages' | 'calendar' | 'player' | 'media' | 'games'
  | 'service' | 'downloads' | 'tools' | 'apps' | 'office' | 'av'
  | 'camera' | 'camcorder' | 'pictures' | 'videoclips' | 'tracks' | 'sounds' | 'streaming'
  | 'catalog'
  | 'fileman' | 'calculator' | 'notes' | 'clock' | 'converter' | 'dictionary'
  | 'appmgr' | 'bluetooth' | 'connmgr' | 'memcard' | 'profiles' | 'themes'
  | 'settings' | 'speeddial' | 'sync' | 'voicetags' | 'voicemail' | 'tones3d' | 'log'
  | 'quickoffice' | 'realplayer' | 'visualradio'

const ICONS: Record<IconName, (g: IconTarget) => void> = {
  contacts: contactsIcon,
  messages: messagesIcon,
  calendar: calendarIcon,
  player: playerIcon,
  media: mediaIcon,
  games: gamesIcon,
  service: serviceIcon,
  downloads: downloadsIcon,
  tools: toolsIcon,
  apps: appsIcon,
  office: officeIcon,
  av: avIcon,
  camera: cameraIcon,
  camcorder: camcorderIcon,
  pictures: picturesIcon,
  videoclips: videoClipsIcon,
  tracks: tracksIcon,
  sounds: soundsIcon,
  streaming: streamingIcon,
  catalog: catalogIcon,
  fileman: filemanIcon,
  calculator: calcIcon,
  notes: notesIcon,
  clock: clockIcon,
  converter: converterIcon,
  dictionary: dictionaryIcon,
  appmgr: appmgrIcon,
  bluetooth: bluetoothIcon,
  connmgr: connmgrIcon,
  memcard: memcardIcon,
  profiles: profilesIcon,
  themes: themesIcon,
  settings: settingsIcon,
  speeddial: speedDialIcon,
  sync: syncIcon,
  voicetags: voiceTagsIcon,
  voicemail: voicemailIcon,
  tones3d: tones3dIcon,
  log: logIcon,
  quickoffice: quickofficeIcon,
  realplayer: realplayerIcon,
  visualradio: visualRadioIcon,
}

/** 在 (x,y) 以 40 栅格绘制图标 */
export function drawIcon(s: Screen, name: IconName, x: number, y: number) {
  ICONS[name]!(new ScaleScreen(s, x, y, 1))
}

/** 在 (x,y) 以缩放尺寸绘制图标（size 为栅格总宽） */
export function drawIconSized(s: Screen, name: IconName, x: number, y: number, size: number) {
  ICONS[name]!(new ScaleScreen(s, x, y, size / 40))
}

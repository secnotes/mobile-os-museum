/**
 * N73 功能表节点树：顶级 12 项（对齐中文固件照片顺序），
 * 文件夹 drill-down；叶子节点 app 缺省表示第 6 步再接入的新应用。
 */
import type { MiniApp } from '../../kernel/types'
import type { IconName } from './icons'
import { messagesApp } from './apps/messages'
import { contactsApp } from './apps/contacts'
import { cameraApp } from './apps/camera'
import { snakeApp } from './apps/snake'
import { settingsApp } from './apps/settings'
import { logApp } from './apps/log'
import { calendarApp } from './apps/calendar'
import { clockApp } from './apps/clock'
import { calculatorApp } from './apps/calculator'
import { notesApp } from './apps/notes'
import { converterApp } from './apps/converter'
import { dictionaryApp } from './apps/dictionary'
import { filemanApp } from './apps/fileman'
import { musicApp } from './apps/music'
import { radioApp } from './apps/radio'
import { realplayerApp } from './apps/realplayer'
import { webApp } from './apps/web'

export interface MenuNode {
  /** 唯一 id */
  id: string
  zh: string
  en: string
  icon: IconName
  children?: MenuNode[]
  app?: MiniApp
}

/** 叶子节点简写 */
function leaf(id: string, zh: string, en: string, icon: IconName, app?: MiniApp): MenuNode {
  return { id, zh, en, icon, app }
}

/* ---- 文件夹内容 ---- */

const MEDIA: MenuNode[] = [
  leaf('m-camera', '照相机', 'Camera', 'camera', cameraApp),
  leaf('m-camcorder', '摄像机', 'Camcorder', 'camcorder'),
  leaf('m-pictures', '图片', 'Images', 'pictures', cameraApp),
  leaf('m-videoclips', '视频片段', 'Video clips', 'videoclips'),
  leaf('m-tracks', '曲目', 'Tracks', 'tracks', musicApp),
  leaf('m-sounds', '声音片段', 'Sound clips', 'sounds'),
  leaf('m-streaming', '流媒体链接', 'Streaming links', 'streaming'),
]

const GAMES: MenuNode[] = [
  leaf('g-snake', '贪吃蛇', 'Snake', 'games', snakeApp),
]

const DOWNLOAD: MenuNode[] = [
  leaf('d-catalog', '下载目录', 'Download catalog', 'catalog'),
]

const TOOLS: MenuNode[] = [
  leaf('t-fileman', '文件管理', 'File mgr.', 'fileman', filemanApp),
  leaf('t-calculator', '计算器', 'Calculator', 'calculator', calculatorApp),
  leaf('t-notes', '记事本', 'Notes', 'notes', notesApp),
  leaf('t-clock', '时钟', 'Clock', 'clock', clockApp),
  leaf('t-converter', '单位换算', 'Converter', 'converter', converterApp),
  leaf('t-dictionary', '词典', 'Dictionary', 'dictionary', dictionaryApp),
  leaf('t-appmgr', '程序管理', 'App. mgr.', 'appmgr'),
  leaf('t-bluetooth', '蓝牙', 'Bluetooth', 'bluetooth'),
  leaf('t-connmgr', '连接管理', 'Conn. mgr.', 'connmgr'),
  leaf('t-memcard', '存储卡', 'Memory card', 'memcard'),
  leaf('t-profiles', '情景模式', 'Profiles', 'profiles'),
  leaf('t-themes', '主题模式', 'Themes', 'themes'),
  leaf('t-settings', '设置', 'Settings', 'settings', settingsApp),
  leaf('t-speeddial', '单键拨号', '1-touch dial.', 'speeddial'),
  leaf('t-sync', '同步', 'Sync', 'sync'),
  leaf('t-voicetags', '声控命令', 'Voice tags', 'voicetags'),
  leaf('t-voicemail', '语音信箱', 'Voice mailbox', 'voicemail'),
  leaf('t-tones3d', '3-D 铃声', '3-D tones', 'tones3d'),
  leaf('t-log', '通讯记录', 'Log', 'log', logApp),
]

const APPLICATIONS: MenuNode[] = [
  leaf('a-snake', '贪吃蛇', 'Snake', 'games', snakeApp),
  leaf('a-catalog', '下载目录', 'Download catalog', 'catalog'),
]

const OFFICE: MenuNode[] = [
  leaf('o-quickoffice', 'Quickoffice', 'Quickoffice', 'quickoffice'),
  leaf('o-converter', '单位换算', 'Converter', 'converter', converterApp),
]

const AV: MenuNode[] = [
  leaf('v-realplayer', 'RealPlayer', 'RealPlayer', 'realplayer', realplayerApp),
  leaf('v-radio', '可视收音机', 'Visual radio', 'visualradio', radioApp),
  leaf('v-player', '音乐播放器', 'Music player', 'player', musicApp),
]

/* ---- 顶级 ---- */

export const MENU_TREE: MenuNode[] = [
  leaf('root-contacts', '名片夹', 'Contacts', 'contacts', contactsApp),
  leaf('root-messages', '信息', 'Messaging', 'messages', messagesApp),
  leaf('root-calendar', '日历', 'Calendar', 'calendar', calendarApp),
  leaf('root-player', '播放器', 'Music plyr.', 'player', musicApp),
  { id: 'root-media', zh: '多媒体', en: 'Media', icon: 'media', children: MEDIA },
  { id: 'root-games', zh: '游戏', en: 'Games', icon: 'games', children: GAMES },
  leaf('root-service', '服务', 'Services', 'service', webApp),
  { id: 'root-download', zh: '下载', en: 'Download', icon: 'downloads', children: DOWNLOAD },
  { id: 'root-tools', zh: '工具', en: 'Tools', icon: 'tools', children: TOOLS },
  { id: 'root-apps', zh: '应用软件', en: 'Applications', icon: 'apps', children: APPLICATIONS },
  { id: 'root-office', zh: '办公工具', en: 'Office', icon: 'office', children: OFFICE },
  { id: 'root-av', zh: '影音', en: 'AV', icon: 'av', children: AV },
]

/** 按 id 全树查找节点及其所在文件夹路径（用于待机快捷方式直达） */
export function findNode(id: string, nodes: MenuNode[] = MENU_TREE, trail: number[] = []): { node: MenuNode; trail: number[] } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (n.id === id) return { node: n, trail }
    if (n.children) {
      const hit = findNode(id, n.children, [...trail, i])
      if (hit) return hit
    }
  }
  return null
}

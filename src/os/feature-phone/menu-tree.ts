/**
 * 功能机菜单树：1100/3310 各自的顶级结构对齐官方用户指南。
 * 所有叶子都是 MiniApp（经 AppRuntime 启动）；列表节点由 OS 层栈式 MenuUI 渲染。
 * 树按阶段扩展（新 app 落地即加入对应叶子），序号 num 一经预留不再变动。
 */
import type { DeviceProfile, MiniApp } from '../../kernel/types'
import { messagesApp } from './apps/messages'
import { contactsApp } from './apps/contacts'
import { chatApp } from './apps/chat'
import { calllogApp } from './apps/calllog'
import { snakeApp } from './apps/snake'
import { spaceImpactApp } from './apps/spaceimpact'
import { pairsApp } from './apps/pairs'
import { bantumiApp } from './apps/bantumi'
import { calculatorApp } from './apps/calculator'
import { composerApp } from './apps/composer'
import { flashlightApp } from './apps/flashlight'
import { tonesApp } from './apps/tones'
import { profilesApp } from './apps/profiles'
import { keyguardApp } from './apps/keyguard'
import { alarmApp } from './apps/alarm'
import { stopwatchApp } from './apps/stopwatch'
import { countdownApp } from './apps/countdown'
import { remindersApp } from './apps/reminders'
import { divertApp } from './apps/divert'
import {
  timesetApp, callsetApp, phonesetApp, clockconfApp, factoryApp, simApp,
} from './apps/settingsfp'

export interface MenuLabel {
  zh: string
  en: string
}

export interface MenuList {
  kind: 'list'
  id: string
  label: MenuLabel
  /** 快捷序号（1100 两位 '01'..'11'；3310 单位 '1'..'13'） */
  num?: string
  items: MenuNode[]
}

export interface MenuLeaf {
  kind: 'app'
  id: string
  label: MenuLabel
  num?: string
  app: MiniApp
}

export type MenuNode = MenuList | MenuLeaf

export interface MenuModel {
  root: MenuList
  /** 待机显示居中大时钟（1100 有；3310 无） */
  idleClock: boolean
  /** 待机信号为左缘竖虚线列（3310 样式） */
  dashedSignal: boolean
}

const list = (id: string, zh: string, en: string, num: string | undefined, items: MenuNode[]): MenuList =>
  ({ kind: 'list', id, num, label: { zh, en }, items })
const leaf = (id: string, zh: string, en: string, num: string | undefined, app: MiniApp): MenuLeaf =>
  ({ kind: 'app', id, num, label: { zh, en }, app })

// ---------- Nokia 1100（01–11，两位序号） ----------

const N1100: MenuList = list('root', '功能表', 'Menu', undefined, [
  list('m-messages', '信息', 'Messages', '01', [
    leaf('m-write', '写信息', 'Write', '1', messagesApp('write')),
    leaf('m-inbox', '收件箱', 'Inbox', '2', messagesApp('inbox')),
    leaf('m-drafts', '草稿', 'Drafts', '3', messagesApp('drafts')),
    leaf('m-sent', '已发信息', 'Sent items', '4', messagesApp('sent')),
    leaf('m-chat', '聊天', 'Chat', '5', chatApp),
    leaf('m-pic', '图片信息', 'Picture msgs', '6', messagesApp('picture')),
    leaf('m-templates', '常用短语', 'Templates', '7', messagesApp('templates')),
    leaf('m-smileys', '表情符号', 'Smileys', '8', messagesApp('smileys')),
    leaf('m-del', '删除信息', 'Delete messages', '9', messagesApp('delete')),
    leaf('m-mset', '信息设置', 'Message settings', '10', messagesApp('settings')),
  ]),
  list('m-contacts', '通讯录', 'Contacts', '02', [
    leaf('m-ct-search', '查找', 'Search', '1', contactsApp('search')),
    leaf('m-ct-add', '新增联系人', 'Add contact', '2', contactsApp('add')),
    // 真机：编辑/删除/发送名片先出姓名搜索，选中后在名片操作里执行
    leaf('m-ct-edit', '编辑', 'Edit', '3', contactsApp('search')),
    leaf('m-ct-del', '删除', 'Delete', '4', contactsApp('search')),
    leaf('m-ct-card', '发送名片', 'Send card', '5', contactsApp('search')),
    leaf('m-ct-speed', '速拨', 'Speed dials', '6', contactsApp('speed')),
    leaf('m-ct-opt', '设置', 'Options', '7', contactsApp('options')),
  ]),
  list('m-callreg', '通话记录', 'Call register', '03', [
    leaf('m-missed', '未接来电', 'Missed calls', '1', calllogApp('missed')),
    leaf('m-received', '已接来电', 'Received calls', '2', calllogApp('received')),
    leaf('m-dialled', '已拨号码', 'Dialled numbers', '3', calllogApp('dialled')),
    leaf('m-delete', '删除近期记录', 'Delete recent lists', '4', calllogApp('delete')),
    leaf('m-duration', '通话计时', 'Call duration', '5', calllogApp('duration')),
  ]),
  list('m-tones', '铃声设置', 'Tones', '04', [
    leaf('m-tn-ring', '来电铃声', 'Ringing tone', '1', tonesApp('ring')),
    leaf('m-tn-vol', '铃声音量', 'Ringing volume', '2', tonesApp('volume')),
    leaf('m-tn-alert', '来电提醒', 'Incoming call alert', '3', tonesApp('alert')),
    leaf('m-tn-msg', '短信提示音', 'Message alert tone', '4', tonesApp('msg')),
    leaf('m-tn-key', '按键音', 'Keypad tones', '5', tonesApp('key')),
    leaf('m-tn-warn', '警告音', 'Warning tones', '6', tonesApp('warn')),
    leaf('m-tn-vib', '振动', 'Vibrating alert', '7', tonesApp('vibrate')),
  ]),
  leaf('m-profiles', '情景模式', 'Profiles', '05', profilesApp('list')),
  list('m-settings', '设置', 'Settings', '06', [
    leaf('m-ts', '时间设置', 'Time settings', '1', timesetApp),
    leaf('m-cs', '通话设置', 'Call settings', '2', callsetApp),
    leaf('m-ps', '手机设置', 'Phone settings', '3', phonesetApp),
    leaf('m-kg-auto', '自动键盘锁', 'Automatic keyguard', '4', keyguardApp),
    leaf('m-factory', '恢复出厂设置', 'Restore factory settings', '5', factoryApp),
  ]),
  leaf('m-alarm', '闹钟', 'Alarm clock', '07', alarmApp),
  leaf('m-reminders', '备忘事项', 'Reminders', '08', remindersApp),
  list('m-games', '游戏', 'Games', '09', [
    leaf('m-snake', '贪吃蛇II', 'Snake II', '1', snakeApp),
    leaf('m-space', '空间大战', 'Space Impact', '2', spaceImpactApp),
  ]),
  list('m-extras', '附加功能', 'Extras', '10', [
    leaf('m-calc', '计算器', 'Calculator', '1', calculatorApp),
    leaf('m-stopwatch', '秒表', 'Stopwatch', '2', stopwatchApp),
    leaf('m-countdown', '倒计时', 'Countdown timer', '3', countdownApp),
    leaf('m-composer', '作曲家', 'Composer', '4', composerApp),
    leaf('m-torch', '手电筒', 'Flashlight', '5', flashlightApp),
  ]),
  leaf('m-sim', 'SIM 服务', 'SIM services', '11', simApp),
])

// ---------- Nokia 3310（1–13，单位序号） ----------

const N3310: MenuList = list('root', '功能表', 'Menu', undefined, [
  list('b-phonebook', '电话本', 'Phone book', '1', [
    leaf('b-ct-search', '查找', 'Search', '1', contactsApp('search')),
    leaf('b-ct-add', '新增姓名', 'Add name', '2', contactsApp('add')),
    leaf('b-ct-edit', '编辑', 'Edit', '3', contactsApp('search')),
    leaf('b-ct-erase', '删除', 'Erase', '4', contactsApp('search')),
    leaf('b-ct-card', '发送名片', 'Send card', '5', contactsApp('search')),
    leaf('b-ct-speed', '速拨', 'Speed dials', '6', contactsApp('speed')),
    leaf('b-ct-opt', '设置', 'Options', '7', contactsApp('options')),
  ]),
  list('b-messages', '信息', 'Messages', '2', [
    leaf('b-write', '写信息', 'Write', '1', messagesApp('write')),
    leaf('b-inbox', '收件箱', 'Inbox', '2', messagesApp('inbox')),
    // 真机发件箱即已发留存（无独立 Sent）
    leaf('b-outbox', '发件箱', 'Outbox', '3', messagesApp('sent')),
    leaf('b-pic', '图片信息', 'Picture msgs', '4', messagesApp('picture')),
    leaf('b-templates', '常用短语', 'Templates', '5', messagesApp('templates')),
    leaf('b-smileys', '表情符号', 'Smileys', '6', messagesApp('smileys')),
    leaf('b-del', '删除信息', 'Delete messages', '7', messagesApp('delete')),
    leaf('b-mset', '信息设置', 'Message settings', '8', messagesApp('settings')),
  ]),
  leaf('b-chat', '聊天', 'Chat', '3', chatApp),
  list('b-callreg', '通话记录', 'Call register', '4', [
    leaf('b-missed', '未接来电', 'Missed calls', '1', calllogApp('missed')),
    leaf('b-received', '已接来电', 'Received calls', '2', calllogApp('received')),
    leaf('b-dialled', '已拨号码', 'Dialled numbers', '3', calllogApp('dialled')),
    leaf('b-delete', '删除近期记录', 'Delete recent lists', '4', calllogApp('delete')),
    leaf('b-duration', '通话计时', 'Call duration', '5', calllogApp('duration')),
  ]),
  list('b-tones', '铃声设置', 'Tones', '5', [
    leaf('b-tn-ring', '来电铃声', 'Ringing tone', '1', tonesApp('ring')),
    leaf('b-tn-vol', '铃声音量', 'Ringing volume', '2', tonesApp('volume')),
    leaf('b-tn-alert', '来电提醒', 'Incoming call alert', '3', tonesApp('alert')),
    leaf('b-tn-composer', '作曲家', 'Composer', '4', composerApp),
    leaf('b-tn-msg', '短信提示音', 'Message alert tone', '5', tonesApp('msg')),
    leaf('b-tn-key', '按键音', 'Keypad tones', '6', tonesApp('key')),
    leaf('b-tn-warn', '警告音', 'Warning & game tones', '7', tonesApp('warn')),
    leaf('b-tn-vib', '振动', 'Vibrating alert', '8', tonesApp('vibrate')),
  ]),
  list('b-settings', '设置', 'Settings', '6', [
    leaf('b-cs', '通话设置', 'Call settings', '1', callsetApp),
    leaf('b-ps', '手机设置', 'Phone settings', '2', phonesetApp),
    leaf('b-factory', '恢复出厂设置', 'Restore factory settings', '3', factoryApp),
  ]),
  leaf('b-divert', '呼叫转移', 'Call divert', '7', divertApp),
  list('b-games', '游戏', 'Games', '8', [
    leaf('b-snake', '贪吃蛇II', 'Snake II', '1', snakeApp),
    leaf('b-space', '空间大战', 'Space Impact', '2', spaceImpactApp),
    leaf('b-pairs', '翻牌配对', 'Pairs II', '3', pairsApp),
    leaf('b-bantumi', '播棋', 'Bantumi', '4', bantumiApp),
  ]),
  leaf('b-calc', '计算器', 'Calculator', '9', calculatorApp),
  leaf('b-reminders', '备忘事项', 'Reminders', '10', remindersApp),
  list('b-clock', '时钟', 'Clock', '11', [
    leaf('b-alarm', '闹钟', 'Alarm clock', '1', alarmApp),
    leaf('b-clockconf', '时钟设置', 'Clock settings', '2', clockconfApp),
    leaf('b-stopwatch', '秒表', 'Stopwatch', '3', stopwatchApp),
    leaf('b-countdown', '倒计时', 'Countdown timer', '4', countdownApp),
  ]),
  leaf('b-profiles', '情景模式', 'Profiles', '12', profilesApp('list')),
  leaf('b-sim', 'SIM 服务', 'SIM services', '13', simApp),
])

/** 按机型产出菜单模型（OS 不做散落的 id 判断） */
export function buildMenu(profile: DeviceProfile): MenuModel {
  if (profile.id === 'nokia-1100') return { root: N1100, idleClock: true, dashedSignal: false }
  return { root: N3310, idleClock: false, dashedSignal: true }
}

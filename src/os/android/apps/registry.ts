import type { MiniApp } from '../../../kernel/types'
import { clockApp } from './clock'
import { amazonApp } from './amazon'
import { browserApp } from './browser'
import { calculatorApp } from './calculator'
import { calendarApp } from './calendar'
import { cameraApp } from './camera'
import { contactsApp } from './contacts'
import { dialerApp } from './dialer'
import { emailApp } from './email'
import { gmailApp } from './gmail'
import { imApp } from './im'
import { mapsApp } from './maps'
import { marketApp } from './market'
import { messagesApp } from './messages'
import { musicApp } from './music'
import { picturesApp } from './pictures'
import { settingsApp } from './settings'
import { voiceDialerApp } from './voicedialer'
import { youtubeApp } from './youtube'

/**
 * 应用列表惰性构建：registry 被 settings 循环引用，
 * 模块求值阶段直接构造数组会访问尚未初始化的 settingsApp（TDZ）。
 * 代理把一切访问推迟到首次运行时调用（此刻所有模块均已就绪）。
 */
let built: Readonly<MiniApp[]> | null = null
function all(): Readonly<MiniApp[]> {
  if (!built) built = [
    clockApp, // Alarm Clock
    amazonApp, // Amazon MP3
    browserApp, // Browser
    calculatorApp, // Calculator
    calendarApp, // Calendar
    cameraApp, // Camera
    contactsApp, // Contacts
    dialerApp, // Dialer
    emailApp, // Email
    gmailApp, // Gmail
    imApp, // IM
    mapsApp, // Maps
    marketApp, // Market
    messagesApp, // Messaging
    musicApp, // Music
    picturesApp, // Pictures
    settingsApp, // Settings
    voiceDialerApp, // Voice Dialer
    youtubeApp, // YouTube
  ]
  return built
}

export const APPS: ReadonlyArray<MiniApp> = new Proxy([] as MiniApp[], {
  get(_t, prop, recv) {
    return Reflect.get(all(), prop, recv)
  },
  has(_t, prop) {
    return Reflect.has(all(), prop)
  },
})

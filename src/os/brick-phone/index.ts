import type { PhoneOS, PhoneOSFactory, OSDeps } from '../../kernel/types'
import type { DeviceKey } from '../../hal/input'
import type { Msg } from '../feature-phone/apps/messages'
import { T9 } from '../feature-phone/t9'
import { brickStrings } from './strings'
import { loadContacts, type Contact } from '../../scenario/data'

/**
 * 大哥大系统（1992）：没有功能表、没有应用生态 ——
 * 待机、拨号、通话、电话本、短信，仅此而已。与功能机共用 HAL、
 * T9 输入引擎和「妈妈」短信生态，但 UI 全然是另一个时代：
 * 更小的屏、更少的层级、按分钟计费的仪式感。
 */

/** 开机音（自创，方正气的小三度上行） */
const BOOT_JINGLE: ReadonlyArray<readonly [number, number]> = [
  [57, 1], [60, 1], [64, 2], [60, 1], [64, 3],
]
/** 来信提示：老式急促双哔（90 年代大哥大没有旋律短信音） */
const RING: ReadonlyArray<readonly [number, number]> = [
  [93, 0.5], [0, 0.5], [93, 1],
]
/** Vol 1–4 对应的主音量 */
const VOL_GAINS = [0.15, 0.3, 0.45, 0.65]

export default {
  create(deps: OSDeps): PhoneOS {
    return new BrickOS(deps)
  },
} satisfies PhoneOSFactory

type State =
  | 'off' | 'boot' | 'shutdown'
  | 'idle' | 'dial' | 'calling' | 'call'
  | 'list' | 'read' | 'compose' | 'sending' | 'sent'
  | 'contacts' | 'ringing' | 'incall' | 'save'

class BrickOS implements PhoneOS {
  private state: State = 'off'
  private powered = false
  private offs: Array<() => void> = []
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private expireInt: ReturnType<typeof setInterval> | null = null
  private ringInt: ReturnType<typeof setInterval> | null = null
  /** 动画时钟（秒）：开机进度 / 呼叫动画 / 通话计时 / 光标闪烁共用 */
  private t = 0
  private dial = ''
  private inbox: Msg[] = []
  private sel = 0
  private readLine = 0
  private t9 = new T9()
  private draft = ''
  unread = false
  /** 通讯录缓存 */
  private contacts: Contact[] = []
  /** 来电信息 / 暂存来电 / 通话接通时刻 */
  private incoming: { tel: string; name?: string } | null = null
  private pendingIncoming: { tel: string; name?: string } | null = null
  private missTimer: ReturnType<typeof setTimeout> | null = null
  /** Vol 1–4 / Fcn 快速静音 / 响铃中已 Fcn 静音 */
  private vol = 3
  private silent = false
  private ringMuted = false
  /** 短暂底部提示（VOL n / 已存储 等） */
  private toast = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  readonly deps: OSDeps

  constructor(deps: OSDeps) {
    this.deps = deps
  }

  start(): void {
    void this.init()
  }

  private async init() {
    await this.deps.battery.init()
    await this.seedMessages()
    await this.refreshUnread()
    this.watchStore()
    this.inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    this.contacts = await loadContacts(this.deps.store.get.bind(this.deps.store))
    this.vol = (await this.deps.store.get<number>('brick:vol')) ?? 3
    this.silent = (await this.deps.store.get<boolean>('brick:silent')) ?? false
    this.applyVolume()
    this.offs.push(this.deps.input.subscribe((k) => this.onInput(k)))
    this.offs.push(this.deps.lang.onChange(() => this.onLangChange()))
    // 统一的帧驱动：大哥大界面简单，全部状态每帧自绘
    this.offs.push(
      this.deps.frames.add((dt) => {
        if (!this.powered || this.state === 'off' || this.state === 'shutdown') return
        this.t += dt
        this.draw()
      }),
    )
    // 多击轮选到期提交
    this.expireInt = setInterval(() => {
      if (this.state !== 'compose' && this.state !== 'save') return
      const out = this.t9.expire()
      if (out) this.appendDraft(out)
    }, 100)
    this.drawOff()
  }

  /** 语言切换：重播种子短信；界面每帧自绘自然跟随 */
  private onLangChange() {
    if (this.state === 'off' || this.state === 'boot' || this.state === 'shutdown') return
    void this.seedMessages()
    this.t9.setMode(this.deps.lang.get() === 'en' ? 'en' : 'py')
  }

  stop(): void {
    this.state = 'off'
    this.powered = false
    this.stopRingback()
    this.stopRinging()
    if (this.expireInt) {
      clearInterval(this.expireInt)
      this.expireInt = null
    }
    for (const t of this.timers.splice(0)) clearTimeout(t)
    for (const off of this.offs.splice(0)) off()
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  // ---------- 电源 ----------

  private onInput(key: DeviceKey) {
    if (key === 'power') {
      if (!this.powered) this.boot()
      else this.shutdown()
      return
    }
    if (!this.powered || this.state === 'off' || this.state === 'boot' || this.state === 'shutdown') return
    if (/^[0-9*#]$/.test(key)) this.deps.audio.dtmf(key)
    else this.deps.audio.keypad()
    switch (this.state) {
      case 'idle':
        this.idleKey(key)
        break
      case 'dial':
        this.dialKey(key)
        break
      case 'calling':
      case 'call':
        if (key === 'end' || key === 'clear' || key === 'back') this.endCall()
        break
      case 'list':
        this.listKey(key)
        break
      case 'read':
        this.readKey(key)
        break
      case 'compose':
        this.composeKey(key)
        break
      case 'save':
        this.saveKey(key)
        break
      case 'contacts':
        this.contactsKey(key)
        break
      case 'ringing':
        this.ringingKey(key)
        break
      case 'incall':
        if (key === 'end' || key === 'clear' || key === 'back') this.endInCall()
        break
      case 'sent':
        this.toList()
        break
      default:
        break
    }
  }

  private boot() {
    this.powered = true
    this.state = 'boot'
    this.t = 0
    this.deps.audio.unlock()
    this.deps.audio.melody(BOOT_JINGLE, 220)
    this.timers.push(setTimeout(() => {
      if (this.state === 'boot') this.enterIdle()
    }, 2400))
  }

  private shutdown() {
    if (this.state === 'shutdown' || this.state === 'off') return
    this.state = 'shutdown'
    this.stopRingback()
    for (const t of this.timers.splice(0)) clearTimeout(t)
    let flashes = 0
    let acc = 0
    const off = this.deps.frames.add((dt) => {
      acc += dt
      if (acc < 0.13) return
      acc = 0
      this.deps.screen.invertRect(0, 0, this.deps.screen.w, this.deps.screen.h)
      if (++flashes >= 6) {
        off()
        this.powered = false
        this.state = 'off'
        this.drawOff()
      }
    })
  }

  private drawOff() {
    this.deps.screen.clear()
    this.deps.screen.render()
  }

  private enterIdle() {
    this.state = 'idle'
    this.dial = ''
    this.t = 0
    // 离开 app / 通话后补放暂存来电
    if (this.pendingIncoming) {
      const p = this.pendingIncoming
      this.pendingIncoming = null
      this.enterRinging(p.tel, p.name)
    }
  }

  // ---------- Vol / Fcn / toast ----------

  private cycleVol() {
    this.vol = (this.vol % 4) + 1
    this.silent = false
    this.applyVolume()
    void this.deps.store.set('brick:vol', this.vol)
    void this.deps.store.set('brick:silent', false)
    const s = brickStrings(this.deps.lang.get())
    this.showToast(`${s.volLabel} ${this.vol}`)
  }

  private toggleSilent() {
    this.silent = !this.silent
    this.applyVolume()
    void this.deps.store.set('brick:silent', this.silent)
    const s = brickStrings(this.deps.lang.get())
    this.showToast(this.silent ? s.silentOn : s.silentOff)
  }

  private applyVolume() {
    this.deps.audio.setMasterVolume(this.silent ? 0 : VOL_GAINS[this.vol - 1]!)
  }

  private showToast(msg: string, ms = 1300) {
    this.toast = msg
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null
      this.toast = ''
    }, ms)
  }

  // ---------- 拨号 / 通话 ----------

  private idleKey(k: DeviceKey) {
    if (/^[0-9*#]$/.test(k)) {
      this.dial = k
      this.state = 'dial'
    } else if (k === 'mr') {
      this.toContacts()
    } else if (k === 'menu') {
      this.toList()
    } else if (k === 'vol') {
      this.cycleVol()
    } else if (k === 'fcn') {
      this.toggleSilent()
    }
    // Call/End/M+/up/down 在待机无效（无记录可重拨）
  }

  private dialKey(k: DeviceKey) {
    if (/^[0-9*#]$/.test(k)) {
      if (this.dial.length < 12) this.dial += k
    } else if (k === 'clear') {
      this.dial = this.dial.slice(0, -1)
      if (!this.dial) this.enterIdle()
    } else if (k === 'call') {
      this.startCall()
    } else if (k === 'end' || k === 'back') {
      this.enterIdle()
    } else if (k === 'mplus') {
      this.beginSave()
    } else if (k === 'vol') {
      this.cycleVol()
    } else if (k === 'fcn') {
      this.toggleSilent()
    }
  }

  private startCall() {
    if (!this.dial) return
    this.state = 'calling'
    this.t = 0
    // 回铃音：440+480Hz 双音频（真机拨通前的等待音）
    this.deps.audio.ringbackTone(0.4)
    this.ringInt = setInterval(() => this.deps.audio.ringbackTone(0.4), 1200)
    this.timers.push(setTimeout(() => {
      this.stopRingback()
      if (this.state === 'calling') {
        this.state = 'call'
        this.t = 0
      }
    }, 2600))
  }

  private endCall() {
    this.stopRingback()
    this.enterIdle()
  }

  private stopRingback() {
    if (this.ringInt) {
      clearInterval(this.ringInt)
      this.ringInt = null
    }
  }

  // ---------- 电话本 ----------

  private toContacts() {
    this.state = 'contacts'
    this.sel = 0
  }

  private contactsKey(k: DeviceKey) {
    const n = this.contacts.length
    if (!n) {
      if (k === 'end' || k === 'clear' || k === 'back' || k === 'mr') this.enterIdle()
      return
    }
    switch (k) {
      case 'mr':
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'call': {
        const c = this.contacts[this.sel]!
        this.dial = c.tel
        this.startCall()
        return
      }
      case 'end':
      case 'clear':
      case 'back':
        this.enterIdle()
        return
      case 'vol':
        this.cycleVol()
        return
      case 'fcn':
        this.toggleSilent()
        return
      default:
        return
    }
  }

  // ---------- 来电 ----------

  /** 来电：idle 直接响铃，否则暂存待回到 idle 触发 */
  incomingCall(tel: string, name?: string) {
    if (!this.powered || this.state === 'off' || this.state === 'boot' || this.state === 'shutdown') {
      this.pendingIncoming = { tel, name }
      return
    }
    if (this.state === 'idle') this.enterRinging(tel, name)
    else this.pendingIncoming = { tel, name }
  }

  private enterRinging(tel: string, name?: string) {
    this.incoming = { tel, name }
    this.state = 'ringing'
    this.t = 0
    this.ringMuted = false
    this.deps.audio.unlock()
    // 双哔循环铃声
    this.deps.audio.melody(RING, 200)
    this.ringInt = setInterval(() => {
      this.deps.audio.melody(RING, 200)
    }, 1400)
    // ~15s 未接 → 漏接
    this.missTimer = setTimeout(() => {
      if (this.state === 'ringing') this.rejectCall()
    }, 15000)
    this.timers.push(this.missTimer)
  }

  private ringingKey(k: DeviceKey) {
    if (k === 'call' || k === 'ok') this.answerCall()
    else if (k === 'end' || k === 'back' || k === 'clear') this.rejectCall()
    else if (k === 'fcn') this.muteRing()
  }

  private answerCall() {
    this.stopRinging()
    this.state = 'incall'
    this.t = 0
  }

  private rejectCall() {
    this.stopRinging()
    this.incoming = null
    this.enterIdle()
  }

  /** Fcn：只静音铃声，不拒接（仍可接听，超时仍漏接） */
  private muteRing() {
    if (this.ringMuted) return
    this.ringMuted = true
    this.stopRingback()
  }

  private endInCall() {
    this.incoming = null
    this.enterIdle()
  }

  private stopRinging() {
    this.stopRingback()
    if (this.missTimer) {
      clearTimeout(this.missTimer)
      this.missTimer = null
    }
  }

  /** 来短信：追加收件箱 + 提示音 */
  injectSms(from: string, text: string) {
    void this.deliverIncoming(from, text)
  }

  private async deliverIncoming(from: string, text: string) {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    inbox.push({ id: Date.now(), from, text, ts: Date.now(), read: false, mine: false })
    await this.deps.store.set('messages:inbox', inbox)
    this.inbox = inbox
    this.unread = true
    if (this.powered && this.state !== 'off' && this.state !== 'boot') {
      this.deps.audio.unlock()
      this.deps.audio.melody(RING, 200)
    }
  }

  // ---------- 短信 ----------

  private listKey(k: DeviceKey) {
    const n = this.inbox.length
    if (!n) {
      if (k === '#') this.toCompose()
      else if (k === 'menu' || k === 'end' || k === 'clear' || k === 'back') this.enterIdle()
      return
    }
    switch (k) {
      case 'up':
        this.sel = (this.sel + n - 1) % n
        break
      case 'down':
        this.sel = (this.sel + 1) % n
        break
      case 'mr': {
        const m = this.inbox[this.sel]
        m.read = true
        void this.deps.store.set('messages:inbox', this.inbox)
        this.readLine = 0
        this.state = 'read'
        break
      }
      case '#':
        this.toCompose()
        return
      case 'menu':
      case 'end':
      case 'clear':
      case 'back':
        this.enterIdle()
        return
      case 'vol':
        this.cycleVol()
        return
      default:
        return
    }
  }

  private readKey(k: DeviceKey) {
    const m = this.inbox[this.sel]
    const lines = wrapHan(m?.text ?? '', 6)
    switch (k) {
      case 'up':
        this.readLine = Math.max(0, this.readLine - 1)
        break
      case 'down':
        this.readLine = Math.min(Math.max(0, lines.length - 1), this.readLine + 1)
        break
      case 'mr':
        if (m && !m.mine) this.toCompose()
        break
      case 'menu':
      case 'end':
      case 'clear':
      case 'back':
        this.toList()
        return
      default:
        return
    }
  }

  private composeKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.appendDraft(out)
    } else if (k === 'ok' || k === 'mr') {
      const out = this.t9.select()
      if (out) this.appendDraft(out)
    } else if (k === 'up') {
      this.t9.cycleCand(-1)
    } else if (k === 'down') {
      this.t9.cycleCand(1)
    } else if (k === 'clear') {
      // 无输入缓冲时：有草稿删字，空草稿则切 alpha/数字模式（真机 a/c 行为）
      if (this.t9.digits.length || this.t9.cands.length) {
        if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
      } else if (this.draft) {
        this.draft = this.draft.slice(0, -1)
      } else {
        this.t9.cycleMode()
      }
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'call') {
      if (this.draft.trim().length) this.send()
    } else if (k === 'menu' || k === 'end' || k === 'back') {
      this.toList()
      return
    } else {
      return
    }
  }

  private toList() {
    this.state = 'list'
    this.sel = Math.min(this.sel, Math.max(0, this.inbox.length - 1))
    this.t9.reset()
  }

  private toCompose() {
    this.state = 'compose'
    this.draft = ''
    this.t9.setMode(this.deps.lang.get() === 'en' ? 'en' : 'py')
    this.t9.reset()
  }

  private send() {
    this.state = 'sending'
    this.t = 0
    this.timers.push(setTimeout(() => void this.delivered(), 1600))
  }

  private async delivered() {
    if (this.state !== 'sending') return
    this.state = 'sent'
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? this.inbox
    inbox.push({
      id: Date.now(),
      from: brickStrings(this.deps.lang.get()).recipient,
      text: this.draft,
      ts: Date.now(),
      read: true,
      mine: true,
    })
    await this.deps.store.set('messages:inbox', inbox)
    this.inbox = inbox
    this.draft = ''
    this.t9.reset()
    this.scheduleReply()
    this.timers.push(setTimeout(() => {
      if (this.state === 'sent') this.toList()
    }, 1100))
  }

  private appendDraft(s: string) {
    if (this.draft.length + s.length <= 20) this.draft += s
  }

  // ---------- M+ 存号命名 ----------

  private beginSave() {
    if (!this.dial) return
    this.state = 'save'
    this.draft = ''
    this.t9.setMode(this.deps.lang.get() === 'en' ? 'en' : 'py')
    this.t9.reset()
  }

  private saveKey(k: DeviceKey) {
    if (/^[0-9]$/.test(k)) {
      const out = this.t9.press(k)
      if (out) this.appendDraft(out)
    } else if (k === 'ok' || k === 'mr') {
      const out = this.t9.select()
      if (out) this.appendDraft(out)
    } else if (k === 'up') {
      this.t9.cycleCand(-1)
    } else if (k === 'down') {
      this.t9.cycleCand(1)
    } else if (k === 'clear') {
      if (this.t9.digits.length) {
        if (this.t9.backspace() === 'char') this.draft = this.draft.slice(0, -1)
      } else if (this.draft) {
        this.draft = this.draft.slice(0, -1)
      }
    } else if (k === '#') {
      this.t9.cycleMode()
    } else if (k === 'call') {
      this.confirmSave()
    } else if (k === 'menu' || k === 'end' || k === 'back') {
      this.enterIdle()
    }
  }

  private async confirmSave() {
    const s = brickStrings(this.deps.lang.get())
    const c: Contact = { name: this.draft.trim() || s.contactsEmpty, tel: this.dial }
    const list = [...this.contacts, c]
    await this.deps.store.set('contacts', list)
    this.contacts = list
    this.dial = ''
    this.draft = ''
    this.t9.reset()
    this.showToast(s.saved)
    this.enterIdle()
  }

  // ---------- 短信生态（种子 / 自动回复） ----------

  private async seedMessages() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    const s = brickStrings(this.deps.lang.get())
    if (inbox) {
      // 原封种子跟随语言重播；有过收发就像真手机一样保留原语言
      const seedTexts: string[] = [
        ...Object.values(BRICK_SEED_TEXTS.zh),
        ...Object.values(BRICK_SEED_TEXTS.en),
      ]
      const pristine =
        inbox.length === 2 && inbox.every((m) => seedTexts.includes(m.text))
      if (!pristine) return
    }
    const now = Date.now()
    await this.deps.store.set('messages:inbox', [
      { id: now - 7200_000, from: s.serviceNum, text: s.seedWelcome, ts: now - 7200_000, read: false, mine: false },
      { id: now - 3600_000, from: s.recipient, text: s.seedMom, ts: now - 3600_000, read: false, mine: false },
    ] satisfies Msg[])
  }

  private scheduleReply() {
    const delay = 4500 + Math.random() * 4500
    this.timers.push(setTimeout(() => void this.deliverReply(), delay))
  }

  private async deliverReply() {
    const inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? []
    const s = brickStrings(this.deps.lang.get())
    inbox.push({
      id: Date.now(),
      from: s.recipient,
      text: s.replies[Math.floor(Math.random() * s.replies.length)],
      ts: Date.now(),
      read: false,
      mine: false,
    })
    await this.deps.store.set('messages:inbox', inbox)
    this.deps.audio.unlock()
    this.deps.audio.melody(RING, 200)
  }

  private async refreshUnread() {
    const inbox = await this.deps.store.get<Msg[]>('messages:inbox')
    this.unread = !!inbox?.some((m) => !m.read && !m.mine)
  }

  private watchStore() {
    const prefix = `${this.deps.profile.id}:`
    this.offs.push(
      this.deps.store.onChange(async (fk) => {
        if (fk === `${prefix}*` || fk.startsWith(`${prefix}messages:`)) {
          await this.refreshUnread()
          if (this.state === 'list' || this.state === 'read') {
            this.inbox = (await this.deps.store.get<Msg[]>('messages:inbox')) ?? this.inbox
          }
        }
      }),
    )
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.deps.screen
    const str = brickStrings(this.deps.lang.get())
    s.clear()
    switch (this.state) {
      case 'boot':
        this.drawBoot()
        break
      case 'idle':
        this.drawIdle(str)
        break
      case 'dial':
        this.drawDial(str)
        break
      case 'calling':
        this.drawCalling(str)
        break
      case 'call':
        this.drawCall(str)
        break
      case 'list':
        this.drawList(str)
        break
      case 'read':
        this.drawRead()
        break
      case 'compose':
        this.drawCompose(str)
        break
      case 'save':
        this.drawSave(str)
        break
      case 'contacts':
        this.drawContacts(str)
        break
      case 'ringing':
        this.drawRinging(str)
        break
      case 'incall':
        this.drawInCall(str)
        break
      case 'sending':
        s.textCenter(s.w >> 1, 14, str.msgsSending, { size: 9 })
        s.textCenter(s.w >> 1, 28, '.'.repeat(Math.floor(this.t * 2) % 4))
        break
      case 'sent':
        s.textCenter(s.w >> 1, 12, str.msgsSent, { size: 14 })
        s.bitmap((s.w >> 1) - 4, 30, [
          '......##',
          '.....##.',
          '#...##..',
          '##.##...',
          '.###....',
          '..#.....',
        ])
        break
      default:
        break
    }
    if (this.state !== 'boot') this.drawStatus()
    if (this.toast) this.drawToast()
    s.render()
  }

  /** 底部反白提示条（VOL n / 已存储 等） */
  private drawToast() {
    const s = this.deps.screen
    const y = s.h - 11
    s.fillRect(6, y, s.w - 12, 9)
    s.textCenter(s.w >> 1, y + 1, this.toast, { size: 9, color: 0 })
    s.invertRect(6, y, s.w - 12, 9)
  }

  /** 状态条：信号 / 未读信封 / 电量（90 年代风格：左信号阶梯、右电量条，留缝不顶满） */
  private drawStatus() {
    const s = this.deps.screen
    const { battery } = this.deps
    const bars = 3 + Math.round(Math.sin(this.t / 9) * 0.9)
    for (let i = 0; i < 4; i++) {
      const h = 2 + i * 2
      if (i < bars) s.fillRect(2 + i * 3, 9 - h, 2, h)
      else s.frameRect(2 + i * 3, 9 - h, 2, h)
    }
    // 电量条：边框 + 内部填充留 1px 上下边距
    const cells = Math.ceil(battery.percent / 25)
    s.frameRect(54, 1, 15, 7)
    for (let i = 0; i < 4; i++) {
      if (i < cells) s.fillRect(55 + i * 4, 3, 3, 3)
    }
    if (this.unread && Math.floor(this.t * 2) % 2 === 0) {
      s.bitmap(32, 1, [
        '########',
        '#......#',
        '##....##',
        '#.#..#.#',
        '#..##..#',
        '#......#',
        '########',
      ])
    }
  }

  private drawBoot() {
    const s = this.deps.screen
    const cx = Math.floor(s.w / 2)
    const maker = this.deps.profile.maker
    // 90 年代摩托罗拉开机：厂牌名居中 + 短暂自检行（无图形 Logo）
    s.textCenter(cx, 18, maker, { size: 12 })
    // 自检进度：逐字点亮的自检行，~2.1s 完成
    const p = Math.min(1, this.t / 2.1)
    const probe = 'SELF TEST'
    const n = Math.floor(p * probe.length)
    s.textCenter(cx, 34, probe.slice(0, n) || ' ', { size: 9 })
  }

  /** 待机：运营商 + 大号日期 + 星期全拼（真机不显示时钟） */
  private drawIdle(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = s.w >> 1
    const d = new Date()
    s.textCenter(cx, 9, str.operator, { size: 9 })
    s.textCenter(cx, 16, String(d.getDate()), { size: 20 })
    s.textCenter(cx, 38, str.weekdays[d.getDay()]!, { size: 9 })
  }

  private drawDial(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = Math.floor(s.w / 2)
    const cursor = Math.floor(this.t * 2) % 2 === 0 ? '_' : ''
    s.textCenter(cx, 16, this.dial ? this.dial + cursor : cursor, { size: 12 })
    s.text(1, s.h - 11, str.dialCall, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.dialExit, { size: 9 })
  }

  private drawCalling(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = Math.floor(s.w / 2)
    s.textCenter(cx, 14, str.calling, { size: 9 })
    s.textCenter(cx, 26, this.dial, { size: 9 })
    s.textCenter(cx, 34, '.'.repeat(Math.floor(this.t * 2) % 4), { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.endCall, { size: 9 })
  }

  private drawCall(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = Math.floor(s.w / 2)
    s.textCenter(cx, 12, str.inCall, { size: 9 })
    const sec = Math.floor(this.t)
    const mm = String(Math.floor(sec / 60)).padStart(2, '0')
    const ss = String(sec % 60).padStart(2, '0')
    s.textCenter(cx, 24, `${mm}:${ss}`, { size: 14 })
    s.textRight(s.w - 1, s.h - 11, str.endCall, { size: 9 })
  }

  private drawList(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = Math.floor(s.w / 2)
    if (!this.inbox.length) {
      s.textCenter(cx, 18, str.noMsgs, { size: 9 })
      s.text(1, s.h - 11, `# ${str.listWrite}`, { size: 9 })
      s.textRight(s.w - 1, s.h - 11, str.listExit, { size: 9 })
      return
    }
    const top = this.sel > 0 ? Math.min(this.sel, this.inbox.length - 2) : 0
    for (let r = 0; r < 2; r++) {
      const i = top + r
      if (i >= this.inbox.length) break
      const m = this.inbox[i]!
      const y = 11 + r * 13
      s.text(1, y, m.mine ? `${str.toPrefix}${m.from}` : m.from, { size: 9 })
      if (!m.read && !m.mine) s.fillRect(s.w - 5, y + 3, 3, 3)
      // 先绘文字再反色：选中条翻转文字像素，呈「亮条暗字」并完全覆盖
      if (i === this.sel) s.invertRect(0, y - 1, s.w, 13)
    }
    s.text(1, s.h - 11, `MR ${str.listOpen}`, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.listExit, { size: 9 })
  }

  private drawRead() {
    const s = this.deps.screen
    const str = brickStrings(this.deps.lang.get())
    const cx = Math.floor(s.w / 2)
    const m = this.inbox[this.sel]
    if (!m) return
    const t = new Date(m.ts)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    s.textCenter(cx, 10, `${m.from} ${hh}:${mm}`, { size: 9 })
    const lines = wrapHan(m.text, 6)
    s.text(1, 22, lines[this.readLine] ?? '', { size: 12 })
    if (lines.length > 1) {
      s.textCenter(cx, s.h - 11, `${this.readLine + 1}/${lines.length}`, { size: 9 })
    }
    s.text(1, s.h - 11, m.mine ? '' : `MR ${str.readReply}`, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.readBack, { size: 9 })
  }

  private drawCompose(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    s.text(1, 1, { py: str.imePy, en: str.imeEn, num: str.imeNum }[this.t9.mode], { size: 9 })
    const hint = this.t9.hint()
    if (hint) s.textRight(s.w - 1, 1, hint, { size: 9 })
    s.fillRect(0, 11, s.w, 1)
    const active =
      this.t9.digits.length > 0 || (this.t9.mode === 'en' && this.t9.hint().length > 0)
    if (active) {
      // 候选行（输入中）：选中项反显
      const cands = this.t9.cands.slice(0, 4)
      cands.forEach((c, i) => {
        const x = 1 + i * 17
        s.text(x, 16, c, { size: 9 })
        if (i === this.t9.candIdx) s.invertRect(x - 1, 15, 13, 13)
      })
    } else {
      // 正文行（无输入时）：显示末尾几个字 + 闪烁光标
      const vis = this.draft.length > 5 ? this.draft.slice(-5) : this.draft
      const x = s.text(1, 16, vis, { size: 12 })
      if (Math.floor(this.t * 2) % 2 === 0) s.fillRect(Math.min(x, s.w - 3), 18, 2, 8)
    }
    s.fillRect(0, 29, s.w, 1)
    s.text(1, s.h - 11, str.composeSend, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.composeExit, { size: 9 })
  }

  /** M+ 命名屏 */
  private drawSave(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    s.textCenter(s.w >> 1, 9, str.nameEntry, { size: 9 })
    s.text(1, 20, this.draft, { size: 12 })
    s.text(1, s.h - 11, str.saveConfirm, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.saveCancel, { size: 9 })
  }

  private drawContacts(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const cx = s.w >> 1
    s.textCenter(cx, 1, str.contactsTitle, { size: 9 })
    s.invertRect(0, 0, s.w, 11)
    if (!this.contacts.length) {
      s.textCenter(cx, 20, str.contactsEmpty, { size: 9 })
      s.textRight(s.w - 1, s.h - 11, str.contactsBack, { size: 9 })
      return
    }
    const c = this.contacts[this.sel]!
    const cy = 18
    s.textCenter(cx, cy, c.name, { size: 12 })
    s.textCenter(cx, cy + 12, c.tel, { size: 9 })
    s.textRight(s.w - 2, 2, `${this.sel + 1}/${this.contacts.length}`, { size: 9 })
    s.text(1, s.h - 11, str.contactsCall, { size: 9 })
    s.textRight(s.w - 1, s.h - 11, str.contactsBack, { size: 9 })
  }

  private drawRinging(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const W = s.w; const H = s.h
    // 与 3310 RingingUI 同一几何：title y8 / 名称 size12 y16 / 号码 y28 / 标签 yH-11
    const blink = Math.floor(this.t * 2) % 2 === 0
    if (blink || this.ringMuted) s.textCenter(W >> 1, 8, str.incomingCall, { size: 9 })
    const inc = this.incoming
    if (inc) {
      s.textCenter(W >> 1, 16, inc.name ?? inc.tel, { size: 12 })
      if (inc.name) s.textCenter(W >> 1, 28, inc.tel, { size: 9 })
    }
    if (this.ringMuted) s.textCenter(W >> 1, H - 11, str.ringMuted, { size: 9 })
    else {
      s.text(1, H - 11, str.incomingAnswer, { size: 9 })
      s.textRight(W - 1, H - 11, str.incomingReject, { size: 9 })
    }
  }

  private drawInCall(str: ReturnType<typeof brickStrings>) {
    const s = this.deps.screen
    const W = s.w; const H = s.h
    // 紧凑几何（72px 窄屏）：title y8 / 名称 size9 y17 / 计时 size12 y25 / 标签 yH-11
    s.textCenter(W >> 1, 8, str.inCall, { size: 9 })
    const inc = this.incoming
    if (inc) s.textCenter(W >> 1, 17, inc.name ?? inc.tel, { size: 9 })
    const sec = Math.floor(this.t)
    const mm = String(Math.floor(sec / 60)).padStart(2, '0')
    const ss = String(sec % 60).padStart(2, '0')
    s.textCenter(W >> 1, 25, `${mm}:${ss}`, { size: 12 })
    s.textRight(W - 1, H - 11, str.endCall, { size: 9 })
  }
}

/** 按字宽换行（12px 汉字 → 每行 n 字） */
function wrapHan(s: string, per: number): string[] {
  const lines: string[] = []
  for (let i = 0; i < s.length; i += per) lines.push(s.slice(i, i + per))
  return lines.length ? lines : ['']
}

/** 种子文案表（原封检测用，两语言的欢迎/妈妈短信） */
const BRICK_SEED_TEXTS = {
  zh: { welcome: '欢迎使用大哥大！本月话费已超支，请尽快到营业厅缴费。', mom: '长途费贵，长话短说。周末回家吃饭吗？' },
  en: { welcome: 'Welcome! Your bill is overdue - please pay at a service hall soon.', mom: 'Long distance is pricey, keep it short. Dinner this weekend?' },
} as const

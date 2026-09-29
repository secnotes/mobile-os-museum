import type { AppContext, MiniApp } from '../../../kernel/types'
import type { Screen } from '../../../hal/screen'
import { Keyboard, type KbAction } from '../keyboard'
import { SB_H } from '../statusbar'
import { PinyinIme } from '../../wp7/ime'
import { ipStrings, type IpStrings } from '../strings'
import type { IconDrawer } from '../icons'
import type { Contact, CallEntry } from '../../../scenario/data'

// ---------- 数据模型 ----------

export interface SmsMsg {
  dir: 'in' | 'out'
  text: string
  ts: number
}
export interface SmsThread {
  tel: string
  name: string
  msgs: SmsMsg[]
  /** 未读条数（Springboard 角标用） */
  unread?: number
}

export interface PhotoMeta {
  id: number
  seed: number
  ts: number
  /** 素材照片文件名（存在则渲染真实照片，否则用 seed 程序化生成） */
  src?: string
}

/** OS 桥（系统类实现，app 经它使用跨应用能力） */
export interface Bridge {
  now(): Date
  batteryPct(): number
  contacts(): Contact[]
  saveContacts(c: Contact[]): void
  callLog(): CallEntry[]
  /** 清空最近通话（Recents 的 Clear 按钮） */
  clearRecents(): void
  /** 查看最近通话后清除 Phone 图标的未接角标 */
  clearMissed(): void
  startCall(num: string, name?: string): void
  getThreads(): SmsThread[]
  /** 切换到短信应用（Phone 详情），OS 负责应用跳转 */
  threadOf(tel: string, name?: string): void
  sendSms(tel: string, text: string): void
  markThreadRead(tel: string): void
  unreadCount(): number
  ringIdx(): number
  setRingIdx(i: number): void
  setLang(l: 'zh' | 'en'): void
  photos(): PhotoMeta[]
  addPhoto(): PhotoMeta
  setWallpaper(i: number): void
  /** Phone 详情→短信：OS 切换应用时携带的目标号码，Text 启动后消费 */
  pendingThreadTel?: string | null
}

// ---------- 应用基类 ----------

/**
 * iPhone 应用基类：统一输入路由、软键盘、拼音 IME、词条。
 * 子类覆盖 draw/tap/drag/dragEnd/frame。
 */
export abstract class IphoneApp {
  protected kb: Keyboard = new Keyboard(() => this.draw())
  protected ime = new PinyinIme()
  /** 键盘是否弹出 */
  protected kbOn = false
  protected str: IpStrings
  protected blink = 0
  /**
   * 列表行武装动作：按下命中行时暂存，抬手且未发生拖拽才执行——
   * 真机 UIScrollView 语义（起手滚动不会激活所在行）。
   */
  private armedFn: (() => void) | null = null

  constructor(protected ctx: AppContext, protected bridge: Bridge) {
    this.str = ipStrings(ctx.lang.get())
  }

  start() {
    // 真机系统行为：点状态栏 → 当前滚动视图回顶部（子类经 statusTap 接线）
    this.ctx.onTap((x, y) => {
      this.armedFn = null // 新一次按下：清掉上一次的武装
      if (y < SB_H && this.statusTap()) return
      this.tap(x, y)
    })
    // 抬起且未拖拽（机壳保证 tapUp 仅此时派发）：执行武装的行动作
    this.ctx.onTapUp(() => {
      const fn = this.armedFn
      this.armedFn = null
      fn?.()
    })
    this.ctx.onDrag((x, y, sx, sy) => this.drag(x, y, sx, sy))
    this.ctx.onDragEnd((moved) => this.dragEnd(moved))
    this.ctx.onLongPress((x, y) => this.longPress(x, y))
    this.ctx.onWheel((dy) => this.wheel(dy))
    this.ctx.onFrame((dt) => this.frame(dt))
    this.ctx.onLang(() => {
      this.str = ipStrings(this.ctx.lang.get())
      this.draw()
    })
    // 首帧：子类 start 经 super.start() 统一触发首次绘制
    this.draw()
  }

  protected abstract draw(): void
  protected tap(_x: number, _y: number): void {}
  /** 状态栏点按：返回 true=已消费（子类令活跃滚动视图回顶） */
  protected statusTap(): boolean {
    return false
  }
  /** 列表行点按：抬手确认，拖拽滚动自动取消（真机行激活语义） */
  protected rowPress(fn: () => void) {
    this.armedFn = fn
  }
  protected longPress(_x: number, _y: number): void {}
  protected drag(_x: number, _y: number, _sx: number, _sy: number): void {}
  protected dragEnd(_moved: boolean): void {}
  /** 鼠标滚轮（dy>0 向下）：子类转给活跃 Scroller */
  protected wheel(_dy: number): void {}
  protected frame(dt: number) {
    this.blink += dt
  }

  /** 键盘上方的 Return 键文案（子类覆盖） */
  protected retLabel(): string {
    return 'return'
  }

  /** 绘制键盘（若 kbOn） */
  protected drawKb() {
    if (this.kbOn) this.kb.draw(this.ctx.screen, this.ime, this.retLabel())
  }

  /**
   * 键盘动作路由；返回 true=已消费。
   * 文本提交经 insertText；子类先处理 ret 等再调 super。
   */
  protected kbAction(a: KbAction): boolean {
    const s = this.ctx.screen
    switch (a.type) {
      case 'char':
        if (this.kb.pinyin && /^[a-z]$/.test(a.ch)) {
          this.ime.feed(a.ch)
          return true
        }
        if (this.kb.pinyin && a.ch === ' ') {
          const out = this.ime.space()
          if (out && out !== ' ') this.insertText(out)
          else if (out === ' ') this.insertText(' ')
          return true
        }
        this.insertText(a.ch)
        return true
      case 'back': {
        if (this.kb.pinyin && this.ime.backspace() === 'letter') return true
        this.backspaceText()
        return true
      }
      case 'ret':
        return false
      case 'shift':
        this.kb.shift = !this.kb.shift
        this.draw()
        return true
      case 'mode':
        this.kb.mode = this.kb.mode === 'abc' ? '123' : 'abc'
        this.draw()
        return true
      case 'modeSym':
        this.kb.mode = this.kb.mode === '123' ? '#+=' : '123'
        this.draw()
        return true
      case 'ime': {
        const out = this.ime.pick(a.i)
        if (out) this.insertText(out)
        return true
      }
      case 'imeBar':
        this.kb.pinyin = !this.kb.pinyin
        this.ime.reset()
        this.draw()
        return true
    }
    void s
  }

  /** 文本插入（子类覆盖；默认无编辑区） */
  protected insertText(_t: string): void {}
  protected backspaceText(): void {}

  /** 让键盘点击音效（真机 tick） */
  protected click() {
    this.ctx.audio.tone(1250, 0.03, { type: 'square', gain: 0.05 })
  }
}

/** MiniApp 工厂：start(ctx) 时构造具体 app */
export function miniApp(
  id: string,
  name: string,
  icon: IconDrawer,
  make: (ctx: AppContext, bridge: Bridge) => IphoneApp,
): (bridge: Bridge) => MiniApp {
  return (bridge: Bridge) => ({
    id,
    name,
    // MiniApp.icon 为 3 参；Springboard 直接用 icons.ts 的 4 参版本
    icon: (s: Screen, x: number, y: number) => icon(s, x, y, 0),
    start(ctx: AppContext) {
      const app = make(ctx, bridge)
      app.start()
    },
  })
}

export type MiniAppFactory = ReturnType<typeof miniApp>

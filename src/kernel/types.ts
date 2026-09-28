import type { Screen } from '../hal/screen'
import type { InputBus, DeviceKey } from '../hal/input'
import type { AudioSynth } from '../hal/audio'
import type { Store, AppStore } from '../hal/storage'
import type { FrameHub } from '../hal/frames'
import type { Battery } from '../hal/battery'
import type { Lang } from '../i18n'
import type { CallEntry, Contact, LogEvent } from '../scenario/data'

/** 响应式语言源：OS 与应用据此取词，切换时收到通知后重绘 */
export interface LangSource {
  get(): Lang
  onChange(fn: () => void): () => void
  /** 请求切换全机语言（设置应用） */
  set?(lang: Lang): void
}

/** 一台"手机"的硬件画像 —— 新增设备只需在 devices/registry.ts 注册一份 */
export interface DeviceProfile {
  id: string
  /** 展示名（真名致敬，如 诺基亚 3310） */
  name: string
  maker: string
  /** 年代，用于展馆时间线排序 */
  era: number
  tagline: string
  description: string
  specs: string[]
  /** 英文文案（展馆切换到 EN 时使用，缺省回落中文） */
  en?: { name?: string; tagline?: string; description?: string; specs?: string[] }
  /** 系统包 id，见 devices/registry.ts 的 loadOS */
  os: string
  /** bg/fg 为 LCD 底色/像素色，缺省用功能机黄绿；palette 开启彩色模式 */
  screen: {
    w: number
    h: number
    scale: number
    bg?: string
    fg?: string
    palette?: ReadonlyArray<string | null>
    /** 电容触屏（如 G1）：机壳把画布点按转成 tap 事件 */
    touch?: boolean
    /**
     * 画布点按支持（浏览器操作便利）：真机本身非触屏（如黑莓 Bold 9000），
     * 但机壳仍把点按转成 tap；与 touch 的区别仅在硬件事实层面。
     */
    pointer?: boolean
    /** 真机字体族（如 Droid Sans）；Screen 据此在文字渲染时使用 */
    fontFamily?: string
    /** 需预加载的真机字体文件（FontFace API），加载后 fontFamily 生效 */
    fontFiles?: ReadonlyArray<{ family: string; weight?: string; url: string }>
  }
  shell: {
    body: string
    bodyEdge: string
    bezel: string
    button: string
    buttonText: string
    /** 机壳形态：n1100 / n3310 / brick（大哥大）/ s60 / g1 / wp7 / iphone / blackberry */
    layout: 'n1100' | 'n3310' | 'brick' | 's60' | 'g1' | 'wp7' | 'iphone' | 'blackberry'
    /** 面板 logo 文案（缺省用 maker；如 G1 面板是运营商 T · Mobile） */
    brandLabel?: string
  }
  /** 真机硬件特性标志（如 1100 内置手电筒） */
  flashlight?: boolean
}

export type KeyHandler = (key: DeviceKey, repeat: boolean) => void

/** OS 提供给 MiniApp 的受限能力（模拟"权限"边界） */
export interface AppContext {
  screen: Screen
  input: InputBus
  audio: AudioSynth
  battery: Battery
  device: DeviceProfile
  /** 本应用私有存储 */
  store: AppStore
  /** 界面语言（跟随展馆切换） */
  lang: LangSource
  /** 语言切换通知（应用退出自动取消订阅，回调里重绘即可） */
  onLang(fn: () => void): () => void
  /** 注册按键处理（应用退出自动取消订阅） */
  onKey(fn: KeyHandler): () => void
  /** 注册触屏点按处理（仅触屏机型会有事件，应用退出自动取消订阅） */
  onTap(fn: (x: number, y: number) => void): () => void
  /** 注册触屏抬起处理（短按/长按区分，应用退出自动取消订阅） */
  onTapUp(fn: (x: number, y: number) => void): () => void
  /** 注册连续拖拽（跟手滚动/手势，应用退出自动取消订阅） */
  onDrag(fn: (x: number, y: number, sx: number, sy: number) => void): () => void
  /** 注册手势结束（moved = 是否发生过拖拽，应用退出自动取消订阅） */
  onDragEnd(fn: (moved: boolean) => void): () => void
  /** 注册长按处理（应用退出自动取消订阅） */
  onLongPress(fn: (x: number, y: number) => void): () => void
  /** 注册触屏滑动处理（Pivot 切换/纵向滚动，应用退出自动取消订阅） */
  onSwipe(fn: (dir: 'up' | 'down' | 'left' | 'right') => void): () => void
  /** 注册鼠标滚轮（dy>0 向下滚，应用退出自动取消订阅） */
  onWheel(fn: (dy: number, x: number, y: number) => void): () => void
  /** 注册每帧回调（dt 秒），返回取消函数 */
  onFrame(fn: (dt: number) => void): () => void
  /** 定时器，应用退出自动清理 */
  every(ms: number, fn: () => void): () => void
  /** OS 侧钩子（如：短信发送后通知系统安排自动回复） */
  host: AppHost
  /** 退出应用，返回功能表 */
  exit(): void
}

export interface AppHost {
  /** 机型专有钩子（如 BlackBerry 的会话/BBM 回调），各 OS 自行扩展 */
  [key: string]: unknown
  /** 短信发出后回调 OS（to 为收件号码，OS 按联系人署名并调度回复） */
  messageSent?(to: string): void
  /** 聊天发出一行（OS 写入 chat:threads 并在同一线程内调度回复） */
  chatSend?(text: string): void
  /** 读取用户自编铃声（作曲家存的数据，跨应用只读） */
  getUserTune?(): Promise<number[] | null>
  /** 应用请求拨号（如电话本），OS 负责退出应用并进入呼叫 */
  dial?(number: string, name?: string): void
  /** 应用请求进入与某联系人的短信对话（如人脉"发信息"） */
  dialMsg?(tel: string, name?: string): void
  /** 读取相机照片（相册跨应用只读；返回 undefined 表示无照片） */
  getPhotos?(): Promise<unknown[] | undefined>
  /** 删除一张相机照片（相册 Delete，OS 重写 camera:photos） */
  deletePhoto?(id: number): Promise<void>
  /** 读取 Amazon MP3 已购曲目（音乐应用跨应用只读） */
  getPurchasedTracks?(): Promise<unknown[] | undefined>
  /** 读取设置里选定的铃声索引（闹钟等系统提醒跨应用只读） */
  getRingtoneIndex?(): Promise<number | undefined>
  /** 读取通话记录（记录应用/拨号器通话记录 tab 跨应用只读） */
  getCallLog?(): Promise<CallEntry[]>
  /** 应用请求记录一条通话（拨号器挂断时回调 OS 写设备级 store） */
  recordCall?(e: Omit<CallEntry, 'id' | 'ts'>): void
  /** 清空通话记录列表（all/missed/received/dialled，OS 过滤重写裸键） */
  deleteCallLog?(kind: 'all' | 'missed' | 'received' | 'dialled'): Promise<void>
  /** 读取通用事件日志（通讯记录应用跨应用只读） */
  getEvents?(): Promise<LogEvent[]>
  /** 记录一条通用事件（短信收发/数据连接，OS 写设备级 store） */
  recordEvent?(e: Omit<LogEvent, 'id' | 'ts'>): void
  /** 读取设备级通讯录（设置页编辑；通讯录应用跨应用只读，回落种子） */
  getContacts?(): Promise<Contact[]>
  /** 保存设备级通讯录（名片夹新建/编辑/删除，OS 写设备级 store） */
  saveContacts?(list: Contact[]): Promise<void>
  /** 发送名片：OS 带预填文本切到写信息 */
  sendCard?(name: string, tel: string): void
  /** 恢复出厂设置：OS 清空本设备全部数据并写回默认设置（app 提供默认值） */
  factoryReset?(conf: unknown): Promise<void>
  /** 读取情景模式配置（profiles app 用，裸键 profiles:conf） */
  getProfiles?(): Promise<unknown>
  /** 保存情景模式配置（applyActive 时 OS 立即把活动模式写入铃声配置） */
  saveProfiles?(conf: unknown, applyActive: boolean): Promise<void>
  /** 应用请求直接切换到另一个 app（不经过菜单，如情景模式列表↔个性化） */
  relaunch?(app: MiniApp): void
  /** 设置时钟（HH:MM，时间设置页用，OS 写 time:offset） */
  setClockTime?(h: number, m: number): void
  /** 设置日期（两位年/月/日，时间设置页用） */
  setClockDate?(y: number, mo: number, d: number): void
  /** 读取当前主题强调色的调色板索引（设置里切换，瓷贴/控件跟随） */
  getAccent?(): number
  /** 应用请求切换主题强调色（设置应用，OS 写设备级 store 并重绘瓷贴） */
  setAccent?(accentIdx: number): void
  /** 应用请求选定来电铃声索引（设置应用，OS 写设备级 store） */
  setRingtone?(idx: number): void
  /** 应用请求切换全机语言（设置应用） */
  setLang?(lang: Lang): void
  /** OS 动效引擎（Pivot 切换转场用） */
  fx?: FxLike
  /** 追加/更新一条系统通知（Market 下载等），进通知栏并持久化 */
  pushNotif?(n: { id?: string; kind: 'download' | 'chat'; title: string; text: string }): void
  /** 应用请求设置锁屏壁纸（设置应用，OS 写 lock:wallpaper） */
  setLockWallpaper?(idx: number): void
  /** Pictures：把相机照片设为锁屏（null 取消，id 用于重启后恢复） */
  setLockPhoto?(canvas: HTMLCanvasElement | null, id?: number): void
  /** 读取 Market 已安装的第三方应用名（设置→管理应用跨应用只读） */
  getInstalledApps?(): Promise<string[]>
  /** 卸载 Market 应用（设置→应用信息→卸载，OS 同步删 market:installed） */
  uninstallApp?(name: string): Promise<void>
}

/** 动效引擎的结构化最小类型（具体实现见各 OS 的 anim 模块） */
export interface FxLike {
  get busy(): boolean
  run(durMs: number, step: (p: number) => void, done?: () => void): void
}

/** MiniApp：跨系统复用的应用/游戏单元 */
export interface MiniApp {
  id: string
  name: string
  /** 英文应用名（缺省回落 name） */
  nameEn?: string
  /** 菜单图标：在 (x, y) 绘制约 10×10 点阵 */
  icon?(screen: Screen, x: number, y: number): void
  /** 返回可选的清理函数，应用退出时由运行时调用 */
  start(ctx: AppContext): void | (() => void)
}

/** OS 从机壳处拿到的全部硬件依赖 */
export interface OSDeps {
  profile: DeviceProfile
  screen: Screen
  input: InputBus
  audio: AudioSynth
  store: Store
  battery: Battery
  frames: FrameHub
  /** 界面语言（跟随展馆切换） */
  lang: LangSource
}

export interface PhoneOS {
  start(): void
  stop(): void
  /** 情景编排：外部来电（仅支持的机型实现） */
  incomingCall?(tel: string, name?: string): void
  /** 情景编排：外部来短信（仅支持的机型实现） */
  injectSms?(from: string, text: string): void
}

export type PhoneOSFactory = { create(deps: OSDeps): PhoneOS }

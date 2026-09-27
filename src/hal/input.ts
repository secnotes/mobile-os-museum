/**
 * 统一输入总线：物理键盘和屏幕上的实体按键汇成同一种 DeviceInput 事件流，
 * OS 与应用只认这一种。press 后按住 450ms 开始自动重复（每 150ms）。
 */
export type DeviceKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '*' | '#'
  | 'up' | 'down' | 'left' | 'right'
  | 'ok' | 'back' | 'clear'
  | 'soft1' | 'soft2'
  | 'power'
  | 'home' | 'menu' | 'call' | 'end' | 'search'
  | 'mr' | 'mplus' | 'fcn' | 'vol'
  | 'mute'
  | 'space'
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j'
  | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't'
  | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | '.' | ','

export type KeyListener = (key: DeviceKey, repeat: boolean) => void

/** 触屏点按：坐标为屏幕缓冲坐标（0..w-1 / 0..h-1），仅触屏机型派发 */
export type TapListener = (x: number, y: number) => void

/** 触屏抬起（用于长按判定：按下武装计时器，抬起时短按才生效） */
export type TapUpListener = (x: number, y: number) => void

/** 触屏滑动（如 G1 从状态栏下拉通知栏）：方向以手势滑动方向命名 */
export type SwipeDir = 'up' | 'down' | 'left' | 'right'
export type SwipeListener = (dir: SwipeDir) => void

/** 触屏连续拖拽：当前坐标 + 按下起点（跟手手势，如三屏滑动/抽屉/通知栏） */
export type DragListener = (x: number, y: number, sx: number, sy: number) => void

/** 触屏手势结束（moved = 是否越过阈值发生过滑动） */
export type DragEndListener = (moved: boolean) => void

/** 触屏长按（按下停留 ~550ms 且未移动） */
export type LongPressListener = (x: number, y: number) => void

export class InputBus {
  private down = new Set<DeviceKey>()
  private listeners = new Set<KeyListener>()
  private tapListeners = new Set<TapListener>()
  private tapUpListeners = new Set<TapUpListener>()
  private swipeListeners = new Set<SwipeListener>()
  private dragListeners = new Set<DragListener>()
  private dragEndListeners = new Set<DragEndListener>()
  private longPressListeners = new Set<LongPressListener>()
  private holdTimers = new Map<DeviceKey, ReturnType<typeof setTimeout>>()
  private repTimers = new Map<DeviceKey, ReturnType<typeof setInterval>>()

  subscribe(fn: KeyListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  subscribeTap(fn: TapListener): () => void {
    this.tapListeners.add(fn)
    return () => this.tapListeners.delete(fn)
  }

  subscribeTapUp(fn: TapUpListener): () => void {
    this.tapUpListeners.add(fn)
    return () => this.tapUpListeners.delete(fn)
  }

  subscribeSwipe(fn: SwipeListener): () => void {
    this.swipeListeners.add(fn)
    return () => this.swipeListeners.delete(fn)
  }

  subscribeDrag(fn: DragListener): () => void {
    this.dragListeners.add(fn)
    return () => this.dragListeners.delete(fn)
  }

  subscribeDragEnd(fn: DragEndListener): () => void {
    this.dragEndListeners.add(fn)
    return () => this.dragEndListeners.delete(fn)
  }

  subscribeLongPress(fn: LongPressListener): () => void {
    this.longPressListeners.add(fn)
    return () => this.longPressListeners.delete(fn)
  }

  /** 连续拖拽：每次 pointermove 都派发（OS 自己决定手势区域与阈值） */
  drag(x: number, y: number, sx: number, sy: number) {
    for (const fn of [...this.dragListeners]) fn(x, y, sx, sy)
  }

  /** 手势结束 */
  dragEnd(moved: boolean) {
    for (const fn of [...this.dragEndListeners]) fn(moved)
  }

  /** 长按（停留阈值且未移动） */
  longPress(x: number, y: number) {
    for (const fn of [...this.longPressListeners]) fn(x, y)
  }

  /** 触屏点按（电容屏）：与按键同一条总线，快照迭代防止启动途中收到自己的点按 */
  tap(x: number, y: number) {
    for (const fn of [...this.tapListeners]) fn(x, y)
  }

  /** 触屏抬起（长按判定用） */
  tapUp(x: number, y: number) {
    for (const fn of [...this.tapUpListeners]) fn(x, y)
  }

  /** 触屏滑动（拖拽越过阈值 / 鼠标滚轮），每次手势只派发一次 */
  swipe(dir: SwipeDir) {
    for (const fn of [...this.swipeListeners]) fn(dir)
  }

  press(key: DeviceKey) {
    if (this.down.has(key)) return
    this.down.add(key)
    this.fire(key, false)
    // fire 过程中监听器可能已释放该键（如应用启动时 runtime.cleanup 会 releaseAll），
    // 此时不能再武装自动重复——否则这把不在 down 集合里的键产生的定时器将无人清理。
    if (!this.down.has(key)) return
    this.holdTimers.set(
      key,
      setTimeout(() => {
        // 首次重复就在初始延迟点（真机键复节奏），随后每 150ms 一次
        this.fire(key, true)
        // fire 途中监听器可能已释放该键（HOME 长按 → Recent → runtime.close），
        // 此时不再武装 interval，避免无人清理的定时器
        if (!this.down.has(key)) return
        this.repTimers.set(
          key,
          setInterval(() => this.fire(key, true), 150),
        )
      }, 450),
    )
  }

  release(key: DeviceKey) {
    if (!this.down.delete(key)) return
    const h = this.holdTimers.get(key)
    if (h) { clearTimeout(h); this.holdTimers.delete(key) }
    const r = this.repTimers.get(key)
    if (r) { clearInterval(r); this.repTimers.delete(key) }
  }

  isDown(key: DeviceKey): boolean {
    return this.down.has(key)
  }

  releaseAll() {
    for (const k of [...this.down]) this.release(k)
  }

  destroy() {
    this.releaseAll()
    this.listeners.clear()
  }

  private fire(key: DeviceKey, repeat: boolean) {
    // 快照迭代：应用在处理按键的途中启动并订阅时，不应收到"启动它自己"的那枚键
    for (const fn of [...this.listeners]) fn(key, repeat)
  }
}

/** 物理键盘 → 设备按键 的映射（e.code 维度，避免输入法/Shift 干扰） */
const BASE_KEYBOARD_MAP: Record<string, DeviceKey> = {
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', Escape: 'back', Backspace: 'clear',
  KeyQ: 'soft1', KeyW: 'soft2', KeyP: 'power', F3: 'home', F7: 'mute',
  Minus: '*', Equal: '#',
  NumpadMultiply: '*', NumpadAdd: '#',
}

/** 全键盘机型（G1）：Q/W 是字母，软键职能交给专用功能键 */
const QWERTY_KEYBOARD_MAP: Record<string, DeviceKey> = {
  ...BASE_KEYBOARD_MAP,
  KeyQ: 'q', KeyW: 'w',
  Space: 'space', Period: '.', Comma: ',',
  F1: 'call', F2: 'end', F3: 'home', F4: 'menu', Tab: 'menu',
  // 电容键机型（WP7）：F5 搜索键；F6 电源（QWERTY 映射下 P 是字母）
  F5: 'search', F6: 'power',
}

for (let c = 65; c <= 90; c++) {
  const letter = String.fromCharCode(c + 32) as DeviceKey
  const code = 'Key' + String.fromCharCode(c)
  QWERTY_KEYBOARD_MAP[code] = letter
}

/**
 * 大哥大（摩托罗拉 3200）：21 键无字母键盘，物理键盘用一组专用映射
 * 驱动 MR/M+/Fcn/Vol 与绿 Call / 红 End。
 */
const BRICK_KEYBOARD_MAP: Record<string, DeviceKey> = {
  ...BASE_KEYBOARD_MAP,
  KeyQ: 'call', KeyW: 'end', KeyC: 'menu',
  KeyR: 'mr', KeyM: 'mplus', KeyF: 'fcn', KeyV: 'vol',
}

export type KeyboardVariant = 'base' | 'qwerty' | 'brick'

/** 键盘映射按机型选择：g1 全键盘 / 大哥大专用 / 其余九宫格时代映射 */
export function mapKeyboardEvent(e: KeyboardEvent, variant: KeyboardVariant = 'base'): DeviceKey | null {
  const map = variant === 'qwerty' ? QWERTY_KEYBOARD_MAP : variant === 'brick' ? BRICK_KEYBOARD_MAP : BASE_KEYBOARD_MAP
  return map[e.code] ?? null
}

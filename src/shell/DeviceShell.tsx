import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { DeviceProfile, PhoneOS } from '../kernel/types'
import { Screen } from '../hal/screen'
import { InputBus, mapKeyboardEvent, type DeviceKey } from '../hal/input'
import { AudioSynth } from '../hal/audio'
import { Store } from '../hal/storage'
import { Battery } from '../hal/battery'
import { FrameHub } from '../hal/frames'
import { loadOS } from '../devices/registry'
import { ScenarioScheduler } from '../scenario/scheduler'
import { STRINGS, type Prefs } from '../i18n'
import { ViewControls } from '../controls'

const KEYPAD: Array<{ key: DeviceKey; sub: string }> = [
  { key: '1', sub: '〇' },
  { key: '2', sub: 'abc' },
  { key: '3', sub: 'def' },
  { key: '4', sub: 'ghi' },
  { key: '5', sub: 'jkl' },
  { key: '6', sub: 'mno' },
  { key: '7', sub: 'pqrs' },
  { key: '8', sub: 'tuv' },
  { key: '9', sub: 'wxyz' },
  { key: '*', sub: '+' },
  { key: '0', sub: '␣' },
  { key: '#', sub: '#' },
]

/** 大哥大数字键次标（3200 真机标点） */
const BRICK_DIGITS: Array<{ key: DeviceKey; sub: string }> = [
  { key: '1', sub: '!' }, { key: '2', sub: '_' }, { key: '3', sub: ':' },
  { key: '4', sub: '$' }, { key: '5', sub: '%' }, { key: '6', sub: '&' },
  { key: '7', sub: "'" }, { key: '8', sub: '(' }, { key: '9', sub: ')' },
  { key: '*', sub: '<' }, { key: '0', sub: '+' }, { key: '#', sub: 'II' },
]

/** 电源键图标（红标，1100 膜片导航 / 3200 功能网格共用） */
const PowerIcon = (
  <svg className="power-icon" viewBox="0 0 20 20" aria-hidden>
    <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <line x1="10" y1="3.4" x2="10" y2="11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

export function DeviceShell({
  profile,
  onBack,
  prefs,
  onLangChange,
}: {
  profile: DeviceProfile
  onBack: () => void
  prefs: Prefs
  onLangChange: (l: import('../i18n').Lang) => void
}) {
  const t = STRINGS[prefs.lang]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<InputBus | null>(null)
  const audioRef = useRef<AudioSynth | null>(null)
  // prefs 变化不应重启 OS（useEffect 只依赖 profile），用 ref 转发语言并广播切换
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const langSubs = useRef(new Set<() => void>())
  const schedulers = useRef(new Map<string, ScenarioScheduler>())
  const bbLedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const subs = [...langSubs.current]
    subs.forEach((f) => f())
  }, [prefs.lang])

  // BlackBerry 顶部 LED：OS 派发 bb-led 事件
  useEffect(() => {
    const onLed = (e: Event) => {
      const el = bbLedRef.current
      if (el) el.dataset.state = (e as CustomEvent<string>).detail
    }
    window.addEventListener('bb-led', onLed)
    return () => window.removeEventListener('bb-led', onLed)
  }, [])

  useEffect(() => {
    // 物理键盘变体：G1/WP7 用 QWERTY 映射（字母直通、F1-F6 功能键）；大哥大用专用映射
    const kbVariant: import('../hal/input').KeyboardVariant =
      profile.shell.layout === 'g1' || profile.shell.layout === 'wp7' || profile.shell.layout === 'blackberry' ? 'qwerty'
      : profile.shell.layout === 'brick' ? 'brick'
      : 'base'
    const canvas = canvasRef.current!
    const screen = new Screen(canvas, profile.screen.w, profile.screen.h, {
      scale: profile.screen.scale,
      bg: profile.screen.bg,
      fg: profile.screen.fg,
      palette: profile.screen.palette,
      fontFamily: profile.screen.fontFamily,
    })
    const input = new InputBus()
    const audio = new AudioSynth()
    const store = new Store(profile.id)
    const battery = new Battery(store)
    const frames = new FrameHub(() => screen.render())
    inputRef.current = input
    audioRef.current = audio

      // 电容触屏（G1）：画布点按 → 屏幕缓冲坐标 → 输入总线 tap 事件；
      // 拖拽越过阈值 → swipe 事件（如从状态栏下拉通知栏）
    const toScreen = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      return {
        x: Math.floor(((e.clientX - rect.left) / rect.width) * profile.screen.w),
        y: Math.floor(((e.clientY - rect.top) / rect.height) * profile.screen.h),
      }
    }
    const onTouchTap = (e: PointerEvent) => {
      if (!profile.screen.touch && !profile.screen.pointer) return
      e.preventDefault()
      const p = toScreen(e)
      if (!p) return
      dragStart = p
      dragged = false
      audio.unlock()
      input.tap(p.x, p.y)
      clearHold()
      holdTimer = setTimeout(() => {
        holdTimer = null
        input.longPress(p.x, p.y)
      }, 550)
    }
    // 拖拽手势：移动即派发连续 drag（OS 跟手）；越过 24px 额外派发一次方向 swipe
    let dragStart: { x: number; y: number } | null = null
    let dragged = false
    // 长按：按下 550ms 不动 → longPress（期间移动/抬起即取消）
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer)
        holdTimer = null
      }
    }
    const onTouchMove = (e: PointerEvent) => {
      if ((!profile.screen.touch && !profile.screen.pointer) || !dragStart) return
      e.preventDefault()
      const p = toScreen(e)
      if (!p) return
      input.drag(p.x, p.y, dragStart.x, dragStart.y)
      if (dragged) return
      const dx = p.x - dragStart.x
      const dy = p.y - dragStart.y
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
      dragged = true
      clearHold()
      input.swipe(Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left')
    }
    const onTouchEnd = (e: PointerEvent) => {
      const wasDrag = dragged
      const start = dragStart
      dragStart = null
      dragged = false
      clearHold()
      if (start) input.dragEnd(wasDrag)
      if (wasDrag) return
      const p = toScreen(e)
      if (p) input.tapUp(p.x, p.y)
    }
    canvas.addEventListener('pointerdown', onTouchTap)
    canvas.addEventListener('pointermove', onTouchMove)
    canvas.addEventListener('pointerup', onTouchEnd)
    canvas.addEventListener('pointercancel', onTouchEnd)

    // 鼠标滚轮：转为屏幕坐标后派发（如抽屉网格滚动）；preventDefault 避免页面滚动
    const onWheel = (e: WheelEvent) => {
      const p = toScreen(e)
      if (!p) return
      e.preventDefault()
      input.wheel(e.deltaY, p.x, p.y)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    const onKeyDown = (e: KeyboardEvent) => {
      const key = mapKeyboardEvent(e, kbVariant)
      if (!key) return
      if (e.repeat) return // 重复由 InputBus 自己调度
      e.preventDefault()
      if (key === 'power') audio.unlock()
      input.press(key)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = mapKeyboardEvent(e, kbVariant)
      if (!key) return
      input.release(key)
    }
    const onBlur = () => input.releaseAll()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    let cancelled = false
    let os: PhoneOS | null = null
    // 预加载真机字体（如 G1 的 Droid Sans）—— FontFace API，加载后 canvas 文字自动使用
    const fontPromise = profile.screen.fontFiles
      ? Promise.all(
          profile.screen.fontFiles.map((f) => {
            const face = new FontFace(f.family, `url(${f.url})`, f.weight ? { weight: f.weight } : undefined)
            return face.load().then(() => document.fonts.add(face)).catch(() => {})
          }),
        )
      : Promise.resolve()
    void Promise.all([loadOS(profile.os), fontPromise]).then(([factory]) => {
      if (cancelled) return
      os = factory.create({
        profile,
        screen,
        input,
        audio,
        store,
        battery,
        frames,
        lang: {
          get: () => prefsRef.current.lang,
          onChange: (fn) => {
            langSubs.current.add(fn)
            return () => langSubs.current.delete(fn)
          },
          set: (l) => onLangChange(l),
        },
      })
      os.start()
      // 情景调度器：仅对实现了 incomingCall/injectSms 的 OS（功能机/大哥大）生效
      if (os.incomingCall && os.injectSms) {
        const sched = new ScenarioScheduler(store, {
          onCall: (tel, name) => os?.incomingCall?.(tel, name),
          onSms: (from, text) => os?.injectSms?.(from, text),
        })
        void sched.start()
        schedulers.current.set(profile.id, sched)
      }
    })

    return () => {
      cancelled = true
      os?.stop()
      const sched = schedulers.current.get(profile.id)
      if (sched) {
        sched.stop()
        schedulers.current.delete(profile.id)
      }
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('pointerdown', onTouchTap)
      canvas.removeEventListener('pointermove', onTouchMove)
      canvas.removeEventListener('pointerup', onTouchEnd)
      canvas.removeEventListener('pointercancel', onTouchEnd)
      canvas.removeEventListener('wheel', onWheel)
      frames.destroy()
      input.destroy()
    }
  }, [profile])

  const press = (key: DeviceKey) => {
    audioRef.current?.unlock()
    inputRef.current?.press(key)
  }
  const release = (key: DeviceKey) => {
    inputRef.current?.release(key)
  }

  const btn = (key: DeviceKey, label: ReactNode, cls = '') => (
    <button
      className={`pbtn ${cls}`}
      data-key={key}
      onPointerDown={(e) => {
        e.preventDefault()
        press(key)
      }}
      onPointerUp={() => release(key)}
      onPointerLeave={() => release(key)}
      onPointerCancel={() => release(key)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )

  const layout = profile.shell.layout
  const brick = layout === 'brick'
  const g1 = layout === 'g1'
  const wp7 = layout === 'wp7'
  const n1100 = layout === 'n1100'
  const n3310 = layout === 'n3310'
  const iphone = layout === 'iphone'
  const bb = layout === 'blackberry'

  // G1 侧滑全键盘（4 行 QWERTY + 空格行）
  const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  // BlackBerry Bold 珍珠 QWERTY
  const BB_ROWS = ['qwertyuiop', 'asdfghjkl']
  const BB_ROW3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

  return (
    <div className="device-page">
      <div className="device-topbar">
        <button className="ghost-btn" onClick={onBack}>
          {t.backToGallery}
        </button>
        <ViewControls
          lang={prefs.lang}
          theme={prefs.theme}
          onLang={prefs.setLang}
          onTheme={prefs.setTheme}
        />
        <span className="device-topbar-name">
          {profile.maker} ·{' '}
          {(prefs.lang === 'en' ? profile.en?.name : undefined) ?? profile.name} · {profile.era}
        </span>
      </div>

      <div className={`phone ${layout}`} style={{ '--body': profile.shell.body, '--body-edge': profile.shell.bodyEdge, '--bezel': profile.shell.bezel, '--btn': profile.shell.button } as CSSProperties}>
        {brick && <div className="phone-antenna" aria-hidden />}
        {n3310 && (
          <div className="n3310-power" title="电源键"
            onPointerDown={(e) => { e.preventDefault(); press('power') }}
            onPointerUp={() => release('power')}
            onPointerLeave={() => release('power')}
          />
        )}
        {!brick && !n1100 && !n3310 && !bb && (
          <div className="phone-power" title="电源键"
            onPointerDown={(e) => { e.preventDefault(); press('power') }}
            onPointerUp={() => release('power')}
            onPointerLeave={() => release('power')}
          />
        )}
        {bb && (
          <>
            {/* 顶部静音键 + 电源/锁定键 + LED（真机 Bold 9000 顶部右上角为独立电源键） */}
            <div className="bb-top-row">
              <div className="bb-led" ref={bbLedRef} aria-hidden />
              <div className="bb-mute" title="静音/键盘锁"
                onPointerDown={(e) => { e.preventDefault(); press('mute') }}
                onPointerUp={() => release('mute')}
                onPointerLeave={() => release('mute')}
              />
              <div className="bb-power" title="电源/锁定键"
                onPointerDown={(e) => { e.preventDefault(); press('power') }}
                onPointerUp={() => release('power')}
                onPointerLeave={() => release('power')}
              />
            </div>
            {/* 左侧快捷键 / 音量键 */}
            <div className="bb-side bb-side-l">
              <div className="bb-side-key" title="左侧快捷键"
                onPointerDown={(e) => { e.preventDefault(); press('soft1') }}
                onPointerUp={() => release('soft1')}
                onPointerLeave={() => release('soft1')}
              />
            </div>
            <div className="bb-side bb-side-r">
              <div className="bb-side-key" title="右侧快捷键（相机）"
                onPointerDown={(e) => { e.preventDefault(); press('soft2') }}
                onPointerUp={() => release('soft2')}
                onPointerLeave={() => release('soft2')}
              />
              <div className="bb-side-key bb-vol" title="音量"
                onPointerDown={(e) => { e.preventDefault(); press('vol') }}
                onPointerUp={() => release('vol')}
                onPointerLeave={() => release('vol')}
              />
            </div>
          </>
        )}
        {brick ? (
          <div className="earpiece-cup" aria-hidden />
        ) : n3310 ? (
          <div className="earpiece-dots" aria-hidden />
        ) : n1100 ? (
          <div className="n1100-plate">
            <div className="earpiece-grille" aria-hidden />
            <div className="brand">NOKIA</div>
          </div>
        ) : iphone ? (
          <div className="iphone-top">
            <div className="iphone-sensor" aria-hidden />
            <div className="iphone-earpiece" aria-hidden />
          </div>
        ) : bb ? (
          <div className="bb-speaker" aria-hidden>
            <div className="bb-speaker-grille" />
          </div>
        ) : (
          <div className="earpiece" />
        )}
        {!brick && !n1100 && !iphone && !bb && (
          <div className="brand">{profile.shell.brandLabel ?? profile.maker}</div>
        )}
        <div className="screen-bezel">
          <canvas
            ref={canvasRef}
            style={profile.screen.touch || profile.screen.pointer
              ? { cursor: 'pointer', touchAction: 'none' }
              : undefined}
          />
        </div>
        {brick && <div className="brick-led" aria-hidden />}

        {g1 ? (
          <>
            {/* G1 面板：呼叫 / 主页 / 轨迹球 / 菜单 / 返回 + 红色挂断 */}
            <div className="g1-controls">
              {btn('call', '☎', 'g1-key g1-call')}
              {btn('home', '⌂', 'g1-key g1-home')}
              <div className="g1-trackpad">
                {btn('up', '', 'g1-track-up')}
                {btn('left', '', 'g1-track-left')}
                {btn('ok', '', 'g1-track-ball')}
                {btn('right', '', 'g1-track-right')}
                {btn('down', '', 'g1-track-down')}
              </div>
              {btn('menu', '≡', 'g1-key g1-menu')}
              {btn('back', '◁', 'g1-key g1-back')}
              {btn('end', '☎', 'g1-key g1-end')}
            </div>

            {/* 侧滑全键盘（默认展开陈列，还原 G1 下巴） */}
            <div className="g1-qwerty">
              {QWERTY_ROWS.map((row, r) => (
                <div key={r} className="g1-qrow">
                  {[...row].map((ch) =>
                    btn(ch as DeviceKey, ch, `g1-qkey${r === 1 ? ' g1-qrow-home' : ''}`),
                  )}
                </div>
              ))}
              <div className="g1-qrow">
                {btn('space', '␣', 'g1-qkey g1-qspace')}
                {btn('.', '.', 'g1-qkey')}
                {btn(',', ',', 'g1-qkey')}
              </div>
            </div>
          </>
        ) : wp7 ? (
          <>
            {/* Lumia 800 面板：屏幕下方黑玻璃条上的三枚电容键 —— 返回 / Windows 开始 / 搜索 */}
            <div className="wp7-capacitive">
              {btn('back', (
                <svg className="wp7-cap-icon" viewBox="0 0 20 20" aria-hidden>
                  <polyline points="13,3 6,10 13,17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ), 'wp7-cap')}
              {btn('home', (
                <svg className="wp7-cap-icon wp7-flag" viewBox="0 0 22 22" aria-hidden>
                  <rect x="1.5" y="1.5" width="8.6" height="8.6" rx="1" />
                  <rect x="11.9" y="1.5" width="8.6" height="8.6" rx="1" />
                  <rect x="1.5" y="11.9" width="8.6" height="8.6" rx="1" />
                  <rect x="11.9" y="11.9" width="8.6" height="8.6" rx="1" />
                </svg>
              ), 'wp7-cap wp7-cap-start')}
              {btn('search', (
                <svg className="wp7-cap-icon" viewBox="0 0 20 20" aria-hidden>
                  <circle cx="8.5" cy="8.5" r="5.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
                  <line x1="12.6" y1="12.6" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              ), 'wp7-cap')}
            </div>
          </>
        ) : n1100 ? (
          <div className="n1100-face">
            {/* 3×2 面板导航：电源红标 / ▲；C / 蓝线 Navi / ▼（无左右） */}
            <div className="n1100-nav">
              {btn('power', PowerIcon, 'nk-key nk-power')}
              <div className="nk-spacer" aria-hidden />
              {btn('up', '▲', 'nk-key')}
              {btn('clear', 'C', 'nk-key')}
              {btn('ok', '', 'nk-key nk-ok')}
              {btn('down', '▼', 'nk-key')}
            </div>
            <div className="keypad n1100-keypad">
              {KEYPAD.map((k) =>
                btn(k.key, (
                  <span className="key-face">
                    <span className="key-digit">{k.key}</span>
                    <span className="key-sub">{k.sub}</span>
                  </span>
                ), 'digit-key n1100-digit'),
              )}
            </div>
          </div>
        ) : n3310 ? (
          <>
            {/* 三键 Navi：三角 C / 银胶囊 / 右连体双热区（上/下） */}
            <div className="n3310-nav">
              {btn('clear', 'C', 'tri tri-c')}
              {btn('ok', '', 'navi-key')}
              <div className="tri-r">
                {btn('up', '', 'tri tri-up')}
                {btn('down', '', 'tri tri-down')}
              </div>
            </div>
            <div className="keypad n3310-keypad">
              {KEYPAD.map((k) =>
                btn(k.key, (
                  <span className="key-face">
                    <span className="key-digit">{k.key}</span>
                    <span className="key-sub">{k.sub}</span>
                  </span>
                ), 'digit-key'),
              )}
            </div>
          </>
        ) : brick ? (
          <>
            {/* 21 键 3×7 网格：数字 4 行 + 功能 3 行 */}
            <div className="brick-grid">
              {BRICK_DIGITS.map((k) =>
                btn(k.key, (
                  <span className="key-face">
                    <span className="key-digit">{k.key}</span>
                    <span className="key-sub">{k.sub}</span>
                  </span>
                ), 'brick-key'),
              )}
              {btn('mr', 'MR', 'brick-fn')}
              {btn('clear', <span className="ac-label"><i>a</i><i>c</i></span>, 'brick-fn')}
              {btn('call', '☎', 'brick-fn brick-call')}
              {btn('mplus', 'M+', 'brick-fn')}
              {btn('vol', '↑', 'brick-fn')}
              {btn('end', '☎', 'brick-fn brick-end')}
              {btn('power', PowerIcon, 'brick-fn brick-pwr')}
              {btn('menu', <span className="menu-key"><b>MENU</b><i>✉</i></span>, 'brick-fn')}
              {btn('fcn', '◀', 'brick-fn')}
            </div>
            <div className="brick-badge">
              <span className="brick-badge-name">MOTOROLA</span>
              <span className="brick-badge-sub">International 3200</span>
            </div>
          </>
        ) : iphone ? (
          /* iPhone 正面仅此一枚圆形 Home 键（真机 1.0 为凹下圆键，无 glyph） */
          <div className="iphone-controls">
            {btn('home', '', 'iphone-home')}
          </div>
        ) : bb ? (
          <>
            {/* 通话/导航条：绿 Send · 黑莓 Menu · 轨迹球 · Back · 红 End */}
            <div className="bb-nav">
              {btn('call', '☎', 'bb-nav-key bb-call')}
              {btn('menu', (
                <svg className="bb-bbmark" viewBox="0 0 24 16" aria-hidden>
                  <circle cx="4" cy="2.5" r="2.2" />
                  <circle cx="4" cy="8" r="2.2" />
                  <circle cx="4" cy="13.5" r="2.2" />
                  <circle cx="12" cy="5.2" r="2.2" />
                  <circle cx="12" cy="10.8" r="2.2" />
                  <circle cx="20" cy="2.5" r="2.2" />
                  <circle cx="20" cy="8" r="2.2" />
                  <circle cx="20" cy="13.5" r="2.2" />
                </svg>
              ), 'bb-nav-key bb-menu')}
              <div className="bb-ball">
                {btn('up', '', 'bb-ball-up')}
                {btn('left', '', 'bb-ball-left')}
                {btn('ok', '', 'bb-ball-press')}
                {btn('right', '', 'bb-ball-right')}
                {btn('down', '', 'bb-ball-down')}
              </div>
              {btn('back', (
                <svg className="bb-back-icon" viewBox="0 0 20 16" aria-hidden>
                  <polyline points="14,3 7,8 14,13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ), 'bb-nav-key bb-back')}
              {btn('end', '☎', 'bb-nav-key bb-end')}
            </div>

            {/* 珍珠 QWERTY */}
            <div className="bb-qwerty">
              {BB_ROWS.map((row, r) => (
                <div key={r} className={`bb-qrow${r === 1 ? ' bb-qrow-home' : ''}`}>
                  {[...row].map((ch) => btn(ch as DeviceKey, ch, 'bb-qkey'))}
                </div>
              ))}
              <div className="bb-qrow bb-qrow-alt">
                <span className="bb-qkey bb-qdecor">alt</span>
                {BB_ROW3.map((ch) => btn(ch as DeviceKey, ch, 'bb-qkey'))}
                {btn('clear',
                  <svg className="bb-backspace" viewBox="0 0 22 16" aria-hidden>
                    <path d="M9 2 L2 8 L9 14 L20 14 L20 2 Z" fill="none"
                      stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M13 6 L17 10 M17 6 L13 10" stroke="currentColor" strokeWidth="1.5" />
                  </svg>,
                  'bb-qkey bb-qback')}
              </div>
              <div className="bb-qrow bb-qrow-bottom">
                <span className="bb-qkey bb-qdecor">aA</span>
                {btn('space', '', 'bb-qkey bb-qspace')}
                {btn('.', '.', 'bb-qkey bb-qdot')}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* S60：软键 + 五向 + C */}
            <div className="nav-row">
              {btn('soft1', <span className="soft-label" />, 'soft soft-l')}
              <div className="nav-pad">
                {btn('up', '▲', 'nav-up')}
                {btn('left', '◀', 'nav-left')}
                {btn('ok', 'OK', 'nav-ok')}
                {btn('right', '▶', 'nav-right')}
                {btn('down', '▼', 'nav-down')}
              </div>
              {btn('soft2', <span className="soft-label" />, 'soft soft-r')}
            </div>

            <div className="c-row">{btn('clear', 'C', 'c-key')}</div>

            <div className="keypad">
              {KEYPAD.map((k) =>
                btn(k.key, (
                  <span className="key-face">
                    <span className="key-digit">{k.key}</span>
                    <span className="key-sub">{k.sub}</span>
                  </span>
                ), 'digit-key'),
              )}
            </div>
          </>
        )}
      </div>

      <div className="legend">
        <div className="legend-title">{iphone ? t.legendTitleTouch : t.legendTitle}</div>
        <div className="legend-grid">
          {(g1 ? t.legendItemsQwerty : wp7 ? t.legendItemsWp7 : iphone ? t.legendItemsTouch : bb ? t.legendItemsBb : t.legendItems).map(([k, v]) => (
            <span key={k} className="legend-item">
              <kbd>{k}</kbd> {v}
            </span>
          ))}
        </div>
        <div className="legend-hint">{g1 ? t.hintQwerty : wp7 ? t.hintWp7 : iphone ? t.hintTouch : bb ? t.hintBb : t.hint}</div>
      </div>
    </div>
  )
}

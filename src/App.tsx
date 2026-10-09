import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { Gallery } from './gallery/Gallery'
import { DeviceShell } from './shell/DeviceShell'
import { SettingsPage } from './scenario/SettingsPage'
import { getDevice } from './devices/registry'
import { STRINGS, type Lang, type Theme, type Prefs } from './i18n'

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem('museum:lang') === 'en' ? 'en' : 'zh'),
  )
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('museum:theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.lang = lang
    localStorage.setItem('museum:lang', lang)
    document.title = STRINGS[lang].docTitle
  }, [lang])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('museum:theme', theme)
  }, [theme])

  const prefs = useMemo<Prefs>(
    () => ({ lang, theme, setLang, setTheme }),
    [lang, theme],
  )

  const open = useCallback((id: string) => {
    window.location.hash = `#/device/${id}`
  }, [])
  const back = useCallback(() => {
    window.location.hash = ''
  }, [])

  const m = /^#\/device\/([\w-]+)/.exec(hash)
  const device = m ? getDevice(m[1]) : undefined
  const isSettings = hash === '#/settings'
  return (
    <>
      {m && !device ? (
        <div className="notfound">
          <p>{STRINGS[lang].notFound}</p>
          <button className="ghost-btn" onClick={back}>
            {STRINGS[lang].backToGallery}
          </button>
        </div>
      ) : device ? (
        <DeviceShell key={device.id} profile={device} onBack={back} prefs={prefs} onLangChange={setLang} />
      ) : (
        <Gallery onOpen={open} prefs={prefs} />
      )}
      {/* 设置浮层：展馆/设备页保持在底下不卸载，关闭后原位恢复 */}
      {isSettings && (
        <SettingsOverlay onClose={back}>
          <SettingsPage prefs={prefs} onBack={back} />
        </SettingsOverlay>
      )}
      <BackToTop label={STRINGS[lang].toTop} />
    </>
  )
}

/** 设置浮层：盖在当前页面之上；点背景或 Esc 关闭，打开期间锁住底下页面滚动 */
function SettingsOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // 锁定必须在浏览器绘制前完成，否则浮层会先以未锁定状态闪一帧
  useLayoutEffect(() => {
    const y = window.scrollY
    const body = document.body
    // 移动端（iOS Safari/Android Chrome）overflow:hidden 锁不住滚动且会丢失位置，
    // 用 position:fixed 固定；桌面端 overflow:hidden 即可（避免 fixed 导致的宽度变化）
    const mobile = window.matchMedia?.('(pointer: coarse)').matches
    if (mobile) {
      const prev = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
      }
      body.style.position = 'fixed'
      body.style.top = `-${y}px`
      body.style.width = '100%'
      return () => {
        body.style.position = prev.position
        body.style.top = prev.top
        body.style.width = prev.width
        window.scrollTo(0, y)
      }
    }
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = prevOverflow
      window.scrollTo(0, y)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

/** 置顶按钮：下滑一段距离后浮现，平滑滚回顶部 */
function BackToTop({ label }: { label: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button
      className={'to-top' + (show ? ' show' : '')}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title={label}
      aria-label={label}
    >
      ↑
    </button>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
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
      {isSettings ? (
        <SettingsPage prefs={prefs} onBack={back} />
      ) : m && !device ? (
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
      <BackToTop label={STRINGS[lang].toTop} />
    </>
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

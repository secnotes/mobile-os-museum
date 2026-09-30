import { useEffect, useState } from 'react'
import { DEVICES } from '../devices/registry'
import { STRINGS, type Prefs } from '../i18n'
import { ViewControls } from '../controls'

/** 卡片铭牌：每台机真实状态栏的缩微版 */
function CardStatusBar({ id }: { id: string }) {
  switch (id) {
    case 'motorola-brick':
      return (
        <div className="device-card-lcd lcd-brick">
          <span>▂▄▆</span>
          <span>▮▮▯</span>
        </div>
      )
    case 'nokia-3310':
    case 'nokia-1100':
      return (
        <div className={`device-card-lcd ${id === 'nokia-3310' ? 'lcd-3310' : 'lcd-1100'}`}>
          <span>▂▄▆█</span>
          <span>中国移动</span>
          <span>▮▮▮▯</span>
        </div>
      )
    case 'nokia-n73':
      return (
        <div className="device-card-lcd lcd-n73">
          <span>▂▄▆ 3G</span>
          <span>12:00</span>
          <span>▮▮▯</span>
        </div>
      )
    case 'apple-iphone-2g':
      return (
        <div className="device-card-lcd lcd-iphone">
          <span>▂▄▆█ AT&T )))</span>
          <span>12:00</span>
          <span>▮▮▮</span>
        </div>
      )
    case 'htc-dream':
      return (
        <div className="device-card-lcd lcd-g1">
          <span className="lcd-g1-sig">3G ▂▄▆</span>
          <span>12:00</span>
        </div>
      )
    case 'blackberry-bold-9000':
      return (
        <div className="device-card-lcd lcd-bb">
          <span>▂▄▆ 3G ●●●</span>
          <span>12:00</span>
          <span>▮▮▯</span>
        </div>
      )
    case 'nokia-lumia-800':
      return (
        <div className="device-card-lcd lcd-lumia">
          <span>▂▄▆ )))</span>
          <span>12:00</span>
        </div>
      )
    default:
      return null
  }
}

export function Gallery({ onOpen, prefs }: { onOpen: (id: string) => void; prefs: Prefs }) {
  const t = STRINGS[prefs.lang]
  const devices = [...DEVICES].sort((a, b) => a.era - b.era)
  const [activeId, setActiveId] = useState('')
  const [tocOpen, setTocOpen] = useState(false)

  // 滚动经过哪张卡片，目录就高亮哪台设备
  useEffect(() => {
    const sections = devices
      .map((d) => document.getElementById(`dev-${d.id}`))
      .filter((el): el is HTMLElement => el !== null)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id.replace(/^dev-/, ''))
        }
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    for (const s of sections) io.observe(s)
    return () => io.disconnect()
    // devices 顺序与内容仅依赖 DEVICES 常量，重渲染不需重建观察者
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jump = (id: string) => {
    setTocOpen(false)
    document.getElementById(`dev-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const tocItems = devices.map((d) => {
    const name = prefs.lang === 'en' ? (d.en?.name ?? d.name) : d.name
    return (
      <button
        key={d.id}
        className={activeId === d.id ? 'toc-item on' : 'toc-item'}
        onClick={() => jump(d.id)}
      >
        <span className="toc-year">{d.era}</span>
        <span className="toc-name">{name}</span>
      </button>
    )
  })

  return (
    <div className="gallery">
      <header className="gallery-header">
        <h1>{t.title}</h1>
        <p className="gallery-sub">{t.sub}</p>
        <div className="gallery-controls">
          <ViewControls
            lang={prefs.lang}
            theme={prefs.theme}
            onLang={prefs.setLang}
            onTheme={prefs.setTheme}
          />
        </div>
        <p className="gallery-intro">{t.intro}</p>
      </header>

      <div className="timeline">
        {devices.map((d) => {
          const name = prefs.lang === 'en' ? (d.en?.name ?? d.name) : d.name
          const tagline = prefs.lang === 'en' ? (d.en?.tagline ?? d.tagline) : d.tagline
          const description =
            prefs.lang === 'en' ? (d.en?.description ?? d.description) : d.description
          const specs = prefs.lang === 'en' ? (d.en?.specs ?? d.specs) : d.specs
          return (
            <section
              key={d.id}
              id={`dev-${d.id}`}
              className="device-card"
              role="button"
              tabIndex={0}
              aria-label={`${name} — ${t.bootBtn}`}
              onClick={() => onOpen(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(d.id)
                }
              }}
            >
              <span className="tl-node" aria-hidden>
                <span className="tl-year">{d.era}</span>
              </span>
              <div className="device-card-body">
                <div className="device-card-name">
                  {name}
                  <span className="device-card-maker">{d.maker}</span>
                  <span className="device-card-arrow" aria-hidden>
                    ›
                  </span>
                </div>
                <div className="device-card-tagline">{tagline}</div>
                <CardStatusBar id={d.id} />
                <p className="device-card-desc">{description}</p>
                <ul className="device-card-specs">
                  {specs.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}
      </div>

      <footer className="gallery-footer">
        <p>{t.footer}</p>
      </footer>

      {/* 桌面端：右缘固定目录导轨 */}
      <nav className="toc-rail" aria-label={t.toc}>
        {tocItems}
      </nav>

      {/* 窄屏：悬浮按钮弹出目录 */}
      <button
        className="toc-float"
        title={t.toc}
        aria-label={t.toc}
        onClick={() => setTocOpen((v) => !v)}
      >
        ☰
      </button>
      {tocOpen && (
        <>
          <div className="toc-backdrop" onClick={() => setTocOpen(false)} />
          <nav className="toc-drawer" aria-label={t.toc}>
            {tocItems}
          </nav>
        </>
      )}

      <button
        className="scenario-float"
        title={t.scenarioEditor}
        aria-label={t.scenarioEditor}
        onClick={() => (window.location.hash = '#/settings')}
      >
        ⚙
      </button>
    </div>
  )
}

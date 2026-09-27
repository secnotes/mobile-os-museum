import type { Lang, Theme } from './i18n'

/** 右上角切换控件：中/EN + 日间/夜间 */
export function ViewControls({
  lang,
  theme,
  onLang,
  onTheme,
}: {
  lang: Lang
  theme: Theme
  onLang: (l: Lang) => void
  onTheme: (t: Theme) => void
}) {
  return (
    <div className="view-controls">
      <div className="vc-seg" role="group" aria-label="语言 Language">
        <button className={lang === 'zh' ? 'vc on' : 'vc'} onClick={() => onLang('zh')} title="中文">
          中
        </button>
        <button className={lang === 'en' ? 'vc on' : 'vc'} onClick={() => onLang('en')} title="English">
          EN
        </button>
      </div>
      <div className="vc-seg" role="group" aria-label="主题 Theme">
        <button
          className={theme === 'light' ? 'vc on' : 'vc'}
          onClick={() => onTheme('light')}
          title="日间 Light"
        >
          ☀
        </button>
        <button
          className={theme === 'dark' ? 'vc on' : 'vc'}
          onClick={() => onTheme('dark')}
          title="夜间 Dark"
        >
          ☾
        </button>
      </div>
    </div>
  )
}

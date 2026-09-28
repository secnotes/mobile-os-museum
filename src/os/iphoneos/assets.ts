/**
 * iPhone OS 1.0 资源：开机 Apple logo PNG +（可选）真机 app 图标 PNG。
 * 默认全部程序化绘制；用户把真机 PNG 投入 public/iphone/{icons,boot}/ 即在此加载，
 * 调用方（springboard/boot）优先 blit PNG，否则回落到像素绘制。
 * loadAll() 在 OS init 时调用；未就绪时 icon()/boot() 返回 undefined。
 */
const BASE = `${import.meta.env.BASE_URL}iphone/`

/** app id → 图标文件名（真机 57×57 圆角 PNG，投入 public/iphone/icons/ 即生效） */
const ICON_FILES: Record<string, string> = {
  sms: 'icons/Text.png',
  calendar: 'icons/Calendar.png',
  photos: 'icons/Photos.png',
  camera: 'icons/Camera.png',
  youtube: 'icons/YouTube.png',
  stocks: 'icons/Stocks.png',
  maps: 'icons/Maps.png',
  weather: 'icons/Weather.png',
  clock: 'icons/Clock.png',
  calc: 'icons/Calculator.png',
  notes: 'icons/Notes.png',
  settings: 'icons/Settings.png',
  phone: 'icons/Phone.png',
  mail: 'icons/Mail.png',
  safari: 'icons/Safari.png',
  ipod: 'icons/iPod.png',
}

/** 开机/框架资源 */
const FW_FILES: Record<string, string> = {
  apple: 'boot/apple.png',
}

class IPhoneAssetStore {
  private imgs = new Map<string, CanvasImageSource>()
  private loaded = false

  /** 预加载全部图片（PNG 缺失时静默跳过，调用方回落像素绘制） */
  async loadAll(): Promise<void> {
    if (this.loaded) return
    const allImg: Record<string, string> = {
      ...Object.fromEntries(Object.entries(ICON_FILES).map(([k, v]) => [`icon:${k}`, v])),
      ...Object.fromEntries(Object.entries(FW_FILES).map(([k, v]) => [`fw:${k}`, v])),
    }
    await Promise.all(
      Object.entries(allImg).map(async ([name, file]) => {
        try {
          const res = await fetch(BASE + file)
          if (!res.ok) return
          const blob = await res.blob()
          const bmp = await createImageBitmap(blob)
          this.imgs.set(name, bmp)
        } catch {
          // 加载失败：调用方回落到像素绘制
        }
      }),
    )
    this.loaded = true
  }

  /** 应用图标（57×57 圆角 PNG） */
  icon(name: string): CanvasImageSource | undefined {
    return this.imgs.get(`icon:${name}`)
  }

  /** 框架资源（开机 Apple logo 等） */
  fw(name: keyof typeof FW_FILES): CanvasImageSource | undefined {
    return this.imgs.get(`fw:${name}`)
  }
}

export const assets = new IPhoneAssetStore()

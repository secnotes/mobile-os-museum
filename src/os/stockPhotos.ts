/**
 * 共享相册素材：public/photos/ 下的真实照片，供 Lumia / Android / iPhone 相册初始化。
 * 各 OS 的照片模型（WPhoto / APhoto / PhotoMeta）携带可选 `src` 字段指向此处文件名；
 * 渲染时若对应位图已加载则 blit 真实照片，否则回落到原有的程序化/调色板绘制。
 *
 * 图片来源：Lorem Picsum (picsum.photos)，真实摄影作品。
 */
const BASE = `${import.meta.env.BASE_URL}photos/`

export interface StockPhoto {
  /** 稳定 id（同时作为各 OS 照片 id 基址） */
  id: number
  file: string
  name: string
  nameEn: string
}

/** 6 张内置相册照片（横竖兼容的方形 640×640） */
export const STOCK_PHOTOS: StockPhoto[] = [
  { id: 101, file: 'sunset.jpg', name: '日落', nameEn: 'Sunset' },
  { id: 102, file: 'mountains.jpg', name: '雪山', nameEn: 'Mountains' },
  { id: 103, file: 'beach.jpg', name: '海岸', nameEn: 'Beach' },
  { id: 104, file: 'city.jpg', name: '城市', nameEn: 'City' },
  { id: 105, file: 'forest.jpg', name: '森林', nameEn: 'Forest' },
  { id: 106, file: 'flower.jpg', name: '花', nameEn: 'Flower' },
]

const cache = new Map<string, CanvasImageSource>()
let loading: Promise<void> | null = null

/** 预加载全部素材照片为 ImageBitmap；幂等。 */
export function loadStockBitmaps(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    await Promise.all(
      STOCK_PHOTOS.map(async (p) => {
        if (cache.has(p.file)) return
        try {
          const res = await fetch(BASE + p.file)
          if (!res.ok) return
          const blob = await res.blob()
          cache.set(p.file, await createImageBitmap(blob))
        } catch {
          /* 离线/加载失败：静默回落到程序化绘制 */
        }
      }),
    )
  })()
  return loading
}

/** 取已加载的素材位图；未加载则返回 undefined（调用方回落绘制）。 */
export function stockBitmap(file: string): CanvasImageSource | undefined {
  return cache.get(file)
}

/** 素材文件 → 公开 URL（供 blitBg 等需要直接 URL 的场景，一般用 stockBitmap）。 */
export function stockUrl(file: string): string {
  return BASE + file
}

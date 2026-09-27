/**
 * 虚拟屏幕：w×h 的像素缓冲，整数倍放大渲染出 LCD 质感。
 * 默认 1bit（单色 LCD）；传入 palette 则为调色板彩色模式（TFT 质感），
 * 像素值 = 调色板索引，0 号固定为底色。
 * 文字通过离屏 canvas 绘制后按 alpha 阈值转成像素点，天然支持汉字。
 */
export interface TextOpts {
  size?: number
  font?: string
  color?: number
  /** 硬裁剪宽度（真机上标题被裁断而非省略号） */
  maxWidth?: number
}

export class Screen {
  readonly w: number
  readonly h: number
  private buf: Uint8Array
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private scale: number
  private bg: string
  private fg: string
  private fontFamily: string
  /** 彩色模式：索引 → RGB；null 表示用底色 */
  private pal: Array<[number, number, number] | null> | null = null
  private bgRgb: [number, number, number] = [0, 0, 0]
  private imgCanvas: HTMLCanvasElement | null = null
  private imgCtx: CanvasRenderingContext2D | null = null
  private imgData: ImageData | null = null
  private off: HTMLCanvasElement
  private offCtx: CanvasRenderingContext2D
  /** 小字汉字 2× 超采样临时画布（平滑缩回，避免密集字笔画坍成黑块） */
  private off2: HTMLCanvasElement | null = null
  private off2Ctx: CanvasRenderingContext2D | null = null
  /** 位图叠加层（真机 PNG 图标等全彩资源），render 时合成在调色板缓冲之上 */
  private overlays: Array<{
    img: CanvasImageSource
    x: number
    y: number
    w?: number
    h?: number
    cx?: number
    cy?: number
    angle?: number
    sx?: number
    sy?: number
    sw?: number
    sh?: number
    smooth?: boolean
  }> = []
  /** 背景叠加层（真机壁纸）：render 时先于调色板缓冲绘制，调色板 bg(索引0)透明以透出壁纸 */
  private bgOverlays: Array<{
    img: CanvasImageSource
    x: number
    y: number
    w?: number
    h?: number
  }> = []

  constructor(
    canvas: HTMLCanvasElement,
    w: number,
    h: number,
    opts: {
      scale?: number
      bg?: string
      fg?: string
      /** 彩色调色板（CSS 颜色），索引 0 应为 null（底色） */
      palette?: ReadonlyArray<string | null>
      /** 文字默认字体族（如真机 Droid Sans）；缺省用系统等宽/中文 */
      fontFamily?: string
    } = {},
  ) {
    this.w = w
    this.h = h
    this.canvas = canvas
    this.buf = new Uint8Array(w * h)
    this.scale = opts.scale ?? 4
    this.bg = opts.bg ?? '#aebd8f'
    this.fg = opts.fg ?? '#25301f'
    this.fontFamily = opts.fontFamily ?? ''
    this.bgRgb = parseHex(this.bg)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * this.scale * dpr)
    canvas.height = Math.round(h * this.scale * dpr)
    // 自然尺寸 + 窄屏（手机浏览器）下随边框等比缩小，避免撑出机身
    canvas.style.width = `${w * this.scale}px`
    canvas.style.maxWidth = '100%'
    canvas.style.height = 'auto'
    canvas.style.aspectRatio = `${w} / ${h}`
    this.ctx = canvas.getContext('2d')!
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0)
    this.off = document.createElement('canvas')
    this.off.width = 8
    this.off.height = 40
    this.offCtx = this.off.getContext('2d', { willReadFrequently: true })!
    if (opts.palette) {
      this.pal = opts.palette.map((c) => (c ? parseHex(c) : null))
      this.imgCanvas = document.createElement('canvas')
      this.imgCanvas.width = w
      this.imgCanvas.height = h
      this.imgCtx = this.imgCanvas.getContext('2d')!
      this.imgData = this.imgCtx.createImageData(w, h)
      // 放大时保持像素锐利（TFT 而非模糊）
      this.ctx.imageSmoothingEnabled = false
    }
  }

  clear() {
    this.buf.fill(0)
    this.overlays.length = 0
    this.bgOverlays.length = 0
  }

  /** 仅清空前景位图叠加层（动效逐帧重铺时用，不动像素缓冲） */
  clearOverlays() {
    this.overlays.length = 0
  }

  /**
   * 截取当前已渲染画面到 w×h 离屏 canvas（转场动效的前/后帧）。
   * 须在 render() 之后调用；全部为程序绘制，画布不会被跨域素材污染。
   */
  snapshot(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, this.w, this.h)
    return c
  }

  /**
   * 合成位图（真机 PNG 图标/壁纸）到叠加层。
   * 坐标为逻辑屏幕坐标；render 时按 scale 放大绘制，默认 imageSmoothingEnabled=false 保持像素锐利。
   * 可选 w/h 缩放，cx/cy+angle 绕中心旋转（如时钟指针）；
   * sx/sy/sw/sh 取源图子矩形（转场裁剪），smooth=true 缩放时开启平滑。
   */
  blit(
    img: CanvasImageSource,
    x: number,
    y: number,
    opts: {
      w?: number; h?: number; cx?: number; cy?: number; angle?: number
      sx?: number; sy?: number; sw?: number; sh?: number; smooth?: boolean
    } = {},
  ) {
    this.overlays.push({ img, x, y, ...opts })
  }

  /**
   * 背景位图（真机壁纸）：render 时先于调色板缓冲绘制；
   * 调色板缓冲的 bg(索引 0)以透明合成，使壁纸在未被控件覆盖处透出。
   */
  blitBg(img: CanvasImageSource, x: number, y: number, opts: { w?: number; h?: number } = {}) {
    this.bgOverlays.push({ img, x, y, ...opts })
  }

  pset(x: number, y: number, v: number = 1) {
    x = x | 0
    y = y | 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    // 单色模式 v 恒为 0/1；彩色模式 v 为调色板索引，原样写入
    this.buf[y * this.w + x] = v
  }

  pget(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.buf[y * this.w + x]
  }

  fillRect(x: number, y: number, w: number, h: number, v: number = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.pset(i, j, v)
  }

  frameRect(x: number, y: number, w: number, h: number) {
    for (let i = x; i < x + w; i++) {
      this.pset(i, y)
      this.pset(i, y + h - 1)
    }
    for (let j = y; j < y + h; j++) {
      this.pset(x, j)
      this.pset(x + w - 1, j)
    }
  }

  invertRect(x: number, y: number, w: number, h: number) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue
        const k = j * this.w + i
        this.buf[k] = this.buf[k] ? 0 : 1
      }
  }

  /** 从 (x0,y0) 到 (x1,y1) 画线（Bresenham） */
  line(x0: number, y0: number, x1: number, y1: number, v: number = 1) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.pset(x0, y0, v)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  /** 按行绘制的点阵图，'#'/'1' 为亮，'.'/'0' 为灭 */
  bitmap(x: number, y: number, rows: string[]) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = row[i]
        if (c === '#' || c === '1') this.pset(x + i, y + j)
      }
    })
  }

  /**
   * 绘制文字（自动检测汉字），返回占用宽度；color 为调色板索引（单色模式恒为 1）。
   * maxWidth：硬裁剪到给定宽度（WP 瓷贴标题等真机就是裁断而非省略号）。
   */
  text(
    x: number,
    y: number,
    str: string,
    opts: TextOpts = {},
  ): number {
    const d = this.textData(str, opts)
    const ci = opts.color ?? 1
    const mw = opts.maxWidth
    for (let j = 0; j < d.h; j++)
      for (let i = 0; i < d.w; i++) {
        if (d.data[j * d.stride + i] && (mw === undefined || i < mw)) this.pset(x + i, y + j, ci)
      }
    return mw === undefined ? d.w : Math.min(d.w, mw)
  }

  /** 以 cx 为中心绘制 */
  textCenter(cx: number, y: number, str: string, opts: TextOpts = {}) {
    const d = this.textData(str, opts)
    this.text(cx - Math.floor(d.w / 2), y, str, opts)
  }

  /** 以 x 为右边界右对齐绘制 */
  textRight(x: number, y: number, str: string, opts: TextOpts = {}) {
    const d = this.textData(str, opts)
    this.text(x - d.w, y, str, opts)
  }

  /**
   * 旋转 90° 绘制文字（横屏游戏 HUD）：dir=1 顺时针、dir=-1 逆时针。
   * (x,y) 是逻辑原点映射到的物理坐标；返回旋转后沿物理 y 轴占用的长度。
   */
  textRot(
    x: number,
    y: number,
    str: string,
    dir: 1 | -1,
    opts: { size?: number; font?: string; color?: number } = {},
  ): number {
    const d = this.textData(str, opts)
    for (let j = 0; j < d.h; j++)
      for (let i = 0; i < d.w; i++) {
        if (!d.data[j * d.stride + i]) continue
        if (dir === 1) this.pset(x - j, y + i)
        else this.pset(x + j, y - i)
      }
    return d.w
  }

  measure(str: string, opts: { size?: number; font?: string; color?: number } = {}): number {
    return this.textData(str, opts).w
  }

  private textData(str: string, opts: { size?: number; font?: string; color?: number }): { data: Uint8Array; w: number; h: number; stride: number } {
    const hasHan = /[⺀-鿿　-〿＀-￯]/.test(str)
    const size = opts.size ?? (hasHan ? 12 : 9)
    const font =
      opts.font ??
      (this.fontFamily
        ? // 真机字体族（如 Droid Sans + Fallback）；优先用户声明，回落系统中文
          `${size}px "${this.fontFamily}", "Droid Sans Fallback", "PingFang SC", "Noto Sans CJK SC", sans-serif`
        : hasHan
          ? `${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
          : `bold ${size}px "Courier New", ui-monospace, monospace`)
    const c = this.offCtx
    c.font = font
    const w = Math.min(Math.ceil(c.measureText(str).width) + 2, 512)
    const h = size + 6
    if (this.off.width < w) this.off.width = w
    if (this.off.height < h) this.off.height = h
    // 调整 canvas 尺寸会重置状态，需重设
    c.font = font
    c.clearRect(0, 0, this.off.width, this.off.height)
    c.fillStyle = '#fff'
    c.textBaseline = 'alphabetic'
    // 小字汉字：先以 2× 光栅再平滑缩回——9px 直绘时密集字（置/警/闹…）
    // 相邻笔画会坍成实心块；2× 超采样保留笔画间隙（真机手工点阵字的替代方案）
    if (hasHan && size <= 10) {
      if (!this.off2) {
        this.off2 = document.createElement('canvas')
        this.off2Ctx = this.off2.getContext('2d', { willReadFrequently: true })
      }
      const c2 = this.off2Ctx!
      const sw = this.off.width * 2
      const sh = this.off.height * 2
      // canvas 初建默认 300×150：必须用不等判断（只判 < 会永不缩小，
      // drawImage 会把过大的源压进目标导致字全碎）
      if (this.off2.width !== sw) this.off2.width = sw
      if (this.off2.height !== sh) this.off2.height = sh
      const sizePrefix = `${size}px`
      c2.font = `${size * 2}px${font.slice(sizePrefix.length)}`
      c2.clearRect(0, 0, this.off2.width, this.off2.height)
      c2.fillStyle = '#fff'
      c2.textBaseline = 'alphabetic'
      c2.fillText(str, 2, size * 2 + 2)
      c.imageSmoothingEnabled = true
      c.drawImage(this.off2, 0, 0, this.off.width, this.off.height)
    } else {
      c.fillText(str, 1, size + 1)
    }
    const img = c.getImageData(0, 0, w, h)
    const data = new Uint8Array(w * h)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (img.data[(j * w + i) * 4 + 3] > 100) data[j * w + i] = 1
      }
    // 裁掉右侧空白列
    let last = 0
    for (let j = 0; j < h; j++)
      for (let i = w - 1; i >= 0; i--) {
        if (data[j * w + i]) { if (i + 1 > last) last = i + 1; break }
      }
    return { data, w: Math.max(last, 1), h, stride: w }
  }

  /** 将缓冲绘制到 canvas：彩色模式走 ImageData 整图放大，单色走留缝像素（LCD 质感） */
  render() {
    const { ctx } = this
    if (this.pal && this.imgCtx && this.imgData && this.imgCanvas) {
      const hasBg = this.bgOverlays.length > 0
      const d = this.imgData.data
      for (let k = 0; k < this.buf.length; k++) {
        const idx = this.buf[k]
        const o = k << 2
        if (hasBg && idx === 0) {
          // bg 透明：透出下层背景位图（真机壁纸）
          d[o + 3] = 0
          continue
        }
        const c = this.pal[idx] ?? this.bgRgb
        d[o] = c[0]
        d[o + 1] = c[1]
        d[o + 2] = c[2]
        d[o + 3] = 255
      }
      this.imgCtx.putImageData(this.imgData, 0, 0)
      // 1) 底色（无背景位图时作为可见底）
      ctx.fillStyle = this.bg
      ctx.fillRect(0, 0, this.w, this.h)
      // 2) 背景位图（真机壁纸，先于调色板缓冲）
      for (const b of this.bgOverlays) {
        if (b.w != null && b.h != null) ctx.drawImage(b.img, b.x, b.y, b.w, b.h)
        else ctx.drawImage(b.img, b.x, b.y)
      }
      // 3) 调色板缓冲（bg 透明处透出壁纸，控件不透明覆盖壁纸）
      ctx.drawImage(this.imgCanvas, 0, 0)
      // 4) 前景位图叠加层（真机 PNG 图标/时钟指针/转场帧，全彩，在最上层）
      for (const o of this.overlays) {
        if (o.smooth) {
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
        }
        if (o.angle != null && o.cx != null && o.cy != null) {
          ctx.save()
          ctx.translate(o.cx, o.cy)
          ctx.rotate(o.angle)
          if (o.w != null && o.h != null) ctx.drawImage(o.img, o.x - o.cx, o.y - o.cy, o.w, o.h)
          else ctx.drawImage(o.img, o.x - o.cx, o.y - o.cy)
          ctx.restore()
        } else if (o.w != null && o.h != null) {
          if (o.sw != null && o.sh != null)
            ctx.drawImage(o.img, o.sx ?? 0, o.sy ?? 0, o.sw, o.sh, o.x, o.y, o.w, o.h)
          else ctx.drawImage(o.img, o.x, o.y, o.w, o.h)
        } else {
          ctx.drawImage(o.img, o.x, o.y)
        }
        if (o.smooth) ctx.imageSmoothingEnabled = false
      }
      // 叠加层随场景持久：由 clear() 在下一次绘制周期开头清空，不在 render 中清除，
      // 这样 FrameHub 每帧调用 render() 时壁纸/图标等叠加层不会丢失。
      return
    }
    ctx.fillStyle = this.bg
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.fillStyle = this.fg
    for (let y = 0; y < this.h; y++) {
      const row = y * this.w
      for (let x = 0; x < this.w; x++) {
        if (this.buf[row + x]) ctx.fillRect(x + 0.06, y + 0.06, 0.88, 0.88)
      }
    }
  }
}

/** '#rgb' / '#rrggbb' → [r, g, b] */
function parseHex(c: string): [number, number, number] {
  const h = c.replace('#', '')
  const s = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

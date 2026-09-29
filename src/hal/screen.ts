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
  /** smooth 文本：是否带 1px 深色投影（白字压深底时开，与抽屉标签一致） */
  shadow?: boolean
  /** 彩色模式下强制走阈值点阵（不走 smooth 抗锯齿）：状态栏等极小 UI 字用，
   *  避免小字 AA 底排半透像素在深底上发灰、视觉上像被截断。 */
  crisp?: boolean
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
  /** 物理缩放（=scale*dpr），smooth 层用物理像素 1:1 合成，文字 AA 最锐利 */
  private phys = 1
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
    this.phys = this.scale * dpr
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
    if (this.smoothCvs) {
      this.smoothCtx!.setTransform(1, 0, 0, 1, 0, 0)
      this.smoothCtx!.clearRect(0, 0, this.smoothCvs.width, this.smoothCvs.height)
      this.smoothDirty = false
    }
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

  /**
   * 把程序化图标（app.icon 回调，画到调色板缓冲）渲染到一张透明背景的离屏 canvas，
   * 供在不透明 overlay 面板（如抽屉碳纤维底）之上用 blit 合成——否则调色板层会被
   * 后加的不透明 overlay 盖住。复用本 Screen 的调色板与字体；结果建议调用方缓存。
   */
  iconCanvas(draw: (s: Screen, x: number, y: number) => void, w = 28, h = 28): HTMLCanvasElement {
    // 用一个 sentinel 底色（调色板里不会出现的品红）渲染，再把该色替换为透明，
    // 得到真正透明底的图标画布。直接用调色板 buf 的 0 索引（底色）渲染成品红，
    // 图标像素（非 0 索引）按调色板着色，最后逐像素把品红改透明。
    const sentinel = '#ff00ff'
    const mini = new Screen(document.createElement('canvas'), w, h, {
      scale: 1,
      bg: sentinel,
      // 占位 palette（构造器会 parseHex）；真 pal 在下面直接覆盖（已是 RGB 数组，
      // 绕过 parseHex——它只认 hex，不认 rgb() 字符串）
      palette: this.pal ? this.pal.map(() => '#000000') : undefined,
      fontFamily: this.fontFamily,
    })
    if (this.pal) mini.pal = this.pal
    draw(mini, 0, 0)
    mini.render()
    const out = mini.snapshot()
    const g = out.getContext('2d')!
    const d = g.getImageData(0, 0, w, h)
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i] >= 250 && d.data[i + 1] <= 5 && d.data[i + 2] >= 250) {
        d.data[i + 3] = 0
      }
    }
    g.putImageData(d, 0, 0)
    return out
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
    // smooth 文本叠加层与调色板缓冲分离：fillRect 重铺不透明背景时，同步清空该矩形
    // 的 smooth 层，否则上一帧画在该处的文字（滚动/重绘时位置已变）会残留透出，与新帧
    // 文字重叠。使 smooth 文字获得与调色板文字一致的"被背景覆盖即清除"语义。
    if (this.smoothCvs && this.smoothDirty) {
      this.smoothCtx!.setTransform(1, 0, 0, 1, 0, 0)
      this.smoothCtx!.clearRect(x * this.smoothScale, y * this.smoothScale, w * this.smoothScale, h * this.smoothScale)
    }
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
   *
   * 彩色调色板模式（Android 等智能机）下转发到 textSmooth，统一全机文字抗锯齿，
   * 消除 app 内选项/列表字体的颗粒感；单色机走阈值化点阵以保留 LCD 质感。
   */
  text(
    x: number,
    y: number,
    str: string,
    opts: TextOpts = {},
  ): number {
    if (this.pal) {
      // crisp：状态栏等极小 UI 字走阈值点阵，避免 AA 底排半透发灰像被截断
      if (!opts.crisp) {
        this.textSmooth(x, y, str, opts)
        const w = this.measure(str, opts)
        return opts.maxWidth === undefined ? w : Math.min(w, opts.maxWidth)
      }
      // crisp 路径：阈值化点阵直接写调色板索引（与单色机 textData 同源）
      const d = this.textData(str, opts)
      const ci = opts.color ?? 1
      const mw = opts.maxWidth
      for (let j = 0; j < d.h; j++)
        for (let i = 0; i < d.w; i++) {
          if (d.data[j * d.stride + i] && (mw === undefined || i < mw)) this.pset(x + i, y + j, ci)
        }
      return mw === undefined ? d.w : Math.min(d.w, mw)
    }
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
    if (this.pal && !opts.crisp) { this.textCenterSmooth(cx, y, str, opts); return }
    const d = this.textData(str, opts)
    this.text(cx - Math.floor(d.w / 2), y, str, opts)
  }

  /** 以 x 为右边界右对齐绘制 */
  textRight(x: number, y: number, str: string, opts: TextOpts = {}) {
    if (this.pal && !opts.crisp) { this.textRightSmooth(x, y, str, opts); return }
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

  // ---------- smooth 文本叠加层 ----------
  // smooth 层用「整数倍超采样」渲染文字：smoothScale 取 ≥phys 的最小整数（如 iPhone
  // scale=1.1 → phys=1.1 → smoothScale=2）。文字在该倍率下 fillText 光栅化到完整物理像素
  // （非 1.1 子像素分数 → AA 不糊），render 时用 imageSmoothingQuality=high 缩到主画布物理尺寸。
  // 仅在显式调用 textSmooth* 时启用；单色机不调用即零开销。
  private smoothCvs: HTMLCanvasElement | null = null
  private smoothCtx: CanvasRenderingContext2D | null = null
  private smoothDirty = false
  /** smooth 层整数超采样倍率（≥phys，文字光栅化锐利） */
  private smoothScale = 1

  private initSmooth() {
    this.smoothScale = Math.max(2, Math.ceil(this.phys - 0.001))
    this.smoothCvs = document.createElement('canvas')
    this.smoothCvs.width = Math.round(this.w * this.smoothScale)
    this.smoothCvs.height = Math.round(this.h * this.smoothScale)
    this.smoothCtx = this.smoothCvs.getContext('2d')!
  }

  /** 解析调色板索引 → css 颜色（smooth 画布用） */
  private smoothColor(ci: number): string {
    if (this.pal) {
      const c = this.pal[ci] ?? this.bgRgb
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
    // 单色模式：1=fg，0=bg
    return ci ? this.fg : this.bg
  }

  /** 调色板索引 → css 颜色（公开，供 graphics.gloss 等取色） */
  colorOf(ci: number): string {
    return this.smoothColor(ci)
  }

  /** 与 textData 一致的字体族选择（供 smooth 与阈值两条路径共用） */
  private fontFor(str: string, size: number): string {
    const hasHan = /[⺀-鿿　-〿＀-￯]/.test(str)
    if (this.fontFamily)
      // 真机字体族（如 Droid Sans + Fallback）；优先用户声明，回落系统中文
      return `${size}px "${this.fontFamily}", "Droid Sans Fallback", "PingFang SC", "Noto Sans CJK SC", sans-serif`
    return hasHan
      ? `${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
      : `bold ${size}px "Courier New", ui-monospace, monospace`
  }

  /**
   * smooth 绘制文字（保留抗锯齿）。坐标语义与 text() 完全一致：基线对齐
   * textData 的离屏 (1, size+1) fillText → pset(x+i, y+j)，故替换 text() 不移位。
   * 直接在物理像素 smoothCvs 上 fillText（transform=phys），AA 最锐利；
   * color 为调色板索引；shadow=true 时带 1px 深色投影（白字压深底用，与抽屉标签一致）。
   */
  textSmooth(x: number, y: number, str: string, opts: TextOpts = {}) {
    if (!this.smoothCvs) this.initSmooth()
    const g = this.smoothCtx!
    const hasHan = /[⺀-鿿　-〿＀-￯]/.test(str)
    const size = opts.size ?? (hasHan ? 12 : 9)
    const font = opts.font ?? this.fontFor(str, size)
    g.save()
    g.setTransform(this.smoothScale, 0, 0, this.smoothScale, 0, 0)
    g.font = font
    g.textBaseline = 'alphabetic'
    if (opts.shadow) {
      g.shadowColor = 'rgba(0,0,0,0.7)'
      g.shadowBlur = 2
      g.shadowOffsetX = 1
      g.shadowOffsetY = 1
    }
    g.fillStyle = this.smoothColor(opts.color ?? 1)
    if (opts.maxWidth !== undefined) {
      // 硬裁剪到 maxWidth（与 text() 一致：超出列不绘）
      g.beginPath()
      g.rect(x, y, opts.maxWidth, size + 6)
      g.clip()
    }
    // 基线对齐 text()：textData 在离屏 (1, size+1) 处 fillText，再 pset(x+i, y+j)
    g.fillText(str, x + 1, y + size + 1)
    g.restore()
    this.smoothDirty = true
  }

  /** 以 cx 为中心 smooth 绘制（位置用 measure 对齐 textCenter，替换不移位） */
  textCenterSmooth(cx: number, y: number, str: string, opts: TextOpts = {}) {
    const w = this.measure(str, opts)
    this.textSmooth(cx - Math.floor(w / 2), y, str, opts)
  }

  /** 以 x 为右边界右对齐 smooth 绘制 */
  textRightSmooth(x: number, y: number, str: string, opts: TextOpts = {}) {
    const w = this.measure(str, opts)
    this.textSmooth(x - w, y, str, opts)
  }

  /**
   * 以 (cx, cy) 为几何中心绘制文字（水平 + 垂直居中，按实际字形墨区计算）。
   * 与 textCenter（y 是墨区顶）不同，按钮/键面/方块内的标签用它，避免文字偏下。
   */
  textCenterV(cx: number, cy: number, str: string, opts: TextOpts = {}) {
    const hasHan = /[⺀-鿿　-〿＀-￯]/.test(str)
    const size = opts.size ?? (hasHan ? 12 : 9)
    const font = opts.font ?? this.fontFor(str, size)
    const g = this.offCtx
    g.font = font
    const m = g.measureText(str)
    const a = m.actualBoundingBoxAscent ?? size * 0.8
    const d = m.actualBoundingBoxDescent ?? size * 0.2
    const w = Math.ceil(m.width)
    // text() 的 y 是光栅顶，光栅基线在 y+size+1；墨区中心 = 基线 + (d-a)/2，
    // 令墨区中心 = cy → 基线 = cy - (d-a)/2
    const y = Math.round(cy - (d - a) / 2 - size - 1)
    this.text(Math.round(cx - w / 2), y, str, opts)
  }

  /**
   * 清空 smooth 叠加层中指定逻辑区域：当某不透明面板（如抽屉）覆盖该区域时，
   * 其下方已画到 smoothCvs 的文字会因 blitSmooth 最后合成而透出面板之上，
   * 故面板绘制后须清空其覆盖区，避免下层文字漏出。区域外（如状态栏）保留。
   */
  clearSmooth(x: number, y: number, w: number, h: number) {
    if (!this.smoothCvs) return
    this.smoothCtx!.setTransform(1, 0, 0, 1, 0, 0)
    this.smoothCtx!.clearRect(x * this.smoothScale, y * this.smoothScale, w * this.smoothScale, h * this.smoothScale)
  }

  /**
   * 在 smooth 叠加层画一个顶部圆角矩形，纵向 alpha 渐变（glass 高光）：
   * alphaTop→0 衰减，真机 1.0 导航栏/工具栏顶部玻璃光泽。用原生 AA 路径绘制，
   * 无 Bayer 抖动散点（抖动在深底上呈雪花）。css 为颜色字符串，r 为顶部圆角半径。
   */
  glossSmooth(x: number, y: number, w: number, h: number, r: number, css: string, alphaTop: number) {
    if (!this.smoothCvs) this.initSmooth()
    const g = this.smoothCtx!
    g.save()
    g.setTransform(this.smoothScale, 0, 0, this.smoothScale, 0, 0)
    const bandH = Math.max(2, Math.round(h * 0.42))
    // 顶部圆角路径（仅顶角 r，底角方）
    g.beginPath()
    g.moveTo(x + r, y)
    g.lineTo(x + w - r, y)
    g.quadraticCurveTo(x + w, y, x + w, y + r)
    g.lineTo(x + w, y + bandH)
    g.lineTo(x, y + bandH)
    g.lineTo(x, y + r)
    g.quadraticCurveTo(x, y, x + r, y)
    g.closePath()
    g.clip()
    // 纵向 alpha 渐变
    const grad = g.createLinearGradient(0, y, 0, y + bandH)
    grad.addColorStop(0, css.replace('rgb', 'rgba').replace(')', `,${alphaTop})`))
    grad.addColorStop(1, css.replace('rgb', 'rgba').replace(')', ',0)'))
    g.fillStyle = grad
    g.fillRect(x, y, w, bandH)
    g.restore()
    this.smoothDirty = true
  }

  /** render 时把 smooth 叠加层合成到屏幕（在前景 overlay 之上，文字居顶） */
  private blitSmooth() {
    if (!this.smoothDirty || !this.smoothCvs) return
    const { ctx } = this
    // smoothCvs 以整数倍 smoothScale 渲染（≥phys），缩到主画布物理尺寸（w*phys × h*phys）。
    // smoothScale=phys（Android scale=4 等整数）时为 1:1 无缩放；
    // smoothScale>phys（iPhone phys=1.1→2）时高质量下采样，文字锐利。
    const dw = Math.round(this.w * this.phys), dh = Math.round(this.h * this.phys)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = this.smoothScale !== this.phys
    if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.smoothCvs, 0, 0, this.smoothCvs.width, this.smoothCvs.height, 0, 0, dw, dh)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(this.phys, 0, 0, this.phys, 0, 0)
  }

  private textData(str: string, opts: { size?: number; font?: string; color?: number }): { data: Uint8Array; w: number; h: number; stride: number } {
    const hasHan = /[⺀-鿿　-〿＀-￯]/.test(str)
    const size = opts.size ?? (hasHan ? 12 : 9)
    const font = opts.font ?? this.fontFor(str, size)
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
      // smooth 文本叠加层最后合成（在前景 overlay 之上，文字居顶，与抽屉 chrome 同位）
      this.blitSmooth()
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
    this.blitSmooth()
  }
}

/** '#rgb' / '#rrggbb' → [r, g, b] */
function parseHex(c: string): [number, number, number] {
  const h = c.replace('#', '')
  const s = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

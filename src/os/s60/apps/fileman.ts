import type { AppContext, MiniApp } from '../../../kernel/types'
import type { DeviceKey } from '../../../hal/input'
import { C } from '../palette'
import { W, CONTENT_TOP, titleBar, softBar, clearContent, wrapText } from '../ui'

/**
 * 文件管理：手机存储 / 存储卡两级根，文件夹树 drill-down，
 * 容量条、种子文件；图片可预览（与相册共享 'photos' 键），.txt 只读。
 */
export const filemanApp: MiniApp = {
  id: 'fileman',
  name: '文件管理',
  nameEn: 'File mgr.',
  start(ctx) {
    const ui = new FilemanUI(ctx)
    void ui.init()
    return () => ui.dispose()
  },
}

type FileKind = 'img' | 'txt' | 'snd' | 'unk'

interface FMFile {
  name: string
  size: number // KB
  kind: FileKind
  /** img：photos 数组下标（-1 = 种子位图，暂不支持，走占位） */
  photoIdx?: number
  text?: string
}

interface FMDir {
  name: string
  en: string
  dirs: FMDir[]
  files: FMFile[]
}

interface Memory {
  zh: string
  en: string
  totalKB: number
  usedKB: number
  root: FMDir
}

interface Frame { dir: FMDir; sel: number }

const PH_SCALE = 3

class FilemanUI {
  private offs: Array<() => void> = []
  private memories: Memory[] = []
  /** 帧栈：null=存储选择页；否则为文件夹路径 */
  private stack: Frame[] | null = null
  private memSel = 0
  private view: 'list' | 'img' | 'txt' = 'list'
  private openFile: FMFile | null = null
  private txtScroll = 0

  constructor(private ctx: AppContext) {}

  async init() {
    const photos = ((await this.ctx.host.getPhotos?.()) as number[][] | undefined) ?? []
    this.photosCache = photos
    this.memories = buildMemories(photos)
    this.offs.push(this.ctx.onKey((k) => this.onKey(k)))
    this.offs.push(this.ctx.onLang(() => this.draw()))
    this.draw()
  }

  dispose() { this.offs.forEach((off) => off()) }

  private onKey(k: DeviceKey) {
    if (this.view === 'img') {
      if (k === 'soft2' || k === 'back' || k === 'soft1' || k === 'ok') {
        this.view = 'list'
        this.draw()
      }
      return
    }
    if (this.view === 'txt') {
      switch (k) {
        case 'up': this.txtScroll = Math.max(0, this.txtScroll - 1); break
        case 'down': this.txtScroll += 1; break
        case 'soft1': case 'soft2': case 'back': this.view = 'list'; break
        default: return
      }
      this.draw()
      return
    }
    // 列表视图
    if (this.stack === null) {
      const n = this.memories.length
      switch (k) {
        case 'up': this.memSel = (this.memSel + n - 1) % n; break
        case 'down': this.memSel = (this.memSel + 1) % n; break
        case 'ok':
          this.stack = [{ dir: this.memories[this.memSel]!.root, sel: 0 }]
          break
        case 'soft2': case 'back': this.ctx.exit(); return
        default: return
      }
      this.draw()
      return
    }
    const f = this.stack[this.stack.length - 1]!
    const count = f.dir.dirs.length + f.dir.files.length
    switch (k) {
      case 'up': f.sel = (f.sel + count - 1) % count; break
      case 'down': f.sel = (f.sel + 1) % count; break
      case 'ok': this.openSelected(f); break
      case 'soft2': case 'back':
        this.stack.pop()
        if (!this.stack.length) this.stack = null
        break
      default: return
    }
    this.draw()
  }

  private openSelected(f: Frame) {
    if (f.sel < f.dir.dirs.length) {
      this.stack!.push({ dir: f.dir.dirs[f.sel]!, sel: 0 })
      return
    }
    const file = f.dir.files[f.sel - f.dir.dirs.length]!
    this.openFile = file
    if (file.kind === 'img' && (file.photoIdx ?? -1) >= 0) {
      this.view = 'img'
    } else if (file.kind === 'txt') {
      this.view = 'txt'
      this.txtScroll = 0
    }
    // 声音/未知类型：真机弹提示框，博物馆里不切视图，无额外动作
  }

  // ---------- 绘制 ----------

  private draw() {
    const s = this.ctx.screen
    const en = this.ctx.lang.get() === 'en'
    clearContent(s)
    if (this.view === 'img') return this.drawImg(en)
    if (this.view === 'txt') return this.drawTxt(en)
    if (this.stack === null) return this.drawMemoryPick(en)
    this.drawDir(en)
  }

  /** 存储选择页：两条 + 容量条 */
  private drawMemoryPick(en: boolean) {
    const s = this.ctx.screen
    titleBar(s, en ? 'File manager' : '文件管理')
    this.memories.forEach((m, i) => {
      const y = CONTENT_TOP + 18 + i * 92
      const selRow = i === this.memSel
      if (selRow) s.fillRect(8, y - 4, W - 16, 82, C.BLUE)
      // 存储卡图标
      s.fillRect(22, y + 8, 30, 22, selRow ? C.PALE : C.GRAY)
      s.fillRect(46, y + 13, 4, 10, selRow ? C.AMBER : C.GRAY)
      s.text(64, y + 10, en ? m.en : m.zh, { size: 15, color: selRow ? C.WHITE : C.INK })
      s.text(64, y + 30, en
        ? `${(m.usedKB / 1024).toFixed(1)} MB used of ${(m.totalKB / 1024).toFixed(0)} MB`
        : `已用 ${(m.usedKB / 1024).toFixed(1)} MB / 共 ${(m.totalKB / 1024).toFixed(0)} MB`,
        { size: 10, color: selRow ? C.PALE : C.GRAY })
      // 容量条
      s.fillRect(64, y + 50, W - 92, 8, selRow ? C.NAVY : C.PALE)
      const pct = m.usedKB / m.totalKB
      s.fillRect(64, y + 50, Math.round((W - 92) * pct), 8, pct > 0.9 ? C.RED : C.GREEN)
    })
    softBar(s, en ? 'Open' : '打开', en ? 'Exit' : '退出')
  }

  /** 文件夹内容列表 */
  private drawDir(en: boolean) {
    const s = this.ctx.screen
    const f = this.stack![this.stack!.length - 1]!
    titleBar(s, en ? f.dir.en : f.dir.name)
    const ROW_H = 32
    const rows: Array<{ label: string; sub: string; dir: boolean }> = [
      ...f.dir.dirs.map((d) => ({ label: en ? d.en : d.name, sub: en ? 'Folder' : '文件夹', dir: true })),
      ...f.dir.files.map((fl) => ({ label: fl.name, sub: sizeText(fl.size), dir: false })),
    ]
    rows.forEach((r, i) => {
      const y = CONTENT_TOP + 6 + i * ROW_H
      const selRow = i === f.sel
      if (selRow) s.fillRect(6, y - 2, W - 12, ROW_H, C.BLUE)
      s.text(14, y + 4, r.dir ? '📁' : iconFor(r.dir ? 'unk' : f.dir.files[i - f.dir.dirs.length]!.kind),
        { size: 13, color: selRow ? C.AMBER : C.BLUE })
      s.text(40, y + 4, r.label, { size: 13, color: selRow ? C.WHITE : C.INK })
      s.text(40, y + 19, r.sub, { size: 9, color: selRow ? C.PALE : C.GRAY })
    })
    softBar(s, en ? 'Open' : '打开', en ? 'Back' : '返回')
  }

  /** 图片预览（复用相册 64×48 横版位图，3 倍放大） */
  private drawImg(en: boolean) {
    const s = this.ctx.screen
    titleBar(s, this.openFile!.name)
    // 照片在 init 时经 host 从相机相册读取，openFile.photoIdx 指向 photos
    const photo = this.lookupPhoto(this.openFile!.photoIdx!)
    if (photo) {
      const ox = (W - 64 * PH_SCALE) / 2
      const oy = CONTENT_TOP + 40
      s.fillRect(ox - 3, oy - 3, 64 * PH_SCALE + 6, 48 * PH_SCALE + 6, C.INK)
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 64; x++)
          s.fillRect(ox + x * PH_SCALE, oy + y * PH_SCALE, PH_SCALE, PH_SCALE,
            photo[y * 64 + x] ?? 0)
    }
    softBar(s, '', en ? 'Back' : '返回')
  }

  private photosCache: number[][] = []
  private lookupPhoto(idx: number): number[] | null {
    return this.photosCache[idx] ?? null
  }


  /** .txt 只读 */
  private drawTxt(en: boolean) {
    const s = this.ctx.screen
    titleBar(s, this.openFile!.name)
    const lines = wrapText(s, this.openFile!.text ?? '', W - 24, 12)
    const maxScroll = Math.max(0, lines.length - 17)
    this.txtScroll = Math.min(this.txtScroll, maxScroll)
    lines.slice(this.txtScroll, this.txtScroll + 17).forEach((ln, i) => {
      s.text(12, CONTENT_TOP + 8 + i * 15, ln, { size: 12, color: C.INK })
    })
    softBar(s, '', en ? 'Back' : '返回')
  }
}

function iconFor(kind: FileKind): string {
  switch (kind) {
    case 'img': return '🖼'
    case 'txt': return '📄'
    case 'snd': return '🎵'
    default: return '❔'
  }
}

function sizeText(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

// ---------- 种子数据 ----------

function dir(name: string, en: string, dirs: FMDir[], files: FMFile[]): FMDir {
  return { name, en, dirs, files }
}

function buildMemories(photos: number[][]): Memory[] {
  const photoFiles: FMFile[] = photos.map((_, i) => ({
    name: `照片_${String(i + 1).padStart(2, '0')}.jpg`,
    size: 28 + (i % 4) * 7,
    kind: 'img',
    photoIdx: i,
  }))
  const phoneImages = dir('图像', 'Images', [], [
    { name: '壁纸默认.jpg', size: 52, kind: 'img' },
    ...photoFiles.slice(0, 2),
  ])
  const phoneSounds = dir('声音文件', 'Sound files', [], [
    { name: 'Nokia tune.ogg', size: 96, kind: 'snd' },
    { name: '信息提示.aac', size: 18, kind: 'snd' },
  ])
  const phoneDocs = dir('文档', 'Documents', [], [
    { name: '使用说明.txt', size: 2, kind: 'txt', text: PHONE_README },
  ])
  const phoneRoot = dir('手机存储', 'Phone memory',
    [phoneImages, phoneSounds, phoneDocs], [])

  const cardImages = dir('图像', 'Images', [], photoFiles.length
    ? photoFiles
    : [{ name: '示例.jpg', size: 40, kind: 'img' }])
  const cardSounds = dir('声音文件', 'Sound files', [], [
    { name: '铃声合集.mp3', size: 820, kind: 'snd' },
    { name: '录音.amr', size: 64, kind: 'snd' },
  ])
  const cardVideos = dir('视频片段', 'Video clips', [], [
    { name: '短片.3gp', size: 1240, kind: 'unk' },
  ])
  const cardDocs = dir('文档', 'Documents', [], [
    { name: '备忘.txt', size: 1, kind: 'txt', text: CARD_TXT },
  ])
  const cardOther = dir('其他', 'Other', [], [
    { name: '数据.dat', size: 320, kind: 'unk' },
  ])
  const cardRoot = dir('存储卡', 'Memory card',
    [cardImages, cardSounds, cardVideos, cardDocs, cardOther], [])

  const photoKB = photoFiles.reduce((a, f) => a + f.size, 0)
  return [
    {
      zh: '手机存储', en: 'Phone memory',
      totalKB: 43_008, // ~42 MB
      usedKB: 14_600 + photoKB,
      root: phoneRoot,
    },
    {
      zh: '存储卡', en: 'Memory card',
      totalKB: 1_048_576, // 1 GB
      usedKB: 128_400 + photoKB,
      root: cardRoot,
    },
  ]
}

const PHONE_README = [
  '欢迎使用诺基亚 N73。',
  '本文件为文件管理器中的只读文本示例。',
  '可使用上下方向键滚动查看。',
].join('\n')

const CARD_TXT = '购物清单：牛奶、面包、电池。'

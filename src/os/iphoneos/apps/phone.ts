import type { Screen } from '../../../hal/screen'
import { C, R } from '../palette'
import { F_BOLD, F_REG } from '../fonts'
import { rr, rrGrad, disc, rrStroke, discStroke } from '../graphics'
import { statusBar, clockString } from '../statusbar'
import { IphoneApp, miniApp } from './common'
import { iconPhone } from '../icons'
import { Scroller } from '../scroll'
import { drawNavBar, navTap } from '../navbar'
import { drawTabBar, tabHit, type TabItem } from '../tabbar'
import type { Contact, CallEntry } from '../../../scenario/data'

// 真机 1.0 标准 12 键：末行 * 0(# 居中)（0 的次标 + 长按输入）
const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#']
const SUBS = ['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+','']

type TabName = 'fav' | 'rec' | 'contacts' | 'keys' | 'vm'

/**
 * Phone：真机 1.0 五标签（个人收藏/最近通话/通讯录/拨号键盘/语音信箱）。
 */
class PhoneApp extends IphoneApp {
  // 真机 1.0 新开电话应用落在首个标签：个人收藏
  private tab: TabName = 'fav'
  private number = ''
  private keyFlash = -1
  private detail: Contact | null = null
  private recMode: 'all' | 'missed' = 'all'
  private vmSel = -1
  private vmPlay = 0
  private scrollers: Record<string, Scroller> = {
    fav: new Scroller(() => this.draw()),
    rec: new Scroller(() => this.draw()),
    contacts: new Scroller(() => this.draw()),
    vm: new Scroller(() => this.draw()),
  }
  private favTels: string[] | null = null
  private favEdit = false
  private favPick = false

  start() {
    super.start()
    void this.ctx.store.get<string[]>('phone:favs').then((v) => {
      if (v) { this.favTels = v; this.draw() }
    })
  }

  protected draw() {
    const s = this.ctx.screen
    const onKeys = this.tab === 'keys' && !this.detail
    s.fillRect(0, 0, 320, 480, onKeys ? C.BLACK : C.GRAY7)
    statusBar(s, { dark: onKeys, batteryPct: this.bridge.batteryPct(), clock: clockString(this.bridge.now()) })
    if (this.detail) { this.drawDetail(s); return }
    const titles: Record<TabName, string> = {
      fav: this.str.favorites, rec: this.str.recents, contacts: this.str.contacts,
      keys: this.str.keypad, vm: this.str.voicemail,
    }
    const top = 64, bottom = 431
    if (onKeys) {
      // 真机拨号键盘：无导航栏，黑底满铺到标签栏
      s.fillRect(0, 20, 320, bottom - 20, C.BLACK)
      this.drawKeypad(s)
    } else {
      if (this.tab === 'fav') this.drawFavNavBar(s)
      else if (this.tab === 'rec') {
        // 真机 1.0 Recents 导航栏右侧 Clear 按钮（有记录时）
        drawNavBar(s, {
          title: titles[this.tab],
          right: this.bridge.callLog().length ? { title: this.str.clear } : undefined,
        })
      } else drawNavBar(s, { title: titles[this.tab] })
      s.fillRect(0, top, 320, bottom - top, C.WHITE)
      if (this.tab === 'rec') this.drawRecents(s, bottom)
      if (this.tab === 'contacts') this.drawContacts(s, top, bottom)
      if (this.tab === 'fav') this.drawFavs(s, top, bottom)
      if (this.tab === 'vm') this.drawVoicemail(s, top, bottom)
    }
    drawTabBar(s, this.tabItems(), this.tabIndex(), C.BLUE)
  }

  // ---------- 拨号键盘 ----------

  private drawKeypad(s: Screen) {
    // 号码显示（白色，黑底）
    s.textCenter(160, 48, this.number || ' ', { size: 30, font: F_BOLD(30), color: C.WHITE })
    // 左上 add contact，右上 delete（白色线性图标）
    this.miniIcon(s, 47, 76, 'add', C.WHITE)
    if (this.number) this.miniIcon(s, 273, 76, 'del', C.WHITE)
    // 12 个圆键：白键黑字；按下为灰键白字
    KEYS.forEach((k, i) => {
      const col = i % 3, row = (i / 3) | 0
      const cx = 53 + col * 107
      const cy = 122 + row * 70
      const flash = this.keyFlash === i
      rrGrad(s, cx - 30, cy - 30, 60, 60, 30, flash ? R.CALC_DARKB : R.KEY)
      discStroke(s, cx, cy, 30, C.GRAY4)
      s.textCenter(cx, cy - 15, k, { size: 28, font: F_REG(28), color: flash ? C.WHITE : C.INK })
      if (SUBS[i]) s.textCenter(cx, cy + 9, SUBS[i], { size: 11, font: F_BOLD(11), color: flash ? C.WHITE : C.GRAY3 })
    })
    // 绿色呼叫圆键
    rrGrad(s, 130, 368, 60, 60, 30, R.GREEN_BTN)
    const cx = 160, cy = 398
    const t = 8
    for (let i = -13; i <= 13; i++)
      s.fillRect(cx + i - (t >> 1), cy - i - (t >> 1), t, t, C.WHITE)
    disc(s, cx - 13, cy + 13, 6, C.WHITE)
    disc(s, cx + 13, cy - 13, 6, C.WHITE)
  }

  private miniIcon(s: Screen, cx: number, cy: number, kind: 'add' | 'del', v: number) {
    if (kind === 'add') {
      // 小人 + 小十字
      disc(s, cx, cy - 5, 4, v)
      rr(s, cx - 6, cy + 2, 12, 8, 3, v)
      s.fillRect(cx + 8, cy - 8, 2, 8, v)
      s.fillRect(cx + 5, cy - 5, 8, 2, v)
    } else {
      // ⌫：外轮廓 + × 内标（线框）
      s.fillRect(cx - 8, cy - 6, 2, 12, v)
      s.fillRect(cx + 6, cy - 6, 2, 12, v)
      s.fillRect(cx - 6, cy - 8, 14, 2, v)
      s.fillRect(cx - 6, cy + 6, 14, 2, v)
      s.line(cx - 3, cy - 3, cx + 2, cy + 2, v)
      s.line(cx + 2, cy - 3, cx - 3, cy + 2, v)
    }
  }

  // ---------- 最近通话 ----------

  private drawRecents(s: Screen, bottom: number) {
    // 分段 All / Missed
    this.segmented(s, 53, 70, 214, 30, [this.str.all, this.str.missed], this.recMode === 'all' ? 0 : 1)
    const listTop = 112
    const rows = this.recRows()
    const sc = this.scrollers.rec!
    sc.setContent(rows.length * 48, bottom - listTop)
    s.fillRect(0, listTop, 320, bottom - listTop, C.WHITE)
    rows.forEach((e, i) => {
      const y = listTop + i * 48 - sc.offset
      if (y < listTop - 48 || y > bottom) return
      const missed = e.missed
      s.text(12, y + 8, e.name, { size: 18, font: F_REG(18), color: missed ? C.RED : C.INK })
      s.text(12, y + 30, missed ? this.str.missed : e.dir === 'out' ? '↗' : '↙', { size: 12, font: F_REG(12), color: C.GRAY3 })
      this.rowChevron(s, y)
      s.fillRect(12, y + 47, 296, 1, C.GRAY6)
    })
  }

  private recRows(): CallEntry[] {
    const all = this.bridge.callLog()
    return this.recMode === 'missed' ? all.filter((e) => e.missed) : all
  }

  // ---------- 通讯录 ----------

  private drawContacts(s: Screen, top: number, bottom: number) {
    const contacts = [...this.bridge.contacts()].sort((a, b) => a.name.localeCompare(b.name))
    const sc = this.scrollers.contacts!
    sc.setContent(contacts.length * 44, bottom - top)
    contacts.forEach((c, i) => {
      const y = top + i * 44 - sc.offset
      if (y < top - 44 || y > bottom) return
      s.text(12, y + 12, c.name, { size: 18, font: F_REG(18), color: C.INK })
      this.rowChevron(s, y)
      s.fillRect(12, y + 43, 296, 1, C.GRAY6)
    })
  }

  // ---------- 个人收藏 ----------

  private favRows(): Contact[] {
    const all = this.bridge.contacts()
    if (!this.favTels) return [...all]
    return this.favTels
      .map((t) => all.find((c) => c.tel === t))
      .filter((c): c is Contact => !!c)
  }

  private saveFavs() {
    this.ctx.store.set('phone:favs', this.favTels)
  }

  /** Favorites 导航栏：左 Edit 钮、右 + 圆钮 */
  private drawFavNavBar(s: Screen) {
    if (this.favPick) {
      drawNavBar(s, { title: this.str.addContact, back: this.str.favorites })
      return
    }
    drawNavBar(s, { title: this.str.favorites })
    // Edit：白色描边胶囊
    rrStroke(s, 7, 27, 52, 30, 5, C.WHITE)
    s.textCenter(33, 35, this.str.edit, { size: 13, font: F_REG(13), color: C.WHITE })
    // +：深蓝圆钮
    rrGrad(s, 287, 27, 28, 28, 6, R.BLUE_BTN)
    s.textCenter(301, 31, '+', { size: 20, font: F_REG(20), color: C.WHITE })
  }

  private drawFavs(s: Screen, top: number, bottom: number) {
    if (this.favPick) { this.drawFavPick(s, top, bottom); return }
    const favs = this.favRows()
    const sc = this.scrollers.fav!
    sc.setContent(favs.length * 44, bottom - top)
    favs.forEach((c, i) => {
      const y = top + i * 44 - sc.offset
      if (y < top - 44 || y > bottom) return
      const nameX = this.favEdit ? 40 : 12
      if (this.favEdit) {
        rrGrad(s, 10, y + 11, 22, 22, 11, R.RED_BTN)
        s.textCenter(21, y + 14, '–', { size: 20, font: F_BOLD(20), color: C.WHITE })
      }
      s.text(nameX, y + 10, c.name, { size: 18, font: F_BOLD(18), color: C.INK })
      // home/mobile 灰色标签
      s.textRight(264, y + 13, c.home ? 'home' : 'mobile', { size: 13, font: F_REG(13), color: C.GRAY3 })
      // 蓝色圆形 › 钮
      const cx = 295
      rrGrad(s, cx - 12, y + 10, 24, 24, 12, R.BLUE_BTN)
      s.textCenter(cx, y + 14, '›', { size: 20, font: F_BOLD(20), color: C.WHITE })
      s.fillRect(nameX, y + 43, 308 - nameX, 1, C.GRAY6)
    })
  }

  /** + 后的联系人挑选列表（尚未收藏的联系人） */
  private drawFavPick(s: Screen, top: number, bottom: number) {
    const list = this.bridge.contacts().filter((c) => !this.favRows().some((f) => f.tel === c.tel))
    const sc = this.scrollers.fav!
    sc.setContent(list.length * 44, bottom - top)
    list.forEach((c, i) => {
      const y = top + i * 44 - sc.offset
      if (y < top - 44 || y > bottom) return
      s.text(12, y + 10, c.name, { size: 18, font: F_REG(18), color: C.INK })
      this.rowChevron(s, y)
      s.fillRect(12, y + 43, 296, 1, C.GRAY6)
    })
  }

  // ---------- 语音信箱 ----------

  private drawVoicemail(s: Screen, top: number, bottom: number) {
    const items = this.str.voicemailNames
    const sc = this.scrollers.vm!
    sc.setContent(items.length * 48 + 50, bottom - top)
    items.forEach((name, i) => {
      const y = top + 10 + i * 48 - sc.offset
      if (y < top - 48 || y > bottom) return
      const sel = this.vmSel === i
      if (sel) s.fillRect(0, y, 320, 48, C.BLUE)
      // 小喇叭
      s.fillRect(12, y + 16, 4, 12, sel ? C.WHITE : C.BLUE)
      s.fillRect(16, y + 12, 6, 20, sel ? C.WHITE : C.BLUE)
      s.fillRect(22, y + 8, 3, 28, sel ? C.WHITE : C.BLUE)
      s.text(38, y + 13, name, { size: 18, font: F_REG(18), color: sel ? C.WHITE : C.INK })
      s.fillRect(sel ? 0 : 12, y + 47, sel ? 320 : 296, 1, C.GRAY6)
    })
    // 播放条
    if (this.vmSel >= 0) {
      const y = bottom - 4
      s.fillRect(0, y, 320, 2, C.GRAY5)
      s.text(12, bottom - 28, '▶', { size: 16, font: F_BOLD(16), color: C.BLUE })
      const dur = 12 + this.vmSel * 5
      s.textRight(308, bottom - 26, `${dur}"`, { size: 13, font: F_REG(13), color: C.GRAY3 })
    }
  }

  // ---------- 联系人详情 ----------

  private drawDetail(s: Screen) {
    drawNavBar(s, { title: this.detail!.name, back: this.str.contacts })
    s.fillRect(0, 64, 320, 416, C.GRAY7)
    // 大姓名
    s.textCenter(160, 90, this.detail!.name, { size: 24, font: F_BOLD(24), color: C.INK })
    // 两个操作按钮
    rrGrad(s, 24, 138, 130, 44, 8, R.CALC_DARKB)
    s.textCenter(89, 151, this.str.apps.text, { size: 17, font: F_BOLD(17), color: C.WHITE })
    rrGrad(s, 166, 138, 130, 44, 8, R.GREEN_BTN)
    s.textCenter(231, 151, this.str.apps.phone, { size: 17, font: F_BOLD(17), color: C.WHITE })
    // 号码组
    rr(s, 8, 208, 304, 44, 8, C.WHITE)
    rrStroke(s, 8, 208, 304, 44, 8, C.GRAY5)
    s.text(20, 220, this.detail!.tel, { size: 18, font: F_REG(18), color: C.BLUE })
  }

  // ---------- 交互 ----------

  protected statusTap(): boolean {
    if (this.detail) return false
    const sc = this.scrollers[this.tab]
    if (!sc) return false // 拨号键盘标签无滚动视图
    sc.scrollTo(0)
    return true
  }

  protected tap(x: number, y: number) {
    // Favorites 专属导航：Edit / +
    if (!this.detail && this.tab === 'fav' && y < 64) {
      if (this.favPick) {
        if (navTap(x, y) === 'back') { this.favPick = false; this.draw() }
        return
      }
      if (x < 80) { this.favEdit = !this.favEdit; this.draw() }
      else if (x > 276) { this.favPick = true; this.draw() }
      return
    }
    const nav = navTap(x, y)
    if (nav === 'back') {
      if (this.detail) { this.detail = null; this.draw() }
      return
    }
    if (nav === 'right' && this.tab === 'rec') {
      this.bridge.clearRecents()
      this.draw()
      return
    }
    if (this.detail) {
      if (y >= 138 && y < 182) {
        if (x < 156) { /* 发短信：打开短信线程 */ this.bridge.threadOf(this.detail!.tel, this.detail!.name) }
        else this.bridge.startCall(this.detail!.tel, this.detail!.name)
      }
      if (y >= 208 && y < 252) this.bridge.startCall(this.detail!.tel, this.detail!.name)
      return
    }
    // tab bar
    const ti = tabHit(x, y, 5)
    if (ti !== null) {
      this.tab = (['fav', 'rec', 'contacts', 'keys', 'vm'] as const)[ti]
      // 查看最近通话 → 清 Phone 图标未接角标（真机行为）
      if (this.tab === 'rec') this.bridge.clearMissed()
      this.draw()
      return
    }
    if (this.tab === 'keys') this.tapKeypad(x, y)
    if (this.tab === 'rec') this.tapRecents(x, y)
    if (this.tab === 'contacts') this.tapContactList(x, y)
    if (this.tab === 'fav') this.tapFavs(x, y)
    if (this.tab === 'vm') this.tapVm(x, y)
  }

  private tapKeypad(x: number, y: number) {
    for (let i = 0; i < KEYS.length; i++) {
      const col = i % 3, row = (i / 3) | 0
      const cx = 53 + col * 107
      const cy = 122 + row * 70
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= 30 * 30) {
        this.number = (this.number + KEYS[i]).slice(0, 15)
        this.keyFlash = i
        this.ctx.audio.dtmf(KEYS[i]!)
        setTimeout(() => { this.keyFlash = -1; this.draw() }, 110)
        this.draw()
        return
      }
    }
    // call
    const dx = x - 160, dy = y - 398
    if (dx * dx + dy * dy <= 30 * 30 && this.number) {
      this.bridge.startCall(this.number)
      return
    }
    // delete
    if (this.number && Math.abs(x - 273) < 14 && Math.abs(y - 76) < 16) {
      this.number = this.number.slice(0, -1)
      this.draw()
    }
  }

  protected longPress(x: number, y: number) {
    if (this.tab === 'keys' && this.number && Math.abs(x - 273) < 14 && Math.abs(y - 76) < 16) {
      this.number = ''
      this.draw()
    }
  }

  private tapRecents(x: number, y: number) {
    if (y >= 70 && y < 100) {
      if (Math.abs(x - 160) < 110) {
        this.recMode = x < 160 ? 'all' : 'missed'
        this.draw()
      }
      return
    }
    const rows = this.recRows()
    const i = Math.floor((y - 112) / 48)
    if (i >= 0 && i < rows.length) {
      const e = rows[i]!
      this.rowPress(() => {
        this.detail = { name: e.name, tel: e.tel }
        this.draw()
      })
    }
  }

  private tapContactList(x: number, y: number) {
    const contacts = [...this.bridge.contacts()].sort((a, b) => a.name.localeCompare(b.name))
    const i = Math.floor((y - 64) / 44)
    if (i >= 0 && i < contacts.length && x < 300) {
      const c = contacts[i]!
      this.rowPress(() => {
        this.detail = c
        this.draw()
      })
    }
  }

  private tapFavs(x: number, y: number) {
    const off = this.scrollers.fav!.offset
    if (this.favPick) {
      const list = this.bridge.contacts().filter((c) => !this.favRows().some((f) => f.tel === c.tel))
      const i = Math.floor((y - 64 + off) / 44)
      if (i >= 0 && i < list.length) {
        const tel = list[i]!.tel
        this.rowPress(() => {
          this.favTels = this.favRows().map((c) => c.tel).concat(tel)
          this.saveFavs()
          this.favPick = false
          this.draw()
        })
      }
      return
    }
    const favs = this.favRows()
    const i = Math.floor((y - 64 + off) / 44)
    if (i >= 0 && i < favs.length) {
      if (this.favEdit && x < 38) {
        this.favTels = this.favRows().map((c) => c.tel).filter((t) => t !== favs[i]!.tel)
        this.saveFavs()
        this.draw()
        return
      }
      const c = favs[i]!
      this.rowPress(() => {
        this.detail = { name: c.name, tel: c.tel }
        this.draw()
      })
    }
  }

  private tapVm(x: number, y: number) {
    const items = this.str.voicemailNames
    const i = Math.floor((y - 74) / 48)
    if (i >= 0 && i < items.length) {
      this.rowPress(() => {
        this.vmSel = i
        this.vmPlay = 0
        this.draw()
      })
      return
    }
    // ▶ 播放：仅动画进度
    if (this.vmSel >= 0 && y >= 395 && y < 420 && x < 40) this.vmPlay = this.vmPlay ? 0 : 1
  }

  protected drag(_x: number, y: number, _sx: number, sy: number) {
    if (this.detail) return
    const map: Record<TabName, string> = { fav: 'fav', rec: 'rec', contacts: 'contacts', keys: '', vm: 'vm' }
    const key = map[this.tab]
    if (key && y < 431 && y > 108) this.scrollers[key]!.onDrag(y, sy)
  }
  protected dragEnd() {
    for (const sc of Object.values(this.scrollers)) sc.onEnd()
  }
  protected frame(dt: number) {
    super.frame(dt)
    for (const sc of Object.values(this.scrollers)) sc.step(dt)
    if (this.vmPlay && this.vmSel >= 0) {
      this.vmPlay += dt
      if (this.vmPlay > 12 + this.vmSel * 5) this.vmPlay = 0
      if (Math.floor(this.blink * 4) % 2 === 0) this.draw()
    }
  }

  // ---------- 标签栏 ----------

  private tabIndex(): number {
    return (['fav', 'rec', 'contacts', 'keys', 'vm'] as const).indexOf(this.tab)
  }

  private tabItems(): TabItem[] {
    return [
      { label: this.str.favorites, icon: (s, x, y, v) => tabStar(s, x - 1, y - 10, v) },
      { label: this.str.recents, icon: (s, x, y, v) => tabClock(s, x, y - 10, v) },
      { label: this.str.contacts, icon: (s, x, y, v) => tabPerson(s, x, y - 10, v) },
      { label: this.str.keypad, icon: (s, x, y, v) => tabDots(s, x, y - 10, v) },
      { label: this.str.voicemail, icon: (s, x, y, v) => tabTape(s, x, y - 10, v) },
    ]
  }

  private segmented(s: Screen, x: number, y: number, w: number, h: number, labels: [string, string], sel: number) {
    rr(s, x, y, w, h, 6, C.WHITE)
    rrStroke(s, x, y, w, h, 6, C.GRAY4)
    s.fillRect(x + (w >> 1) - 1, y + 4, 1, h - 8, C.GRAY5)
    labels.forEach((l, i) =>
      s.textCenter(x + (w >> 1) * (i ? 3 : 1), y + 8, l, {
        size: 14, font: i === sel ? F_BOLD(14) : F_REG(14), color: i === sel ? C.INK : C.GRAY3,
      }))
  }

  private rowChevron(s: Screen, y: number) {
    s.line(294, y + 14, 300, y + 20, C.GRAY4)
    s.line(300, y + 20, 294, y + 26, C.GRAY4)
  }
}

// ---------- tab 小图标 ----------
function tabStar(s: Screen, x: number, y: number, v: number) {
  s.fillRect(x - 8, y + 5, 16, 4, v)
  s.fillRect(x - 3, y, 6, 14, v)
  s.fillRect(x - 10, y + 9, 4, 5, v)
  s.fillRect(x + 6, y + 9, 4, 5, v)
}
function tabClock(s: Screen, x: number, y: number, v: number) {
  disc(s, x, y + 8, 8, v)
  disc(s, x, y + 8, 6, C.BLACK)
  s.line(x, y + 8, x + 4, y + 5, v)
  s.line(x, y + 8, x, y + 2, v)
}
function tabPerson(s: Screen, x: number, y: number, v: number) {
  disc(s, x, y + 5, 4, v)
  rr(s, x - 6, y + 10, 12, 7, 3, v)
}
function tabDots(s: Screen, x: number, y: number, v: number) {
  for (const [ox, oy] of [[-6,0],[6,0],[0,0],[-6,8],[6,8],[0,8]] as const)
    disc(s, x + ox, y + 4 + oy / 2, 2, v)
}
function tabTape(s: Screen, x: number, y: number, v: number) {
  rrStroke(s, x - 9, y, 18, 12, 2, v)
  disc(s, x - 5, y + 5, 2, v)
  disc(s, x + 5, y + 7, 2, v)
}

export const phoneFactory = miniApp('phone', '电话', iconPhone, (ctx, b) => new PhoneApp(ctx, b))

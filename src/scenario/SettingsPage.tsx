/**
 * 情景编排设置页：为功能机（3310/1100）与大哥大编排
 * 通讯录 / 通话记录 / 短信 / 定时来电来短信事件。
 *
 * 直接用 `new Store(deviceId)` 读写——与设备内 OS 共用同一 IndexedDB，
 * 改动即时落库，设备内 OS 的 onChange 会感知刷新。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEVICES } from '../devices/registry'
import { Store } from '../hal/storage'
import { type Prefs } from '../i18n'
import {
  SEED_CONTACTS,
  type Contact,
  type CallEntry,
  type ScenarioEvent,
} from './data'

/** 设置页支持的设备（功能机/大哥大/S60/G1/WP7 均实现 incomingCall/injectSms） */
const SUPPORTED = ['nokia-3310', 'nokia-1100', 'motorola-brick', 'nokia-n73', 'htc-dream', 'nokia-lumia-800', 'apple-iphone-2g'] as const
/** 大哥大真机无通话记录 → 不显示该分区 */
const NO_CALLLOG = ['motorola-brick']

interface LocalStrings {
  title: string
  desc: string
  tabContacts: string
  tabCalllog: string
  tabMessages: string
  tabEvents: string
  name: string
  tel: string
  add: string
  del: string
  empty: string
  dir: string
  dirIn: string
  dirOut: string
  missed: string
  dur: string
  sec: string
  from: string
  text: string
  read: string
  mine: string
  eventType: string
  evCall: string
  evSms: string
  delay: string
  triggerNow: string
  fired: string
  close: string
  unsupported: string
  confirmDel: string
}

const L: Record<'zh' | 'en', LocalStrings> = {
  zh: {
    title: '情景编排',
    desc: '为各台手机编排通讯录、通话记录、短信，并定时触发来电/来短信。改动即时落库，进入设备即可见。',
    tabContacts: '通讯录',
    tabCalllog: '通话记录',
    tabMessages: '短信',
    tabEvents: '情景事件',
    name: '姓名',
    tel: '号码',
    add: '新增',
    del: '删除',
    empty: '（空）',
    dir: '方向',
    dirIn: '来电',
    dirOut: '去电',
    missed: '未接',
    dur: '时长',
    sec: '秒',
    from: '来源',
    text: '内容',
    read: '已读',
    mine: '我发',
    eventType: '类型',
    evCall: '来电',
    evSms: '短信',
    delay: '延迟(秒)',
    triggerNow: '立即触发',
    fired: '已触发',
    close: '关闭',
    unsupported: '该设备暂不支持情景编排',
    confirmDel: '删除这条？',
  },
  en: {
    title: 'Scenario Editor',
    desc: 'Stage contacts, call logs and messages for each phone, and schedule incoming calls/SMS. Changes save instantly and appear in-game.',
    tabContacts: 'Contacts',
    tabCalllog: 'Call log',
    tabMessages: 'Messages',
    tabEvents: 'Events',
    name: 'Name',
    tel: 'Number',
    add: 'Add',
    del: 'Delete',
    empty: '(empty)',
    dir: 'Dir',
    dirIn: 'Incoming',
    dirOut: 'Outgoing',
    missed: 'Missed',
    dur: 'Duration',
    sec: 's',
    from: 'From',
    text: 'Text',
    read: 'Read',
    mine: 'Mine',
    eventType: 'Type',
    evCall: 'Call',
    evSms: 'SMS',
    delay: 'Delay(s)',
    triggerNow: 'Trigger now',
    fired: 'fired',
    close: 'Close',
    unsupported: 'Scenario editing unavailable for this device',
    confirmDel: 'Delete this entry?',
  },
}

type Section = 'contacts' | 'calllog' | 'messages' | 'events'

export function SettingsPage({ prefs, onBack }: { prefs: Prefs; onBack: () => void }) {
  const t = L[prefs.lang]
  const [devId, setDevId] = useState<string>(SUPPORTED[0])
  const [section, setSection] = useState<Section>('contacts')
  const store = useMemo(() => new Store(devId), [devId])
  // 当前分区首次数据读取完成前，整张卡片不出现——
  // 否则卡片先以空内容的高度出现，数据到达后被撑高（视觉上"先缩小再放大"）
  const [ready, setReady] = useState(false)
  const reportReady = useCallback(() => setReady(true), [])

  // 切设备/切分区需重新等待数据就绪
  useEffect(() => setReady(false), [devId, section])

  // 切到无通话记录的设备（大哥大）时，若当前在 calllog 分区则退回通讯录
  useEffect(() => {
    if (section === 'calllog' && NO_CALLLOG.includes(devId)) setSection('contacts')
  }, [devId, section])

  // 卡片始终渲染（否则 editor 不挂载、onReady 无人调用 → 死锁）；
  // 数据就绪前仅不可见：布局已按最终内容完成，出现时不会有高度跳变
  return (
    <div className="settings-page" style={ready ? undefined : { visibility: 'hidden' }}>
      <div className="settings-topbar">
        <h1>{t.title}</h1>
        <button className="settings-close" onClick={onBack} title={t.close} aria-label={t.close}>
          ✕
        </button>
      </div>
      <p className="settings-desc">{t.desc}</p>

      <div className="settings-tabs">
        {DEVICES.map((d) => {
          const supported = (SUPPORTED as readonly string[]).includes(d.id)
          const name = prefs.lang === 'en' ? (d.en?.name ?? d.name) : d.name
          return (
            <button
              key={d.id}
              className={`stab${d.id === devId ? ' active' : ''}${supported ? '' : ' disabled'}`}
              disabled={!supported}
              onClick={() => setDevId(d.id)}
              title={supported ? undefined : t.unsupported}
            >
              {name}
            </button>
          )
        })}
      </div>

      <div className="settings-sections">
        <button className={`sec-tab${section === 'contacts' ? ' active' : ''}`} onClick={() => setSection('contacts')}>
          {t.tabContacts}
        </button>
        {!NO_CALLLOG.includes(devId) && (
          <button className={`sec-tab${section === 'calllog' ? ' active' : ''}`} onClick={() => setSection('calllog')}>
            {t.tabCalllog}
          </button>
        )}
        <button className={`sec-tab${section === 'messages' ? ' active' : ''}`} onClick={() => setSection('messages')}>
          {t.tabMessages}
        </button>
        <button className={`sec-tab${section === 'events' ? ' active' : ''}`} onClick={() => setSection('events')}>
          {t.tabEvents}
        </button>
      </div>

      <div className="settings-body">
        {section === 'contacts' && <ContactsEditor store={store} t={t} onReady={reportReady} />}
        {section === 'calllog' && <CalllogEditor store={store} t={t} onReady={reportReady} />}
        {section === 'messages' && <MessagesEditor store={store} t={t} onReady={reportReady} />}
        {section === 'events' && <EventsEditor store={store} t={t} onReady={reportReady} />}
      </div>
    </div>
  )
}

// ---------------- 通讯录 ----------------

function ContactsEditor({ store, t, onReady }: { store: Store; t: LocalStrings; onReady: () => void }) {
  const [list, setList] = useState<Contact[]>([])
  const [name, setName] = useState('')
  const [tel, setTel] = useState('')

  useEffect(() => {
    let alive = true
    void store.get<Contact[]>('contacts').then((v) => {
      if (!alive) return
      setList(v && v.length ? v : [...SEED_CONTACTS])
      onReady()
    })
    const off = store.onChange((fk) => {
      if (fk.endsWith(':contacts')) void store.get<Contact[]>('contacts').then((v) => setList(v ?? []))
    })
    return () => {
      alive = false
      off()
    }
  }, [store])

  const persist = async (next: Contact[]) => {
    setList(next)
    await store.set('contacts', next)
  }
  const add = async () => {
    if (!name.trim() || !tel.trim()) return
    await persist([...list, { name: name.trim(), tel: tel.trim() }])
    setName('')
    setTel('')
  }
  const del = async (i: number) => {
    if (!confirm(t.confirmDel)) return
    await persist(list.filter((_, j) => j !== i))
  }

  return (
    <div className="editor">
      <table className="ed-table">
        <thead>
          <tr>
            <th>{t.name}</th>
            <th>{t.tel}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={3} className="ed-empty">{t.empty}</td>
            </tr>
          )}
          {list.map((c, i) => (
            <tr key={i}>
              <td>{c.name}</td>
              <td>{c.tel}</td>
              <td>
                <button className="del-btn" onClick={() => del(i)}>
                  {t.del}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ed-add">
        <input placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder={t.tel} value={tel} onChange={(e) => setTel(e.target.value)} />
        <button onClick={add}>{t.add}</button>
      </div>
    </div>
  )
}

// ---------------- 通话记录 ----------------

function CalllogEditor({ store, t, onReady }: { store: Store; t: LocalStrings; onReady: () => void }) {
  const [list, setList] = useState<CallEntry[]>([])
  const [tel, setTel] = useState('')
  const [name, setName] = useState('')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [missed, setMissed] = useState(false)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    let alive = true
    void store.get<CallEntry[]>('calllog').then((v) => {
      if (alive) {
        setList(v ?? [])
        onReady()
      }
    })
    const off = store.onChange((fk) => {
      if (fk.endsWith(':calllog')) void store.get<CallEntry[]>('calllog').then((v) => setList(v ?? []))
    })
    return () => {
      alive = false
      off()
    }
  }, [store])

  const persist = async (next: CallEntry[]) => {
    setList(next)
    await store.set('calllog', next)
  }
  const add = async () => {
    if (!tel.trim()) return
    await persist([
      ...list,
      { id: Date.now(), tel: tel.trim(), name: name.trim(), dir, ts: Date.now(), dur, missed },
    ])
    setTel('')
    setName('')
    setMissed(false)
    setDur(0)
  }
  const del = async (i: number) => {
    if (!confirm(t.confirmDel)) return
    await persist(list.filter((_, j) => j !== i))
  }

  const sorted = [...list].sort((a, b) => b.ts - a.ts)

  return (
    <div className="editor">
      <table className="ed-table">
        <thead>
          <tr>
            <th>{t.name}</th>
            <th>{t.tel}</th>
            <th>{t.dir}</th>
            <th>{t.missed}</th>
            <th>{t.dur}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="ed-empty">{t.empty}</td>
            </tr>
          )}
          {sorted.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.tel}</td>
              <td>{e.dir === 'in' ? t.dirIn : t.dirOut}</td>
              <td>{e.missed ? '✓' : ''}</td>
              <td>{e.dur}{t.sec}</td>
              <td>
                <button className="del-btn" onClick={() => del(list.findIndex((x) => x.id === e.id))}>
                  {t.del}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ed-add">
        <input placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder={t.tel} value={tel} onChange={(e) => setTel(e.target.value)} />
        <select value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')}>
          <option value="in">{t.dirIn}</option>
          <option value="out">{t.dirOut}</option>
        </select>
        <label>
          <input type="checkbox" checked={missed} onChange={(e) => setMissed(e.target.checked)} /> {t.missed}
        </label>
        <input
          type="number"
          min={0}
          placeholder={t.dur}
          value={dur}
          onChange={(e) => setDur(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 70 }}
        />
        {t.sec}
        <button onClick={add}>{t.add}</button>
      </div>
    </div>
  )
}

// ---------------- 短信 ----------------

interface Msg {
  id: number
  from: string
  text: string
  ts: number
  read: boolean
  mine: boolean
}

function MessagesEditor({ store, t, onReady }: { store: Store; t: LocalStrings; onReady: () => void }) {
  const [list, setList] = useState<Msg[]>([])
  const [from, setFrom] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    let alive = true
    void store.get<Msg[]>('messages:inbox').then((v) => {
      if (alive) {
        setList(v ?? [])
        onReady()
      }
    })
    const off = store.onChange((fk) => {
      if (fk.endsWith(':messages:inbox')) void store.get<Msg[]>('messages:inbox').then((v) => setList(v ?? []))
    })
    return () => {
      alive = false
      off()
    }
  }, [store])

  const persist = async (next: Msg[]) => {
    setList(next)
    await store.set('messages:inbox', next)
  }
  const add = async () => {
    if (!from.trim() || !text.trim()) return
    await persist([...list, { id: Date.now(), from: from.trim(), text: text.trim(), ts: Date.now(), read: false, mine: false }])
    setFrom('')
    setText('')
  }
  const del = async (i: number) => {
    if (!confirm(t.confirmDel)) return
    await persist(list.filter((_, j) => j !== i))
  }
  const toggleRead = async (i: number) => {
    const next = list.map((m, j) => (j === i ? { ...m, read: !m.read } : m))
    await persist(next)
  }

  const sorted = [...list].sort((a, b) => b.ts - a.ts)

  return (
    <div className="editor">
      <table className="ed-table">
        <thead>
          <tr>
            <th>{t.from}</th>
            <th>{t.text}</th>
            <th>{t.read}</th>
            <th>{t.mine}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="ed-empty">{t.empty}</td>
            </tr>
          )}
          {sorted.map((m) => {
            const i = list.findIndex((x) => x.id === m.id)
            return (
              <tr key={m.id}>
                <td>{m.from}</td>
                <td className="ed-text">{m.text}</td>
                <td>
                  <input type="checkbox" checked={m.read} onChange={() => toggleRead(i)} />
                </td>
                <td>{m.mine ? '✓' : ''}</td>
                <td>
                  <button className="del-btn" onClick={() => del(i)}>
                    {t.del}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="ed-add">
        <input placeholder={t.from} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input placeholder={t.text} value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={add}>{t.add}</button>
      </div>
    </div>
  )
}

// ---------------- 情景事件 ----------------

function EventsEditor({ store, t, onReady }: { store: Store; t: LocalStrings; onReady: () => void }) {
  const [list, setList] = useState<ScenarioEvent[]>([])
  const [type, setType] = useState<'call' | 'sms'>('call')
  const [from, setFrom] = useState('')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [delay, setDelay] = useState(5)

  useEffect(() => {
    let alive = true
    void store.get<ScenarioEvent[]>('events').then((v) => {
      if (alive) {
        setList(v ?? [])
        onReady()
      }
    })
    const off = store.onChange((fk) => {
      if (fk.endsWith(':events')) void store.get<ScenarioEvent[]>('events').then((v) => setList(v ?? []))
    })
    return () => {
      alive = false
      off()
    }
  }, [store])

  const persist = async (next: ScenarioEvent[]) => {
    setList(next)
    await store.set('events', next)
  }
  const add = async () => {
    if (!from.trim()) return
    await persist([
      ...list,
      {
        id: Date.now(),
        type,
        from: from.trim(),
        name: name.trim(),
        text: type === 'sms' ? text.trim() : undefined,
        delaySec: Math.max(0, delay),
        fired: false,
      },
    ])
    setFrom('')
    setName('')
    setText('')
    setDelay(5)
  }
  const del = async (i: number) => {
    if (!confirm(t.confirmDel)) return
    await persist(list.filter((_, j) => j !== i))
  }
  const resetFired = async (i: number) => {
    const next = list.map((e, j) => (j === i ? { ...e, fired: false } : e))
    await persist(next)
  }

  return (
    <div className="editor">
      <table className="ed-table">
        <thead>
          <tr>
            <th>{t.eventType}</th>
            <th>{t.from}</th>
            <th>{t.name}</th>
            <th>{t.text}</th>
            <th>{t.delay}</th>
            <th>{t.fired}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={7} className="ed-empty">{t.empty}</td>
            </tr>
          )}
          {list.map((e, i) => (
            <tr key={e.id}>
              <td>{e.type === 'call' ? t.evCall : t.evSms}</td>
              <td>{e.from}</td>
              <td>{e.name}</td>
              <td className="ed-text">{e.text ?? ''}</td>
              <td>{e.delaySec}{t.sec}</td>
              <td>{e.fired ? '✓' : ''}</td>
              <td className="ed-actions">
                {e.fired && <button onClick={() => resetFired(i)}>↺</button>}
                <button className="del-btn" onClick={() => del(i)}>
                  {t.del}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ed-add">
        <select value={type} onChange={(e) => setType(e.target.value as 'call' | 'sms')}>
          <option value="call">{t.evCall}</option>
          <option value="sms">{t.evSms}</option>
        </select>
        <input placeholder={t.from} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} />
        {type === 'sms' && (
          <input placeholder={t.text} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <input
          type="number"
          min={0}
          placeholder={t.delay}
          value={delay}
          onChange={(e) => setDelay(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 70 }}
        />
        {t.sec}
        <button onClick={add}>{t.add}</button>
      </div>
      <p className="ed-hint">
        {t.triggerNow}: {t.delay}=0
      </p>
    </div>
  )
}

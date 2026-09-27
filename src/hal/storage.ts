/**
 * 持久化：IndexedDB 键值存储，键空间按 `${deviceId}:${appId}:${key}` 隔离。
 * IndexedDB 不可用时退化为内存 Map（本次会话内有效）。
 * 任何 set 都会触发 onChange，供 OS 与应用跨界面刷新（如新短信 → 待机信封图标）。
 */
export class Store {
  private db: IDBDatabase | null = null
  private mem = new Map<string, string>()
  private listeners = new Set<(fullKey: string) => void>()
  private ready: Promise<void>

  constructor(private deviceId: string) {
    this.ready = new Promise((resolve) => {
      try {
        const req = indexedDB.open('mobile-museum', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('kv')
        req.onsuccess = () => {
          this.db = req.result
          resolve()
        }
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.ready
    const fk = this.full(key)
    if (!this.db) {
      const v = this.mem.get(fk)
      return v === undefined ? undefined : (JSON.parse(v) as T)
    }
    return new Promise((resolve) => {
      try {
        const r = this.db!.transaction('kv').objectStore('kv').get(fk)
        r.onsuccess = () =>
          resolve(r.result === undefined ? undefined : (JSON.parse(r.result as string) as T))
        r.onerror = () => resolve(undefined)
      } catch {
        resolve(undefined)
      }
    })
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.ready
    const fk = this.full(key)
    const raw = JSON.stringify(value)
    if (!this.db) {
      this.mem.set(fk, raw)
    } else {
      await new Promise<void>((resolve) => {
        try {
          const tx = this.db!.transaction('kv', 'readwrite')
          tx.objectStore('kv').put(raw, fk)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      })
    }
    for (const fn of this.listeners) fn(fk)
  }

  async remove(key: string): Promise<void> {
    await this.ready
    const fk = this.full(key)
    if (!this.db) {
      this.mem.delete(fk)
    } else {
      await new Promise<void>((resolve) => {
        try {
          const tx = this.db!.transaction('kv', 'readwrite')
          tx.objectStore('kv').delete(fk)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      })
    }
    for (const fn of this.listeners) fn(fk)
  }

  /** 恢复出厂设置：清空本设备的全部数据 */
  async clearAll(): Promise<void> {
    await this.ready
    const prefix = `${this.deviceId}:`
    if (!this.db) {
      for (const k of [...this.mem.keys()]) if (k.startsWith(prefix)) this.mem.delete(k)
    } else {
      await new Promise<void>((resolve) => {
        try {
          const tx = this.db!.transaction('kv', 'readwrite')
          const store = tx.objectStore('kv')
          const range = IDBKeyRange.bound(prefix, prefix + '￿')
          const req = store.openCursor(range)
          req.onsuccess = () => {
            const cursor = req.result
            if (cursor) {
              void cursor.delete()
              cursor.continue()
            }
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      })
    }
    for (const fn of this.listeners) fn(`${this.deviceId}:*`)
  }

  /** 监听本设备任意键变化（回调收到完整键名） */
  onChange(cb: (fullKey: string) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private full(key: string): string {
    return `${this.deviceId}:${key}`
  }
}

/** 应用级存储视图：MiniApp 只能看到自己的键空间 */
export class AppStore {
  private readonly prefix: string

  constructor(private store: Store, deviceId: string, private appId: string) {
    // Store 回调给的是完整键 <deviceId>:<appId>:<key>，前缀必须带设备 id 才匹配
    this.prefix = `${deviceId}:${appId}:`
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(`${this.appId}:${key}`)
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store.set(`${this.appId}:${key}`, value)
  }

  remove(key: string): Promise<void> {
    return this.store.remove(`${this.appId}:${key}`)
  }

  /** 监听本应用键变化（回调收到去掉前缀后的短键名） */
  onChange(cb: (key: string) => void): () => void {
    return this.store.onChange((fk) => {
      if (fk.startsWith(this.prefix)) cb(fk.slice(this.prefix.length))
    })
  }

  /** 恢复出厂设置（系统应用用，清除整个设备的数据） */
  clearAll(): Promise<void> {
    return this.store.clearAll()
  }
}

# 掌上博物馆 E2E 回归测试

无视觉端到端测试套件。每个套件用 headless Chromium + CDP（WebSocket 远程调试）驱动页面，
通过画布 `getImageData` 像素 / 调色板计数、IndexedDB 直读、`getComputedStyle` 几何断言来验证
UI 行为——**不依赖任何截图视觉判读**（本环境读 PNG 返回空，故一律走像素计数）。

## 前置

- Node ≥ 22（套件用了原生 `fetch`、`WebSocket`）
- 系统装有 `chromium`（headless）。若二进制名不同，可改各套件里 `spawn('chromium', …)`，
  或设 `CHROME_BIN` 后自行替换。
- 先装依赖：`npm install`

## 运行

```bash
# 全量（自动构建 + 起 preview:4173 + 跑 13 套件 + 汇总 + 关 preview）
npm run test:e2e

# 跳过构建（已 build 过）
npm run test:e2e:nobuild

# 只跑名字含某子串的套件（子串匹配，可多个）
node e2e/run.mjs wp7 g1
node e2e/run.mjs s60      # 同时命中 s60-check / s60-scenario-check
```

退出码：全过 `0`，任一失败 `1`。

## 套件一览（e2e/suites/）

| 套件 | 端口 | 覆盖 |
|---|---|---|
| `e2e.mjs` | 9222 | 展厅设备数 + 跨设备基础流程（开机/短信/拨号） |
| `keys-check.mjs` | 9227 | 各机型键盘外观几何（CSS computed style 断言） |
| `n1100-check.mjs` | 9229 | Nokia 1100 全流程（含手电筒） |
| `s60-check.mjs` | 9224 | Nokia N73 (S60) 全流程 + 真机开机动画 |
| `g1-check.mjs` | 9231 | HTC Dream (G1, Android 1.0) 全流程 + 17 预装应用 |
| `scenario-check.mjs` | 9234 | 设置页情景编排（来电/短信注入，功能机三台） |
| `brick-scenario-check.mjs` | 9235 | 大哥大情景（来电响铃/接听） |
| `brick-book-check.mjs` | 9237 | 大哥大电话本持久化 |
| `s60-scenario-check.mjs` | 9238 | N73 情景（来电/短信/通话记录） |
| `g1-scenario-check.mjs` | 9239 | G1 情景（全屏来电卡片/通话记录/通讯录） |
| `wp7-check.mjs` | 9240 | Lumia 800 (WP7.5 Mango) 全流程（瓷贴/拼音 IME/主题色） |
| `wp7-scenario-check.mjs` | 9241 | Lumia 800 情景（来电接听/拒接 + SMS 注入） |
| `theme-style-check.mjs` | 9242 | 卡片主题样式（四边一致 + 对比度） |
| `bb-check.mjs` | 9244 | BlackBerry Bold 9000 全流程（BBM/电话本/16 应用） |
| `n3310-check.mjs` | 9247 | Nokia 3310 全流程（三游戏/呼叫转移/恢复出厂） |

## 架构要点

- **每个套件独立**：自己 spawn 一个 chromium，独占 `--user-data-dir` 和 `--remote-debugging-port`，
  互不干扰。顺序跑（`run.mjs` 不并发，避免机器负载抖动影响像素阈值）。
- **preview 由 run.mjs 统一管理**：套件假定 `http://localhost:4173/mobile/` 已就绪；
  `run.mjs` 起 `vite preview --port 4173 --strictPort`、等就绪、跑完 detached 进程组一并 kill。
  也可手动 `npm run preview` 后单跑某套件：`node e2e/suites/wp7-check.mjs`。
- **IndexedDB 直读**：`mobile-museum` 库 `kv` 表，键 `${deviceId}:${appId}:${key}`，值是 JSON 字符串
  （读出后需再 `JSON.parse`）。直接写 IDB 不触发 OS 的 `watchStore`（那是 Store.set 进程内事件）——
  要改 OS 缓存状态须走应用内操作。读 IDB 用 fire-and-forget + 轮询，`awaitPromise` 会挂起。
- **触屏 tap**：在 canvas 上派发 `PointerEvent('pointerdown')`，坐标按 `getBoundingClientRect`
  归一化到屏幕坐标系。**别点命中区边界**（`Math.floor` 会让 x=114 落进 113 的缝隙）——一律点区域中心。
- **画布缩放**：部分机型屏幕按比例缩放（如 Lumia 800 480×800 → 346×576，系数 0.72²≈0.52），
  像素阈值须相应折算，别套用全分辨率阈值。

## 常见坑

- **抗锯齿文字不产生精确调色板色**：`fillText` 抗锯齿像素极少正好落在某个调色板 RGB 上。
  断言「文字存在」时要么用容差区间计数（见 `g1-check.mjs` 的 `rectGrayish`），要么靠文字周边
  纯色底板间接佐证——别对文字像素做精确 RGB 匹配。
- **开机动画等待**：N73 / 3310 / G1 / Lumia 800 开机动画 4.2–4.6s，E2E 里重开机等待须 ≥5.3s
  （旧值 3.1s 会把开机白屏误判为壁纸异常）。
- **残留 chromium**：套件各自结束时 kill 自己的 chromium。若套件中途崩溃留下幽灵进程，
  手动 `pkill -x chromium` 清理（注意 `pgrep -f` 会匹配自身命令行致自杀，用 `-x` 精确匹配）。
- **vite preview 绑 IPv6**：日志显 `localhost:4173`，但 `curl 127.0.0.1` 可能失败（exit 7）；
  用 `curl http://localhost`（解析 ::1）即可。

#!/usr/bin/env node
/**
 * 掌上博物馆 E2E 回归运行器。
 *
 * 流程：构建 → 启动 vite preview(4173) → 顺序跑 e2e/suites/*.mjs → 汇总 → 关 preview。
 * 每个套件自己 spawn 一个独立 chromium（独占 user-data-dir + 调试端口），互不干扰。
 *
 * 用法：
 *   node e2e/run.mjs              # 跑全部
 *   node e2e/run.mjs wp7 g1       # 只跑名字含 wp7 或 g1 的套件（子串匹配）
 *   node e2e/run.mjs --no-build   # 跳过构建（已 build 过时用）
 *
 * 退出码：全部通过 0，否则 1。
 */
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PREVIEW_PORT = 4173
const BASE_URL = `http://localhost:${PREVIEW_PORT}/mobile/`

const args = process.argv.slice(2)
const noBuild = args.includes('--no-build')
const filters = args.filter((a) => !a.startsWith('-')).map((a) => a.toLowerCase())

// Chromium 二进制：默认 'chromium'，可经 CHROME_BIN 环境变量覆盖。
// （各套件直接 spawn('chromium', ...)，故仅作提示用；如需切换请改套件或设 CHROME_BIN 后用 sed 替换。）
const CHROME_BIN = process.env.CHROME_BIN || 'chromium'

function log(msg) { console.log(`\n[run] ${msg}`) }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function waitForPreview(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL, { method: 'GET' })
      if (res.ok) return true
    } catch { /* 还没起来 */ }
    await sleep(500)
  }
  return false
}

function build() {
  log('构建项目 (npm run build)…')
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
  if (r.status !== 0) { console.error('[run] 构建失败'); return false }
  return true
}

function startPreview() {
  log(`启动 vite preview (端口 ${PREVIEW_PORT})…`)
  // 静默：输出重定向到文件，避免污染汇总
  const out = spawn('npm', ['run', 'preview', '--', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: 'ignore', detached: true,
  })
  return out
}

async function main() {
  // 0) 收集套件
  let suites = readdirSync(join(__dirname, 'suites')).filter((f) => f.endsWith('.mjs')).sort()
  if (filters.length) {
    suites = suites.filter((s) => filters.some((f) => s.toLowerCase().includes(f)))
  }
  if (!suites.length) { console.error('[run] 没有匹配的套件'); process.exit(1) }
  log(`将运行 ${suites.length} 个套件：\n  ${suites.join('\n  ')}`)

  // 1) 构建
  if (!noBuild) {
    if (!build()) process.exit(1)
  } else {
    log('跳过构建（--no-build）')
  }

  // 2) 启动 preview
  if (process.env.CHROME_BIN) log(`提示：CHROME_BIN=${CHROME_BIN}（套件默认 spawn 'chromium'，如需替换请改套件）`)
  const preview = startPreview()
  let previewOk = false
  try {
    previewOk = await waitForPreview()
    if (!previewOk) { console.error('[run] vite preview 30s 内未就绪'); process.exit(1) }
    log('preview 已就绪')

    // 3) 顺序跑套件
    const results = []
    for (const s of suites) {
      const path = join(__dirname, 'suites', s)
      process.stdout.write(`\n=== ${s} ===\n`)
      const r = spawnSync('node', [path], { stdio: 'inherit' })
      const ok = r.status === 0
      results.push({ name: s, ok })
      process.stdout.write(`${ok ? '✓' : '✗'} ${s} (exit ${r.status})\n`)
      // 套件各自 spawn 的 chromium 应在自身结束时 kill；这里不全局清理，避免误杀。
    }

    // 4) 汇总
    const pass = results.filter((r) => r.ok).length
    const fail = results.length - pass
    log(`汇总：PASS=${pass} FAIL=${fail} / ${results.length}`)
    if (fail) {
      console.error('失败套件：')
      results.filter((r) => !r.ok).forEach((r) => console.error(`  ✗ ${r.name}`))
    }
    process.exit(fail ? 1 : 0)
  } finally {
    // 5) 关 preview（detached 进程组）
    try { process.kill(-preview.pid) } catch { /* 可能已退出 */ }
  }
}

main()

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署到 GitHub Pages 时默认仓库名为 mobile（https://<user>.github.io/mobile/）
// 若仓库名不同，构建时用 VITE_BASE=/<repoName>/ npm run build 覆盖
const base = process.env.VITE_BASE ?? '/mobile/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // 每个 OS 是独立 chunk（通过动态 import 自动分割），点开展品才下载
    target: 'es2020',
  },
})

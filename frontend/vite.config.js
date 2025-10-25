import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001
  },
  base: '/USDC/', // 🔥 改成你的仓库名
  build: {
    outDir: 'dist'
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001
  },
  base: '/', // 🔥 改为根路径
  build: {
    outDir: 'dist'
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001
  },
  base: '/USDC/', // 重要：添加这一行
  build: {
    outDir: 'dist'
  }
})

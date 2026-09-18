import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
})

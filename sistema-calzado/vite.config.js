import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true, // Esto permite que cualquier dispositivo vea la app
    host: true
  },
  build: {
    chunkSizeWarningLimit: 2500, // sube el límite a 1000kb
  },
})

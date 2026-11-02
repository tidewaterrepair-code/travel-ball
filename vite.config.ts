import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { brandApi } from './server/vitePlugin.js'

// Absolute base: the app is served from /, /login, /admin and /c/<club>/ by our own server.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), brandApi()],
})

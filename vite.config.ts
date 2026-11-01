import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { brandApi } from './server/vitePlugin.js'

// base: './' keeps the build portable (GitHub Pages, Netlify, any static host).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), brandApi()],
})

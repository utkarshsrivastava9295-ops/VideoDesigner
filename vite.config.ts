import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { youtubeApiPlugin } from './vite-youtube-api'

export default defineConfig({
  plugins: [react(), youtubeApiPlugin()],
  base: './',
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})

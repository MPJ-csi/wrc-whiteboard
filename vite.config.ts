import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative paths, so the built app works at any web address, including a sub-folder.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
})

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Vite builds the React PWA. In dev, the Node server mounts this as middleware.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  // Saving generated questions must not reload the browser (that closed Generate all).
  server: {
    watch: {
      ignored: ['**/data/**'],
    },
  },
})

import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, strictPort: false },
  build: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: { proxy: { '/api': process.env.MINDMESH_API_TARGET ?? 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': process.env.MINDMESH_API_TARGET ?? 'http://127.0.0.1:8000' } },
})

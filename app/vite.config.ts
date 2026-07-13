import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset paths relative so the build also works when pinned to IPFS.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2020' },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Absolute base ('/') so client-side routes like /coin/0x.. resolve assets correctly
// on refresh. `vite build --mode ipfs` opts into relative paths ('./') for an
// IPFS-pinned mirror (no server rewrite there, so deep-links wouldn't apply anyway).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ipfs' ? './' : '/',
  build: { target: 'es2020' },
  // Local dev runs vite (no Cloudflare Pages Functions), so proxy the read APIs to
  // the deployed functions — the board/search/holders/candles then work locally
  // against the live testnet indexer. (Overridden by VITE_RPC_URL local-fork mode.)
  server: {
    proxy: {
      '/api': { target: 'https://littlejohn-app.pages.dev', changeOrigin: true, secure: true },
    },
  },
}))

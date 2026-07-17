# LittleJohn app (launchpad frontend)

Vite + React 18 + TypeScript SPA. viem for chain reads/writes, `lightweight-charts`
for the candle chart, plain CSS (`src/styles.css`), no Tailwind. Read APIs are
Cloudflare Pages Functions under `functions/api/*` that proxy the Ponder indexer.

## Routing

Client-side routing via **react-router-dom** (`BrowserRouter`, mounted in `main.tsx`).
Clean paths (not hash routing). Routes live in `App.tsx`:

| Path | Page | Notes |
|---|---|---|
| `/` | `Launch` | Trenches board (list only) |
| `/coin/:addr` | `CoinPage` | Per-coin detail — chart, trade box, holders. Deep-linkable/shareable |
| `/create` | `Create` | |
| `/swap` | `Swap` | |
| `/pools` | `Pools` | |
| `/lock` | `Lock` | |
| `/heist` | `Claim` | |
| `*` | → `/` | catch-all redirect |

The sidebar nav uses `<NavLink>` (renders `<a>`); the `/` link uses `end` so it's only
active on the board, not on `/coin/*`. Clicking a board card / KOTH card / search result
calls `navigate('/coin/'+addr)`. There is **no inline coin detail on the board** — the coin
gets its own full page (pump.fun-style).

### Coin page data (`CoinPage` + `src/lib/token.ts`)
A coin page resolves its token cold (no board context) via `loadToken(addr, publicClient, d)`:
indexer API (`/api/token/:addr`) first, falling back to on-chain reads for local-fork dev
**and** for freshly-created coins the indexer hasn't seen yet (API 404). The board reuses the
same on-chain reader (`loadTokenOnChain`). The buy/sell box is `components/TradePanel.tsx`.

## Deploy gotchas (don't regress these)

- **`vite.config.ts` base is `'/'`** (absolute). It must NOT be `'./'` — relative asset
  paths break depth-1 routes like `/coin/0x…` on refresh (browser resolves `./assets/…`
  against `/coin/` → 404, white screen). An IPFS-pinned mirror can opt into relative paths
  with `vite build --mode ipfs`.
- **`public/_redirects`** (`/* /index.html 200`) is the Cloudflare Pages SPA fallback so
  deep-links / hard-refreshes on client routes serve `index.html` instead of 404ing.
  `functions/api/*` and static assets take precedence over the splat, so `/api/*` is not
  shadowed.

## Dev / verify

```bash
npm run dev                 # Vite dev server (client routes only; /api needs the functions)
npm run build               # tsc --noEmit && vite build
npx wrangler pages dev dist --port 8788 --compatibility-date 2024-01-01
                            # serves the built app + functions against the deployed indexer
```
For local-fork work, set `VITE_RPC_URL=http://127.0.0.1:8545` (anvil fork); the board + coin
page then read on-chain instead of the indexer API (which serves remote testnet data).

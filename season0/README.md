# Heist Season 0 portal

Non-custodial points campaign for LittleJohn's pre-TGE ramp. Nobody deposits funds;
participants earn locked-veJOHN allocations by making noise, running the testnet, bringing
referrals, and showing intent. Output feeds the existing Merkle pipeline.

## Stack
- **Frontend**: Vite + React (LittleJohn design system), injected-wallet, sign-to-prove.
- **Backend**: Cloudflare Pages Functions (`functions/api/*`) + **D1** (SQLite). Same origin,
  so the CSP stays `connect-src 'self'`.
- **Scoring**: weights mindshare 40 / testnet 30 / referrals 20 / poi 10. The admin export
  produces a self-describing snapshot that `contracts/tools/heists-scorer/score.js` scores
  directly (same generic engine as the on-chain seasons).

## API
| route | who | what |
|---|---|---|
| `POST /api/join` | signed | register wallet (+ optional referral code / X handle), get referral code |
| `GET /api/me?wallet=` | public | points breakdown, rank, referral link, submissions |
| `GET /api/leaderboard` | public | top 100 by blended score |
| `POST /api/submit` | signed | submit an X post link for mindshare scoring |
| `GET/POST /api/admin/score` | admin | list pending / approve+score submissions |
| `POST /api/admin/quest-points` | admin | ingest testnet + poi points (from the sync job) |
| `GET /api/admin/export` | admin | season snapshot JSON → score.js |

Signed routes verify an EIP-191 message containing the wallet + a 10-minute timestamp.
Admin routes require the `x-admin-key` header (`ADMIN_KEY` secret).

## Season 0 → TGE (verified end-to-end against local D1)
```
join/submit ──▶ admin approve ──▶ GET /api/admin/export ──▶ score.js ──▶ generate.js ──▶ root
                                                                         ──▶ openSeason + freeze ──▶ claim (locked veJOHN)
```

## Deploy (once Cloudflare account + token exist)
```bash
wrangler d1 create littlejohn-season0            # paste id into wrangler.toml
wrangler d1 execute littlejohn-season0 --file schema.sql
wrangler pages secret put ADMIN_KEY
npm run build && wrangler pages deploy dist --project-name littlejohn-season0
```
Local dev: `npm run build && wrangler pages dev dist` (uses a local D1; `.dev.vars` for ADMIN_KEY).

## Testnet quests
`scripts/sync-testnet.js` is a **stub** until the testnet deploy exists. Once live it reads
each wallet's testnet actions (via `contracts/tools/heists-snapshot`) and POSTs the `testnet`
+ `poi` points to `/api/admin/quest-points`. Until then Season 0 runs on mindshare + referrals
+ proof-of-interest, and testnet points stay 0.

## Anti-sybil
Depth-weighted testnet (not click counts), curated (human-scored) mindshare, referral cap
(25/wallet, credited only when the referred wallet actually earns), submission rate limits.

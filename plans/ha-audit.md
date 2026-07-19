# LittleJohn HA audit (holistic, 2026-07-19)

Fresh component-by-component resilience pass. Goal: no single failure takes the
platform offline — the infra half of what killed Noxa. Severity: HIGH = a real
outage vector; MED = degraded/needs arming; LOW = accepted/minor.

## Fixed this session
- **Edge-cache public reads** (`app/functions/api/_middleware.ts`) — board/token/
  trades/candles/holders/search served from the Cloudflare colo cache with
  stale-while-revalidate, so a read-flood hits cache, not origin/Ponder. Verified
  board 0.88s cold → 0.24s warm (backend skipped).
- **Read-client RPC failover + retry** (`app/src/lib/wallet.tsx`, `chains.ts`) —
  the publicClient backs both trading AND the board's on-chain fallback; it used a
  single `http()` with no retry, so one RPC outage sank both paths. Now retry 3 +
  8s timeout, and `fallback()` across providers when `VITE_RPC_FALLBACK` is armed.

## Component audit

| Component | SPOF? | On failure | Status |
|---|---|---|---|
| Frontend (CF Pages) | No — global edge | Static shell always serves | ✅ |
| API reads (Pages Fn → Ponder) | via Ponder | Flood → colo cache; SWR serves stale | ✅ hardened |
| Read RPC (app publicClient) | was single | retry+failover across providers | ✅ hardened (arm the 2nd URL) |
| Board data | Ponder | falls back to on-chain reads | ✅ |
| candles/holders/trades/search | **Ponder only** | **error — no fallback** | ⚠️ HIGH |
| **Ponder (Fly)** | **single machine, single region, single-writer** | indexed features down; board still works | ⚠️ HIGH |
| **Neon Postgres** | single DB | Ponder can't serve; free-tier cold-starts | ⚠️ HIGH |
| Indexer RPC | multi in code | `PONDER_RPC_URL` comma-list + public tertiary | ✅ (arm 2nd) |
| Firehose (DO + WS) | single DO | WS drops → 2s chain polling | ✅ |
| D1 (social) / R2 (media) | CF-managed | profile enrich is best-effort (`if env.DB`) | ✅ |
| RH sequencer | **single, centralized** | whole chain halts — out of our control | ⚠️ external |

## Residual gaps, ranked

1. **[HIGH] Ponder + Neon are the core SPOF.** Single-writer Ponder (can't scale
   horizontally), single Fly machine in one region (iad), single Neon DB. If any
   dies: the **board degrades to chain-read (works), but candles/holders/trades/
   search have no fallback and error.** Mitigations in place: Fly auto-restart
   (`min_machines_running=1`, health check `/health`), edge SWR serves stale
   cached entries. **Mainnet actions (#15):** paid Neon (kills cold-starts) +
   ideally a read replica; size Ponder up (shared-cpu-2x/2gb+) and match its
   region to Neon's; add a warm-standby plan or accept restart-window downtime for
   indexed-only features.
2. **[MED] Failover not armed.** App (`VITE_RPC_FALLBACK`) and Ponder
   (`PONDER_RPC_URL` multi) both support it in code but the 2nd provider isn't set.
   **#15:** set QuickNode/dRPC/Alchemy-RH as the backup on both; add its host to
   the CSP `connect-src` (currently only the public RH RPCs are allowed).
3. **[MED] "Up but stale" indexer is undetectable.** A lagging Ponder (slow RPC/DB)
   serves stale prices silently — chain-read doesn't trigger because it isn't
   "down." **Fix:** external monitor on Ponder sync-status / block-lag with an
   alert; optionally a lightweight lag check surfaced in the UI.
4. **[LOW] True edge-caching still invokes the Worker.** `caches.default` protects
   the backend but the Function runs per request. A CF Cache Rule for `/api/*`
   GETs would skip invocation entirely. Optional; CF already absorbs the volume.
5. **[LOW] RH sequencer is a single centralized point.** If Robinhood's sequencer
   halts, everything halts. Not ours to fix — an accepted external dependency.

## Bottom line
After today's two fixes there is **no remaining code-level SPOF** in our stack.
The HIGH residuals are all Ponder/Neon single-instance concerns — partially
mitigated (chain-read + auto-restart + SWR) and fully closed only by the mainnet
provisioning in **#15** (paid Neon + backup RPC + sized/monitored Ponder) plus a
stale-indexer monitor. Fold these into #15/#13 as explicit requirements.

# Proposal: split-TTL cache headers for `/api/candles`

**From:** UI session (chart wiring)  ·  **For:** robin (backend/infra)  ·  **Status:** proposal, not implemented

## Context

The chart now consumes `/api/candles/:addr?res=<sec>` (pre-aggregated OHLC) instead of
building candles client-side. Verified end-to-end against the deployed indexer (WOOD/ROBIN/
NOTT, all 200s; res param and addr swap correctly).

Topology is **many browsers → one Pages Function → one Ponder box on Fly**. The launch risk
isn't stale charts, it's a trending token sending a thundering herd of concurrent opens
straight through to a single Fly instance. Caching is an origin shield.

### Key insight that makes aggressive caching safe

The chart's freshness does **not** depend on the candle response being fresh:

- **Historical candles are immutable** — a 1m bar from 2h ago never changes.
- **The current/forming bar is drawn by the live-trade overlay**, not the candle fetch. The
  client merges `watchLive` trades onto (and *creates new buckets past*) the newest API candle.
  So even if `/api/candles` is seconds stale — or missing the newest bucket entirely — the
  chart still shows live price action from the trade stream.

⇒ Edge staleness on the candle endpoint is invisible on-screen. We can cache hard.

## The ask

Replace the flat `public, max-age=5` on `/api/candles` responses with a TTL split by recency,
using distinct browser (`max-age`) vs edge (`s-maxage`) TTLs plus `stale-while-revalidate`.

Two tiers:

| Response state | When | `Cache-Control` |
|---|---|---|
| **Live tail** | newest candle == current time bucket (trades happening now) | `public, max-age=2, s-maxage=5, stale-while-revalidate=30` |
| **Settled** | newest candle < current bucket (no trade yet this bucket) | `public, max-age=10, s-maxage=30, stale-while-revalidate=300` |
| **Error** | 4xx/5xx | `no-store` |

Rationale:
- `s-maxage` (edge/shared) is the origin shield. Even `s-maxage=5` collapses 100 opens/sec on a
  hot token to ~1 origin query / 5s per `(token,res)` — a ~500× reduction — while the overlay
  hides that ≤5s lag. Settled series aren't changing, so `s-maxage=30` is safe and looser.
- `max-age` (per-browser) stays short so a single tab feels live even without the overlay.
- `stale-while-revalidate` serves the cached copy instantly and refreshes behind the scenes,
  so no user ever waits on a revalidation.

## Concrete diff

**1. Make `json()` accept an optional cache policy (backward compatible — default unchanged, so
board/trades/token/holders are untouched):**

```ts
// functions/api/_ponder.ts
export function json(body: unknown, status = 200, cacheControl = 'public, max-age=5'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cacheControl },
  })
}
```

**2. Compute the TTL per candle response:**

```ts
// functions/api/candles/[addr].ts
function candleCache(candles: Candle[], res: number): string {
  const curBucket = Math.floor(Date.now() / 1000 / res) * res
  const newest = candles.length ? candles[candles.length - 1].time : 0
  // Newest bar is the current bucket → live/mutable tail → short. Otherwise the series is
  // settled until the next trade → cache longer. The client's live overlay draws any newer
  // trades regardless, so edge staleness never shows on the chart.
  return newest >= curBucket
    ? 'public, max-age=2, s-maxage=5, stale-while-revalidate=30'
    : 'public, max-age=10, s-maxage=30, stale-while-revalidate=300'
}
```

Then both success returns become `return json({ candles }, 200, candleCache(candles, res))`,
and the error returns become `return json({ error: ... }, 4xx|500, 'no-store')`
(a cached 500 for 5s is a mini-outage — worth killing while here).

## ⚠ Implementation caveat — verify the edge actually caches

`Cache-Control` on a Pages Function response reliably drives the **browser** cache, but
Cloudflare does **not** always edge-cache a dynamically-generated Worker/Pages-Function
response from the header alone. To guarantee the `s-maxage` origin-shield actually engages,
one of:
- wrap the response through the **Cache API** (`caches.default.match` / `.put`) keyed on the
  request URL, or
- a zone **Cache Rule** that makes `/api/candles/*` eligible.

Please confirm the edge is caching (not just browsers) — otherwise the thundering-herd
protection isn't real, which is the whole point for launch.

## Phase 2 (optional, needs a small FE change — my lane)

The theoretically-cleanest split is to make the immutable history *permanently* cacheable:
add a bounded historical variant (e.g. `?before=<ts>` returning only settled buckets) served
with `public, max-age=31536000, immutable`, and fetch history + a small live window separately
on the client. Bigger change; only worth it if a single instance still strains after tier-1.
Flagging, not requesting.

## Client side (not blocking this)

I'll layer React Query on the client later for snappy token-switches / background revalidate —
UX polish, not load-bearing, and it composes with whatever you set here. Nothing needed from
you for that.

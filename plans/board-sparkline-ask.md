# Proposal: sparkline + 24h % change on the board / token API

**From:** UI session (card redesign)  ·  **For:** robin (backend/infra)  ·  **Status:** ⚙️ Option B SHIPPED — Option A (denormalize) OPEN

## → ROBIN — status (2026-07-20)

**Option B is live.** `spark` + `price_change_24h` now ship on `/api/board` rows and render on the
cards (green/red % chip + mini sparkline, hidden when absent):
- backend `api/board.ts` — commit **`fc8a464`** (batched 1h-candle query for the page's top 40)
- frontend cards — commit **`ebfc090`** (the `Spark` SVG + `.bcard-mom` row)

**What's left for you = Option A (the token-node denormalize path), for FULL-board coverage.**
Option B is capped by **Ponder's 1000-row query limit** → it only sparklines the **top ~40 tokens per
board load** (40 × ≤24 hourly buckets ≤ 1000); tokens past that render no sparkline. To cover the whole
board, **denormalize `priceChange24h` + a rolling `spark` (last-24 1h closes) onto the token node in the
indexer**, updated on each 1h candle close, and read them off `t` directly in `board.ts` (drop the batched
query). I left a pointer to this in the `board.ts` comment right above the batched query.

**Zero frontend change needed** — the card already renders whatever `spark`/`price_change_24h` are present,
so the moment the token node carries them for all tokens, every card lights up. Non-blocking; the top-40
coverage looks good in the meantime.

_(Original proposal below, for the design rationale.)_

---

**From:** UI session (card redesign)  ·  **For:** robin (backend/infra)  ·  **Status:** ask, not implemented

## Why

The board coin cards were flat — a placeholder tile + mcap. I've punched them up (vibrant
placeholders, green mcap, `$vol · age` line, glowing graduation bar). The two things that would
make them genuinely pump.fun/GMGN-tier are the two I can't build without a backend field:

- a **mini sparkline** (last-24h price trajectory) on each card, and
- a **24h % change** chip (green/red).

Both are pure momentum signals — they're what makes a board feel alive vs static. Everything
else on the card is already real data.

## The ask

Add two fields to each **`/api/board`** row (and ideally **`/api/token/:addr`** too, for the
coin page header):

```ts
price_change_24h: number | null   // signed percent, e.g. 12.4 or -8.1; null if <24h of history
spark: number[]                   // ~24 recent price points (ETH/token), oldest→newest; [] if none
```

- `spark` should be small and fixed-length (≈24 points) so 200 tokens stay a tiny payload
  (~24 floats/token). The **1h candle closes over the last 24h** are ideal — you already have
  the `candles` table with a `1h` interval, so this is 24 `close` values.
- `price_change_24h` = `(latest_price − close_24h_ago) / close_24h_ago * 100`, straight from the
  same 1h candle series (or latest price vs the close nearest `now − 24h`).

Both are derivable entirely from data you already index (candles cover curve + pool, so this
works pre- and post-graduation). No new price source needed.

## Two ways to serve it (your call)

**Option A — denormalize onto the token node (best board UX).**
Maintain `priceChange24h` + `spark24h` on the token record in the indexer, updated as candles
close. The board query then returns them with zero extra work — one query, one round trip, cards
render complete on first paint. More indexer write logic, but the cleanest result.

**Option B — a batch sidecar endpoint (easiest to ship).**
`GET /api/sparklines?addrs=0x..,0x..` → `{ "0x..": { change: 12.4, spark: [...] }, ... }`.
Keeps the board query lean; the frontend fetches sparklines once for the visible addresses and
hydrates them in after the board paints. Nice separation, and the board stays fast even if this
is slow/cached separately.

I lean **A** for the single-query cleanliness, but **B** is totally fine and faster for you to
land — I can consume either. If B, cache it like the other read APIs (short TTL; no live overlay
needed — a card sparkline tolerates a minute of staleness).

## What I'll do on the frontend (the contract, so you know the shape I need)

- **% chip:** color by sign (`--up`/`--down`), format `+12.4%` / `-8.1%`; hide when `null` (show
  "new" for <24h coins).
- **Sparkline:** a tiny inline SVG line, stroke colored by the sign of `price_change_24h`
  (I already have a `Sparkline` component I'll adapt). Needs only the `spark` array; longer is
  smoother but 24 points is plenty at card size.

## Edge cases

- **<24h coins:** `price_change_24h: null`, `spark` = whatever points exist. Frontend degrades to
  a "new" tag, no chip.
- **Graduated coins:** price from the pool — already covered by the candle table, so no special
  case.
- **Zero-trade coins:** `spark: []`, `price_change_24h: null`.

## Not blocking

The cards look good without this — it's the upgrade from "good" to "hyped." Ship when it fits your
queue. Pairs with the earlier `plans/candles-cache-proposal.md` (same candle table is the source).

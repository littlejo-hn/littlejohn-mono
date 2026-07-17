# Data layer build plan — launchpad-first (2026-07-16)

Derived from the field catalog (artifact `data-catalog`, launchpad-first cut).
Scope: a pump.fun-grade launchpad, NOT a GMGN analytics tool. We build launch +
trade + holder *balances* + cheap market stats + the social layer (profiles,
comments). We explicitly DO NOT build the PnL / sniper / smart-money / clustering
engine.

Two independent tracks. They share nothing and can run in parallel. The one
cross-dependency: a profile's "coins held" needs Track A's holder data.

---

## Track A — data / indexer

### The engine decision (lock this before building A)

Adding holders means indexing `Transfer` on *every* launched token (a factory of
ERC20s) and keeping per-wallet balances reorg-safe. That is precisely the case
that separates the two options:

- **Ponder (recommended).** `factory()` config indexes Transfer across all tokens
  created by the launchpad natively; reorg handling + candle rollups come for free;
  the based-alpha schema proves the shape. Cost: a long-running Node service +
  Postgres on Railway/Fly (~$10-20/mo), one more vendor, and it's a SEPARATE
  instance from based-alpha (no-links rule). Handlers written fresh for Velodrome
  pairs, not V3.
- **Extend the Cloudflare D1 indexer (alternative).** Stays all-Cloudflare, no new
  host. Cost: we hand-roll factory-wide Transfer indexing (getLogs by topic across
  all token addresses each tick) + balance-delta maintenance + candle rollups, all
  reorg-safe by hand. More bug surface on the exact part Ponder does for free.

Recommendation: **Ponder for Track A.** Holders + candles are its sweet spot and
they're the bulk of this track. The Cloudflare-native call was right when the data
model was 3 tables; holders tips it. Note: the DO firehose (live push) reads the
chain directly and is unaffected by this choice, it stays on Cloudflare either way.

### Schema (Ponder tables)

- **token** (extend what we have): add `lastPriceWei bigint` (exact, replace float),
  keep metadata/socials/curve state/graduated/pool.
- **trade** (extend): add `protocolFee`, `creatorFee` (event already emits, we drop
  them today), store `priceWei bigint` not float.
- **holder** (new): `id = token-address`, `token`, `address`, `balance` (ground
  truth from Transfer). NO buy/sell aggregates, NO cost basis (that's the deferred
  PnL engine). Index `(token, balance)` for top-holders, `address` for portfolio.
- **candle** (new): `id = token-interval-bucket`, OHLC + volumeEth + trades,
  intervals 1m/5m/15m/1h/4h/1d (drop 1s/15s unless charts need them). Pre-stored so
  chart loads are index reads, not aggregations.
- **pool** reserves: store latest reserves per graduated pair for liquidity/depth.

### Derived / cheap (query or compute, no new indexing)

- Holder count = `COUNT(holder WHERE token=? AND balance>0)`.
- Dev % = creator's holder.balance / supply.
- Curve progress % = tokens_sold / CURVE_SUPPLY.
- 24h volume / txns / price-change windows = windowed queries over trades.
- ATH = running max of candle highs.
- Dev's other coins = `token WHERE creator=?` (we already store creator).
- LP-burned / owner-powers = surface known on-chain facts.
- Trending = simple volume-weighted-recency score, computed on read.

### External

- **USD pricing:** one ETH/USD feed (Chainlink on-chain if RH Chain has a feed,
  else a cached off-chain price in a Worker). Everything USD derives from it.

### Frontend repoint

- Board / token / trades / candles read from Ponder's API (GraphQL or SQL-over-HTTP)
  instead of the D1 Pages Functions. DO firehose (`watchLive`) unchanged.

---

## Track B — social app-DB (engine-independent, lands on us regardless)

This is the half of pump.fun that is not an indexer. Nothing here is on-chain.

### Storage
- **Cloudflare R2** (or CF Images) for avatars, banners, comment image attachments.
  Token images stay on IPFS (canonical); profile/social media go to R2 (cheap
  delivery, mutable, app-owned).

### Auth
- **Sign-In With Ethereum (SIWE):** wallet signs a nonce, we issue a session. This
  is how a wallet "owns" its profile (set username/avatar, post comments). No
  passwords, no email.

### Schema (D1 or Postgres — can stay on Cloudflare D1 even if Track A goes Ponder)
- **profile:** `address` PK, `username` (unique), `avatarUrl`, `bannerUrl`, `bio`,
  `createdAt`, `verified`.
- **comment:** `id`, `token`, `author`, `body`, `imageUrl?`, `createdAt`,
  `replyTo?`; index `(token, createdAt)`. Reply count = aggregate.
- **watchlist:** `(address, token)` pairs.
- Moderation: `report` table + a hide flag; a basic admin review path.

### API
- Pages Functions: `POST /api/siwe`, `GET/PUT /api/profile/:addr`,
  `GET/POST /api/comments/:token`, `POST /api/upload` (R2 presigned), watchlist CRUD.

### Frontend
- Profile page (username/avatar/banner/bio + coins created + coins held via Track A).
- Comment thread on the coin page. Username+avatar shown wherever an address appears
  (board, trades feed, holders) — a resolver that maps address → profile.

---

## Sequencing

1. **Lock the engine decision** (Ponder vs extend-D1). Blocks Track A only.
2. Track A and Track B start in parallel.
3. Track A order: exact prices + fees (trivial) → holders → candles → derived stats
   → USD → frontend repoint.
4. Track B order: storage + SIWE → profile CRUD → address→profile resolver
   (wire into existing board/feed) → comments → watchlist → moderation.
5. Join point: profile "coins held" consumes Track A holder data (do last).

## Deferred (not building — the GMGN tier)

Holder/profile PnL, avg entry, leaderboards, first-N-buyers, sniper/insider/bundled
detection, smart-money flows, wallet clustering, bubble maps.

## Open decisions

- [ ] Engine: Ponder (recommended) vs extend D1. **Needs Yuxi.**
- [ ] Does RH Chain expose a Chainlink ETH/USD feed, or do we cache an off-chain price?
- [ ] Candle intervals: include 1s/15s or start at 1m?
- [ ] Username namespace: first-come-first-served, reservations, or none at launch?

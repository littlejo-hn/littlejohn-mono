# Infra architecture — HA data stack for the launchpad (2026-07-16)

Grounded in web research (sources at bottom). Goal per Yuxi: zero outages,
redundancy everywhere, scale to hundreds of thousands of tokens and users.

## Posture: "zero outage" is a design stance, not a promise

Even the best go down. pump.fun rides Solana's Geyser firehose + heavy caching and
still has app-layer incidents; the NOXA launchpad went fully dark for two days at
its peak. So the target is: **no single point of failure, degrade-don't-die, recover
in minutes not hours.** Our biggest residual SPOF is Ponder's single writer (below),
plan around it explicitly.

Reality check that shapes everything: **there is no Geyser on EVM.** pump.fun's
sub-second edge is a Solana push firehose we cannot replicate. Our equivalent is
Ponder polling `getLogs` + the Durable Object firehose we already built for live push.

## The eight decisions

### 1. RPC — 3-tier failover pool
- Primary: **Alchemy** (paid dedicated). Secondary: **QuickNode** (independent failure
  domain). Tertiary: **dRPC paid** (cheap burst). Break-glass: **public RH RPC** (health
  gate / last resort, never primary).
- Failover at the transport layer (Ponder's `PONDER_RPC_URL` takes a comma-separated
  list and load-balances + fails over). Health-gate on 5xx/429 and head-block staleness
  (drop a node lagging > 2 blocks).
- Cost driver at scale is `getLogs` volume, not user reads. Keep the primary on a real
  paid tier, not pay-as-you-go.

### 2. Ponder — single writer, many readers
- **One `ponder start` writes; unlimited `ponder serve` replicas read.** No leader
  election, never run two writers.
- Writer HA = auto-restart supervision (resumes on the same `DATABASE_SCHEMA`). For true
  redundancy, a **warm standby writer on a second schema/region** indexing in parallel;
  cut over via a DB view flip. Cost: 2x indexing RPC. This is the one investment that
  most moves us toward zero-outage.
- **Zero-downtime deploys + schema migrations = blue-green via views:** new deploy
  backfills into a fresh schema, flip a static view when it hits `/ready`. Readers query
  the view name and never reconfigure. (Tradeoff: full re-backfill per schema change,
  batch them.)
- Wire `/ready` (200 only when caught up to head) into the load balancer.

### 3. Postgres — Neon now, Aurora as the escape hatch
- **Neon** (paid): storage/compute split, shared-storage read replicas (no replication-lag
  management), autoscaling for spiky launch traffic, PITR. **Turn scale-to-zero OFF on the
  primary** (cold starts). Writer → primary, all API reads → replicas.
- **Not Supabase for the hot path**: its auto-failover is Enterprise-only. (Supabase could
  still serve Track B social data where HA matters less — we already have a project.)
- **Aurora multi-AZ** is the migration target once 100k-token Transfer writes saturate Neon.
- Non-negotiables: connection pooler (Ponder + Workers exhaust connections otherwise),
  PITR on, DB colocated with Ponder (< 50ms roundtrip — Ponder buffers writes and flushes
  via COPY, but latency still bounds throughput).

### 4. Read path — CDN + KV in front of replicas
- Cloudflare **Cache API** on all GET endpoints (token, trades, candles) with 1-5s TTL,
  absorbs the bulk of 100k-user reads before Postgres.
- **KV board cache**: precompute board/trending on a 1-2s cron Worker into KV (built for
  read-heavy fan-out, 1M+ RPS). KV caveat: 1 write/sec/key, eventual consistency, right
  for a timer-refreshed board, wrong for per-user state (use Redis/PG for those).
- Rate Limiting API on write/expensive endpoints; WAF + DDoS + Bot Management on.

### 5. Realtime — keep Durable Objects, shard + hibernate
- **DO per token room** (naturally shards 100k tokens; idle rooms hibernate, nearly free).
- The real ceiling is **1,000 requests/sec per DO** (every inbound WS message counts), not
  connection count. For the global board firehose, use a **fan-out tree** (ingest DO shards
  to N broadcaster DOs).
- Use the **Hibernation WebSocket API** (no duration billing while hibernating).
- **Frontend must fall back to HTTP polling when WS drops** — the single most important
  degradation path. A WS outage becomes near-realtime, never a broken page.
- Switch to **Ably** only above ~250k concurrent or if we need presence/ordering guarantees.

### 6. The 100k-token holder problem — the hard part
- Index Transfer with **one wide `getLogs` per block range filtered by the Transfer topic**
  across all tokens, then filter to our set. Never poll per-contract. (Ponder's `factory()`
  does the efficient batching; this is what our scaffold uses.)
- **HASH-partition `holders` by token** (~64 partitions) so per-token queries prune to one
  partition. Keep raw transfers in a separate range-partitioned-by-block append table you
  can DROP to prune.
- **Liveness-tier holder tracking.** Most launched tokens die within hours. Maintain the
  live holder aggregate only for active tokens (curve-active + recently graduated + above a
  volume floor); for dead tokens keep only raw logs (or drop) and recompute on-demand if
  someone loads the page. This is the single biggest cost lever at scale.

### 7. Monitoring + graceful degradation
- **Indexer lag (head - last indexed) is the #1 signal** — Ponder exposes Prometheus
  metrics; alert if lag > ~10 blocks / 30s. Plus RPC health, PG replication lag + pool
  saturation, Worker p99 + cache hit ratio, DO req-rate vs 1k/s.
- Prometheus → Grafana Cloud; PagerDuty / Better Stack paging on indexer-lag and `/ready`.
- Degrade-don't-die: RPC fails → transport fallback; indexer down → serve stale from
  replicas + CDN with a "data may be delayed" banner; bad deploy → view-flip rollback;
  cache/Redis miss → fall through to PG; **WS down → HTTP polling**; overload → shed load,
  serve cached board.

### 8. What the big platforms run
Solana launchpads use Geyser/Yellowstone gRPC (not available to us) + caching + own RPC
fleets. Scale reality: pump.fun hit ~71.7k tokens/day; the chain stayed up, the app layer
is where launchpads fail. Our differentiator is graceful degradation + fast recovery.

## Provision-today checklist

1. **RPC:** Alchemy + QuickNode dedicated endpoints + dRPC paid key; put all in
   `PONDER_RPC_URL` (comma-separated) with public RH as break-glass.
2. **Ponder:** one `ponder start` under auto-restart (Railway or Fly Machines) + 2x
   `ponder serve` behind the CF Worker; blue-green via new schema + view flip; `/ready`
   on the LB.
3. **Postgres:** Neon paid, primary + 1 read replica, scale-to-zero OFF, PITR on, pooler
   on, colocated with Ponder.
4. **Holders:** wide-topic getLogs (factory does this), HASH-partition `holders` by token,
   liveness-tier so only active tokens keep a live aggregate.
5. **Read path:** Cache API on GETs, KV board cache on a 1-2s cron, Rate Limiting, WAF/DDoS.
6. **Realtime:** DO-per-token + Hibernation + fan-out tree for the board; frontend
   HTTP-polling fallback (we already have the DO firehose; add sharding + the fallback).
7. **Observability:** Ponder Prometheus → Grafana; PagerDuty on indexer-lag + `/ready`;
   RPC/PG/Worker dashboards; the "data delayed" banner.

Provision later: warm standby writer (2nd region), indexer sharding, Aurora migration,
Upstash Redis for counters, Ably above 250k concurrent, Goldsky Mirror for cold-token
backfill.

## Rough monthly cost

| | Launch | 100k-token / 100k-CCU |
|---|---|---|
| RPC | $200-600 | $2,000-6,000 (self-node may win here) |
| Ponder compute | $100-300 | $500-1,500 (2x with standby writer) |
| Postgres | $150-400 (Neon) | $2,000-6,000 (Aurora + replicas) |
| Cloudflare (Pages/Workers/KV/Cache) | $50-200 | $500-2,000 |
| Durable Objects | $20-100 | $300-1,500 (idle rooms ~free) |
| Monitoring | $50-150 | $300-800 |
| **Total** | **~$600-1,800/mo** | **~$6,000-18,000/mo** |

Biggest cost levers at scale: RPC getLogs volume (wide-filter batching + liveness tiering)
and Postgres writes (partitioning + pruning dead tokens).

## Our-specific notes / deltas from current state

- We already have: Cloudflare stack, the DO firehose (live push), Alchemy paid, a Supabase
  project (use for Track B social data, NOT the indexer hot path).
- Track A scaffold (`ponder/`) already uses the factory pattern for holders and RPC-list
  failover. Not yet built: holder HASH-partitioning, liveness-tiering, metadata enrichment
  step, `ponder serve` split, blue-green deploy.
- The DO firehose predates this doc; it needs the per-token sharding + fan-out tree + the
  HTTP-polling frontend fallback to hit the scale/uptime bar here.

## Open decisions (need Yuxi)

- [x] Host for Ponder: **Fly Machines** (locked 2026-07-16). Chosen for multi-region (the
  standby writer) + Yuxi's existing familiarity with Fly. Writer = one always-on Machine
  (auto-restart), readers = `ponder serve` Machines later; colocate region with Neon.
- [ ] Provision the paid RPC set now, or run testnet on public RH + Alchemy until closer to
  mainnet? (Testnet volume is tiny; could defer QuickNode/dRPC to mainnet.)
- [ ] Warm standby writer at launch, or accept auto-restart-only until we see real load?

## Sources
Ponder self-hosting + performance + migration docs; Cloudflare DO limits/pricing/hibernation
+ KV + Rate Limiting docs; Neon vs Supabase vs RDS (2026); Postgres partitioning docs;
QuickNode/Robinhood RPC provider lists; Yellowstone Geyser; pump.fun scale + NOXA outage
writeups. (Full URLs in the research transcript.)

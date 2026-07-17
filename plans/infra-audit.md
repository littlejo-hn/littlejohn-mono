# Infra audit — LittleJohn vs pump.fun (2026-07-16)

Why this matters: multiple RH launchpads have died from infra, not product. The
failure mode is always the same: the indexer stalls or the RPC rate-limits, the
board freezes, and users read a frozen board as "dead project" and leave. This
audit checks our stack against that failure mode and against how pump.fun runs.

## How pump.fun actually runs (the principles to copy)

1. **One firehose, not N pollers.** pump.fun subscribes to a single Geyser /
   Yellowstone gRPC stream of ALL program updates and fans out from there. It
   never polls per-token. Every token shares one subscription.
2. **Redundant RPC.** Multiple nodes/providers behind a failover; a single
   provider hiccup never freezes the product.
3. **Own indexer DB + heavy caching** in front of everything; browsers read the
   API/cache, not the chain.
4. **Monitoring on liveness** — they know within seconds if the stream lags.

## Our stack today

- Indexer: cron Worker (1/min) → chunked `getLogs` on the launchpad → D1. Good:
  single-stream for history, idempotent writes, per-chunk checkpoint, 5-conf lag.
- Live: one `LiveFeed` Durable Object **per coin**, each polling `getLogs` ~1/sec.
- Board/API: Pages Functions → D1.
- Pinning: Pinata V3.

## Gaps, ranked by how likely they are to kill us

### P0 — per-coin per-second DO polling is the scaling wall  [DONE 2026-07-16]
FIXED: `live.ts` is now a single firehose hub DO (idFromName("hub")) holding all
sockets tagged by coin; polls the launchpad once per tick (one getLogs for all
curve trades + Migrated, one across watched pairs) and fans out via
getWebSockets(tag). RPC cost is now independent of coin count. Verified live: a
real testnet buy pushed over the socket sub-second (harness/firehose-proof.mjs).

Original finding:
`indexer/src/live.ts`: every watched coin runs its own DO polling `getBlockNumber`
+ `getLogs`(launchpad, filtered) + `getLogs`(pair) + `getBlock` every 1s. That is
2–4 RPC calls/sec **per watched coin**. 50 coins being watched at once = ~150
RPC calls/sec of `getLogs` (expensive). Any real RPC rate-limits this instantly,
and the board goes dark exactly when we're busiest. This is the opposite of
pump.fun's one-firehose model.
**Fix:** collapse to ONE firehose. A single poller (the cron at higher cadence, or
one "hub" DO) reads ALL launchpad logs once per tick and routes each trade to the
per-coin fan-out DO by token. N coins → 1 RPC stream, not N. Per-coin DOs keep
only the socket set + broadcast; they stop touching the chain.

### P0 — single RPC provider, no failover (indexer + DO + frontend)  [ARMED 2026-07-16]
Indexer + DO side DONE: `makeClient` now uses viem `fallback([...])` when
`RPC_URL_FALLBACK` is set (unset = single, current behavior).

Provider choice (verified 2026-07-16):
- dRPC FREE tier does NOT serve RH Chain (`eth_chainId` -> "chain is not available
  on freetier"). Only usable if upgraded to dRPC paid.
- Public RH RPC works and is independent infra from Alchemy. chainIds verified:
  `rpc.testnet.chain.robinhood.com` -> 0xb626, `rpc.mainnet.chain.robinhood.com` -> 0x1237.

RECOMMENDED launch pairing (zero extra cost): primary = Alchemy mainnet (paid),
secondary = `https://rpc.mainnet.chain.robinhood.com` (public RH). Set as the
mainnet worker's RPC_URL (secret) + RPC_URL_FALLBACK. Optional 3rd for decentralized
independence = dRPC PAID or QuickNode. Frontend read client still wants a public
secondary too — public RH RPC is the free option there as well.

Original finding:
`indexer/src/index.ts makeClient`: `http(env.RPC_URL)` — one transport.
`app/src/lib/wallet.tsx:29`: `http()` — bare, single RH public RPC.
No `fallback([...])` anywhere. One provider blip = frozen board / failing reads.
**Fix:** viem `fallback([http(primary), http(secondary)])` in makeClient and in
the frontend read client. Need a 2nd RH RPC endpoint (or our own node) as backup.

### P1 — Cloudflare free-tier caps (`workers_dev=true`, no paid plan)  [DONE 2026-07-16, confirm in dash]
User upgraded to Workers Paid (2026-07-16). Lifts D1 to 50M writes/day and removes
the DO invocation ceiling. Could not verify via API (token lacks billing scope);
confirm in dashboard: Workers & Pages sidebar should read "Workers Paid".

Original finding:
DO invocations and D1 writes both have hard free-tier ceilings. Per-second DO
polling alone is 86,400 invocations/day PER watched coin; D1 free write cap is
100k/day (~70 writes/min) and a busy launchpad blows past it. Hitting either cap
mid-launch = silent freeze.
**Fix:** move to Workers Paid ($5/mo) BEFORE mainnet — lifts D1 to 50M writes and
removes the DO ceiling. Cheap insurance. (P0 firehose fix also slashes the DO
invocation count regardless.)

### P1 — no monitoring / alerting on indexer liveness  [DONE 2026-07-16]
DONE: `/health` returns 503 when the cron has gone silent > 5 min (keys on
`checkpoint.last_run_ts`, stamped every successful pass), 200 otherwise, with
head / lastBlock / lagBlocks for info. Point an external monitor
(healthchecks.io / UptimeRobot) at it — that external ping is the last user step.

Original finding:
`scheduled()` swallows errors into `console.error`. If the run dies at 3am the
board freezes and nobody knows. This is the exact way clones die quietly.
**Fix:** `/health` endpoint reporting checkpoint-lag (head − last_block); external
heartbeat (healthchecks.io / CF alert) that pages if lag > N blocks or cron missed.

### P2 — no timeout on IPFS metadata fetch  [DONE 2026-07-16]
DONE: `resolveMeta` fetch now uses `AbortSignal.timeout(3000)`; a hung gateway
leaves meta null instead of stalling the chunk.

Original finding:
`resolveMeta` in index.ts does `fetch(url)` with no AbortSignal inside the chunk's
`Promise.all`. One hanging gateway on one token creation can stall the whole chunk
→ Worker timeout → failed run.
**Fix:** `fetch(url, { signal: AbortSignal.timeout(3000) })`; on timeout leave meta
null and let a later pass fill it.

### P2 — no reorg rollback
Checkpoint only advances; trades keyed `block-logIndex` with INSERT OR IGNORE. A
reorg deeper than 5 confs would leave stale wrong rows. Low risk on an Orbit L2
(centralized sequencer, deep reorgs rare) but there's no recovery path.
**Fix:** accept for launch; document it. If needed later, delete trades >
(head − N) before re-indexing the tail.

## Recommended order for today
1. P0 firehose refactor (biggest scale + cost win, kills the RPC amplification).
2. P0 RPC fallback (need a 2nd endpoint — user action to source one).
3. P1 Workers Paid upgrade (user action, $5).
4. P1 healthcheck + alert.
5. P2 fetch timeout (quick), reorg note (doc only).

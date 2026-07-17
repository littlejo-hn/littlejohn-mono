# littlejohn-ponder

Track A of the data layer (see `../plans/data-layer-buildplan.md`). Ponder indexer:
tokens, trades (with fees, exact bigint prices), holder balances (factory Transfer),
pre-aggregated OHLCV candles, and pool reserves. Launchpad-first: NO PnL / cost-basis
(that is the deferred GMGN tier).

## Run locally

```bash
cd ponder
pnpm install            # or npm install
cp .env.local.example .env.local   # fill PONDER_RPC_URL etc.
pnpm codegen            # generate ponder:schema / ponder:registry types
pnpm dev                # sync against testnet into the local PGlite store
```

`pnpm dev` serves the GraphQL + SQL API on http://localhost:42069 and hot-reloads.

## Contracts indexed (ponder.config.ts)

- `Launchpad` — TokenCreated / Trade / Graduated / Migrated
- `LaunchToken` — ERC20 Transfer, via `factory()` on every token the launchpad
  creates (this is the holder-balance machinery)
- `DexPair` — Velodrome pair Swap / Sync, via `factory()` on the launchpad's
  Migrated event (only launchpad-token pairs, no DEX-wide filtering)

## Known TODOs before this replaces the D1 indexer

- **Metadata enrichment.** image/socials are left null during sync (fetching IPFS
  for every token inline would stall the indexer). Resolve them in a separate step
  (a bounded worker or an on-read resolver) and backfill.
- **USD pricing.** lastPriceWei is native ETH; a separate ETH/USD feed layers on top.
- **Frontend repoint.** The app currently reads the D1 Pages Functions; point board /
  token / trades / candles at Ponder's API. The DO firehose (live push) is unchanged.
- **Deploy topology.** See the infra architecture doc for HA hosting + Postgres.

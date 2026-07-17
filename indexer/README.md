# littlejohn-indexer

Cloudflare-native indexer for the LittleJohn launchpad. It replaces the
frontend's per-token RPC loops with a D1-backed API so the coin board scales to
thousands of tokens.

Two pieces, one shared D1 database (`littlejohn_index`):

1. **Scheduled Worker** (`indexer/`) polls chain events via `getLogs` every
   minute and writes them to D1.
2. **Pages Functions** (`app/functions/api/`) read the same D1 and serve JSON.

## What it indexes

Launchpad events `TokenCreated`, `Trade`, `Graduated`, `Migrated`, plus graduated
ve(3,3) pair `Sync` / `Swap`. Price/mcap math matches the frontend exactly:

- Curve price = `virtualEth / virtualToken` (both 1e18-scaled).
- Pool price = `wethReserve / tokenReserve` (token order via address sort, which
  is how Velodrome V1 pairs assign token0/token1).
- `mcap = price * 1e9` (total supply is 1e9 whole tokens). USD conversion stays
  in the frontend; D1 stores ETH-denominated price and mcap.

Writes are idempotent (`ON CONFLICT DO UPDATE` / `INSERT OR IGNORE`) and the
aggregate columns (`trade_count`, `vol_eth`, `last_trade_ts`) are recomputed from
the `trades` table, so a failed run safely re-processes the same block range.

## Read API (Pages Functions)

- `GET /api/board?sort=mcap|new|graduating|volume&status=all|curve|graduated&limit=60`
- `GET /api/token/:addr`
- `GET /api/candles/:addr?res=60`
- `GET /api/trades/:addr?limit=50`

## Files

```
indexer/
  package.json
  tsconfig.json
  wrangler.toml        # name littlejohn-indexer, cron "* * * * *", D1 + vars
  schema.sql           # tokens / trades / checkpoint
  src/index.ts         # scheduled() + fetch("/run"); export runIndex()
app/
  wrangler.toml        # binds the SAME D1 to the Pages project
  functions/api/
    board.ts
    token/[addr].ts
    candles/[addr].ts
    trades/[addr].ts
```

## Setup and deploy

Run from `indexer/`. Requires `wrangler` (`npm install`).

1. **Create the D1 database** and copy the returned id:

   ```sh
   npx wrangler d1 create littlejohn_index
   ```

2. **Paste the id** into `database_id` in BOTH `indexer/wrangler.toml` and
   `app/wrangler.toml` (replace `PLACEHOLDER_D1_ID`).

3. **Apply the schema** (add `--remote` to hit the deployed DB; omit for local):

   ```sh
   npx wrangler d1 execute littlejohn_index --remote --file schema.sql
   ```

4. **Confirm `START_BLOCK`** in `indexer/wrangler.toml`. Default is the testnet
   launchpad deploy block `90397141`. For a fresh deployment set it to that
   contract's deploy block (the indexer only reads from this block forward).

5. **Deploy the indexer Worker:**

   ```sh
   npx wrangler deploy
   ```

   The cron trigger runs `scheduled` every minute. To force a pass immediately:

   ```sh
   curl https://littlejohn-indexer.<your-subdomain>.workers.dev/run
   ```

6. **Bind the D1 database to the app's Pages project** so the Pages Functions can
   read it. Either:

   - keep `app/wrangler.toml` (already binds `DB` -> `littlejohn_index`) and
     deploy the app with `npx wrangler pages deploy dist` from `app/`, or
   - set it in the dashboard: Pages project `littlejohn-app` -> Settings ->
     Functions -> D1 database bindings -> add `DB` = `littlejohn_index`.

   Then redeploy the app so the binding takes effect.

## Local testing

```sh
# from indexer/
npx wrangler d1 execute littlejohn_index --local --file schema.sql
npx wrangler dev
# in another shell:
curl http://localhost:8787/run
```

## Mainnet

Override the `[vars]` for mainnet (chainId 4663, RPC
`https://rpc.mainnet.chain.robinhood.com`) plus the mainnet launchpad / WETH /
router / start block once deployed. Use a separate `[env.mainnet]` block or the
dashboard vars.

## Notes

- `viem` runs on Workers without `nodejs_compat`. If a future dep needs Node
  builtins, add `compatibility_flags = ["nodejs_compat"]` to `wrangler.toml`.
- `CONFIRMATIONS` (default 5) keeps the indexer behind the chain head to avoid
  reorgs advancing the checkpoint past unstable blocks.

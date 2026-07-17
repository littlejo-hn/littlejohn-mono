import { ponder } from "ponder:registry";
import { token, trade, holder, pool, candle } from "ponder:schema";

// --- helpers ---------------------------------------------------------------

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const WETH = (process.env.WETH_ADDRESS ??
  "0xF13E5952780Cdcd2C17333129b5Bc5187ff07DC2").toLowerCase();
const WAD = 10n ** 18n;

const lc = (a: string) => a.toLowerCase() as `0x${string}`;

// 1e18-scaled ETH per whole token (exact; avoids float precision loss).
function priceWei(virtualEth: bigint, virtualToken: bigint): bigint {
  return virtualToken > 0n ? (virtualEth * WAD) / virtualToken : 0n;
}

// Buckets a trade into every candle interval. Idempotent per (token, interval, bucket).
const INTERVALS: [string, number][] = [
  ["1m", 60],
  ["5m", 300],
  ["15m", 900],
  ["1h", 3600],
  ["4h", 14400],
  ["1d", 86400],
];

async function applyCandles(
  db: any,
  tok: `0x${string}`,
  ts: number,
  price: bigint,
  volEth: bigint,
) {
  for (const [interval, secs] of INTERVALS) {
    const bucketStart = Math.floor(ts / secs) * secs;
    await db
      .insert(candle)
      .values({
        id: `${tok}-${interval}-${bucketStart}`,
        token: tok,
        interval,
        bucketStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volumeEth: volEth,
        trades: 1,
      })
      .onConflictDoUpdate((row: any) => ({
        high: row.high > price ? row.high : price,
        low: row.low < price ? row.low : price,
        close: price,
        volumeEth: row.volumeEth + volEth,
        trades: row.trades + 1,
      }));
  }
}

async function adjustHolder(
  db: any,
  tok: `0x${string}`,
  addr: `0x${string}`,
  delta: bigint,
) {
  await db
    .insert(holder)
    .values({
      id: `${tok}-${addr}`,
      token: tok,
      address: addr,
      balance: delta > 0n ? delta : 0n,
    })
    .onConflictDoUpdate((row: any) => ({ balance: row.balance + delta }));
}

// --- launchpad -------------------------------------------------------------

ponder.on("Launchpad:TokenCreated", async ({ event, context }) => {
  const a = event.args;
  const addr = lc(a.token);
  await context.db
    .insert(token)
    .values({
      address: addr,
      name: a.name,
      symbol: a.symbol,
      nameLower: (a.name ?? '').toLowerCase(),
      symbolLower: (a.symbol ?? '').toLowerCase(),
      metadataURI: a.metadataURI,
      image: null,
      description: null,
      twitter: null,
      telegram: null,
      website: null,
      creator: lc(a.creator),
      createdAt: Number(event.block.timestamp),
      createdBlock: event.block.number,
      virtualEth: a.virtualEth,
      virtualToken: a.virtualToken,
      tokensSold: 0n,
      lastPriceWei: priceWei(a.virtualEth, a.virtualToken),
      graduated: false,
      migrated: false,
      pool: null,
      tradeCount: 0,
      volumeEth: 0n,
    })
    .onConflictDoNothing();
});

ponder.on("Launchpad:Trade", async ({ event, context }) => {
  const a = event.args;
  const tok = lc(a.token);
  const price = priceWei(a.virtualEth, a.virtualToken);

  await context.db
    .insert(trade)
    .values({
      id: `${event.block.number}-${event.log.logIndex}`,
      token: tok,
      trader: lc(a.trader),
      isBuy: a.isBuy,
      ethAmount: a.ethAmount,
      tokenAmount: a.tokenAmount,
      protocolFee: a.protocolFee,
      creatorFee: a.creatorFee,
      priceWei: price,
      timestamp: Number(event.block.timestamp),
      block: event.block.number,
      source: "curve",
    })
    .onConflictDoNothing();

  await context.db.update(token, { address: tok }).set((row: any) => ({
    virtualEth: a.virtualEth,
    virtualToken: a.virtualToken,
    tokensSold: a.tokensSold,
    lastPriceWei: price,
    tradeCount: row.tradeCount + 1,
    volumeEth: row.volumeEth + a.ethAmount,
  }));

  await applyCandles(context.db, tok, Number(event.block.timestamp), price, a.ethAmount);
});

ponder.on("Launchpad:Graduated", async ({ event, context }) => {
  await context.db
    .update(token, { address: lc(event.args.token) })
    .set({ graduated: true });
});

ponder.on("Launchpad:Migrated", async ({ event, context }) => {
  const tok = lc(event.args.token);
  const pair = lc(event.args.pair);
  // Velodrome sorts token0 as the numerically smaller address.
  const tokenIsToken0 = tok < WETH;
  await context.db.update(token, { address: tok }).set({ migrated: true, pool: pair });
  await context.db
    .insert(pool)
    .values({ address: pair, token: tok, tokenIsToken0, reserveToken: 0n, reserveEth: 0n })
    .onConflictDoNothing();
});

// --- holder balances (factory Transfer across all tokens) ------------------

ponder.on("LaunchToken:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  if (value === 0n) return;
  const tok = lc(event.log.address);
  const f = lc(from);
  const t = lc(to);
  // Mints come from 0x0; burns go to 0x0 / dead. Skip those sides so supply held
  // by the zero/dead sink is never counted as a holder.
  if (f !== ZERO && f !== DEAD) await adjustHolder(context.db, tok, f, -value);
  if (t !== ZERO && t !== DEAD) await adjustHolder(context.db, tok, t, value);
});

// --- post-graduation pool trading ------------------------------------------

ponder.on("DexPair:Sync", async ({ event, context }) => {
  const pair = lc(event.log.address);
  const p = await context.db.find(pool, { address: pair });
  if (!p) return;
  const { reserve0, reserve1 } = event.args;
  const reserveToken = p.tokenIsToken0 ? reserve0 : reserve1;
  const reserveEth = p.tokenIsToken0 ? reserve1 : reserve0;
  if (reserveToken === 0n) return;
  const price = (reserveEth * WAD) / reserveToken;
  await context.db.update(pool, { address: pair }).set({ reserveToken, reserveEth });
  await context.db.update(token, { address: p.token }).set({ lastPriceWei: price });
});

ponder.on("DexPair:Swap", async ({ event, context }) => {
  const pair = lc(event.log.address);
  const p = await context.db.find(pool, { address: pair });
  if (!p) return;
  const a = event.args;
  const is0 = p.tokenIsToken0;
  const tokIn = is0 ? a.amount0In : a.amount1In;
  const tokOut = is0 ? a.amount0Out : a.amount1Out;
  const ethIn = is0 ? a.amount1In : a.amount0In;
  const ethOut = is0 ? a.amount1Out : a.amount0Out;
  const isBuy = tokOut > 0n;
  const ethAmount = isBuy ? ethIn : ethOut;
  const tokenAmount = isBuy ? tokOut : tokIn;
  const price = tokenAmount > 0n ? (ethAmount * WAD) / tokenAmount : 0n;

  await context.db
    .insert(trade)
    .values({
      id: `${event.block.number}-${event.log.logIndex}`,
      token: p.token,
      trader: lc(a.to),
      isBuy,
      ethAmount,
      tokenAmount,
      protocolFee: 0n,
      creatorFee: 0n,
      priceWei: price,
      timestamp: Number(event.block.timestamp),
      block: event.block.number,
      source: "dex",
    })
    .onConflictDoNothing();

  await context.db.update(token, { address: p.token }).set((row: any) => ({
    lastPriceWei: price,
    tradeCount: row.tradeCount + 1,
    volumeEth: row.volumeEth + ethAmount,
  }));

  await applyCandles(context.db, p.token, Number(event.block.timestamp), price, ethAmount);
});

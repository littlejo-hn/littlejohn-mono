import { index, onchainTable } from "ponder";

// LittleJohn indexer schema — launchpad-first (see plans/data-layer-buildplan.md).
// Prices are stored as bigint fixed-point (wei of ETH per whole token, 1e18-scaled)
// so tiny curve prices keep full precision — no float loss. Holder rows are pure
// balances (no cost-basis / PnL by design; that is the deferred GMGN tier).

export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    // Lowercased copies so search `_contains` is case-insensitive.
    nameLower: t.text().notNull(),
    symbolLower: t.text().notNull(),
    metadataURI: t.text().notNull(),
    // Media/socials resolved by a separate enrichment step, NOT during sync
    // (fetching IPFS for 100k tokens inline would stall the indexer).
    image: t.text(),
    description: t.text(),
    twitter: t.text(),
    telegram: t.text(),
    website: t.text(),
    creator: t.hex().notNull(),
    createdAt: t.integer().notNull(), // unix seconds
    createdBlock: t.bigint().notNull(),
    virtualEth: t.bigint().notNull(),
    virtualToken: t.bigint().notNull(),
    tokensSold: t.bigint().notNull(),
    lastPriceWei: t.bigint().notNull(), // 1e18-scaled ETH per whole token
    graduated: t.boolean().notNull(),
    migrated: t.boolean().notNull(),
    pool: t.hex(),
    tradeCount: t.integer().notNull(),
    volumeEth: t.bigint().notNull(),
  }),
  // Every board query sorts by one of these and pages by (sort key, address).
  (table) => ({
    createdAtIdx: index().on(table.createdAt, table.address),
    volumeIdx: index().on(table.volumeEth, table.address),
    tradeCountIdx: index().on(table.tradeCount, table.address),
    graduatedSoldIdx: index().on(table.graduated, table.tokensSold),
    creatorIdx: index().on(table.creator),
  }),
);

export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(), // `${block}-${logIndex}`
    token: t.hex().notNull(),
    trader: t.hex().notNull(),
    isBuy: t.boolean().notNull(),
    ethAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    protocolFee: t.bigint().notNull(),
    creatorFee: t.bigint().notNull(),
    priceWei: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    block: t.bigint().notNull(),
    source: t.text().notNull(), // "curve" | "dex"
  }),
  (table) => ({
    tokenTimeIdx: index().on(table.token, table.timestamp),
    traderIdx: index().on(table.trader),
  }),
);

// Per-(token, wallet) balance, ground truth from ERC20 Transfer events. Holder
// count = rows with balance > 0; dev % = creator's balance / supply. No PnL.
export const holder = onchainTable(
  "holder",
  (t) => ({
    id: t.text().primaryKey(), // `${token}-${address}`
    token: t.hex().notNull(),
    address: t.hex().notNull(),
    balance: t.bigint().notNull(),
  }),
  (table) => ({
    tokenBalanceIdx: index().on(table.token, table.balance),
    addressIdx: index().on(table.address),
  }),
);

// Graduated Velodrome pair -> launchpad token, plus latest reserves for liquidity.
export const pool = onchainTable("pool", (t) => ({
  address: t.hex().primaryKey(),
  token: t.hex().notNull(),
  tokenIsToken0: t.boolean().notNull(),
  reserveToken: t.bigint().notNull(),
  reserveEth: t.bigint().notNull(),
}));

// Pre-aggregated OHLCV so chart loads are index reads, not table scans.
export const candle = onchainTable(
  "candle",
  (t) => ({
    id: t.text().primaryKey(), // `${token}-${interval}-${bucketStart}`
    token: t.hex().notNull(),
    interval: t.text().notNull(), // "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
    bucketStart: t.integer().notNull(),
    open: t.bigint().notNull(),
    high: t.bigint().notNull(),
    low: t.bigint().notNull(),
    close: t.bigint().notNull(),
    volumeEth: t.bigint().notNull(),
    trades: t.integer().notNull(),
  }),
  (table) => ({
    seriesIdx: index().on(table.token, table.interval, table.bucketStart),
  }),
);

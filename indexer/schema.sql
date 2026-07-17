-- littlejohn_index D1 schema.
--
-- Shared by two Cloudflare deployments that bind the SAME D1 database:
--   * the indexer Worker (writes)  -> indexer/src/index.ts
--   * the app Pages Functions (reads) -> app/functions/api/*
--
-- Every indexer write is idempotent (ON CONFLICT DO UPDATE / INSERT OR IGNORE)
-- and aggregate columns (trade_count, vol_eth, last_trade_ts) are recomputed
-- from the trades table rather than incremented, so a failed run can safely
-- re-process the same block range without double counting.

CREATE TABLE IF NOT EXISTS tokens (
  address       TEXT PRIMARY KEY,   -- lowercased token address
  symbol        TEXT,
  name          TEXT,
  image         TEXT,               -- resolved http(s) url (ipfs:// rewritten to gateway)
  description   TEXT,
  twitter       TEXT,
  telegram      TEXT,
  website       TEXT,
  creator       TEXT,               -- lowercased
  created_block INTEGER,
  created_ts    INTEGER,
  graduated     INTEGER NOT NULL DEFAULT 0,   -- 0 | 1
  pair          TEXT,               -- lowercased ve(3,3) pair address, set on Migrated
  tokens_sold   TEXT,               -- uint (wei-scale) as decimal string
  virtual_eth   TEXT,               -- uint (1e18-scaled) as decimal string
  virtual_token TEXT,               -- uint (1e18-scaled) as decimal string
  price         REAL,               -- ETH per whole token
  mcap          REAL,               -- price * 1e9 (total supply is 1e9 whole tokens)
  last_trade_ts INTEGER,
  trade_count   INTEGER NOT NULL DEFAULT 0,
  vol_eth       REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tokens_graduated  ON tokens (graduated);
CREATE INDEX IF NOT EXISTS idx_tokens_mcap        ON tokens (mcap);
CREATE INDEX IF NOT EXISTS idx_tokens_created     ON tokens (created_block);
CREATE INDEX IF NOT EXISTS idx_tokens_last_trade  ON tokens (last_trade_ts);

CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,    -- `${block}-${logIndex}`
  token        TEXT NOT NULL,       -- lowercased token address
  trader       TEXT,                -- lowercased
  is_buy       INTEGER NOT NULL,    -- 0 | 1
  eth_amount   TEXT,                -- wei as decimal string
  token_amount TEXT,                -- wei as decimal string
  price        REAL,                -- ETH per whole token at this trade
  block        INTEGER NOT NULL,
  log_index    INTEGER NOT NULL,
  ts           INTEGER,
  phase        TEXT NOT NULL        -- 'curve' | 'pool'
);

CREATE INDEX IF NOT EXISTS idx_trades_token_ts ON trades (token, ts);
CREATE INDEX IF NOT EXISTS idx_trades_block    ON trades (block);

CREATE TABLE IF NOT EXISTS checkpoint (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  last_block  INTEGER,
  last_run_ts INTEGER               -- unix seconds of the last successful pass; /health watches this
);

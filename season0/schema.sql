-- LittleJohn Heist Season 0 — D1 schema
CREATE TABLE IF NOT EXISTS participants (
  wallet      TEXT PRIMARY KEY,           -- lowercased address
  code        TEXT UNIQUE NOT NULL,       -- this wallet's referral code
  referred_by TEXT,                       -- referral code of whoever brought them
  x_handle    TEXT,
  joined_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet     TEXT NOT NULL,
  url        TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  score      INTEGER NOT NULL DEFAULT 0,       -- mindshare points awarded on approval
  created_at INTEGER NOT NULL
);

-- populated by the (stubbed) testnet reader + the proof-of-interest job
CREATE TABLE IF NOT EXISTS quest_points (
  wallet     TEXT PRIMARY KEY,
  testnet    INTEGER NOT NULL DEFAULT 0,
  poi        INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sub_wallet ON submissions(wallet);
CREATE INDEX IF NOT EXISTS idx_part_ref ON participants(referred_by);

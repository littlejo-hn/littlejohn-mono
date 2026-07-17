-- Track B social tables (share the D1 bound to the Pages project as DB).

CREATE TABLE IF NOT EXISTS profile (
  address    TEXT PRIMARY KEY,   -- lowercased wallet
  username   TEXT,
  avatar_url TEXT,
  bio        TEXT,
  updated_ts INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_username ON profile (username);

CREATE TABLE IF NOT EXISTS comment (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT NOT NULL,      -- lowercased coin address
  author     TEXT NOT NULL,      -- lowercased wallet
  body       TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comment_token ON comment (token, id);

// Chain-wide token index in D1. The firehose and on-chain lookups persist every token
// they resolve — address, symbol, name, logo, venue, pool — exactly once, so search and
// logos come from OUR store instead of GeckoTerminal (no rate limits, no per-request
// proxy, and logos survive after a token ages out of the live firehose window). This is
// how the big terminals do it: resolve once at discovery, keep the URL.

export type IndexInput = {
  address: string; symbol: string; name?: string | null; image?: string | null
  dex?: string; pool?: string; liqUsd?: number; createdTs?: number
}

let schemaReady = false // per-isolate: skip the DDL once the table is known to exist
async function ensureSchema(db: D1Database) {
  if (schemaReady) return
  await db.exec(
    'CREATE TABLE IF NOT EXISTS tokens (address TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT, image TEXT, dex TEXT, pool TEXT, liq_usd REAL, created_ts INTEGER, first_seen INTEGER, last_seen INTEGER)',
  )
  schemaReady = true
}

export async function indexTokens(db: D1Database, items: IndexInput[]): Promise<void> {
  const rows = items.filter((t) => t.address && t.symbol)
  if (!rows.length) return
  await ensureSchema(db)
  const now = Math.floor(Date.now() / 1000)
  // Upsert: first_seen is set once (ON CONFLICT never touches it); keep the first
  // non-null image we ever resolved for a token, refresh everything else.
  const stmt = db.prepare(
    `INSERT INTO tokens (address,symbol,name,image,dex,pool,liq_usd,created_ts,first_seen,last_seen)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(address) DO UPDATE SET symbol=excluded.symbol, name=excluded.name,
       image=COALESCE(tokens.image, excluded.image), dex=excluded.dex, pool=excluded.pool,
       liq_usd=excluded.liq_usd, last_seen=excluded.last_seen`,
  )
  await db.batch(rows.map((t) => stmt.bind(
    t.address.toLowerCase(), t.symbol, t.name ?? null, t.image ?? null, t.dex ?? null, t.pool ?? null,
    Number.isFinite(t.liqUsd) ? t.liqUsd : 0, t.createdTs ?? 0, now, now,
  )))
}

// D1 row -> the terminal card shape (matches /api/trenches so results render + trade).
function rowToCoin(r: Record<string, unknown>) {
  return {
    pool: (r.pool as string) ?? '', address: r.address as string, symbol: r.symbol as string,
    name: (r.name as string) ?? (r.symbol as string), image: (r.image as string) ?? null, dex: (r.dex as string) ?? '',
    priceUsd: 0, fdvUsd: 0, liqUsd: (r.liq_usd as number) ?? 0, vol24: 0, vol1h: 0, chg24: 0, chg1h: 0,
    buys24: 0, sells24: 0, buyers24: 0, sellers24: 0, createdTs: (r.created_ts as number) ?? 0, score: 0,
  }
}

export async function searchTokens(db: D1Database, q: string) {
  const s = q.trim()
  if (!s) return []
  await ensureSchema(db)
  if (/^0x[0-9a-f]{40}$/i.test(s)) {
    const r = await db.prepare('SELECT * FROM tokens WHERE address = ?').bind(s.toLowerCase()).all()
    return (r.results ?? []).map(rowToCoin)
  }
  const like = `%${s.replace(/[%_\\]/g, '')}%`
  const r = await db
    .prepare('SELECT * FROM tokens WHERE symbol LIKE ?1 OR name LIKE ?1 ORDER BY (UPPER(symbol) = UPPER(?2)) DESC, liq_usd DESC LIMIT 20')
    .bind(like, s)
    .all()
  return (r.results ?? []).map(rowToCoin)
}

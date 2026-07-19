// Shared helper for the read APIs: query the Ponder indexer's GraphQL and map its
// exact-bigint fields back to the float-shaped rows the frontend already expects,
// so the browser-facing /api/* contract is unchanged (D1 -> Ponder swap only).
//
// The browser never talks to Ponder directly — these Pages Functions do, server
// side — so no CSP change is needed. PONDER_URL is set per environment; it falls
// back to the deployed testnet indexer.

export interface Env {
  PONDER_URL?: string
  LAUNCHPAD_ADDRESS?: string
  DB?: D1Database // still bound during the transition; unused here
}

const DEFAULT_PONDER = 'https://littlejohn-ponder.fly.dev/graphql'
const DEFAULT_LAUNCHPAD = '0xbabea7f2e54df349de3d743b9d55c33e6484cbd3' // testnet
const WAD = 1e18
const SUPPLY_WHOLE = 1e9 // total supply in whole tokens; mcap = price * supply

// Total supply in wei (1e9 whole tokens), for holder-percentage math.
export const TOTAL_SUPPLY_WEI = 1_000_000_000n * 10n ** 18n

// The bonding-curve contract holds the unsold curve supply and shows up as a
// "holder"; label it rather than counting it as a real wallet.
export const launchpadAddr = (env: Env): string =>
  (env.LAUNCHPAD_ADDRESS || DEFAULT_LAUNCHPAD).toLowerCase()

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=5' },
  })
}

// Edge-cache a public GET at the Cloudflare CDN so a read-flood hits cache, not
// origin/Ponder — the infra vector that took Noxa's board offline. Each colo
// caches independently after one miss, so origin sees ~1 req/colo/TTL instead of
// one per client. `stale-while-revalidate` lets the edge keep serving the last
// good response even while origin is slow or down (graceful degradation).
export async function edgeCached(
  request: Request,
  waitUntil: (p: Promise<unknown>) => void,
  ttl: number,
  produce: () => Promise<Response>,
): Promise<Response> {
  if (request.method !== 'GET') return produce()
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(new URL(request.url).toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await produce()
  if (res.status !== 200) return res
  const cacheable = new Response(res.clone().body, res)
  cacheable.headers.set('cache-control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 6}`)
  waitUntil(cache.put(key, cacheable.clone()))
  return cacheable
}

export async function ponderQuery<T = any>(env: Env, query: string): Promise<T> {
  // PONDER_URL may be a comma-separated list (primary, warm-standby, ...). Try
  // each in order and fail over on network / HTTP / GraphQL error, so one indexer
  // instance going down doesn't take the read API with it. A 6s per-endpoint
  // timeout stops a hung primary from stalling the whole request. Endpoints are
  // our own trusted infra from config — never user input — so failover adds no
  // new attack surface (same trust boundary as a single endpoint).
  const endpoints = (env.PONDER_URL || DEFAULT_PONDER).split(',').map((s) => s.trim()).filter(Boolean)
  const body = JSON.stringify({ query })
  let lastErr: unknown
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) throw new Error(`ponder ${res.status}`)
      const j = (await res.json()) as { data?: T; errors?: unknown }
      if (j.errors) throw new Error('ponder: ' + JSON.stringify(j.errors))
      return j.data as T
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ponder: all endpoints failed')
}

// 1e18-scaled wei string -> float (ETH per whole token, or ETH amount).
export const weiToNum = (s: string | null | undefined): number | null =>
  s == null ? null : Number(s) / WAD

// Ponder token node -> the full D1-shaped token row the frontend reads.
export function mapToken(t: any) {
  const price = weiToNum(t.lastPriceWei)
  return {
    address: t.address,
    symbol: t.symbol ?? null,
    name: t.name ?? null,
    image: t.image ?? null,
    description: t.description ?? null,
    twitter: t.twitter ?? null,
    telegram: t.telegram ?? null,
    website: t.website ?? null,
    creator: t.creator ?? null,
    created_block: t.createdBlock != null ? Number(t.createdBlock) : null,
    created_ts: t.createdAt ?? null,
    tokens_sold: t.tokensSold ?? null,
    virtual_eth: t.virtualEth ?? null,
    virtual_token: t.virtualToken ?? null,
    price,
    mcap: price == null ? null : price * SUPPLY_WHOLE,
    graduated: !!t.graduated,
    pair: t.pool ?? null,
    trade_count: t.tradeCount ?? 0,
    vol_eth: t.volumeEth != null ? Number(t.volumeEth) / WAD : 0,
    last_trade_ts: null, // not tracked on the token node; derive from trades if needed
  }
}

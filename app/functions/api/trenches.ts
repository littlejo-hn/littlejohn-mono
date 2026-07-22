// GET /api/trenches — the RH-Chain-native terminal feed. Composes GeckoTerminal's
// chain-wide pool data for the "robinhood" network into clean terminal cards, so
// we cover EVERY launch across every pad/DEX (not just our own launchpad). Wash-
// resistant trending is computed here from unique-buyer counts, not raw volume.
//
//   feed = trending | new | gainers | top   (default trending)
//   Edge-cached by _middleware (allowlisted), so GeckoTerminal is hit rarely.

import { json } from './_ponder'

const GT_BASE = 'https://api.geckoterminal.com/api/v2'
const GT = `${GT_BASE}/networks/robinhood`
const HEADERS = { 'user-agent': 'littlejohn-terminal/1', accept: 'application/json' }

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

type Card = {
  pool: string
  address: string
  symbol: string
  name: string
  image: string | null
  dex: string
  priceUsd: number
  fdvUsd: number
  liqUsd: number
  vol24: number
  vol1h: number
  chg24: number
  chg1h: number
  buys24: number
  sells24: number
  buyers24: number
  sellers24: number
  createdTs: number
  score: number
}

// GeckoTerminal pool node + included base-token map -> a terminal card.
function mapPool(p: any, toks: Record<string, any>): Card | null {
  const a = p.attributes ?? {}
  const btId = p.relationships?.base_token?.data?.id
  const bt = toks[btId] ?? {}
  const address = bt.address ?? ''
  if (!address) return null
  const created = a.pool_created_at ? Math.floor(Date.parse(a.pool_created_at) / 1000) : 0
  const tx = a.transactions?.h24 ?? {}
  const buyers24 = num(tx.buyers)
  const sellers24 = num(tx.sellers)
  const vol24 = num(a.volume_usd?.h24)
  const ageH = Math.max(0, (Date.now() / 1000 - created) / 3600)
  // Wash-resistant: reward volume backed by MANY unique buyers, and recency.
  // Raw volume alone is washable; unique-buyer count is not (few wallets can't
  // fake a broad holder base). sqrt tempers whales; /(age) surfaces momentum.
  const score = (vol24 * Math.sqrt(buyers24 + 1)) / (ageH + 3)
  return {
    pool: a.address ?? '',
    address,
    symbol: bt.symbol ?? '?',
    name: bt.name ?? bt.symbol ?? 'Unknown',
    image: bt.image_url && bt.image_url !== 'missing.png' ? bt.image_url : null,
    dex: p.relationships?.dex?.data?.id ?? '',
    priceUsd: num(a.base_token_price_usd),
    fdvUsd: num(a.fdv_usd),
    liqUsd: num(a.reserve_in_usd),
    vol24,
    vol1h: num(a.volume_usd?.h1),
    chg24: num(a.price_change_percentage?.h24),
    chg1h: num(a.price_change_percentage?.h1),
    buys24: num(tx.buys),
    sells24: num(tx.sells),
    buyers24,
    sellers24,
    createdTs: created,
    score,
  }
}

async function gtPools(path: string): Promise<{ data: any[]; toks: Record<string, any> }> {
  const res = await fetch(`${GT}/${path}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`geckoterminal ${res.status}`)
  const j = (await res.json()) as any
  const toks: Record<string, any> = {}
  for (const i of j.included ?? []) if (i.type === 'token') toks[i.id] = i.attributes
  return { data: j.data ?? [], toks }
}

// Chain-wide token search (name / symbol / address) so ANY RH token is reachable,
// not just what's on the board — GeckoTerminal's search covers every indexed pool.
async function gtSearch(q: string): Promise<{ data: any[]; toks: Record<string, any> }> {
  const res = await fetch(`${GT_BASE}/search/pools?query=${encodeURIComponent(q)}&network=robinhood&include=base_token,dex`, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`geckoterminal ${res.status}`)
  const j = (await res.json()) as any
  const toks: Record<string, any> = {}
  for (const i of j.included ?? []) if (i.type === 'token') toks[i.id] = i.attributes
  return { data: j.data ?? [], toks }
}

const FRESH_MS = 45_000 // refetch GeckoTerminal at most this often per feed
const STALE_MS = 600_000 // serve last-good up to 10 min on upstream failure

export const onRequestGet: PagesFunction = async (ctx) => {
  const { request } = ctx
  const url = new URL(request.url)
  const feed = url.searchParams.get('feed') ?? 'trending'
  const q = (url.searchParams.get('q') ?? '').trim()
  const inc = 'include=base_token,dex'
  if (feed === 'search' && !q) return json({ feed, count: 0, tokens: [] })

  // Cache-through with serve-stale: GeckoTerminal 429s from Cloudflare's shared
  // egress IPs, so we refetch at most every FRESH_MS and, if that fetch fails,
  // return the last-good copy (kept STALE_MS) so the board never goes blank.
  const cache = (caches as unknown as { default: Cache }).default
  const cacheId = feed === 'search' ? `search:${q.toLowerCase()}` : feed
  const key = new Request(`https://trenches.cache/${cacheId}`, { method: 'GET' })
  const cached = await cache.match(key)
  if (cached) {
    const at = Number(cached.headers.get('x-fetched-at') || 0)
    if (Date.now() - at < FRESH_MS) return cached
  }

  try {
    let cards: Card[]
    if (feed === 'search') {
      const { data, toks } = await gtSearch(q)
      const byTok = new Map<string, Card>()
      for (const c of data.map((p) => mapPool(p, toks)).filter((c): c is Card => !!c)) {
        const k = c.address.toLowerCase()
        const cur = byTok.get(k)
        if (!cur || c.liqUsd > cur.liqUsd) byTok.set(k, c) // deepest pool per token
      }
      cards = [...byTok.values()].sort((a, b) => b.liqUsd - a.liqUsd) // no dust filter — the user asked for it
    } else if (feed === 'new') {
      const { data, toks } = await gtPools(`new_pools?${inc}&page=1`)
      cards = data.map((p) => mapPool(p, toks)).filter((c): c is Card => !!c).sort((a, b) => b.createdTs - a.createdTs)
    } else {
      // Top-by-volume set (1 call — GeckoTerminal free tier is 30/min; the edge
      // cache absorbs load), then re-rank/filter our way.
      const { data, toks } = await gtPools(`pools?${inc}&sort=h24_volume_usd_desc&page=1`)
      let all = data.map((p) => mapPool(p, toks)).filter((c): c is Card => !!c)
      // Dedupe by token (keep the deepest pool per token).
      const byTok = new Map<string, Card>()
      for (const c of all) {
        const k = c.address.toLowerCase()
        const cur = byTok.get(k)
        if (!cur || c.liqUsd > cur.liqUsd) byTok.set(k, c)
      }
      all = [...byTok.values()].filter((c) => c.liqUsd >= 500) // drop dust
      if (feed === 'gainers') cards = all.sort((a, b) => b.chg24 - a.chg24)
      else if (feed === 'top') cards = all.sort((a, b) => b.liqUsd - a.liqUsd)
      else cards = all.sort((a, b) => b.score - a.score) // trending (wash-resistant)
    }
    const resp = json({ feed, count: cards.length, tokens: cards.slice(0, 60) })
    resp.headers.set('cache-control', `public, s-maxage=${Math.floor(STALE_MS / 1000)}`)
    resp.headers.set('x-fetched-at', String(Date.now()))
    ctx.waitUntil(cache.put(key, resp.clone()))
    return resp
  } catch (e) {
    // Upstream failed (usually a shared-IP 429) — serve the last-good copy if we
    // have one, so the terminal degrades gracefully instead of going blank.
    if (cached) return cached
    return json({ error: e instanceof Error ? e.message : String(e), tokens: [] }, 502)
  }
}

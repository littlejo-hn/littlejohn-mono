// GET /api/board — the coin board, served from the Ponder indexer.
//
// Query params:
//   sort   = mcap | new | graduating | volume   (default mcap)
//   status = all | curve | graduated            (default all)
//   limit  = 1..200                              (default 60)

import { json, ponderQuery, weiToNum, type Env } from './_ponder'
import { resolveMany } from './_meta'
import { profilesFor } from './_social'

// mcap ∝ lastPriceWei (supply is constant), so ordering by price = ordering by mcap.
const ORDER: Record<string, string> = {
  mcap: 'lastPriceWei',
  new: 'createdBlock',
  graduating: 'tokensSold',
  volume: 'volumeEth',
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') ?? 'mcap'
  const status = url.searchParams.get('status') ?? 'all'

  let limit = parseInt(url.searchParams.get('limit') ?? '60', 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 60
  limit = Math.min(limit, 200)

  const orderField = ORDER[sort] ?? ORDER.mcap
  const where =
    status === 'curve' ? 'where:{graduated:false}, ' : status === 'graduated' ? 'where:{graduated:true}, ' : ''

  const query = `{ tokens(${where}orderBy:"${orderField}", orderDirection:"desc", limit:${limit}){
    items{ address symbol name image metadataURI lastPriceWei tokensSold createdAt volumeEth tradeCount creator graduated }
  } }`

  try {
    const data = await ponderQuery<{ tokens: { items: any[] } }>(env, query)
    const items = data.tokens?.items ?? []
    // Resolve media at the read layer (edge-cached); only the visible page.
    const metas = await resolveMany(items.map((t) => (t.image ? null : t.metadataURI)))
    const tokens = items.map((t, i) => {
      const price = weiToNum(t.lastPriceWei)
      return {
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        image: t.image ?? metas[i].image,
        price,
        mcap: price == null ? null : price * 1e9,
        graduated: !!t.graduated,
        tokens_sold: t.tokensSold,
        created_ts: t.createdAt,
        vol_eth: t.volumeEth != null ? Number(t.volumeEth) / 1e18 : 0,
        trade_count: t.tradeCount,
        creator: t.creator,
        creator_name: null as string | null,
        creator_avatar: null as string | null,
        spark: null as number[] | null,
        price_change_24h: null as number | null,
      }
    })
    // Attach creator username/avatar (one batched profile lookup for the page).
    // Guarded: profiles are enrichment, so a D1 hiccup (or an unmigrated table)
    // degrades to coins-without-names instead of 500ing the whole board.
    if (env.DB) {
      try {
        const profs = await profilesFor(env.DB, tokens.map((t) => t.creator).filter(Boolean))
        for (const t of tokens) {
          const p = profs[String(t.creator).toLowerCase()]
          if (p) { t.creator_name = p.username; t.creator_avatar = p.avatar }
        }
      } catch { /* enrichment only; board still returns without creator profiles */ }
    }

    // 24h momentum: sparkline (hourly closes) + % change, from the pre-aggregated
    // 1h candles in ONE batched query. Ponder caps a query at 1000 rows, so we
    // sparkline the top SPARK_LIMIT tokens of the page (≤~25 buckets each ≤ 1000);
    // the rest stay null and the card just omits the sparkline. For full-board
    // coverage without the cap, denormalize spark/price_change onto the token node
    // in the indexer (update on each 1h candle close) and read them off `t` here.
    const SPARK_LIMIT = 40
    const sparkAddrs = tokens.slice(0, SPARK_LIMIT).map((t) => String(t.address).toLowerCase())
    if (sparkAddrs.length) {
      const cutoff = Math.floor(Date.now() / 1000) - 86400
      const inList = sparkAddrs.map((a) => `"${a}"`).join(',')
      const cq = `{ candles(where:{token_in:[${inList}], interval:"1h", bucketStart_gt:${cutoff}}, orderBy:"bucketStart", orderDirection:"desc", limit:1000){
        items{ token close }
      } }`
      try {
        const cd = await ponderQuery<{ candles: { items: any[] } }>(env, cq)
        const byTok = new Map<string, number[]>()
        for (const c of cd.candles?.items ?? []) {
          const v = weiToNum(c.close)
          if (v == null) continue
          const k = String(c.token).toLowerCase()
          const arr = byTok.get(k)
          if (arr) arr.push(v); else byTok.set(k, [v])
        }
        for (const t of tokens) {
          const s = byTok.get(String(t.address).toLowerCase())
          if (s && s.length >= 2) {
            s.reverse() // fetched desc so a 1000-row cap drops the OLDEST bucket, not the latest price; flip to chronological
            t.spark = s
            const first = s[0], last = s[s.length - 1]
            t.price_change_24h = first > 0 ? ((last - first) / first) * 100 : null
          }
        }
      } catch { /* momentum is best-effort; the board still returns without it */ }
    }

    return json({ tokens })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

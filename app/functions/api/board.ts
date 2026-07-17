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
      }
    })
    // Attach creator username/avatar (one batched profile lookup for the page).
    if (env.DB) {
      const profs = await profilesFor(env.DB, tokens.map((t) => t.creator).filter(Boolean))
      for (const t of tokens) {
        const p = profs[String(t.creator).toLowerCase()]
        if (p) { t.creator_name = p.username; t.creator_avatar = p.avatar }
      }
    }
    return json({ tokens })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

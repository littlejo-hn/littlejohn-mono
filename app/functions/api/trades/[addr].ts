// GET /api/trades/:addr?limit=50 — recent trades for a token, newest first,
// served from the Ponder indexer.

import { json, ponderQuery, weiToNum, type Env } from '../_ponder'
import { profilesFor } from '../_social'

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const addr = String(params.addr ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: 'invalid address' }, 400)

  const url = new URL(request.url)
  let limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 50
  limit = Math.min(limit, 2000)

  const query = `{ trades(where:{token:"${addr}"}, orderBy:"block", orderDirection:"desc", limit:${limit}){
    items{ id token trader isBuy ethAmount tokenAmount priceWei timestamp block source }
  } }`

  try {
    const data = await ponderQuery<{ trades: { items: any[] } }>(env, query)
    const trades = (data.trades?.items ?? []).map((t) => ({
      id: t.id,
      token: t.token,
      trader: t.trader,
      is_buy: !!t.isBuy,
      eth_amount: t.ethAmount,
      token_amount: t.tokenAmount,
      price: weiToNum(t.priceWei),
      block: Number(t.block),
      // trade id is `${block}-${logIndex}`; the frontend expects a numeric log_index.
      log_index: Number(String(t.id).split('-')[1] ?? 0),
      ts: t.timestamp,
      // D1 used 'curve' | 'pool'; Ponder uses 'curve' | 'dex' — keep the old contract.
      phase: t.source === 'dex' ? 'pool' : t.source,
      trader_name: null as string | null,
      trader_avatar: null as string | null,
    }))
    if (env.DB) {
      const profs = await profilesFor(env.DB, trades.map((t) => t.trader).filter(Boolean))
      for (const t of trades) {
        const p = profs[String(t.trader).toLowerCase()]
        if (p) { t.trader_name = p.username; t.trader_avatar = p.avatar }
      }
    }
    return json({ trades })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

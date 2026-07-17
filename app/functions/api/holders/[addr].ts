// GET /api/holders/:addr?limit=50 — top holders for a token, with supply %.
// System addresses (bonding curve, liquidity pool) are labeled, not counted as
// real holders. Powered by the Ponder indexer's holder balances.

import { json, ponderQuery, launchpadAddr, TOTAL_SUPPLY_WEI, type Env } from '../_ponder'

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const addr = String(params.addr ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: 'invalid address' }, 400)

  const url = new URL(request.url)
  let limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 50
  limit = Math.min(limit, 200)

  const launchpad = launchpadAddr(env)

  try {
    // Creator + pool address for labeling; top holders + total count.
    const meta = await ponderQuery<{ token: { creator: string; pool: string | null } | null }>(
      env,
      `{ token(address:"${addr}"){ creator pool } }`,
    )
    const creator = meta.token?.creator?.toLowerCase() ?? null
    const pool = meta.token?.pool?.toLowerCase() ?? null

    const data = await ponderQuery<{ holders: { items: any[]; totalCount: number } }>(
      env,
      `{ holders(where:{token:"${addr}", balance_gt:"0"}, orderBy:"balance", orderDirection:"desc", limit:${limit}){
        items{ address balance } totalCount
      } }`,
    )
    const items = data.holders?.items ?? []

    const labelOf = (a: string): 'curve' | 'pool' | 'dev' | null =>
      a === launchpad ? 'curve' : a === pool ? 'pool' : a === creator ? 'dev' : null

    const holders = items.map((h) => {
      const a = h.address.toLowerCase()
      // pct of total supply, in basis points then /100 to keep precision.
      const pct = Number((BigInt(h.balance) * 1000000n) / TOTAL_SUPPLY_WEI) / 10000
      return { address: a, balance: h.balance, pct, label: labelOf(a) }
    })

    // Real holder count excludes the curve + pool system addresses.
    const systemPresent = holders.filter((h) => h.label === 'curve' || h.label === 'pool').length
    const count = Math.max(0, (data.holders?.totalCount ?? 0) - systemPresent)
    const dev = holders.find((h) => h.label === 'dev')

    return json({ count, devPct: dev?.pct ?? 0, holders })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

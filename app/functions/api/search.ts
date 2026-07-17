// GET /api/search?q=... — search ALL indexed coins by ticker, name, or address,
// plus coins by creator wallet. Case-insensitive (via the lowercased columns).
// (Username search arrives with Track B profiles.)

import { json, ponderQuery, weiToNum, type Env } from './_ponder'

// No metadata resolution here — search must feel instant; result rows fall back to
// a letter avatar. Media resolves (and caches) on the board / coin page.
const FIELDS = 'address symbol name image lastPriceWei tokensSold volumeEth graduated creator'

function mapCoin(t: any) {
  const price = weiToNum(t.lastPriceWei)
  return {
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    image: t.image ?? null,
    mcap: price == null ? null : price * 1e9,
    graduated: !!t.graduated,
    tokens_sold: t.tokensSold,
    vol_eth: t.volumeEth != null ? Number(t.volumeEth) / 1e18 : 0,
    creator: t.creator,
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (!q) return json({ coins: [] })

  try {
    let items: any[] = []
    if (/^0x[0-9a-f]{40}$/i.test(q)) {
      // An address can be a coin OR a creator wallet — return both.
      const a = q.toLowerCase()
      const d = await ponderQuery<{ token: any | null; byCreator: { items: any[] } }>(
        env,
        `{ token(address:"${a}"){ ${FIELDS} }
           byCreator: tokens(where:{creator:"${a}"}, orderBy:"volumeEth", orderDirection:"desc", limit:20){ items{ ${FIELDS} } } }`,
      )
      if (d.token) items.push(d.token)
      for (const t of d.byCreator?.items ?? []) if (!items.some((x) => x.address === t.address)) items.push(t)
    } else {
      const s = q.toLowerCase().replace(/[\\"]/g, '').slice(0, 64)
      const d = await ponderQuery<{ tokens: { items: any[] } }>(
        env,
        `{ tokens(where:{OR:[{symbolLower_contains:"${s}"},{nameLower_contains:"${s}"}]}, orderBy:"volumeEth", orderDirection:"desc", limit:15){ items{ ${FIELDS} } } }`,
      )
      items = d.tokens?.items ?? []
    }

    return json({ coins: items.map(mapCoin) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

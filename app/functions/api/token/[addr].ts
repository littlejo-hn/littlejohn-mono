// GET /api/token/:addr — one token, served from the Ponder indexer.

import { json, ponderQuery, mapToken, type Env } from '../_ponder'
import { resolveMeta } from '../_meta'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const addr = String(params.addr ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: 'invalid address' }, 400)

  const query = `{ token(address:"${addr}"){
    address name symbol metadataURI image description twitter telegram website
    creator createdAt createdBlock virtualEth virtualToken tokensSold lastPriceWei
    graduated migrated pool tradeCount volumeEth
  } }`

  try {
    const data = await ponderQuery<{ token: any | null }>(env, query)
    if (!data.token) return json({ error: 'not found' }, 404)
    const row = mapToken(data.token)
    if (!row.image && data.token.metadataURI) {
      const m = await resolveMeta(data.token.metadataURI)
      row.image = m.image
      row.description = row.description ?? m.description
      row.twitter = row.twitter ?? m.twitter
      row.telegram = row.telegram ?? m.telegram
      row.website = row.website ?? m.website
    }
    return json(row)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

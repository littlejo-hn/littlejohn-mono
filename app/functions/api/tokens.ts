// GET /api/tokens?q=… — chain-wide token search from OUR D1 index (ticker / name /
// address). Reliable and instant: no GeckoTerminal rate-limit, because the firehose +
// lookups already resolved and stored every token they saw. Addresses not yet indexed
// fall back to the on-chain /api/lookup (client-side).
import { json } from './_ponder'
import { searchTokens } from './_index'

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async (ctx) => {
  const q = (new URL(ctx.request.url).searchParams.get('q') ?? '').trim()
  if (!q || !ctx.env?.DB) return json({ tokens: [] })
  try {
    return json({ tokens: await searchTokens(ctx.env.DB, q) })
  } catch (e) {
    return json({ tokens: [], error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

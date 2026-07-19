// Edge-cache public read endpoints so a read-flood hits the Cloudflare colo
// cache instead of origin/Ponder — the infra vector that took Noxa's board
// offline. Only the explicit allowlist below is cached; auth, mutations, media
// and personalized routes always pass straight through, and non-GET is never
// cached. `edgeCached` also serves stale-while-revalidate, so the edge keeps
// answering with the last good response even while origin is slow or down.
import { edgeCached } from './_ponder'

// first path segment after /api/  ->  edge TTL (seconds)
const TTL: Record<string, number> = {
  board: 8,
  token: 8,
  trades: 4,
  candles: 12,
  holders: 20,
  search: 8,
}

export const onRequest: PagesFunction = async (ctx) => {
  const { request } = ctx
  if (request.method !== 'GET') return ctx.next()
  const seg = new URL(request.url).pathname.replace(/^\/api\//, '').split('/')[0]
  const ttl = TTL[seg]
  if (!ttl) return ctx.next()
  return edgeCached(request, ctx.waitUntil.bind(ctx), ttl, () => ctx.next())
}

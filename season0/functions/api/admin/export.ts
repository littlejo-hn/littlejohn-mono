/// <reference types="@cloudflare/workers-types" />
import { json, categoryPoints, SEASON_WEIGHTS, type Env } from '../../_lib'

// Emits the season snapshot in heists-scorer/score.js format (self-describing weights).
// Operator runs: score.js <this> allocations.json -> generate.js -> root, then openSeason+freeze.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401)

  const all = await categoryPoints(env)
  const cat = (key: 'mindshare' | 'testnet' | 'referrals' | 'poi') =>
    [...all.entries()].filter(([, c]) => c[key] > 0).map(([address, c]) => ({ address, score: c[key] }))

  const snapshot = {
    season: 0,
    budgetTokens: String(env.SEASON_BUDGET || '20000000'),
    weights: SEASON_WEIGHTS,
    mindshare: cat('mindshare'),
    testnet: cat('testnet'),
    referrals: cat('referrals'),
    poi: cat('poi'),
  }
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="season0-snapshot.json"' },
  })
}

/// <reference types="@cloudflare/workers-types" />
import { json, type Env } from '../../_lib'

// Ingests testnet / proof-of-interest points, computed off-chain by the sync job.
// Body: { rows: [{ wallet, testnet?, poi? }] }. Upserts quest_points.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401)
  const body = await request.json<{ rows: { wallet: string; testnet?: number; poi?: number }[] }>().catch(() => null)
  if (!body || !Array.isArray(body.rows)) return json({ error: 'bad request' }, 400)

  const stmt = env.DB.prepare(
    `INSERT INTO quest_points (wallet, testnet, poi, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(wallet) DO UPDATE SET testnet = excluded.testnet, poi = excluded.poi, updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  const batch = body.rows
    .filter((r) => /^0x[0-9a-fA-F]{40}$/.test(r.wallet))
    .map((r) => stmt.bind(r.wallet.toLowerCase(), Math.max(0, Math.floor(r.testnet || 0)), Math.max(0, Math.floor(r.poi || 0)), now))
  if (batch.length) await env.DB.batch(batch)
  return json({ ok: true, upserted: batch.length })
}

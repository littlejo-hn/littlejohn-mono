/// <reference types="@cloudflare/workers-types" />
import { json, categoryPoints, blendedScore, type Env } from '../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const wallet = (new URL(request.url).searchParams.get('wallet') || '').toLowerCase()
  if (!wallet) return json({ error: 'wallet required' }, 400)

  const p = await env.DB.prepare('SELECT code, referred_by, x_handle, joined_at FROM participants WHERE wallet = ?').bind(wallet).first<{ code: string; referred_by: string | null; x_handle: string | null; joined_at: number }>()
  if (!p) return json({ joined: false })

  const all = await categoryPoints(env)
  const blend = blendedScore(all)
  const points = all.get(wallet) ?? { mindshare: 0, testnet: 0, referrals: 0, poi: 0 }
  const total = blend.get(wallet) ?? 0

  // rank = 1 + number of wallets with a strictly higher blended score
  let rank = 1
  for (const v of blend.values()) if (v > total) rank++

  const subs = await env.DB.prepare('SELECT id, url, status, score, created_at FROM submissions WHERE wallet = ? ORDER BY created_at DESC').bind(wallet).all()

  return json({
    joined: true,
    code: p.code,
    xHandle: p.x_handle,
    points,
    total,
    rank,
    participants: blend.size,
    submissions: subs.results,
  })
}

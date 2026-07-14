/// <reference types="@cloudflare/workers-types" />
import { json, categoryPoints, blendedScore, type Env } from '../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const all = await categoryPoints(env)
  const blend = blendedScore(all)

  const handles = await env.DB.prepare('SELECT wallet, x_handle FROM participants').all<{ wallet: string; x_handle: string | null }>()
  const handleOf = new Map(handles.results.map((r) => [r.wallet, r.x_handle]))

  const rows = [...blend.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([wallet, total], i) => ({
      rank: i + 1,
      wallet: `${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
      xHandle: handleOf.get(wallet) ?? null,
      total,
      ...(all.get(wallet) ?? { mindshare: 0, testnet: 0, referrals: 0, poi: 0 }),
    }))

  return json({ participants: blend.size, leaderboard: rows })
}

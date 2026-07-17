// GET /api/profile/:addr — public profile (username / avatar / bio) for a wallet.

import { json, type Env } from '../_social'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const addr = String(params.addr ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: 'invalid address' }, 400)
  try {
    const row = await env.DB.prepare('SELECT username, avatar_url, bio FROM profile WHERE address = ?1')
      .bind(addr)
      .first<{ username: string | null; avatar_url: string | null; bio: string | null }>()
    return json({ address: addr, username: row?.username ?? null, avatar: row?.avatar_url ?? null, bio: row?.bio ?? null })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

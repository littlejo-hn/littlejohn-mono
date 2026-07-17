// GET  /api/comments/:token — thread for a coin, newest first (with poster profile)
// POST /api/comments/:token — add a comment (requires a Bearer session)

import { json, verifySession, bearer, profilesFor, type Env } from '../_social'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const token = String(params.token ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(token)) return json({ error: 'invalid address' }, 400)
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, author, body, created_ts FROM comment WHERE token = ?1 ORDER BY id DESC LIMIT 100',
    )
      .bind(token)
      .all<{ id: number; author: string; body: string; created_ts: number }>()
    const rows = results ?? []
    const profiles = await profilesFor(env.DB, rows.map((r) => r.author))
    const comments = rows.map((r) => ({
      id: r.id,
      author: r.author,
      body: r.body,
      ts: r.created_ts,
      username: profiles[r.author]?.username ?? null,
      avatar: profiles[r.author]?.avatar ?? null,
    }))
    return json({ comments })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  const token = String(params.token ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(token)) return json({ error: 'invalid address' }, 400)
  const author = await verifySession(env, bearer(request))
  if (!author) return json({ error: 'sign in to comment' }, 401)
  try {
    const { body } = (await request.json()) as { body?: string }
    const text = String(body ?? '').trim().slice(0, 500)
    if (!text) return json({ error: 'empty comment' }, 400)
    await env.DB.prepare('INSERT INTO comment (token, author, body, created_ts) VALUES (?1,?2,?3,?4)')
      .bind(token, author, text, Math.floor(Date.now() / 1000))
      .run()
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

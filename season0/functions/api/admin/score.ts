/// <reference types="@cloudflare/workers-types" />
import { json, type Env } from '../../_lib'

const authed = (request: Request, env: Env) => !!env.ADMIN_KEY && request.headers.get('x-admin-key') === env.ADMIN_KEY

// Council/team scores a mindshare submission. status: approved|rejected; score = mindshare points.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401)
  const body = await request.json<{ id: number; status: 'approved' | 'rejected'; score?: number }>().catch(() => null)
  if (!body || !body.id || !['approved', 'rejected'].includes(body.status)) return json({ error: 'bad request' }, 400)

  const score = body.status === 'approved' ? Math.max(0, Math.floor(Number(body.score) || 0)) : 0
  const res = await env.DB.prepare('UPDATE submissions SET status = ?, score = ? WHERE id = ?')
    .bind(body.status, score, body.id)
    .run()
  return json({ ok: true, updated: res.meta.changes })
}

// list pending submissions for review
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401)
  const status = new URL(request.url).searchParams.get('status') || 'pending'
  const rows = await env.DB.prepare('SELECT id, wallet, url, status, score, created_at FROM submissions WHERE status = ? ORDER BY created_at').bind(status).all()
  return json({ submissions: rows.results })
}

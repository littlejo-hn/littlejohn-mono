/// <reference types="@cloudflare/workers-types" />
import { json, verifySig, type Env } from '../_lib'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json<{ address: string; signature: string; ts: string; url: string }>().catch(() => null)
  if (!body) return json({ error: 'bad request' }, 400)

  const wallet = await verifySig(body.address, 'submit', body.ts, body.signature)
  if (!wallet) return json({ error: 'signature invalid or expired' }, 401)

  const p = await env.DB.prepare('SELECT 1 FROM participants WHERE wallet = ?').bind(wallet).first()
  if (!p) return json({ error: 'join the Heist first' }, 403)

  const url = (body.url || '').trim()
  if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return json({ error: 'link must be an X (twitter) post' }, 400)

  // one pending submission per url per wallet
  const dupe = await env.DB.prepare('SELECT 1 FROM submissions WHERE wallet = ? AND url = ?').bind(wallet, url).first()
  if (dupe) return json({ error: 'already submitted' }, 409)

  // light rate limit: max 20 submissions/wallet
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE wallet = ?').bind(wallet).first<{ n: number }>()
  if ((count?.n ?? 0) >= 20) return json({ error: 'submission limit reached' }, 429)

  await env.DB.prepare('INSERT INTO submissions (wallet, url, status, score, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(wallet, url, 'pending', Date.now())
    .run()

  return json({ ok: true, status: 'pending' })
}

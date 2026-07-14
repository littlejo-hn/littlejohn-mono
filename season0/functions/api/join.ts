/// <reference types="@cloudflare/workers-types" />
import { json, verifySig, genCode, type Env } from '../_lib'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json<{ address: string; signature: string; ts: string; referralCode?: string; xHandle?: string }>().catch(() => null)
  if (!body) return json({ error: 'bad request' }, 400)

  const wallet = await verifySig(body.address, 'join', body.ts, body.signature)
  if (!wallet) return json({ error: 'signature invalid or expired' }, 401)

  const existing = await env.DB.prepare('SELECT code FROM participants WHERE wallet = ?').bind(wallet).first<{ code: string }>()
  if (existing) return json({ code: existing.code, joined: true })

  // resolve referrer (must exist, not self)
  let referredBy: string | null = null
  if (body.referralCode) {
    const ref = await env.DB.prepare('SELECT wallet FROM participants WHERE code = ?').bind(body.referralCode.toUpperCase()).first<{ wallet: string }>()
    if (ref && ref.wallet !== wallet) referredBy = body.referralCode.toUpperCase()
  }

  // generate a unique code
  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const clash = await env.DB.prepare('SELECT 1 FROM participants WHERE code = ?').bind(code).first()
    if (!clash) break
    code = genCode()
  }

  const xHandle = (body.xHandle || '').replace(/^@/, '').slice(0, 30) || null
  await env.DB.prepare('INSERT INTO participants (wallet, code, referred_by, x_handle, joined_at) VALUES (?, ?, ?, ?, ?)')
    .bind(wallet, code, referredBy, xHandle, Date.now())
    .run()

  return json({ code, joined: true })
}

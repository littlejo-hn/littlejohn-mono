// POST /api/upload — avatar upload for the signed-in wallet. Body is the raw image
// bytes with an image/* content-type. Stores in R2 (MEDIA binding) and points the
// wallet's profile at it. Served back via /api/media/<key>.

import { json, verifySession, bearer, type Env } from './_social'

const MAX_BYTES = 2 * 1024 * 1024 // 2MB

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const addr = await verifySession(env, bearer(request))
  if (!addr) return json({ error: 'sign in required' }, 401)
  if (!env.MEDIA) return json({ error: 'media storage not configured' }, 503)

  const ct = request.headers.get('content-type') ?? ''
  if (!ct.startsWith('image/')) return json({ error: 'image required' }, 400)

  const buf = await request.arrayBuffer()
  if (buf.byteLength === 0) return json({ error: 'empty file' }, 400)
  if (buf.byteLength > MAX_BYTES) return json({ error: 'max 2MB' }, 413)

  const ext = (ct.split('/')[1] ?? 'png').split('+')[0].replace(/[^a-z0-9]/gi, '') || 'png'
  const key = `avatars/${addr}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  try {
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct } })
    const url = `/api/media/${key}`
    await env.DB.prepare(
      `INSERT INTO profile (address, avatar_url, updated_ts) VALUES (?1,?2,?3)
       ON CONFLICT(address) DO UPDATE SET avatar_url = excluded.avatar_url, updated_ts = excluded.updated_ts`,
    )
      .bind(addr, url, Math.floor(Date.now() / 1000))
      .run()
    return json({ ok: true, avatar: url })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

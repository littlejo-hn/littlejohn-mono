// GET /api/media/<key> — serve an object from the R2 MEDIA bucket (avatars, etc).
// Same-origin, so the app's `img-src 'self'` CSP already allows it.

import type { Env } from '../_social'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '')
  if (!key || !env.MEDIA) return new Response('not found', { status: 404 })
  const obj = await env.MEDIA.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}

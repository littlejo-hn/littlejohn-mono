// POST /api/profile — update the signed-in wallet's own profile (username, bio).
// Avatars are added once R2 is enabled.

import { json, verifySession, bearer, type Env } from './_social'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const addr = await verifySession(env, bearer(request))
  if (!addr) return json({ error: 'sign in required' }, 401)
  try {
    const { username, bio } = (await request.json()) as { username?: string | null; bio?: string | null }

    let uname = username == null ? null : String(username).trim()
    if (uname === '') uname = null
    if (uname) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
        return json({ error: 'username must be 3-20 letters, numbers, or _' }, 400)
      }
      const taken = await env.DB.prepare('SELECT address FROM profile WHERE username = ?1 AND address <> ?2')
        .bind(uname, addr)
        .first()
      if (taken) return json({ error: 'username taken' }, 409)
    }
    const b = bio == null ? null : String(bio).slice(0, 160)

    await env.DB.prepare(
      `INSERT INTO profile (address, username, bio, updated_ts) VALUES (?1,?2,?3,?4)
       ON CONFLICT(address) DO UPDATE SET username = excluded.username, bio = excluded.bio, updated_ts = excluded.updated_ts`,
    )
      .bind(addr, uname, b, Math.floor(Date.now() / 1000))
      .run()
    return json({ ok: true, address: addr, username: uname, bio: b })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

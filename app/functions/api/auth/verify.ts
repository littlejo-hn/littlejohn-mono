// POST /api/auth/verify — verify a wallet sign-in message + signature, issue a
// session token the client sends as a Bearer for writes (comments, profile).

import { json, verifySignIn, issueSession, type Env } from '../_social'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { address, message, signature } = (await request.json()) as {
      address?: string
      message?: string
      signature?: `0x${string}`
    }
    if (!address || !message || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return json({ error: 'bad request' }, 400)
    }
    if (!(await verifySignIn(address, message, signature))) return json({ error: 'invalid signature' }, 401)
    return json({ token: await issueSession(env, address), address: address.toLowerCase() })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

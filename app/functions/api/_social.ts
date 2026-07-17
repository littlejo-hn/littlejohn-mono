// Track B social helpers: wallet sign-in (SIWE-lite) + stateless HMAC session
// tokens, shared by the auth / comments / profile endpoints.

import { verifyMessage } from 'viem'

export interface Env {
  DB: D1Database
  SESSION_SECRET?: string
  MEDIA?: R2Bucket // avatar/media storage (bound via the Pages dashboard)
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const b = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
  return b
}
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return b64url(new Uint8Array(sig))
}

// session = base64url({a:address, e:expiry}).hmac
export async function issueSession(env: Env, address: string, ttlSec = 7 * 86400): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ a: address.toLowerCase(), e: Math.floor(Date.now() / 1000) + ttlSec })))
  return payload + '.' + (await hmac(env.SESSION_SECRET ?? 'dev-secret', payload))
}
export async function verifySession(env: Env, token: string | null): Promise<string | null> {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  if ((await hmac(env.SESSION_SECRET ?? 'dev-secret', payload)) !== sig) return null
  try {
    const { a, e } = JSON.parse(new TextDecoder().decode(fromB64url(payload)))
    return a && e && e >= Math.floor(Date.now() / 1000) ? a : null
  } catch {
    return null
  }
}

export function bearer(request: Request): string | null {
  const h = request.headers.get('authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Verify a wallet sign-in: signature recovers to `address`, message is ours and
// freshly issued (5-min window). Stateless (no server nonce store) — fine for a
// comments/profile layer; a replay only re-authenticates the same wallet.
export async function verifySignIn(address: string, message: string, signature: `0x${string}`): Promise<boolean> {
  const m = /Issued At: (.+)$/m.exec(message)
  const iat = m ? Date.parse(m[1]) : NaN
  if (!iat || Math.abs(Date.now() - iat) > 5 * 60 * 1000) return false
  if (!message.includes('littlejohn') || !message.toLowerCase().includes(address.toLowerCase())) return false
  try {
    return await verifyMessage({ address: address as `0x${string}`, message, signature })
  } catch {
    return false
  }
}

// username/avatar for a batch of addresses.
export async function profilesFor(db: D1Database, addresses: string[]): Promise<Record<string, { username: string | null; avatar: string | null }>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))]
  if (!uniq.length) return {}
  const ph = uniq.map((_, i) => `?${i + 1}`).join(',')
  const { results } = await db
    .prepare(`SELECT address, username, avatar_url FROM profile WHERE address IN (${ph})`)
    .bind(...uniq)
    .all<{ address: string; username: string | null; avatar_url: string | null }>()
  const map: Record<string, { username: string | null; avatar: string | null }> = {}
  for (const r of results ?? []) map[r.address] = { username: r.username, avatar: r.avatar_url }
  return map
}

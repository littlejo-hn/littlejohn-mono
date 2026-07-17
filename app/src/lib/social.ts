import type { WalletClient, Address } from 'viem'

export type Comment = {
  id: number
  author: string
  body: string
  ts: number
  username: string | null
  avatar: string | null
}

const KEY = 'lj_session'

export function getSession(): { token: string; address: string } | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Wallet sign-in: sign a fresh message, exchange it for a session token. */
export async function signIn(walletClient: WalletClient, address: Address): Promise<{ token: string; address: string }> {
  const nonce = Math.random().toString(36).slice(2, 12)
  const issuedAt = new Date().toISOString()
  const message = `littlejohn wants you to sign in.\n\nAddress: ${address}\nNonce: ${nonce}\nIssued At: ${issuedAt}`
  const signature = await walletClient.signMessage({ account: address, message })
  const r = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, message, signature }),
  })
  if (!r.ok) throw new Error('Sign-in failed')
  const data = (await r.json()) as { token: string; address: string }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
  return data
}

export type Profile = { address: string; username: string | null; avatar: string | null; bio: string | null }

export async function getProfile(addr: string): Promise<Profile | null> {
  try {
    const r = await fetch(`/api/profile/${addr}`)
    return r.ok ? ((await r.json()) as Profile) : null
  } catch {
    return null
  }
}

export async function saveProfile(p: { username?: string | null; bio?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const s = getSession()
  if (!s) return { ok: false, error: 'not signed in' }
  const r = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
    body: JSON.stringify(p),
  })
  if (r.ok) return { ok: true }
  if (r.status === 401) clearSession()
  const d = (await r.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: d.error ?? 'failed' }
}

export async function uploadAvatar(file: File): Promise<{ ok: boolean; avatar?: string; error?: string }> {
  const s = getSession()
  if (!s) return { ok: false, error: 'not signed in' }
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'content-type': file.type || 'image/png', authorization: `Bearer ${s.token}` },
    body: file,
  })
  if (r.ok) return { ok: true, avatar: ((await r.json()) as { avatar: string }).avatar }
  if (r.status === 401) clearSession()
  const d = (await r.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: d.error ?? 'upload failed' }
}

export async function fetchComments(token: string): Promise<Comment[]> {
  try {
    const r = await fetch(`/api/comments/${token}`)
    if (!r.ok) return []
    return ((await r.json()).comments ?? []) as Comment[]
  } catch {
    return []
  }
}

export async function postComment(token: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const s = getSession()
  if (!s) return { ok: false, error: 'not signed in' }
  const r = await fetch(`/api/comments/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ body }),
  })
  if (r.ok) return { ok: true }
  if (r.status === 401) clearSession()
  const d = (await r.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: d.error ?? 'failed' }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json()
  if (!r.ok) throw new Error((data as { error?: string }).error || `error ${r.status}`)
  return data as T
}
async function get<T>(path: string): Promise<T> {
  const r = await fetch(path)
  const data = await r.json()
  if (!r.ok) throw new Error((data as { error?: string }).error || `error ${r.status}`)
  return data as T
}

export type CatPoints = { mindshare: number; testnet: number; referrals: number; poi: number }
export type Me = {
  joined: boolean
  code?: string
  xHandle?: string | null
  points?: CatPoints
  total?: number
  rank?: number
  participants?: number
  submissions?: { id: number; url: string; status: string; score: number }[]
}
export type LeaderRow = { rank: number; wallet: string; xHandle: string | null; total: number } & CatPoints

export const apiJoin = (address: string, signature: string, ts: string, referralCode?: string, xHandle?: string) =>
  post<{ code: string; joined: boolean }>('/api/join', { address, signature, ts, referralCode, xHandle })
export const apiMe = (wallet: string) => get<Me>(`/api/me?wallet=${wallet}`)
export const apiLeaderboard = () => get<{ participants: number; leaderboard: LeaderRow[] }>('/api/leaderboard')
export const apiSubmit = (address: string, signature: string, ts: string, url: string) =>
  post<{ ok: boolean; status: string }>('/api/submit', { address, signature, ts, url })

/// <reference types="@cloudflare/workers-types" />
import { verifyMessage, isAddress, getAddress } from 'viem'

export interface Env {
  DB: D1Database
  ADMIN_KEY: string
  SEASON_BUDGET: string // whole JOHN for Season 0 (e.g. "20000000")
}

export const SEASON_WEIGHTS = { mindshare: 0.4, testnet: 0.3, referrals: 0.2, poi: 0.1 }
export const REFERRAL_CAP = 25 // max referral credits per wallet (anti-sybil)

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

// The exact message the frontend asks the wallet to sign. Includes the address and a
// timestamp so a signature can't be replayed for a different wallet or reused for long.
export function actionMessage(address: string, action: string, ts: string): string {
  return `LittleJohn Heist Season 0\nWallet: ${address}\nAction: ${action}\nTime: ${ts}`
}

export async function verifySig(address: string, action: string, ts: string, signature: string): Promise<`0x${string}` | null> {
  if (!isAddress(address)) return null
  const t = Date.parse(ts)
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) return null // 10-min window
  try {
    const a = getAddress(address)
    const ok = await verifyMessage({ address: a, message: actionMessage(a, action, ts), signature: signature as `0x${string}` })
    return ok ? (a.toLowerCase() as `0x${string}`) : null
  } catch {
    return null
  }
}

export function genCode(): string {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return [...b].map((x) => (x % 36).toString(36)).join('').toUpperCase()
}

export type CatPoints = { mindshare: number; testnet: number; referrals: number; poi: number }

/** Compute each wallet's raw category points from the DB. */
export async function categoryPoints(env: Env): Promise<Map<string, CatPoints>> {
  const out = new Map<string, CatPoints>()
  const get = (w: string) => {
    let c = out.get(w)
    if (!c) { c = { mindshare: 0, testnet: 0, referrals: 0, poi: 0 }; out.set(w, c) }
    return c
  }

  const subs = await env.DB.prepare(
    "SELECT wallet, SUM(score) AS s FROM submissions WHERE status='approved' GROUP BY wallet",
  ).all<{ wallet: string; s: number }>()
  for (const r of subs.results) get(r.wallet).mindshare = r.s || 0

  const quests = await env.DB.prepare('SELECT wallet, testnet, poi FROM quest_points').all<{ wallet: string; testnet: number; poi: number }>()
  for (const r of quests.results) { const c = get(r.wallet); c.testnet = r.testnet || 0; c.poi = r.poi || 0 }

  // referrals: credit a referrer when a wallet they referred has real activity (mindshare or testnet)
  const parts = await env.DB.prepare('SELECT wallet, code, referred_by FROM participants').all<{ wallet: string; code: string; referred_by: string | null }>()
  const codeToWallet = new Map<string, string>()
  for (const p of parts.results) codeToWallet.set(p.code, p.wallet)
  for (const p of parts.results) {
    if (!p.referred_by) continue
    const referrer = codeToWallet.get(p.referred_by)
    if (!referrer) continue
    const c = get(p.wallet)
    const active = c.mindshare > 0 || c.testnet > 0
    if (active) {
      const rc = get(referrer)
      rc.referrals = Math.min(REFERRAL_CAP, rc.referrals + 1)
    }
  }
  return out
}

/** Weighted-blend total for leaderboard display (0..1 share of the pool, ×1e6 for readability). */
export function blendedScore(all: Map<string, CatPoints>): Map<string, number> {
  const cats = ['mindshare', 'testnet', 'referrals', 'poi'] as const
  const totals: Record<string, number> = { mindshare: 0, testnet: 0, referrals: 0, poi: 0 }
  for (const c of all.values()) for (const k of cats) totals[k] += c[k]
  const activeWeight = cats.reduce((s, k) => s + (totals[k] > 0 ? SEASON_WEIGHTS[k] : 0), 0) || 1
  const out = new Map<string, number>()
  for (const [w, c] of all) {
    let share = 0
    for (const k of cats) if (totals[k] > 0) share += (SEASON_WEIGHTS[k] / activeWeight) * (c[k] / totals[k])
    if (share > 0) out.set(w, Math.round(share * 1_000_000))
  }
  return out
}

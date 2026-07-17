import type { Address, PublicClient } from 'viem'
import { launchpadAbi, routerAbi, erc20Abi, pairAbi } from '../abis'
import { ZERO, type Deployment } from '../config/contracts'
import { resolveMetadata } from './metadata'

// A launched coin as the board + coin page consume it. Price is ETH per whole
// token; mcap = price * total supply.
export type Listed = {
  addr: `0x${string}`; symbol: string; graduated: boolean; tokensSold: bigint
  price: number; mcap: number; creator: `0x${string}`
  creatorName?: string | null; creatorAvatar?: string | null
  volEth?: number; createdTs?: number
  image?: string; banner?: string; name?: string; description?: string
  twitter?: string; telegram?: string; website?: string
}

export const TOTAL_SUPPLY_WHOLE = 1_000_000_000 // total supply; mcap = price * supply

export function fmtUsd(v: number): string {
  if (!isFinite(v) || v <= 0) return '$0'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(2)}`
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
export const xUrl = (v: string) => (v.startsWith('http') ? v : `https://x.com/${v.replace(/^@/, '')}`)
export const tgUrl = (v: string) => (v.startsWith('http') ? v : `https://t.me/${v.replace(/^@/, '')}`)

// Read one coin straight from the chain by address (the board's per-token loader,
// factored out so the coin page reuses the exact same path). Null on any failure.
export async function loadTokenOnChain(addr: Address, publicClient: PublicClient, d: Deployment): Promise<Listed | null> {
  try {
    const [sym, curve, uri] = await Promise.all([
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }) as Promise<string>,
      publicClient.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: 'getCurve', args: [addr] }) as Promise<{ virtualEth: bigint; virtualToken: bigint; tokensSold: bigint; graduated: boolean; creator: `0x${string}` }>,
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'metadataURI' }) as Promise<string>,
    ])
    const meta = await resolveMetadata(uri).catch(() => null)
    // Price = ETH per whole token: curve reserves pre-graduation, pool reserves after.
    let price = Number(curve.virtualEth) / Number(curve.virtualToken)
    if (curve.graduated) {
      try {
        const pair = (await publicClient.readContract({ address: d.router, abi: routerAbi, functionName: 'pairFor', args: [addr, d.weth, false] })) as `0x${string}`
        const m = (await publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' })) as readonly [bigint, bigint, bigint, bigint, boolean, `0x${string}`, `0x${string}`]
        const tokIs0 = m[5].toLowerCase() === addr.toLowerCase()
        const tokR = tokIs0 ? m[2] : m[3], wethR = tokIs0 ? m[3] : m[2]
        if (tokR > 0n) price = Number(wethR) / Number(tokR)
      } catch { /* keep curve price */ }
    }
    return { addr, symbol: sym, graduated: curve.graduated, tokensSold: curve.tokensSold, price, mcap: price * TOTAL_SUPPLY_WHOLE, creator: curve.creator, image: meta?.image, banner: meta?.banner, name: meta?.name, description: meta?.description, twitter: meta?.twitter, telegram: meta?.telegram, website: meta?.website }
  } catch { return null }
}

type ApiTokenRow = {
  address: `0x${string}`; symbol: string | null; name: string | null; image: string | null
  description: string | null; twitter: string | null; telegram: string | null; website: string | null
  creator: string | null; price: number | null; mcap: number | null; graduated: boolean
  tokens_sold: string | null; vol_eth: number | null; created_ts: number | null
}

// Resolve one coin cold (no board context) for the coin page. Prod: the indexer
// API (fast). Local-fork dev, or a coin the indexer hasn't seen yet (404), falls
// back to reading the chain so freshly-created coins are viewable immediately.
export async function loadToken(addr: Address, publicClient: PublicClient, d: Deployment): Promise<Listed | null> {
  if (!import.meta.env.VITE_RPC_URL) {
    try {
      const res = await fetch(`/api/token/${addr}`)
      if (res.ok) {
        const r = (await res.json()) as ApiTokenRow
        if (r?.address) return {
          addr: r.address,
          symbol: r.symbol ?? '',
          name: r.name ?? undefined,
          image: r.image ?? undefined,
          description: r.description ?? undefined,
          twitter: r.twitter ?? undefined,
          telegram: r.telegram ?? undefined,
          website: r.website ?? undefined,
          graduated: !!r.graduated,
          tokensSold: BigInt(r.tokens_sold ?? '0'),
          price: r.price ?? 0,
          mcap: r.mcap ?? 0,
          creator: (r.creator ?? ZERO) as `0x${string}`,
          volEth: r.vol_eth ?? 0,
          createdTs: r.created_ts ?? 0,
        }
      }
      // 404 / non-ok → fall through to on-chain (coin may not be indexed yet).
    } catch { /* network error → on-chain */ }
  }
  return loadTokenOnChain(addr, publicClient, d)
}

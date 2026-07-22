// GET /api/lookup?addr=0x… — resolve ANY token by address straight from the chain
// (no GeckoTerminal, so no shared-IP 429s): find its deepest WETH pool across the
// Uniswap V2 + V3 factories, read its metadata + liquidity, and return one terminal
// card. This is the "paste any token and trade it" path (Uniswap's outputCurrency
// equivalent) — the token need not be on the board or indexed anywhere.
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { json } from './_ponder'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const ZERO = '0x0000000000000000000000000000000000000000'
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address
const USDG_WETH = '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca' as Address
const V2_FACTORY = '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f' as Address
const V3_FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA' as Address
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const V3_FEES = [10000, 3000, 500, 100] as const

const chain = {
  id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MULTICALL3 } },
} as const

const symbolAbi = parseAbiItem('function symbol() view returns (string)')
const nameAbi = parseAbiItem('function name() view returns (string)')
const decimalsAbi = parseAbiItem('function decimals() view returns (uint8)')
const balanceOfAbi = parseAbiItem('function balanceOf(address) view returns (uint256)')
const getPairAbi = parseAbiItem('function getPair(address,address) view returns (address)')
const getPoolAbi = parseAbiItem('function getPool(address,address,uint24) view returns (address)')
const logoAbi = parseAbiItem('function logo() view returns (string)')
const num = (v: bigint, dec: number) => Number(v) / 10 ** dec

function imgFromUri(uri: string | undefined | null): string | null {
  if (!uri) return null
  const s = uri.trim()
  if (s.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${s.slice(7).replace(/^ipfs\//, '')}`
  if (s.startsWith('https://')) return s
  if (/^(baf[a-z0-9]{20,}|Qm[a-zA-Z0-9]{44})$/.test(s)) return `https://ipfs.io/ipfs/${s}`
  return null
}

const FRESH_MS = 20_000

async function resolve(T: Address) {
  const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 2, timeout: 8000 }) })
  // Round 1 — every WETH pool the token could live in (V2 pair + V3 fee tiers).
  const disc = await client.multicall({ allowFailure: true, contracts: [
    { address: V2_FACTORY, abi: [getPairAbi], functionName: 'getPair', args: [T, WETH] },
    ...V3_FEES.map((f) => ({ address: V3_FACTORY, abi: [getPoolAbi], functionName: 'getPool', args: [T, WETH, f] as const })),
  ] })
  const pools: { pool: Address; dex: string }[] = []
  const v2 = disc[0].result as Address | undefined
  if (v2 && v2 !== ZERO) pools.push({ pool: v2, dex: 'uniswap-v2-robinhood' })
  V3_FEES.forEach((_f, i) => {
    const p = disc[1 + i].result as Address | undefined
    if (p && p !== ZERO) pools.push({ pool: p, dex: 'uniswap-v3-robinhood' })
  })
  if (!pools.length) return null // no WETH pool — not reachable via our routes (yet)

  // Round 2 — token metadata + ethUsd + each candidate pool's WETH reserve.
  const res = await client.multicall({ allowFailure: true, contracts: [
    { address: WETH, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [decimalsAbi], functionName: 'decimals' },
    { address: T, abi: [symbolAbi], functionName: 'symbol' },
    { address: T, abi: [nameAbi], functionName: 'name' },
    { address: T, abi: [logoAbi], functionName: 'logo' },
    ...pools.map((p) => ({ address: WETH, abi: [balanceOfAbi], functionName: 'balanceOf', args: [p.pool] as const })),
  ] })
  const symbol = res[3].result as string | undefined
  if (!symbol) return null
  const usdgDec = Number(res[2].result ?? 6n)
  const wethRef = num((res[0].result as bigint) ?? 0n, 18)
  const usdgRef = num((res[1].result as bigint) ?? 0n, usdgDec)
  const ethUsd = wethRef > 0 ? usdgRef / wethRef : 0

  // Deepest WETH pool wins.
  let best = pools[0], bestWeth = 0
  pools.forEach((p, i) => {
    const w = num((res[6 + i].result as bigint) ?? 0n, 18)
    if (w > bestWeth) { bestWeth = w; best = p }
  })

  return {
    pool: best.pool, address: T, symbol, name: (res[4].result as string) || symbol,
    image: imgFromUri(res[5].result as string | undefined), dex: best.dex,
    priceUsd: 0, fdvUsd: 0, liqUsd: 2 * bestWeth * ethUsd, vol24: 0, vol1h: 0, chg24: 0, chg1h: 0,
    buys24: 0, sells24: 0, buyers24: 0, sellers24: 0, createdTs: 0, score: 0,
  }
}

export const onRequestGet: PagesFunction = async (ctx) => {
  const addr = (new URL(ctx.request.url).searchParams.get('addr') ?? '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ token: null })

  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(`https://lookup.cache/${addr}`, { method: 'GET' })
  const cached = await cache.match(key)
  if (cached) {
    const at = Number(cached.headers.get('x-fetched-at') || 0)
    if (Date.now() - at < FRESH_MS) return cached
  }
  try {
    const token = await resolve(addr as Address)
    const resp = json({ token })
    resp.headers.set('x-fetched-at', String(Date.now()))
    if (token) ctx.waitUntil(cache.put(key, resp.clone()))
    return resp
  } catch (e) {
    if (cached) return cached
    return json({ token: null, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

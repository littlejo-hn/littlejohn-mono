// GET /api/firehose — the 0-lag launch feed. Reads the chain directly (not GeckoTerminal)
// so new pools surface ~1 block after creation. Watches the new-pool events on three
// Uniswap venues — V2 (PairCreated) + V3 (PoolCreated) factories and V4's singleton
// PoolManager (Initialize) — then enriches every new token in ONE Multicall3 batch
// (symbol/name/decimals + a liquidity read: quote-token balance for V2/V3, on-chain
// liquidity via StateView for V4). Non-Uniswap pads (Pons, Bankr, …) are separate
// venues added next. Cache-through + serve-stale so RH's RPC is hit rarely.
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { json } from './_ponder'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const ZERO = '0x0000000000000000000000000000000000000000' as Address // native ETH in V4
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address
const USDG_WETH = '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca' as Address // ref pool for ethUsd
const V2_FACTORY = '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f' as Address
const V3_FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA' as Address
const V4_POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951' as Address
const V4_STATE_VIEW = '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b' as Address
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const QUOTES = new Set([ZERO.toLowerCase(), WETH.toLowerCase(), USDG.toLowerCase()])

const WINDOW = 2000n // ~3.3 min of blocks at ~0.1s
const BLOCK_S = 0.1 // measured avg block time (age approximation)
const MIN_LIQ = 200 // drop dust
const MAX_ENRICH = 90 // cap the batch regardless of launch rate
const MAX = 60

const chain = {
  id: 4663, name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  contracts: { multicall3: { address: MULTICALL3 } },
} as const

const symbolAbi = parseAbiItem('function symbol() view returns (string)')
const nameAbi = parseAbiItem('function name() view returns (string)')
const decimalsAbi = parseAbiItem('function decimals() view returns (uint8)')
const balanceOfAbi = parseAbiItem('function balanceOf(address) view returns (uint256)')
const getLiquidityAbi = parseAbiItem('function getLiquidity(bytes32 poolId) view returns (uint128)')
const num = (v: bigint, dec: number) => Number(v) / 10 ** dec
const Q96 = 2n ** 96n

type Card = {
  pool: string; address: string; symbol: string; name: string; image: string | null; dex: string
  priceUsd: number; fdvUsd: number; liqUsd: number; vol24: number; vol1h: number
  chg24: number; chg1h: number; buys24: number; sells24: number; buyers24: number; sellers24: number
  createdTs: number; score: number
}

// A discovered launch, normalized across venues. `kind` selects the liquidity read.
type Cand = {
  token: Address; quote: Address; pool: string; dex: string; block: bigint
  kind: 'erc20' | 'v4'; sqrtPriceX96?: bigint; quoteIs0?: boolean
}

async function build(): Promise<Card[]> {
  const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 2, timeout: 8000 }) })
  const latest = await client.getBlockNumber()
  const from = latest > WINDOW ? latest - WINDOW : 0n

  const [anchor, v2Logs, v3Logs, v4Logs] = await Promise.all([
    client.getBlock({ blockNumber: latest }),
    client.getLogs({ address: V2_FACTORY, event: parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength)'), fromBlock: from, toBlock: latest }),
    client.getLogs({ address: V3_FACTORY, event: parseAbiItem('event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'), fromBlock: from, toBlock: latest }),
    client.getLogs({ address: V4_POOL_MANAGER, event: parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'), fromBlock: from, toBlock: latest }),
  ])
  const anchorTs = Number(anchor.timestamp)

  const cands: Cand[] = []
  const erc20 = (t0: Address, t1: Address, pool: Address, dex: string, block: bigint) => {
    const t0q = QUOTES.has(t0.toLowerCase()), t1q = QUOTES.has(t1.toLowerCase())
    if (t0q === t1q) return
    cands.push({ token: t0q ? t1 : t0, quote: t0q ? t0 : t1, pool, dex, block, kind: 'erc20' })
  }
  for (const l of v2Logs) erc20(l.args.token0!, l.args.token1!, l.args.pair!, 'uniswap-v2-robinhood', l.blockNumber)
  for (const l of v3Logs) erc20(l.args.token0!, l.args.token1!, l.args.pool!, 'uniswap-v3-robinhood', l.blockNumber)
  for (const l of v4Logs) {
    const c0 = l.args.currency0!, c1 = l.args.currency1!
    const c0q = QUOTES.has(c0.toLowerCase()), c1q = QUOTES.has(c1.toLowerCase())
    if (c0q === c1q) continue
    cands.push({
      token: c0q ? c1 : c0, quote: c0q ? c0 : c1, pool: l.args.id!, dex: 'uniswap-v4-robinhood',
      block: l.blockNumber, kind: 'v4', sqrtPriceX96: l.args.sqrtPriceX96!, quoteIs0: c0q,
    })
  }
  if (!cands.length) return []
  // Newest first, capped, then dedupe by token so one launch isn't enriched twice.
  cands.sort((a, b) => Number(b.block - a.block))
  const seen = new Set<string>()
  const picked = cands.filter((c) => {
    const k = c.token.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k); return true
  }).slice(0, MAX_ENRICH)

  // One batched read: ethUsd (ref pool) + per-candidate symbol/name/decimals + a
  // liquidity read (quote balanceOf for V2/V3, StateView.getLiquidity for V4).
  const eth = [
    { address: WETH, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [decimalsAbi], functionName: 'decimals' },
  ] as const
  const perCand = picked.flatMap((c) => [
    { address: c.token, abi: [symbolAbi], functionName: 'symbol' },
    { address: c.token, abi: [nameAbi], functionName: 'name' },
    { address: c.token, abi: [decimalsAbi], functionName: 'decimals' },
    c.kind === 'v4'
      ? { address: V4_STATE_VIEW, abi: [getLiquidityAbi], functionName: 'getLiquidity', args: [c.pool as `0x${string}`] }
      : { address: c.quote, abi: [balanceOfAbi], functionName: 'balanceOf', args: [c.pool as Address] },
  ])
  const res = await client.multicall({ contracts: [...eth, ...perCand], allowFailure: true })

  const usdgDec = Number(res[2].result ?? 6n)
  const wethRef = num((res[0].result as bigint) ?? 0n, 18)
  const usdgRef = num((res[1].result as bigint) ?? 0n, usdgDec)
  const ethUsd = wethRef > 0 ? usdgRef / wethRef : 0

  const cards: Card[] = []
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i]
    const b = 3 + i * 4
    const symbol = res[b].result as string | undefined
    const name = res[b + 1].result as string | undefined
    const liq = res[b + 3].result as bigint | undefined
    if (!symbol || liq == null) continue
    const isUsdg = c.quote.toLowerCase() === USDG.toLowerCase()
    const quoteDec = isUsdg ? usdgDec : 18
    const quotePrice = isUsdg ? 1 : ethUsd
    // Quote-side reserve: V2/V3 read the pool's balance directly; V4 derives it from
    // liquidity L and the pool's sqrt price (full-range approximation — a rough TVL
    // gauge for the dust filter, since the singleton holds no per-pool balance).
    let qReserveWei = liq
    if (c.kind === 'v4') {
      const sp = c.sqrtPriceX96 ?? 0n
      if (sp === 0n) continue
      qReserveWei = c.quoteIs0 ? (liq * Q96) / sp : (liq * sp) / Q96
    }
    const liqUsd = 2 * num(qReserveWei, quoteDec) * quotePrice
    if (!(liqUsd >= MIN_LIQ)) continue
    cards.push({
      pool: c.pool, address: c.token, symbol, name: name || symbol, image: null, dex: c.dex,
      priceUsd: 0, fdvUsd: 0, liqUsd, vol24: 0, vol1h: 0, chg24: 0, chg1h: 0,
      buys24: 0, sells24: 0, buyers24: 0, sellers24: 0,
      createdTs: anchorTs - Math.round(Number(latest - c.block) * BLOCK_S),
      score: Number(c.block),
    })
  }
  return cards.sort((a, b) => b.score - a.score).slice(0, MAX)
}

const FRESH_MS = 4_000 // refetch the chain at most this often
const STALE_MS = 120_000 // serve last-good up to 2 min on RPC failure

export const onRequestGet: PagesFunction = async (ctx) => {
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request('https://firehose.cache/new', { method: 'GET' })
  const cached = await cache.match(key)
  if (cached) {
    const at = Number(cached.headers.get('x-fetched-at') || 0)
    if (Date.now() - at < FRESH_MS) return cached
  }
  try {
    const cards = await build()
    const resp = json({ feed: 'firehose', count: cards.length, tokens: cards })
    resp.headers.set('cache-control', `public, s-maxage=${Math.floor(STALE_MS / 1000)}`)
    resp.headers.set('x-fetched-at', String(Date.now()))
    ctx.waitUntil(cache.put(key, resp.clone()))
    return resp
  } catch (e) {
    if (cached) return cached // serve-stale on RPC hiccup so the feed never blanks
    return json({ error: e instanceof Error ? e.message : String(e), tokens: [] }, 502)
  }
}

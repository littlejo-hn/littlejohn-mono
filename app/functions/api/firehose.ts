// GET /api/firehose — the 0-lag launch feed. Instead of mirroring GeckoTerminal
// (seconds-to-minutes behind), we read the chain directly: eth_getLogs for new-pool
// events on the Uniswap V2 + V3 factories over the last ~3 min (~0.1s blocks), then
// enrich every new token in ONE Multicall3 batch (symbol/name/decimals + quote
// reserve). New pools hit the board ~1 block after creation. V4/pad-native launches
// are the next source. Cache-through + serve-stale so RH's RPC is hit rarely.
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { json } from './_ponder'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address
const USDG_WETH = '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca' as Address // ref pool for ethUsd
const V2_FACTORY = '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f' as Address
const V3_FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA' as Address
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const QUOTES = new Set([WETH.toLowerCase(), USDG.toLowerCase()])

const WINDOW = 2000n // ~3.3 min of blocks at ~0.1s
const BLOCK_S = 0.1 // measured avg block time (age approximation)
const MIN_LIQ = 200 // drop dust
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
const num = (v: bigint, dec: number) => Number(v) / 10 ** dec

// The terminal Card shape (matches /api/trenches so rows render identically).
type Card = {
  pool: string; address: string; symbol: string; name: string; image: string | null; dex: string
  priceUsd: number; fdvUsd: number; liqUsd: number; vol24: number; vol1h: number
  chg24: number; chg1h: number; buys24: number; sells24: number; buyers24: number; sellers24: number
  createdTs: number; score: number
}

async function build(): Promise<Card[]> {
  const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 2, timeout: 8000 }) })
  const latest = await client.getBlockNumber()
  const from = latest > WINDOW ? latest - WINDOW : 0n

  const [anchor, v2Logs, v3Logs] = await Promise.all([
    client.getBlock({ blockNumber: latest }),
    client.getLogs({ address: V2_FACTORY, event: parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength)'), fromBlock: from, toBlock: latest }),
    client.getLogs({ address: V3_FACTORY, event: parseAbiItem('event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'), fromBlock: from, toBlock: latest }),
  ])
  const anchorTs = Number(anchor.timestamp)

  // Normalize both factories to a common shape; keep only one-quote-side pools.
  type Cand = { pool: Address; token: Address; quote: Address; dex: string; block: bigint }
  const cands: Cand[] = []
  const push = (t0: Address, t1: Address, pool: Address, dex: string, block: bigint) => {
    const t0q = QUOTES.has(t0.toLowerCase()), t1q = QUOTES.has(t1.toLowerCase())
    if (t0q === t1q) return // need exactly one recognized quote token
    cands.push({ pool, token: t0q ? t1 : t0, quote: t0q ? t0 : t1, dex, block })
  }
  for (const l of v2Logs) push(l.args.token0!, l.args.token1!, l.args.pair!, 'uniswap-v2-robinhood', l.blockNumber)
  for (const l of v3Logs) push(l.args.token0!, l.args.token1!, l.args.pool!, 'uniswap-v3-robinhood', l.blockNumber)
  if (!cands.length) return []

  // One batched read: ethUsd (from the ref pool) + per-token symbol/name/decimals/quote reserve.
  const eth = [
    { address: WETH, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [balanceOfAbi], functionName: 'balanceOf', args: [USDG_WETH] },
    { address: USDG, abi: [decimalsAbi], functionName: 'decimals' },
  ] as const
  const perToken = cands.flatMap((c) => [
    { address: c.token, abi: [symbolAbi], functionName: 'symbol' },
    { address: c.token, abi: [nameAbi], functionName: 'name' },
    { address: c.token, abi: [decimalsAbi], functionName: 'decimals' },
    { address: c.quote, abi: [balanceOfAbi], functionName: 'balanceOf', args: [c.pool] },
  ])
  const res = await client.multicall({ contracts: [...eth, ...perToken], allowFailure: true })

  const usdgDec = Number(res[2].result ?? 6n)
  const wethRef = num((res[0].result as bigint) ?? 0n, 18)
  const usdgRef = num((res[1].result as bigint) ?? 0n, usdgDec)
  const ethUsd = wethRef > 0 ? usdgRef / wethRef : 0

  const cards: Card[] = []
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    const b = 3 + i * 4
    const symbol = res[b].result as string | undefined
    const name = res[b + 1].result as string | undefined
    const qbal = res[b + 3].result as bigint | undefined
    if (!symbol || qbal == null) continue
    const qIsWeth = c.quote.toLowerCase() === WETH.toLowerCase()
    const qReserve = num(qbal, qIsWeth ? 18 : usdgDec)
    const liqUsd = 2 * qReserve * (qIsWeth ? ethUsd : 1) // both sides ~= 2x the quote reserve
    if (!(liqUsd >= MIN_LIQ)) continue
    cards.push({
      pool: c.pool, address: c.token, symbol, name: name || symbol, image: null, dex: c.dex,
      priceUsd: 0, fdvUsd: 0, liqUsd, vol24: 0, vol1h: 0, chg24: 0, chg1h: 0,
      buys24: 0, sells24: 0, buyers24: 0, sellers24: 0,
      createdTs: anchorTs - Math.round(Number(latest - c.block) * BLOCK_S),
      score: Number(c.block),
    })
  }
  // Dedupe by token (keep the deepest pool), newest first.
  const byTok = new Map<string, Card>()
  for (const c of cards) { const k = c.address.toLowerCase(); const p = byTok.get(k); if (!p || c.liqUsd > p.liqUsd) byTok.set(k, c) }
  return [...byTok.values()].sort((a, b) => b.score - a.score).slice(0, MAX)
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

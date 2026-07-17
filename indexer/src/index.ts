// LittleJohn launchpad indexer (Cloudflare scheduled Worker).
//
// Polls Robinhood Chain via getLogs once a minute and writes bonding-curve and
// graduated-pool activity into a D1 database that the app's Pages Functions read.
// This replaces the frontend's per-token RPC loops so the coin board scales to
// thousands of tokens.
//
// Price/mcap math is kept identical to the frontend (src/lib/trades.ts):
//   curve price = virtualEth / virtualToken   (both 1e18-scaled)
//   pool  price = wethReserve / tokenReserve  (token order via pair token0)
//   mcap        = price * 1e9                  (total supply is 1e9 whole tokens)

import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type PublicClient,
} from 'viem'

export interface Env {
  DB: D1Database
  LIVE: DurableObjectNamespace
  RPC_URL: string
  RPC_URL_FALLBACK?: string
  CHAIN_ID: string
  LAUNCHPAD: string
  WETH: string
  ROUTER: string
  START_BLOCK: string
  CONFIRMATIONS: string
  IPFS_GATEWAY: string
  MAX_CHUNKS_PER_RUN?: string
}

// LiveFeed Durable Object: sub-second live trade push over WebSockets. It reads
// the chain and broadcasts only; D1 history is owned by the cron above.
export { LiveFeed } from './live'

// ---------------------------------------------------------------- event ABIs

const tokenCreatedEvent = parseAbiItem(
  'event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint256 virtualEth, uint256 virtualToken)',
)
export const tradeEvent = parseAbiItem(
  'event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 virtualEth, uint256 virtualToken, uint256 tokensSold)',
)
const graduatedEvent = parseAbiItem(
  'event Graduated(address indexed token, uint256 ethLiquidity, uint256 tokenLiquidity)',
)
const migratedEvent = parseAbiItem(
  'event Migrated(address indexed token, address indexed pair, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee)',
)
const syncEvent = parseAbiItem('event Sync(uint256 reserve0, uint256 reserve1)')
export const swapEvent = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
)

const launchpadEvents = [tokenCreatedEvent, tradeEvent, graduatedEvent, migratedEvent]
const pairEvents = [syncEvent, swapEvent]

const CHUNK = 2000n
const BATCH_SIZE = 100 // D1 statements per batch call
const TOTAL_SUPPLY_WHOLE = 1_000_000_000

// ---------------------------------------------------------------- helpers

export function makeClient(env: Env): PublicClient {
  // Primary plus an optional backup RPC. viem's fallback() fails over to the next
  // transport on error, so a single provider blip never freezes indexing. Set
  // RPC_URL_FALLBACK (secret/var) to a second endpoint to arm it; unset = single.
  const urls = [env.RPC_URL, env.RPC_URL_FALLBACK].filter((u): u is string => !!u)
  const chain = defineChain({
    id: Number(env.CHAIN_ID),
    name: 'robinhood-chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: urls } },
  })
  const transport = urls.length > 1 ? fallback(urls.map((u) => http(u))) : http(urls[0])
  return createPublicClient({ chain, transport })
}

export function priceFrom(virtualEth: bigint, virtualToken: bigint): number {
  return virtualToken > 0n ? Number(virtualEth) / Number(virtualToken) : 0
}

// Velodrome V1 pairs sort tokens by address (token0 is the numerically smaller
// address), so we can derive token order without an extra metadata() RPC call.
export function tokenIsToken0(token: string, weth: string): boolean {
  return token.toLowerCase() < weth.toLowerCase()
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

function ipfsToHttp(uri: string | undefined, gateway: string): string | undefined {
  if (!uri) return undefined
  return uri.startsWith('ipfs://') ? gateway + uri.slice('ipfs://'.length) : uri
}

type Meta = {
  image: string | null
  description: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
}

const EMPTY_META: Meta = { image: null, description: null, twitter: null, telegram: null, website: null }

function parseDataJson(uri: string): Record<string, unknown> | null {
  const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri)
  if (!m) return null
  try {
    const raw = m[1] ? b64ToUtf8(m[2]) : decodeURIComponent(m[2])
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Resolve an on-chain metadataURI (data:, ipfs://, http(s)://) to display fields.
async function resolveMeta(uri: string, gateway: string): Promise<Meta> {
  if (!uri) return EMPTY_META
  let obj = parseDataJson(uri)
  if (!obj) {
    const url = ipfsToHttp(uri, gateway)
    if (url && url.startsWith('http')) {
      try {
        // Bound the gateway fetch: one hung IPFS gateway must not stall the whole
        // chunk (and time out the Worker). On timeout, leave meta null; a later
        // pass over the same token can fill it in.
        const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
        if (r.ok) {
          const j = await r.json()
          if (j && typeof j === 'object') obj = j as Record<string, unknown>
        }
      } catch {
        /* metadata unreachable; leave fields null */
      }
    }
  }
  if (!obj) return EMPTY_META
  return {
    image: ipfsToHttp(str(obj.image) ?? undefined, gateway) ?? null,
    description: str(obj.description),
    twitter: str(obj.twitter),
    telegram: str(obj.telegram),
    website: str(obj.website),
  }
}

// Fetch (and cache) timestamps for a set of blocks.
async function fillBlockTimes(
  client: PublicClient,
  blocks: Iterable<bigint>,
  cache: Map<bigint, number>,
): Promise<void> {
  const missing = [...new Set(blocks)].filter((b) => !cache.has(b))
  await Promise.all(
    missing.map(async (b) => {
      const blk = await client.getBlock({ blockNumber: b })
      cache.set(b, Number(blk.timestamp))
    }),
  )
}

function pos(a: { blockNumber: bigint | null; logIndex: number | null }): [bigint, number] {
  return [a.blockNumber ?? 0n, a.logIndex ?? 0]
}
function byPos(
  a: { blockNumber: bigint | null; logIndex: number | null },
  b: { blockNumber: bigint | null; logIndex: number | null },
): number {
  const [ab, ai] = pos(a)
  const [bb, bi] = pos(b)
  return ab === bb ? ai - bi : Number(ab - bb)
}

// Run D1 statements in ordered sub-batches (D1 caps statements per batch call).
async function runBatched(env: Env, stmts: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await env.DB.batch(stmts.slice(i, i + BATCH_SIZE))
  }
}

// ---------------------------------------------------------------- chunk

async function processChunk(
  env: Env,
  client: PublicClient,
  launchpad: Address,
  weth: string,
  gateway: string,
  fromBlock: bigint,
  toBlock: bigint,
  tsCache: Map<bigint, number>,
): Promise<number> {
  // 1. Launchpad events for the range, in one call.
  const lpLogs = await client.getLogs({ address: launchpad, events: launchpadEvents, fromBlock, toBlock })
  const sortedLp = [...lpLogs].sort(byPos)

  // 2. Known graduated pairs (from DB) plus any migrated inside this chunk, so
  //    Sync/Swap emitted in the same range as the migration are captured too.
  const gradRows = await env.DB.prepare(
    'SELECT address, pair FROM tokens WHERE graduated = 1 AND pair IS NOT NULL',
  ).all<{ address: string; pair: string }>()
  const pairToToken = new Map<string, string>()
  for (const r of gradRows.results ?? []) pairToToken.set(r.pair.toLowerCase(), r.address.toLowerCase())
  for (const log of sortedLp) {
    if (log.eventName === 'Migrated') {
      const a = log.args as { token: Address; pair: Address }
      pairToToken.set(a.pair.toLowerCase(), a.token.toLowerCase())
    }
  }

  // 3. Pool events for the known pairs.
  const pairAddrs = [...pairToToken.keys()]
  const pairLogs = pairAddrs.length
    ? await client.getLogs({ address: pairAddrs as Address[], events: pairEvents, fromBlock, toBlock })
    : []
  const sortedPair = [...pairLogs].sort(byPos)

  // Resolve block timestamps for everything we touch.
  await fillBlockTimes(
    client,
    [...sortedLp, ...sortedPair].map((l) => l.blockNumber ?? 0n),
    tsCache,
  )

  // Resolve metadata for new tokens (bounded to this chunk's creations).
  const metaByToken = new Map<string, Meta>()
  await Promise.all(
    sortedLp
      .filter((l) => l.eventName === 'TokenCreated')
      .map(async (l) => {
        const a = l.args as { token: Address; metadataURI: string }
        metaByToken.set(a.token.toLowerCase(), await resolveMeta(a.metadataURI, gateway))
      }),
  )

  const stmts: D1PreparedStatement[] = []
  const touched = new Set<string>()
  let tradeInserts = 0

  const upsertToken = env.DB.prepare(
    `INSERT INTO tokens
       (address, symbol, name, image, description, twitter, telegram, website, creator,
        created_block, created_ts, tokens_sold, virtual_eth, virtual_token, price, mcap)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'0',?12,?13,?14,?15)
     ON CONFLICT(address) DO UPDATE SET
       symbol=excluded.symbol, name=excluded.name, image=excluded.image,
       description=excluded.description, twitter=excluded.twitter, telegram=excluded.telegram,
       website=excluded.website, creator=excluded.creator, created_block=excluded.created_block,
       created_ts=excluded.created_ts, virtual_eth=excluded.virtual_eth,
       virtual_token=excluded.virtual_token, price=excluded.price, mcap=excluded.mcap`,
  )
  const updOnTrade = env.DB.prepare(
    'UPDATE tokens SET price=?2, mcap=?3, tokens_sold=?4, virtual_eth=?5, virtual_token=?6 WHERE address=?1',
  )
  const updGraduated = env.DB.prepare('UPDATE tokens SET graduated=1 WHERE address=?1')
  const updPair = env.DB.prepare('UPDATE tokens SET pair=?2 WHERE address=?1')
  const updPoolPrice = env.DB.prepare('UPDATE tokens SET price=?2, mcap=?3 WHERE address=?1')
  const insTrade = env.DB.prepare(
    `INSERT OR IGNORE INTO trades
       (id, token, trader, is_buy, eth_amount, token_amount, price, block, log_index, ts, phase)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  )

  // 4. Launchpad logs, in (block, logIndex) order.
  for (const log of sortedLp) {
    const block = log.blockNumber ?? 0n
    const logIndex = log.logIndex ?? 0
    const ts = tsCache.get(block) ?? null

    switch (log.eventName) {
      case 'TokenCreated': {
        const a = log.args as {
          token: Address
          creator: Address
          name: string
          symbol: string
          virtualEth: bigint
          virtualToken: bigint
        }
        const token = a.token.toLowerCase()
        const m = metaByToken.get(token) ?? EMPTY_META
        const price = priceFrom(a.virtualEth, a.virtualToken)
        stmts.push(
          upsertToken.bind(
            token,
            a.symbol,
            a.name,
            m.image,
            m.description,
            m.twitter,
            m.telegram,
            m.website,
            a.creator.toLowerCase(),
            Number(block),
            ts,
            a.virtualEth.toString(),
            a.virtualToken.toString(),
            price,
            price * TOTAL_SUPPLY_WHOLE,
          ),
        )
        touched.add(token)
        break
      }
      case 'Trade': {
        const a = log.args as {
          token: Address
          trader: Address
          isBuy: boolean
          ethAmount: bigint
          tokenAmount: bigint
          virtualEth: bigint
          virtualToken: bigint
          tokensSold: bigint
        }
        const token = a.token.toLowerCase()
        const price = priceFrom(a.virtualEth, a.virtualToken)
        stmts.push(
          updOnTrade.bind(
            token,
            price,
            price * TOTAL_SUPPLY_WHOLE,
            a.tokensSold.toString(),
            a.virtualEth.toString(),
            a.virtualToken.toString(),
          ),
        )
        stmts.push(
          insTrade.bind(
            `${block}-${logIndex}`,
            token,
            a.trader.toLowerCase(),
            a.isBuy ? 1 : 0,
            a.ethAmount.toString(),
            a.tokenAmount.toString(),
            price,
            Number(block),
            logIndex,
            ts,
            'curve',
          ),
        )
        tradeInserts++
        touched.add(token)
        break
      }
      case 'Graduated': {
        const a = log.args as { token: Address }
        const token = a.token.toLowerCase()
        stmts.push(updGraduated.bind(token))
        touched.add(token)
        break
      }
      case 'Migrated': {
        const a = log.args as { token: Address; pair: Address }
        const token = a.token.toLowerCase()
        stmts.push(updPair.bind(token, a.pair.toLowerCase()))
        touched.add(token)
        break
      }
    }
  }

  // 5. Pool logs. Swaps become trades; the latest Sync sets graduated price.
  const latestSync = new Map<string, { blockKey: bigint; idx: number; price: number }>()
  for (const log of sortedPair) {
    const pair = (log.address ?? '').toLowerCase()
    const token = pairToToken.get(pair)
    if (!token) continue
    const block = log.blockNumber ?? 0n
    const logIndex = log.logIndex ?? 0
    const ts = tsCache.get(block) ?? null
    const is0 = tokenIsToken0(token, weth)

    if (log.eventName === 'Sync') {
      const a = log.args as { reserve0: bigint; reserve1: bigint }
      const tokR = is0 ? a.reserve0 : a.reserve1
      const wethR = is0 ? a.reserve1 : a.reserve0
      if (tokR === 0n) continue
      const price = Number(wethR) / Number(tokR)
      const cur = latestSync.get(token)
      if (!cur || block > cur.blockKey || (block === cur.blockKey && logIndex > cur.idx)) {
        latestSync.set(token, { blockKey: block, idx: logIndex, price })
      }
    } else if (log.eventName === 'Swap') {
      const a = log.args as {
        amount0In: bigint
        amount1In: bigint
        amount0Out: bigint
        amount1Out: bigint
        to: Address
      }
      const tokIn = is0 ? a.amount0In : a.amount1In
      const tokOut = is0 ? a.amount0Out : a.amount1Out
      const wethIn = is0 ? a.amount1In : a.amount0In
      const wethOut = is0 ? a.amount1Out : a.amount0Out
      const isBuy = tokOut > 0n
      const ethAmount = isBuy ? wethIn : wethOut
      const tokenAmount = isBuy ? tokOut : tokIn
      const price = tokenAmount > 0n ? Number(ethAmount) / Number(tokenAmount) : 0
      stmts.push(
        insTrade.bind(
          `${block}-${logIndex}`,
          token,
          a.to.toLowerCase(),
          isBuy ? 1 : 0,
          ethAmount.toString(),
          tokenAmount.toString(),
          price,
          Number(block),
          logIndex,
          ts,
          'pool',
        ),
      )
      tradeInserts++
      touched.add(token)
    }
  }
  for (const [token, s] of latestSync) {
    stmts.push(updPoolPrice.bind(token, s.price, s.price * TOTAL_SUPPLY_WHOLE))
    touched.add(token)
  }

  // 6. Recompute aggregate columns from the trades table (idempotent, so a
  //    re-processed chunk never double-counts volume or trade count).
  const recompute = env.DB.prepare(
    `UPDATE tokens SET
       trade_count   = (SELECT COUNT(*) FROM trades WHERE token = ?1),
       vol_eth       = (SELECT COALESCE(SUM(CAST(eth_amount AS REAL)), 0) / 1e18 FROM trades WHERE token = ?1),
       last_trade_ts = (SELECT MAX(ts) FROM trades WHERE token = ?1)
     WHERE address = ?1`,
  )
  for (const token of touched) stmts.push(recompute.bind(token))

  await runBatched(env, stmts)
  return tradeInserts
}

// ---------------------------------------------------------------- entrypoint

export async function runIndex(env: Env): Promise<Record<string, unknown>> {
  const client = makeClient(env)
  const launchpad = env.LAUNCHPAD.toLowerCase() as Address
  const weth = env.WETH.toLowerCase()
  const confirmations = BigInt(env.CONFIRMATIONS || '5')

  const cp = await env.DB.prepare('SELECT last_block FROM checkpoint WHERE id = 1').first<{
    last_block: number
  }>()
  const fromBlock = cp ? BigInt(cp.last_block) + 1n : BigInt(env.START_BLOCK)

  // Stamp a successful pass so /health can tell "indexer alive" from "cron dead".
  const stampRun = () =>
    env.DB.prepare(
      `INSERT INTO checkpoint (id, last_block, last_run_ts) VALUES (1, ?1, ?2)
       ON CONFLICT(id) DO UPDATE SET last_run_ts = excluded.last_run_ts`,
    )
      .bind(Number(fromBlock) - 1, Math.floor(Date.now() / 1000))
      .run()

  const latest = await client.getBlockNumber()
  const toBlock = latest > confirmations ? latest - confirmations : 0n
  if (toBlock < fromBlock) {
    await stampRun()
    return { ok: true, from: fromBlock.toString(), to: toBlock.toString(), chunks: 0, note: 'nothing new' }
  }

  const tsCache = new Map<bigint, number>()
  const setCheckpoint = env.DB.prepare(
    'INSERT INTO checkpoint (id, last_block) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET last_block = excluded.last_block',
  )

  // Cap chunks per invocation so a large backfill never blows the Worker's
  // per-request limit. The checkpoint advances each chunk, so the next tick
  // resumes; the cron catches the backlog up over successive minutes.
  const maxChunks = Number(env.MAX_CHUNKS_PER_RUN || '6')
  let chunks = 0
  let trades = 0
  for (let start = fromBlock; start <= toBlock && chunks < maxChunks; start += CHUNK) {
    const end = start + CHUNK - 1n <= toBlock ? start + CHUNK - 1n : toBlock
    trades += await processChunk(env, client, launchpad, weth, env.IPFS_GATEWAY, start, end, tsCache)
    // Advance the checkpoint per chunk so a later failure only re-processes the
    // failed chunk. Re-processing is safe because every write is idempotent.
    await setCheckpoint.bind(Number(end)).run()
    chunks++
  }

  await stampRun()
  return { ok: true, from: fromBlock.toString(), to: toBlock.toString(), chunks, trades, caughtUp: chunks < maxChunks }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runIndex(env).catch((e) => {
        console.error('indexer run failed:', e instanceof Error ? e.stack ?? e.message : String(e))
      }),
    )
  },

  // On-demand pass for testing without waiting for cron: `curl <worker>/run`.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Live trade feed: GET /ws/0x<token> upgrades to a WebSocket served by the
    // single firehose LiveFeed Durable Object. One instance holds every viewer's
    // socket (tagged by coin) and polls the launchpad once per tick for all coins,
    // so RPC cost is independent of how many tokens are being watched (see live.ts).
    const ws = /^\/ws\/(0x[0-9a-fA-F]{40})$/.exec(url.pathname)
    if (ws) {
      const stub = env.LIVE.get(env.LIVE.idFromName('hub'))
      return stub.fetch(request)
    }

    // Liveness probe for an external monitor (healthchecks.io / UptimeRobot).
    // Returns 503 when the cron has gone silent (> 5 min) so a missed run pages
    // us instead of the board quietly freezing. lagBlocks is reported for info;
    // it is large during first-time backfill, so the alert keys on run recency.
    if (url.pathname === '/health') {
      try {
        const client = makeClient(env)
        const head = await client.getBlockNumber()
        const cp = await env.DB.prepare('SELECT last_block, last_run_ts FROM checkpoint WHERE id = 1').first<{
          last_block: number
          last_run_ts: number | null
        }>()
        const last = cp ? BigInt(cp.last_block) : 0n
        const lastRun = cp?.last_run_ts ?? 0
        const sinceRun = Math.floor(Date.now() / 1000) - lastRun
        const confirmations = BigInt(env.CONFIRMATIONS || '5')
        const target = head > confirmations ? head - confirmations : 0n
        const lag = target > last ? target - last : 0n
        const stale = lastRun === 0 || sinceRun > 300
        return Response.json(
          {
            ok: !stale,
            head: head.toString(),
            lastBlock: last.toString(),
            lagBlocks: lag.toString(),
            lastRunAgoSec: sinceRun,
            stale,
          },
          { status: stale ? 503 : 200 },
        )
      } catch (e) {
        return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
      }
    }

    if (url.pathname === '/run') {
      try {
        const result = await runIndex(env)
        return Response.json(result)
      } catch (e) {
        return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
      }
    }
    return new Response('littlejohn-indexer: POST/GET /run to trigger a pass', { status: 404 })
  },
}

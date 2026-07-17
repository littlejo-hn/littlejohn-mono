// LiveFeed Durable Object: single-firehose live trade push to browsers.
//
// One instance (addressed `idFromName("hub")`) holds EVERY viewer's WebSocket,
// each tagged with the coin it is watching, and polls the chain ONCE per tick
// for all coins at once:
//   - one getLogs on the launchpad  -> every curve Trade (all tokens) + Migrated
//   - one getLogs across the graduated pairs currently being watched -> pool Swaps
// Each new trade is fanned out to just the sockets tagged with its token via
// `getWebSockets(tag)`. So N watched coins cost one RPC stream, not N pollers.
//
// This is the firehose model pump.fun-style platforms rely on: never poll per
// token. The old design ran one poller per coin (2-4 RPC calls/sec each), which
// rate-limited the RPC exactly when the platform was busiest and froze the board.
//
// Scale ceiling: one DO holds all sockets. Cloudflare allows a large number of
// hibernatable sockets per DO; if we ever outgrow it, shard into K hubs keyed by
// hash(token) % K — each still polls the launchpad once, so the firehose property
// (RPC cost independent of coin count) holds.
//
// Parsing is imported from ./index (priceFrom, tokenIsToken0, tradeEvent,
// swapEvent, makeClient) so live and historical trades agree exactly.

import { parseAbiItem, type Address, type PublicClient } from 'viem'
import { makeClient, priceFrom, tokenIsToken0, tradeEvent, swapEvent, type Env } from './index'

const migratedEvent = parseAbiItem(
  'event Migrated(address indexed token, address indexed pair, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee)',
)
const getCurveAbi = parseAbiItem(
  'function getCurve(address token) view returns ((uint128 virtualEth, uint128 virtualToken, uint128 realEth, uint128 tokensSold, bool graduated, address creator, uint16 protocolFeeBps, uint16 creatorFeeBps) curve)',
)
const pairForAbi = parseAbiItem(
  'function pairFor(address tokenA, address tokenB, bool stable) view returns (address pair)',
)

const POLL_MS = 1000

// Per-coin graduation state the hub needs to route pool swaps.
type CoinState = { graduated: boolean; pair: string | null }

// The exact JSON shape a browser receives per trade.
type TradeMessage = {
  type: 'trade'
  time: number
  price: number
  isBuy: boolean
  ethAmount: string
  tokenAmount: string
  trader: string
  block: string
  phase: 'curve' | 'pool'
}

export class LiveFeed {
  private state: DurableObjectState
  private env: Env
  private client: PublicClient

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.client = makeClient(env)
  }

  // A viewer connects: GET /ws/0x<token> (routed here by the Worker). The token
  // is carried as the socket's tag so the poll loop can fan out per coin.
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 })
    }
    const m = /\/ws\/(0x[0-9a-fA-F]{40})/.exec(new URL(req.url).pathname)
    const token = m ? m[1].toLowerCase() : null
    if (!token) return new Response('missing token', { status: 400 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    // Tag the socket with its coin so getWebSockets(token) routes trades to it.
    this.state.acceptWebSocket(server, [token])

    // Learn this coin's graduation/pair state once (only on a coin's first viewer).
    await this.ensureCoin(token)

    // Make sure the single poll loop is running.
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + POLL_MS)
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    if (msg === 'ping') ws.send('pong') // keepalive; ignore everything else
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code)
    } catch {
      /* already closed */
    }
  }

  async webSocketError(): Promise<void> {
    // Nothing to do; the socket drops out of getWebSockets() on its own.
  }

  async alarm(): Promise<void> {
    // Nobody watching: clear cursor + coin map so a later reconnect re-pins to
    // the head (never replays an hour of blocks), then hibernate. No reschedule.
    if (this.state.getWebSockets().length === 0) {
      await this.state.storage.delete(['lastBlock', 'coins'])
      return
    }

    try {
      await this.poll()
    } catch (e) {
      // Transient RPC hiccup: skip this tick and try again next second.
      console.error('livefeed poll failed:', e instanceof Error ? e.stack ?? e.message : String(e))
    }

    if (this.state.getWebSockets().length > 0) {
      await this.state.storage.setAlarm(Date.now() + POLL_MS)
    }
  }

  // Distinct coins with at least one live viewer, read from socket tags.
  private activeTokens(): Set<string> {
    const set = new Set<string>()
    for (const ws of this.state.getWebSockets()) {
      for (const t of this.state.getTags(ws)) set.add(t)
    }
    return set
  }

  // Record a coin's graduation/pair state the first time it is watched. Pin the
  // shared cursor to the chain head on the very first coin so we only ever stream
  // NEW trades (D1 owns the backfill).
  private async ensureCoin(token: string): Promise<void> {
    const coins = (await this.state.storage.get<Record<string, CoinState>>('coins')) ?? {}
    if (!coins[token]) {
      const launchpad = this.env.LAUNCHPAD.toLowerCase() as Address
      const weth = this.env.WETH.toLowerCase()
      const curve = await this.readCurve(launchpad, token)
      coins[token] = {
        graduated: curve.graduated,
        pair: curve.graduated ? await this.resolvePair(token, weth) : null,
      }
      await this.state.storage.put('coins', coins)
    }
    if ((await this.state.storage.get('lastBlock')) === undefined) {
      const head = await this.client.getBlockNumber()
      await this.state.storage.put('lastBlock', head.toString())
    }
  }

  private async poll(): Promise<void> {
    const launchpad = this.env.LAUNCHPAD.toLowerCase() as Address
    const weth = this.env.WETH.toLowerCase()
    const active = this.activeTokens()
    if (active.size === 0) return

    // Drop coins nobody watches anymore so the map and pair-poll stay small.
    const coins = (await this.state.storage.get<Record<string, CoinState>>('coins')) ?? {}
    for (const t of Object.keys(coins)) if (!active.has(t)) delete coins[t]

    const lastBlock = await this.state.storage.get<string>('lastBlock')
    const head = await this.client.getBlockNumber()
    const fromBlock = lastBlock !== undefined ? BigInt(lastBlock) + 1n : head
    if (fromBlock > head) return // nothing new; cursor unchanged

    // 1. One call: every curve Trade (all tokens) plus Migrated, for the window.
    const lpLogs = await this.client.getLogs({
      address: launchpad,
      events: [tradeEvent, migratedEvent],
      fromBlock,
      toBlock: head,
    })

    // 2. Learn graduations for coins we're watching, so we start reading their pair.
    for (const log of lpLogs) {
      if (log.eventName !== 'Migrated') continue
      const a = log.args as { token: Address; pair: Address }
      const t = a.token.toLowerCase()
      if (coins[t]) coins[t] = { graduated: true, pair: a.pair.toLowerCase() }
    }

    // 3. One call: pool Swaps across every watched graduated pair.
    const pairToToken = new Map<string, string>()
    for (const [t, c] of Object.entries(coins)) if (c.pair) pairToToken.set(c.pair, t)
    const pairAddrs = [...pairToToken.keys()]
    const swapLogs = pairAddrs.length
      ? await this.client.getLogs({ address: pairAddrs as Address[], event: swapEvent, fromBlock, toBlock: head })
      : []

    if (!lpLogs.length && !swapLogs.length) {
      await this.state.storage.put({ coins, lastBlock: head.toString() })
      return
    }

    const tsCache = await this.blockTimes([...lpLogs, ...swapLogs].map((l) => l.blockNumber ?? 0n))
    const is0For = (token: string) => tokenIsToken0(token, weth)

    // Group messages per coin, keyed by (block, logIndex) for ordering.
    const byToken = new Map<string, { key: [bigint, number]; msg: TradeMessage }[]>()
    const push = (token: string, key: [bigint, number], msg: TradeMessage) => {
      if (!active.has(token)) return
      const arr = byToken.get(token) ?? []
      arr.push({ key, msg })
      byToken.set(token, arr)
    }

    for (const log of lpLogs) {
      if (log.eventName !== 'Trade') continue
      const a = log.args as {
        token: Address
        trader: Address
        isBuy: boolean
        ethAmount: bigint
        tokenAmount: bigint
        virtualEth: bigint
        virtualToken: bigint
      }
      const token = a.token.toLowerCase()
      const block = log.blockNumber ?? 0n
      push(token, [block, log.logIndex ?? 0], {
        type: 'trade',
        time: tsCache.get(block) ?? 0,
        price: priceFrom(a.virtualEth ?? 0n, a.virtualToken ?? 0n),
        isBuy: a.isBuy ?? false,
        ethAmount: (a.ethAmount ?? 0n).toString(),
        tokenAmount: (a.tokenAmount ?? 0n).toString(),
        trader: (a.trader ?? '').toLowerCase(),
        block: block.toString(),
        phase: 'curve',
      })
    }

    for (const log of swapLogs) {
      const token = pairToToken.get((log.address ?? '').toLowerCase())
      if (!token) continue
      const a = log.args as {
        amount0In: bigint
        amount1In: bigint
        amount0Out: bigint
        amount1Out: bigint
        to: Address
      }
      const is0 = is0For(token)
      const block = log.blockNumber ?? 0n
      const tokIn = is0 ? a.amount0In ?? 0n : a.amount1In ?? 0n
      const tokOut = is0 ? a.amount0Out ?? 0n : a.amount1Out ?? 0n
      const wethIn = is0 ? a.amount1In ?? 0n : a.amount0In ?? 0n
      const wethOut = is0 ? a.amount1Out ?? 0n : a.amount0Out ?? 0n
      const isBuy = tokOut > 0n
      const ethAmount = isBuy ? wethIn : wethOut
      const tokenAmount = isBuy ? tokOut : tokIn
      const price = tokenAmount > 0n ? Number(ethAmount) / Number(tokenAmount) : 0
      push(token, [block, log.logIndex ?? 0], {
        type: 'trade',
        time: tsCache.get(block) ?? 0,
        price,
        isBuy,
        ethAmount: ethAmount.toString(),
        tokenAmount: tokenAmount.toString(),
        trader: (a.to ?? '').toLowerCase(),
        block: block.toString(),
        phase: 'pool',
      })
    }

    // Fan out: each coin's trades go only to sockets tagged with that coin.
    for (const [token, arr] of byToken) {
      arr.sort((x, y) => (x.key[0] === y.key[0] ? x.key[1] - y.key[1] : Number(x.key[0] - y.key[0])))
      const sockets = this.state.getWebSockets(token)
      if (!sockets.length) continue
      for (const { msg } of arr) {
        const json = JSON.stringify(msg)
        for (const ws of sockets) {
          try {
            ws.send(json)
          } catch {
            /* socket closing; hibernation will drop it */
          }
        }
      }
    }

    await this.state.storage.put({ coins, lastBlock: head.toString() })
  }

  private async readCurve(launchpad: Address, token: string) {
    return this.client.readContract({
      address: launchpad,
      abi: [getCurveAbi],
      functionName: 'getCurve',
      args: [token as Address],
    })
  }

  private async resolvePair(token: string, weth: string): Promise<string> {
    const p = await this.client.readContract({
      address: this.env.ROUTER.toLowerCase() as Address,
      abi: [pairForAbi],
      functionName: 'pairFor',
      args: [token as Address, weth as Address, false],
    })
    return (p as string).toLowerCase()
  }

  // Fetch (and cache locally for this tick) each block's timestamp.
  private async blockTimes(blocks: Iterable<bigint>): Promise<Map<bigint, number>> {
    const cache = new Map<bigint, number>()
    await Promise.all(
      [...new Set(blocks)].map(async (b) => {
        const blk = await this.client.getBlock({ blockNumber: b })
        cache.set(b, Number(blk.timestamp))
      }),
    )
    return cache
  }
}

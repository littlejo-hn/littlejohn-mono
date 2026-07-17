import type { Address, PublicClient } from 'viem'
import { getAbiItem } from 'viem'
import { launchpadAbi, pairAbi, routerAbi } from '../abis'
import { ZERO } from '../config/contracts'

export const tradeEvent = getAbiItem({ abi: launchpadAbi, name: 'Trade' })
export const syncEvent = getAbiItem({ abi: pairAbi, name: 'Sync' })
export const swapEvent = getAbiItem({ abi: pairAbi, name: 'Swap' })

export type TradePoint = {
  time: number // unix seconds (block timestamp)
  price: number // ETH per whole token (virtualEth / virtualToken)
  isBuy: boolean
  ethAmount: bigint
  tokenAmount: bigint
  trader: Address
  traderName?: string | null
  traderAvatar?: string | null
  block: bigint
}

export type Candle = { time: number; open: number; high: number; low: number; close: number }

// Price of a token from a Trade event's post-trade reserves. Both reserves are
// 1e18-scaled, so the ratio is ETH per whole token directly.
export function priceFrom(virtualEth: bigint, virtualToken: bigint): number {
  return Number(virtualEth) / Number(virtualToken)
}

/** Recent Trade history for one token. Bounded window keeps it snappy without an indexer. */
export async function fetchTradeHistory(
  pub: PublicClient,
  launchpad: Address,
  token: Address,
  lookback = 20_000n,
): Promise<TradePoint[]> {
  const latest = await pub.getBlockNumber()
  const fromBlock = latest > lookback ? latest - lookback : 0n
  const logs = await pub.getLogs({
    address: launchpad,
    event: tradeEvent,
    args: { token },
    fromBlock,
    toBlock: latest,
  })
  // Resolve block timestamps once per unique block.
  const blocks = [...new Set(logs.map((l) => l.blockNumber!))]
  const times = new Map<bigint, number>()
  await Promise.all(
    blocks.map(async (b) => {
      const blk = await pub.getBlock({ blockNumber: b })
      times.set(b, Number(blk.timestamp))
    }),
  )
  return logs.map((l) => {
    const a = l.args as { isBuy: boolean; ethAmount: bigint; tokenAmount: bigint; virtualEth: bigint; virtualToken: bigint; trader: Address }
    return {
      time: times.get(l.blockNumber!) ?? 0,
      price: priceFrom(a.virtualEth, a.virtualToken),
      isBuy: a.isBuy,
      ethAmount: a.ethAmount,
      tokenAmount: a.tokenAmount,
      trader: a.trader,
      block: l.blockNumber!,
    }
  })
}

/** Bucket price points into OHLC candles of `intervalSec`. */
export function buildCandles(points: TradePoint[], intervalSec = 60): Candle[] {
  const byBucket = new Map<number, Candle>()
  for (const p of points) {
    if (!p.time) continue
    const bucket = Math.floor(p.time / intervalSec) * intervalSec
    const c = byBucket.get(bucket)
    if (!c) {
      byBucket.set(bucket, { time: bucket, open: p.price, high: p.price, low: p.price, close: p.price })
    } else {
      c.high = Math.max(c.high, p.price)
      c.low = Math.min(c.low, p.price)
      c.close = p.price
    }
  }
  return [...byBucket.values()].sort((a, b) => a.time - b.time)
}

/** Post-graduation price history from the ve(3,3) pool's Sync events. Side and
 *  amounts are inferred from consecutive-reserve deltas (Sync has no trader). */
export async function fetchPoolHistory(
  pub: PublicClient,
  pair: Address,
  tokenIsToken0: boolean,
  lookback = 20_000n,
): Promise<TradePoint[]> {
  const latest = await pub.getBlockNumber()
  const fromBlock = latest > lookback ? latest - lookback : 0n
  const logs = await pub.getLogs({ address: pair, event: syncEvent, fromBlock, toBlock: latest })
  const sorted = [...logs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : Number(a.blockNumber! - b.blockNumber!),
  )
  const blocks = [...new Set(sorted.map((l) => l.blockNumber!))]
  const times = new Map<bigint, number>()
  await Promise.all(blocks.map(async (b) => { times.set(b, Number((await pub.getBlock({ blockNumber: b })).timestamp)) }))

  const out: TradePoint[] = []
  let prev: { tok: bigint; weth: bigint } | null = null
  for (const l of sorted) {
    const a = l.args as { reserve0: bigint; reserve1: bigint }
    const tok = tokenIsToken0 ? a.reserve0 : a.reserve1
    const weth = tokenIsToken0 ? a.reserve1 : a.reserve0
    if (tok === 0n) { prev = null; continue }
    const price = Number(weth) / Number(tok)
    let isBuy = true, ethAmount = weth, tokenAmount = tok
    if (prev) {
      const dTok = tok - prev.tok
      isBuy = dTok < 0n // token left the pool => a buy
      tokenAmount = dTok < 0n ? -dTok : dTok
      const dEth = weth - prev.weth
      ethAmount = dEth < 0n ? -dEth : dEth
    }
    out.push({ time: times.get(l.blockNumber!) ?? 0, price, isBuy, ethAmount, tokenAmount, trader: ZERO, block: l.blockNumber! })
    prev = { tok, weth }
  }
  return out
}

/** History points from the indexer API (scales, no getLogs). Null on failure so
 *  callers fall back to on-chain reads. Chart candles + feed build from these. */
export async function fetchApiTrades(token: Address, limit = 2000): Promise<TradePoint[] | null> {
  try {
    const r = await fetch(`/api/trades/${token}?limit=${limit}`)
    if (!r.ok) return null
    const d = (await r.json()) as { trades?: Array<{ ts: number | null; price: number | null; is_buy: boolean; eth_amount: string | null; token_amount: string | null; trader: string | null; block: number; trader_name: string | null; trader_avatar: string | null }> }
    return (d.trades ?? [])
      .map((t) => ({
        time: t.ts ?? 0,
        price: t.price ?? 0,
        isBuy: t.is_buy,
        ethAmount: BigInt(t.eth_amount ?? '0'),
        tokenAmount: BigInt(t.token_amount ?? '0'),
        trader: (t.trader ?? ZERO) as Address,
        traderName: t.trader_name,
        traderAvatar: t.trader_avatar,
        block: BigInt(t.block ?? 0),
      }))
      .sort((a, b) => a.time - b.time || Number(a.block - b.block))
  } catch { return null }
}

/** Pre-aggregated OHLC candles from the indexer API (no client-side bucketing).
 *  `res` is the bucket width in seconds. Prices are ETH per whole token — same
 *  units as buildCandles, so callers apply the mcap/ccy multiplier identically.
 *  Null on failure so the chart falls back to building candles from trades. */
export async function fetchCandles(token: Address, res: number): Promise<Candle[] | null> {
  try {
    const r = await fetch(`/api/candles/${token}?res=${res}`)
    if (!r.ok) return null
    const d = (await r.json()) as { candles?: Array<{ time: number; open: number; high: number; low: number; close: number }> }
    if (!d.candles) return null
    return d.candles
      .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
      .sort((a, b) => a.time - b.time)
  } catch { return null }
}

export type HolderRow = { address: Address; balance: bigint; pct: number; label: 'curve' | 'pool' | 'dev' | null }
export type HoldersData = { count: number; devPct: number; holders: HolderRow[] }

/** Top holders + real holder count from the indexer API (Transfer-derived
 *  balances). System addresses (curve, pool) are labeled, not counted. */
export async function fetchHolders(token: Address, limit = 20): Promise<HoldersData | null> {
  try {
    const r = await fetch(`/api/holders/${token}?limit=${limit}`)
    if (!r.ok) return null
    const d = (await r.json()) as {
      count: number
      devPct: number
      holders: Array<{ address: string; balance: string; pct: number; label: HolderRow['label'] }>
    }
    return {
      count: d.count ?? 0,
      devPct: d.devPct ?? 0,
      holders: (d.holders ?? []).map((h) => ({
        address: h.address as Address,
        balance: BigInt(h.balance),
        pct: h.pct,
        label: h.label,
      })),
    }
  } catch {
    return null
  }
}

/** Full price history: curve Trade events + (if graduated) pool Sync events, stitched. */
export async function fetchTokenHistory(
  pub: PublicClient,
  launchpad: Address,
  router: Address,
  token: Address,
  weth: Address,
): Promise<TradePoint[]> {
  const curve = await fetchTradeHistory(pub, launchpad, token)
  let pool: TradePoint[] = []
  try {
    const pair = (await pub.readContract({ address: router, abi: routerAbi, functionName: 'pairFor', args: [token, weth, false] })) as Address
    // metadata() => (dec0, dec1, r0, r1, stable, token0, token1)
    const meta = (await pub.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' })) as readonly [bigint, bigint, bigint, bigint, boolean, Address, Address]
    pool = await fetchPoolHistory(pub, pair, meta[5].toLowerCase() === token.toLowerCase())
  } catch { /* no pool yet (still on the curve) */ }
  return [...curve, ...pool].sort((a, b) => a.time - b.time || Number(a.block - b.block))
}

async function blockTimes(pub: PublicClient, logs: { blockNumber: bigint | null }[]): Promise<Map<bigint, number>> {
  const blocks = [...new Set(logs.map((l) => l.blockNumber!))]
  const m = new Map<bigint, number>()
  await Promise.all(blocks.map(async (b) => { m.set(b, Number((await pub.getBlock({ blockNumber: b })).timestamp)) }))
  return m
}

/** One wallet's trades on a token: curve Trade events (trader indexed) plus pool
 *  Swap events (to indexed). Used to plot dev / your own entries on the chart. */
export async function fetchWalletTrades(
  pub: PublicClient,
  launchpad: Address,
  router: Address,
  token: Address,
  weth: Address,
  wallet: Address,
  lookback = 20_000n,
): Promise<TradePoint[]> {
  const latest = await pub.getBlockNumber()
  const fromBlock = latest > lookback ? latest - lookback : 0n
  const pts: TradePoint[] = []

  const cLogs = await pub.getLogs({ address: launchpad, event: tradeEvent, args: { token, trader: wallet }, fromBlock, toBlock: latest })
  const cT = await blockTimes(pub, cLogs)
  for (const l of cLogs) {
    const a = l.args as { isBuy: boolean; ethAmount: bigint; tokenAmount: bigint; virtualEth: bigint; virtualToken: bigint }
    pts.push({ time: cT.get(l.blockNumber!) ?? 0, price: priceFrom(a.virtualEth, a.virtualToken), isBuy: a.isBuy, ethAmount: a.ethAmount, tokenAmount: a.tokenAmount, trader: wallet, block: l.blockNumber! })
  }

  try {
    const pair = (await pub.readContract({ address: router, abi: routerAbi, functionName: 'pairFor', args: [token, weth, false] })) as Address
    const meta = (await pub.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' })) as readonly [bigint, bigint, bigint, bigint, boolean, Address, Address]
    const tokIs0 = meta[5].toLowerCase() === token.toLowerCase()
    const sLogs = await pub.getLogs({ address: pair, event: swapEvent, args: { to: wallet }, fromBlock, toBlock: latest })
    const sT = await blockTimes(pub, sLogs)
    for (const l of sLogs) {
      const a = l.args as { amount0In: bigint; amount1In: bigint; amount0Out: bigint; amount1Out: bigint }
      const tokIn = tokIs0 ? a.amount0In : a.amount1In
      const tokOut = tokIs0 ? a.amount0Out : a.amount1Out
      const wethIn = tokIs0 ? a.amount1In : a.amount0In
      const wethOut = tokIs0 ? a.amount1Out : a.amount0Out
      const isBuy = tokOut > 0n
      const ethAmount = isBuy ? wethIn : wethOut
      const tokenAmount = isBuy ? tokOut : tokIn
      pts.push({ time: sT.get(l.blockNumber!) ?? 0, price: tokenAmount > 0n ? Number(ethAmount) / Number(tokenAmount) : 0, isBuy, ethAmount, tokenAmount, trader: wallet, block: l.blockNumber! })
    }
  } catch { /* no pool */ }

  return pts.sort((a, b) => a.time - b.time || Number(a.block - b.block))
}

/** Average entry price (ETH per token) from a wallet's buys. 0 if none. */
export function avgEntryPrice(trades: TradePoint[]): number {
  let eth = 0, tok = 0
  for (const t of trades) if (t.isBuy) { eth += Number(t.ethAmount); tok += Number(t.tokenAmount) }
  return tok > 0 ? eth / tok : 0
}

/** ETH/USD derived from the WETH/USDG pool (USDG ~= $1). Falls back to a
 *  constant when no such pool exists yet (e.g. testnet). */
export async function fetchEthUsd(
  pub: PublicClient,
  router: Address,
  weth: Address,
  usdg: Address,
  fallback: number,
): Promise<number> {
  try {
    const pair = (await pub.readContract({ address: router, abi: routerAbi, functionName: 'pairFor', args: [weth, usdg, false] })) as Address
    const m = (await pub.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' })) as readonly [bigint, bigint, bigint, bigint, boolean, Address, Address]
    const wethIs0 = m[5].toLowerCase() === weth.toLowerCase()
    const wethR = wethIs0 ? Number(m[2]) / 10 ** Number(m[0]) : Number(m[3]) / 10 ** Number(m[1])
    const usdgR = wethIs0 ? Number(m[3]) / 10 ** Number(m[1]) : Number(m[2]) / 10 ** Number(m[0])
    if (wethR > 0 && usdgR > 0) return usdgR / wethR
  } catch { /* no pool, use fallback */ }
  return fallback
}

// Live trade push from the indexer's Durable Object (one poller per coin, fanned
// out over WebSocket). Sub-second, and it covers both curve and pool phases, so
// the caller does not branch on graduation. Auto-reconnects; returns unsubscribe.
const LIVE_WS = (import.meta.env.VITE_LIVE_WS as string) || 'wss://littlejohn-indexer.spirits-defi.workers.dev'
export function watchLive(token: Address, onTrade: (p: TradePoint) => void): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let ping: ReturnType<typeof setInterval> | undefined
  const connect = () => {
    if (closed) return
    try { ws = new WebSocket(`${LIVE_WS}/ws/${token}`) } catch { return }
    ws.onopen = () => { ping = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send('ping') }, 25000) }
    ws.onmessage = (e) => {
      if (e.data === 'pong') return
      try {
        const m = JSON.parse(e.data as string) as { type?: string; time: number; price: number; isBuy: boolean; ethAmount: string; tokenAmount: string; trader: string; block: string }
        if (m.type !== 'trade') return
        onTrade({ time: m.time, price: m.price, isBuy: m.isBuy, ethAmount: BigInt(m.ethAmount), tokenAmount: BigInt(m.tokenAmount), trader: m.trader as Address, block: BigInt(m.block) })
      } catch { /* ignore malformed frame */ }
    }
    ws.onclose = () => { clearInterval(ping); if (!closed) setTimeout(connect, 2000) }
    ws.onerror = () => { ws?.close() }
  }
  connect()
  return () => { closed = true; clearInterval(ping); ws?.close() }
}

/** Live subscription to pool Sync events (post-graduation). */
export function watchPoolTrades(
  pub: PublicClient,
  pair: Address,
  tokenIsToken0: boolean,
  onTrade: (p: TradePoint) => void,
): () => void {
  let prev: { tok: bigint; weth: bigint } | null = null
  return pub.watchEvent({
    address: pair,
    event: syncEvent,
    pollingInterval: 2000, // ~2s liveness (chain has no wss; upgrade path is a DO fan-out)
    onLogs: async (logs) => {
      for (const l of logs) {
        const a = l.args as { reserve0: bigint; reserve1: bigint }
        const tok = tokenIsToken0 ? a.reserve0 : a.reserve1
        const weth = tokenIsToken0 ? a.reserve1 : a.reserve0
        if (tok === 0n) { prev = null; continue }
        let isBuy = true, ethAmount = weth, tokenAmount = tok
        if (prev) {
          const dTok = tok - prev.tok
          isBuy = dTok < 0n
          tokenAmount = dTok < 0n ? -dTok : dTok
          const dEth = weth - prev.weth
          ethAmount = dEth < 0n ? -dEth : dEth
        }
        let time = Math.floor(Date.now() / 1000)
        try { if (l.blockNumber != null) time = Number((await pub.getBlock({ blockNumber: l.blockNumber })).timestamp) } catch { /* wall clock */ }
        onTrade({ time, price: Number(weth) / Number(tok), isBuy, ethAmount, tokenAmount, trader: ZERO, block: l.blockNumber ?? 0n })
        prev = { tok, weth }
      }
    },
  })
}

/** Live subscription to new trades for a token. Returns an unsubscribe fn. */
export function watchTrades(
  pub: PublicClient,
  launchpad: Address,
  token: Address,
  onTrade: (p: TradePoint) => void,
): () => void {
  return pub.watchEvent({
    address: launchpad,
    event: tradeEvent,
    args: { token },
    pollingInterval: 2000, // ~2s liveness (chain has no wss; upgrade path is a DO fan-out)
    onLogs: async (logs) => {
      for (const l of logs) {
        const a = l.args as { isBuy: boolean; ethAmount: bigint; tokenAmount: bigint; virtualEth: bigint; virtualToken: bigint; trader: Address }
        let time = Math.floor(Date.now() / 1000)
        try {
          if (l.blockNumber != null) time = Number((await pub.getBlock({ blockNumber: l.blockNumber })).timestamp)
        } catch { /* fall back to wall clock */ }
        onTrade({
          time,
          price: priceFrom(a.virtualEth, a.virtualToken),
          isBuy: a.isBuy,
          ethAmount: a.ethAmount,
          tokenAmount: a.tokenAmount,
          trader: a.trader,
          block: l.blockNumber ?? 0n,
        })
      }
    },
  })
}

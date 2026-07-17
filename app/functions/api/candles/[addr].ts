// GET /api/candles/:addr?res=60 — OHLCV candles from the Ponder indexer. `res` is
// the bucket width in seconds. Standard resolutions read the pre-aggregated candle
// table (fast); any other res falls back to bucketing raw trades.

import { json, ponderQuery, type Env } from '../_ponder'

const RES_TO_INTERVAL: Record<number, string> = {
  60: '1m',
  300: '5m',
  900: '15m',
  3600: '1h',
  14400: '4h',
  86400: '1d',
}

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const addr = String(params.addr ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: 'invalid address' }, 400)

  const url = new URL(request.url)
  let res = parseInt(url.searchParams.get('res') ?? '60', 10)
  if (!Number.isFinite(res) || res <= 0) res = 60

  try {
    const interval = RES_TO_INTERVAL[res]
    if (interval) {
      // Fast path: pre-aggregated candles for a standard interval.
      const query = `{ candles(where:{token:"${addr}", interval:"${interval}"}, orderBy:"bucketStart", orderDirection:"asc", limit:1000){
        items{ bucketStart open high low close volumeEth }
      } }`
      const data = await ponderQuery<{ candles: { items: any[] } }>(env, query)
      const candles: Candle[] = (data.candles?.items ?? []).map((c) => ({
        time: c.bucketStart,
        open: Number(c.open) / 1e18,
        high: Number(c.high) / 1e18,
        low: Number(c.low) / 1e18,
        close: Number(c.close) / 1e18,
        volume: Number(c.volumeEth) / 1e18,
      }))
      return json({ candles })
    }

    // Fallback: bucket raw trades for a non-standard resolution.
    const query = `{ trades(where:{token:"${addr}"}, orderBy:"block", orderDirection:"asc", limit:1000){
      items{ priceWei ethAmount timestamp }
    } }`
    const data = await ponderQuery<{ trades: { items: any[] } }>(env, query)
    const buckets = new Map<number, Candle>()
    for (const t of data.trades?.items ?? []) {
      if (t.timestamp == null) continue
      const time = Math.floor(t.timestamp / res) * res
      const price = Number(t.priceWei) / 1e18
      const vol = Number(t.ethAmount) / 1e18
      const b = buckets.get(time)
      if (!b) buckets.set(time, { time, open: price, high: price, low: price, close: price, volume: vol })
      else {
        b.high = Math.max(b.high, price)
        b.low = Math.min(b.low, price)
        b.close = price // trades are block-ascending, so last wins
        b.volume += vol
      }
    }
    const candles = [...buckets.values()].sort((a, b) => a.time - b.time)
    return json({ candles })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

import { useEffect, useRef, useState } from 'react'
import { formatEther } from 'viem'
import {
  createChart, CandlestickSeries, HistogramSeries, ColorType, LineStyle,
  type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp,
} from 'lightweight-charts'
import { buildCandles, fetchCandles, type Candle, type TradePoint } from '../lib/trades'
import type { Address } from 'viem'
import { TradeBadges, type Badge } from './tradeBadges'
import { ArrowsOut, ArrowsIn } from '@phosphor-icons/react'

type MarkerTrade = TradePoint & { kind: 'dev' | 'you' }

const GOLD = '#e6e9ef'
const RED = '#f6465d'
const GREEN = '#34e29a'
const BLUE = '#7C9EFF'
const DIM = '#8b929e'
const LINE = 'rgba(255,255,255,.06)'
const BUY = '#34e29a'   // badge: buy / dev-bought
const SELL = '#f6465d'  // badge: sell / dev-sold

const SUPPLY_WHOLE = 1_000_000_000

const TIMEFRAMES = [
  { label: '1m', s: 60 }, { label: '5m', s: 300 }, { label: '15m', s: 900 },
  { label: '1h', s: 3600 }, { label: '1d', s: 86400 },
]

function usd(v: number): string {
  if (!isFinite(v) || v <= 0) return '$0'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(2)}`
}

function eth(v: number): string {
  if (!isFinite(v) || v <= 0) return 'Ξ0'
  if (v >= 1) return `Ξ${v.toFixed(2)}`
  if (v >= 0.0001) return `Ξ${v.toFixed(5)}`
  return `Ξ${v.toExponential(2)}`
}

export function TokenChart({ addr, points, ethUsd, gradPrice, markers, avgEntry }: {
  addr?: Address; points: TradePoint[]; ethUsd: number; gradPrice: number; markers: MarkerTrade[]; avgEntry: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const badgesRef = useRef<TradeBadges | null>(null)
  const gradLineRef = useRef<IPriceLine | null>(null)
  const avgLineRef = useRef<IPriceLine | null>(null)
  const bucketMap = useRef<Map<number, MarkerTrade[]>>(new Map())
  const candleRangeRef = useRef<{ low: number; high: number }[]>([])
  const ethUsdRef = useRef(ethUsd)
  const [res, setRes] = useState(60)
  const [apiCandles, setApiCandles] = useState<Candle[] | null>(null)
  const [showDev, setShowDev] = useState(true)
  const [denom, setDenom] = useState<'mcap' | 'price'>('mcap')
  const [ccy, setCcy] = useState<'usd' | 'eth'>('usd')
  const ccyRef = useRef<'usd' | 'eth'>('usd')
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  // Pull pre-aggregated OHLC from the indexer for the current resolution (fast path).
  // Falls back to client-side candles built from `points` when this returns null.
  useEffect(() => {
    if (!addr) { setApiCandles(null); return }
    let live = true
    setApiCandles(null)
    fetchCandles(addr, res).then((c) => { if (live) setApiCandles(c) })
    return () => { live = false }
  }, [addr, res])

  useEffect(() => {
    if (!box.current) return
    const chart = createChart(box.current, {
      width: box.current.clientWidth,
      height: box.current.clientHeight,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: DIM, fontFamily: 'inherit', fontSize: 11 },
      grid: { vertLines: { color: LINE }, horzLines: { color: LINE } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: LINE },
      rightPriceScale: { borderColor: LINE },
      crosshair: { horzLine: { labelBackgroundColor: GOLD }, vertLine: { labelBackgroundColor: GOLD } },
      handleScale: false, handleScroll: false,
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: GREEN, borderUpColor: GREEN, wickUpColor: GREEN,
      downColor: RED, borderDownColor: RED, wickDownColor: RED,
      priceFormat: { type: 'custom', formatter: (v: number) => (ccyRef.current === 'usd' ? usd(v) : eth(v)), minMove: 0.0001 },
      // Scale to the candles (+ padding), NOT the graduation line, so the far-off
      // grad target never squishes the bars. The line comes into view as price nears it.
      autoscaleInfoProvider: () => {
        const cs = candleRangeRef.current
        if (!cs.length) return null
        let lo = Infinity, hi = -Infinity
        for (const c of cs) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high }
        if (!isFinite(lo) || !isFinite(hi)) return null
        const pad = (hi - lo) * 0.14 || hi * 0.08 || 1
        return { priceRange: { minValue: Math.max(0, lo - pad), maxValue: hi + pad } }
      },
    })
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    chartRef.current = chart
    candleRef.current = candle
    volRef.current = vol
    const badges = new TradeBadges()
    candle.attachPrimitive(badges)
    badgesRef.current = badges

    chart.subscribeCrosshairMove((param) => {
      const el = tip.current
      if (!el) return
      const t = param.time as number | undefined
      const trades = t != null ? bucketMap.current.get(t) : undefined
      if (!trades || !trades.length || !param.point) { el.style.display = 'none'; return }
      el.innerHTML = trades.slice(0, 6).map((r) => {
        const who = r.kind === 'dev' ? 'DEV' : 'YOU'
        const eth = Number(formatEther(r.ethAmount)).toPrecision(2)
        return `<div><b style="color:${r.kind === 'dev' ? BLUE : GOLD}">${who} ${r.isBuy ? 'BUY' : 'SELL'}</b> ${eth} ETH @ ${usd(r.price * SUPPLY_WHOLE * ethUsdRef.current)}</div>`
      }).join('')
      el.style.display = 'block'
      const w = box.current?.clientWidth ?? 300
      el.style.left = `${Math.min(param.point.x + 12, w - 150)}px`
      el.style.top = `${param.point.y + 12}px`
    })

    const ro = new ResizeObserver(() => { if (box.current) chart.applyOptions({ width: box.current.clientWidth, height: box.current.clientHeight }) })
    ro.observe(box.current)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = candleRef.current = volRef.current = null; badgesRef.current = null; gradLineRef.current = avgLineRef.current = null }
  }, [])

  useEffect(() => {
    const candle = candleRef.current, vol = volRef.current
    if (!candle || !vol) return
    ethUsdRef.current = ethUsd
    ccyRef.current = ccy
    const mult = denom === 'mcap'
      ? (ccy === 'usd' ? SUPPLY_WHOLE * ethUsd : SUPPLY_WHOLE)
      : (ccy === 'usd' ? ethUsd : 1)

    // Base candles: pre-aggregated from the indexer when available (fast path),
    // else built client-side from raw trades. Then overlay live trades newer than
    // the last indexed bucket so the current bar keeps ticking between refreshes.
    const raw = ((): Candle[] => {
      if (!apiCandles) return buildCandles(points, res)
      const lastT = apiCandles.length ? apiCandles[apiCandles.length - 1].time : 0
      const livePts = points.filter((p) => p.time && Math.floor(p.time / res) * res >= lastT)
      if (!livePts.length) return apiCandles
      const merged = new Map(apiCandles.map((c) => [c.time, { ...c }]))
      for (const lc of buildCandles(livePts, res)) {
        const ex = merged.get(lc.time)
        if (ex) { ex.high = Math.max(ex.high, lc.high); ex.low = Math.min(ex.low, lc.low); ex.close = lc.close }
        else merged.set(lc.time, lc)
      }
      return [...merged.values()].sort((a, b) => a.time - b.time)
    })()
    const candles = raw.map((c) => ({
      time: c.time as UTCTimestamp, open: c.open * mult, high: c.high * mult, low: c.low * mult, close: c.close * mult,
    }))
    candle.setData(candles)
    candleRangeRef.current = candles // drives autoscale (candles only, not the grad line)

    // candle geometry per bucket, so badges can anchor off the wick (GMGN-style)
    const cmap = new Map(candles.map((c) => [c.time as number, c]))
    const dir = new Map(candles.map((c) => [c.time as number, c.close >= c.open]))
    const volByBucket = new Map<number, number>()
    for (const p of points) {
      if (!p.time) continue
      const b = Math.floor(p.time / res) * res
      volByBucket.set(b, (volByBucket.get(b) ?? 0) + Number(formatEther(p.ethAmount)) * ethUsd)
    }
    vol.setData([...volByBucket.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({
      time: t as UTCTimestamp, value: v, color: dir.get(t) ? 'rgba(38,203,124,.35)' : 'rgba(246,70,93,.35)',
    })))

    // GMGN-style badges: aggregate trades per (bucket, kind, side) into one badge + count.
    // DB/DS = dev bought/sold, B/S = your own trades (gold ring). Dev capped + toggleable.
    const MAX_DEV = 12
    const bmap = new Map<number, MarkerTrade[]>()
    const agg = new Map<string, Badge & { kind: 'dev' | 'you' }>()
    for (const m of [...markers].sort((a, b) => a.time - b.time)) {
      if (!m.time) continue
      const b = Math.floor(m.time / res) * res
      bmap.set(b, [...(bmap.get(b) ?? []), m])
      const key = `${b}-${m.kind}-${m.isBuy}`
      const cur = agg.get(key)
      if (cur) { cur.count = (cur.count ?? 1) + 1; cur.price = m.price * mult }
      else agg.set(key, {
        time: b,
        price: (m.isBuy ? cmap.get(b)?.low : cmap.get(b)?.high) ?? m.price * mult, // anchor off the wick
        code: m.kind === 'dev' ? (m.isBuy ? 'DB' : 'DS') : (m.isBuy ? 'B' : 'S'),
        fill: m.isBuy ? BUY : SELL, ring: m.kind === 'you', count: 1, below: m.isBuy, kind: m.kind,
      })
    }
    bucketMap.current = bmap
    const youB: Badge[] = [], devB: Badge[] = []
    for (const a of agg.values()) (a.kind === 'dev' ? devB : youB).push(a)
    badgesRef.current?.setBadges([...youB, ...(showDev ? devB.slice(-MAX_DEV) : [])])

    if (gradLineRef.current) { candle.removePriceLine(gradLineRef.current); gradLineRef.current = null }
    const gradMcap = gradPrice * mult
    if (isFinite(gradMcap) && gradMcap > 0) {
      gradLineRef.current = candle.createPriceLine({ price: gradMcap, color: BLUE, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'graduation' })
    }
    if (avgLineRef.current) { candle.removePriceLine(avgLineRef.current); avgLineRef.current = null }
    const avgMcap = avgEntry * mult
    if (isFinite(avgMcap) && avgMcap > 0) {
      avgLineRef.current = candle.createPriceLine({ price: avgMcap, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'your avg' })
    }
    chartRef.current?.timeScale().fitContent()
  }, [apiCandles, points, res, ethUsd, gradPrice, markers, avgEntry, showDev, denom, ccy])

  return (
    <div className={`chart ${full ? 'chart-full' : ''}`}>
      <div className="chart-tf">
        {TIMEFRAMES.map((t) => (
          <button key={t.s} className={res === t.s ? 'active' : ''} onClick={() => setRes(t.s)}>{t.label}</button>
        ))}
        <div className="chart-tf-right">
          <button className="chart-toggle" onClick={() => setDenom((x) => (x === 'mcap' ? 'price' : 'mcap'))} title="Market cap / price">{denom === 'mcap' ? 'MCap' : 'Price'}</button>
          <button className="chart-toggle" onClick={() => setCcy((x) => (x === 'usd' ? 'eth' : 'usd'))} title="Denomination">{ccy.toUpperCase()}</button>
          <button className={`chart-toggle ${showDev ? 'active' : ''}`} onClick={() => setShowDev((v) => !v)} title="Show the creator's trades on the chart">Dev trades</button>
          <button className="chart-toggle" onClick={() => setFull((v) => !v)} title="Fullscreen">{full ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}</button>
        </div>
      </div>
      <div ref={box} className="chart-canvas" />
      <div ref={tip} className="chart-tip" />
      {points.length === 0 && !apiCandles?.length && <div className="chart-empty">No trades yet</div>}
    </div>
  )
}

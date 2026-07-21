import { useCallback, useEffect, useState } from 'react'
import { TrendUp, Sparkle, Rocket, ChartLineUp } from '@phosphor-icons/react'
import { Avatar } from '../components/Avatar'
import { TokenDrawer } from '../components/TokenDrawer'

// The RH-Chain-native terminal. Chain-wide across every pad/DEX (via /api/trenches,
// composed from GeckoTerminal), ranked wash-resistant. GMGN doesn't have RH as a
// real tab — this is the RH-first trenches board.

type Coin = {
  pool: string
  address: string
  symbol: string
  name: string
  image: string | null
  dex: string
  priceUsd: number
  fdvUsd: number
  liqUsd: number
  vol24: number
  vol1h: number
  chg24: number
  chg1h: number
  buys24: number
  sells24: number
  buyers24: number
  sellers24: number
  createdTs: number
}

type Feed = 'trending' | 'new' | 'gainers' | 'top'
const FEEDS: { id: Feed; label: string; Ico: typeof TrendUp }[] = [
  { id: 'trending', label: 'Trending', Ico: TrendUp },
  { id: 'new', label: 'New', Ico: Sparkle },
  { id: 'gainers', label: 'Gainers', Ico: ChartLineUp },
  { id: 'top', label: 'Top', Ico: Rocket },
]

function usd(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v > 0) return `$${v.toPrecision(2)}`
  return '—'
}
function age(ts: number): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(v > -100 && v < 100 ? 1 : 0)}%`

export function Trenches() {
  const [feed, setFeed] = useState<Feed>('trending')
  const [coins, setCoins] = useState<Coin[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Coin | null>(null)

  const load = useCallback(async (f: Feed) => {
    setLoading(true); setErr(null)
    try {
      // "New" reads the chain directly (0-lag launch firehose); the rest use the
      // GeckoTerminal-composed board where lag doesn't matter.
      const res = await fetch(f === 'new' ? '/api/firehose' : `/api/trenches?feed=${f}`)
      const data = (await res.json()) as { tokens?: Coin[]; error?: string }
      if (data.error && !(data.tokens || []).length) throw new Error(data.error)
      setCoins(data.tokens ?? [])
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCoins([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(feed) }, [feed, load])
  // Refresh: the firehose ("New") ticks fast to stay near-real-time; the rest are
  // edge-cached and cheap, so a slower cadence is fine.
  useEffect(() => {
    const id = setInterval(() => load(feed), feed === 'new' ? 5_000 : 20_000)
    return () => clearInterval(id)
  }, [feed, load])

  return (
    <div className="term">
      <div className="term-head">
        <div>
          <div className="term-title">The Robinhood Chain trenches</div>
          <div className="term-sub">Every launch, every pad, in one place — ranked by real buyers, not washed volume.</div>
        </div>
        <div className="feed-pills">
          {FEEDS.map(({ id, label, Ico }) => (
            <button key={id} className={`fpill ${feed === id ? 'on' : ''}`} onClick={() => setFeed(id)}>
              <Ico size={15} weight={feed === id ? 'fill' : 'regular'} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="term-table">
        <div className="term-row term-hrow">
          <span className="tc-rank">#</span>
          <span className="tc-tok">Token</span>
          <span className="tc-num">Price</span>
          <span className="tc-num">1h</span>
          <span className="tc-num">24h</span>
          <span className="tc-num">MC</span>
          <span className="tc-num">Vol 24h</span>
          <span className="tc-num">Liq</span>
          <span className="tc-num">Buys/Sells</span>
          <span className="tc-num">Age</span>
        </div>

        {loading && coins.length === 0 && Array.from({ length: 12 }).map((_, i) => (
          <div className="term-row" key={i}><span className="tc-rank">{i + 1}</span><span className="tc-tok"><span className="term-skel" /></span></div>
        ))}

        {!loading && err && coins.length === 0 && (
          <div className="term-empty">Couldn't reach the feed. <button className="board-clear" onClick={() => load(feed)}>Retry</button></div>
        )}
        {!loading && !err && coins.length === 0 && <div className="term-empty">Nothing here yet.</div>}

        {coins.map((c, i) => (
          <div
            key={c.pool || c.address}
            className="term-row term-coin"
            role="button"
            tabIndex={0}
            onClick={() => setSel(c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(c) } }}
          >
            <span className="tc-rank">{i + 1}</span>
            <span className="tc-tok">
              <Avatar className="tc-img" image={c.image ?? undefined} symbol={c.symbol} addr={c.address} />
              <span className="tc-toktext">
                <span className="tc-sym">{c.symbol}{age(c.createdTs) && Date.now() / 1000 - c.createdTs < 3600 && <em className="tc-fresh">NEW</em>}</span>
                <span className="tc-name">{c.name}</span>
              </span>
            </span>
            <span className="tc-num num">{usd(c.priceUsd)}</span>
            <span className={`tc-num num ${c.chg1h >= 0 ? 'up' : 'down'}`}>{pct(c.chg1h)}</span>
            <span className={`tc-num num ${c.chg24 >= 0 ? 'up' : 'down'}`}>{pct(c.chg24)}</span>
            <span className="tc-num num">{usd(c.fdvUsd)}</span>
            <span className="tc-num num">{usd(c.vol24)}</span>
            <span className={`tc-num num ${c.liqUsd < 2000 ? 'warn' : ''}`}>{usd(c.liqUsd)}</span>
            <span className="tc-num num tc-flow"><b className="up">{c.buys24}</b>/<b className="down">{c.sells24}</b></span>
            <span className="tc-num num tc-age">{age(c.createdTs)}</span>
          </div>
        ))}
      </div>
      <div className="term-foot">{feed === 'new'
        ? 'Live from chain · new pools appear ~1 block (~0.1s) after creation, straight from the Uniswap V2/V3 factories · not financial advice'
        : 'Data via GeckoTerminal · trending ranked by unique buyers, not raw volume · not financial advice'}</div>
      <TokenDrawer coin={sel} onClose={() => setSel(null)} />
    </div>
  )
}

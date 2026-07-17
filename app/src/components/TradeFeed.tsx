import { formatUnits } from 'viem'
import { shortAddr } from '../lib/format'
import { ZERO } from '../config/contracts'
import { Avatar } from './Avatar'
import type { TradePoint } from '../lib/trades'

const SUPPLY = 1_000_000_000

function ago(sec: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  return `${Math.floor(d / 3600)}h`
}

function usd(v: number): string {
  if (!isFinite(v) || v <= 0) return '$0'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(2)}`
}

function amt(n: number): string {
  if (!isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(n < 1 ? 3 : 0)
}

// Live tape of the most recent trades, GMGN-style: age, type, market cap, size, total, trader.
export function TradeFeed({ points, ethUsd }: { points: TradePoint[]; ethUsd: number }) {
  const rows = [...points].sort((a, b) => b.time - a.time || Number(b.block - a.block)).slice(0, 14)
  if (rows.length === 0) return null
  return (
    <div className="feed">
      <div className="feed-head"><span>Age</span><span>Type</span><span>MC</span><span>Amount</span><span>Total</span><span>Trader</span></div>
      {rows.map((r, i) => (
        <div className={`feed-row ${r.isBuy ? 'buy' : 'sell'}`} key={`${r.block}-${i}`}>
          <span className="feed-age">{ago(r.time)}</span>
          <span className="feed-side">{r.isBuy ? 'Buy' : 'Sell'}</span>
          <span className="num">{usd(r.price * SUPPLY * ethUsd)}</span>
          <span className="num">{amt(Number(formatUnits(r.tokenAmount, 18)))}</span>
          <span className="num feed-total">{usd(Number(formatUnits(r.ethAmount, 18)) * ethUsd)}</span>
          <span className="feed-by">
            {r.trader === ZERO ? 'pool' : (
              <><Avatar className="feed-av" image={r.traderAvatar ?? undefined} symbol={r.traderName || r.trader} addr={r.trader} />{r.traderName || shortAddr(r.trader)}</>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

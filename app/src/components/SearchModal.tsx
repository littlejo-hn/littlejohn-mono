import { useEffect, useRef, useState, useCallback } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'

type Coin = {
  address: string
  symbol: string
  name: string | null
  image: string | null
  mcap: number | null
  graduated: boolean
  tokens_sold: string | null
  vol_eth: number
}

const CURVE_SUPPLY_WHOLE = 793_100_000
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// mcap is ETH-denominated on Robinhood Chain; show it in Ξ (our own thing, not $).
function fmtEth(v: number | null): string {
  if (!v || v <= 0) return '—'
  if (v >= 1000) return `Ξ${(v / 1000).toFixed(1)}K`
  if (v >= 1) return `Ξ${v.toFixed(1)}`
  if (v >= 0.001) return `Ξ${v.toFixed(3)}`
  return `Ξ${v.toExponential(1)}`
}

function curvePct(c: Coin): number {
  if (c.graduated || !c.tokens_sold) return 100
  try {
    return Math.min(100, (Number(BigInt(c.tokens_sold) / 10n ** 18n) / CURVE_SUPPLY_WHOLE) * 100)
  } catch {
    return 0
  }
}

export function SearchModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (addr: string) => void
}) {
  const [hot, setHot] = useState<Coin[]>([])
  const [results, setResults] = useState<Coin[]>([])
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hot coins (top by volume) for the empty state; loaded once per open.
  useEffect(() => {
    if (!open) return
    setQ('')
    setHi(0)
    setResults([])
    let off = false
    fetch('/api/board?sort=volume&limit=8')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d?.tokens) setHot(d.tokens as Coin[]) })
      .catch(() => {})
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => { off = true; clearTimeout(t) }
  }, [open])

  // Server-side search across ALL coins (ticker / name / address / creator), debounced.
  useEffect(() => {
    const s = q.trim()
    if (!s) { setResults([]); return }
    let off = false
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!off && d?.coins) { setResults(d.coins as Coin[]); setHi(0) } })
        .catch(() => {})
    }, 160)
    return () => { off = true; clearTimeout(t) }
  }, [q])

  const showHot = !q.trim()
  const list = showHot ? hot.slice(0, 7) : results

  const choose = useCallback((c: Coin) => onSelect(c.address), [onSelect])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
      else if (e.key === 'Enter') { const c = list[hi]; if (c) choose(c) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, list, hi, onClose, choose])

  if (!open) return null

  return (
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search coins">
        <div className="cmdk-input">
          <MagnifyingGlass size={18} className="cmdk-ico" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coins, tickers, addresses…"
            aria-label="Search coins"
          />
        </div>

        <div className="cmdk-section">{showHot ? 'Hot in the trenches' : 'Results'}</div>
        <div className="cmdk-list">
          {list.length === 0 && (
            <div className="cmdk-empty">{q.trim() ? `No coins match “${q.trim()}”.` : 'Nothing in the trenches yet.'}</div>
          )}
          {list.map((c, i) => {
            const pct = curvePct(c)
            return (
              <button
                key={c.address}
                className={`cmdk-row ${i === hi ? 'hi' : ''}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(c)}
              >
                {showHot && <span className={`cmdk-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>}
                <span className="cmdk-av">
                  {c.image ? <img src={c.image} alt="" /> : <span className="cmdk-av-ph">{(c.symbol || '?')[0]}</span>}
                </span>
                <span className="cmdk-meta">
                  <span className="cmdk-sym">{c.symbol}</span>
                  <span className="cmdk-name">{c.name ?? short(c.address)}</span>
                </span>
                <span className="cmdk-right">
                  <span className="cmdk-mcap num">{fmtEth(c.mcap)}</span>
                  {c.graduated ? (
                    <span className="cmdk-tag grad">Graduated</span>
                  ) : (
                    <span className="cmdk-prog" title={`${Math.round(pct)}% to the getaway`}>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span className="cmdk-brand"><i className="diamond" /> LittleJohn</span>
        </div>
      </div>
    </div>
  )
}

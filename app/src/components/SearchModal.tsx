import { useEffect, useRef, useState, useCallback } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { dexLabel } from '../lib/dex'

// Chain-wide token search: any RH token by ticker / name / address, not just what's on
// the board. An address resolves on-chain (/api/lookup — reliable, no GeckoTerminal);
// a name/ticker goes through the GeckoTerminal-backed search. Selecting opens the
// token's trade drawer on the terminal (via ?token=).
type Coin = {
  address: string
  symbol: string
  name: string | null
  image: string | null
  dex: string
  liqUsd: number
}

const isAddr = (s: string) => /^0x[0-9a-f]{40}$/i.test(s)
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
function usd(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
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
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false) // GT name-search rate-limited
  const inputRef = useRef<HTMLInputElement>(null)

  // Trending coins for the empty state; loaded once per open.
  useEffect(() => {
    if (!open) return
    setQ(''); setHi(0); setResults([])
    let off = false
    fetch('/api/trenches?feed=trending')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d?.tokens) setHot(d.tokens as Coin[]) })
      .catch(() => {})
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => { off = true; clearTimeout(t) }
  }, [open])

  // Chain-wide search, debounced. Address -> on-chain resolve; else -> GT search.
  useEffect(() => {
    const s = q.trim()
    if (!s) { setResults([]); setLoading(false); setErrored(false); return }
    let off = false
    setLoading(true); setErrored(false)
    const t = setTimeout(async () => {
      try {
        // Our own index first (reliable — name + already-seen addresses).
        let items: Coin[] = []
        const r = await fetch(`/api/tokens?q=${encodeURIComponent(s)}`)
        if (r.ok) items = ((await r.json())?.tokens ?? []) as Coin[]
        // An address we haven't indexed yet -> resolve on-chain (server-side it also
        // joins the index, so next time it's instant).
        if (!items.length && isAddr(s)) {
          const r2 = await fetch(`/api/lookup?addr=${s}`)
          if (r2.ok) { const tok = (await r2.json())?.token; if (tok) items = [tok as Coin] }
        }
        if (off) return
        setResults(items); setHi(0); setLoading(false)
      } catch {
        if (!off) { setErrored(true); setResults([]); setLoading(false) }
      }
    }, 200)
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
            placeholder="Search any token — ticker, name, or address…"
            aria-label="Search coins"
          />
        </div>

        <div className="cmdk-section">{showHot ? 'Trending' : loading ? 'Searching…' : 'Results'}</div>
        <div className="cmdk-list">
          {list.length === 0 && !loading && (
            <div className="cmdk-empty">
              {!q.trim()
                ? 'Nothing in the trenches yet.'
                : errored
                  ? 'Search hiccup — try again.'
                  : isAddr(q.trim()) ? 'No WETH pool found for that address.' : `No token indexed for “${q.trim()}” yet — try the address.`}
            </div>
          )}
          {list.map((c, i) => (
            <button
              key={c.address}
              className={`cmdk-row ${i === hi ? 'hi' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(c)}
            >
              {showHot && <span className={`cmdk-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>}
              <Avatar className="cmdk-av" image={c.image ?? undefined} symbol={c.symbol} addr={c.address} />
              <span className="cmdk-meta">
                <span className="cmdk-sym">{c.symbol}</span>
                <span className="cmdk-name">{c.name ?? short(c.address)}</span>
              </span>
              <span className="cmdk-right">
                <span className="cmdk-mcap num">{usd(c.liqUsd)}</span>
                {c.dex && <span className="cmdk-tag">{dexLabel(c.dex)}</span>}
              </span>
            </button>
          ))}
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

import { useEffect } from 'react'
import { ArrowSquareOut, X } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { TerminalTrade } from './TerminalTrade'
import { dexLabel } from '../lib/dex'

// The token this drawer trades — a structural subset of the terminal's Coin.
export type DrawerCoin = {
  address: string
  pool: string
  symbol: string
  name: string
  image: string | null
  dex: string
  priceUsd: number
  chg24: number
}

function price(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(3)}`
}

// Right-anchored trade drawer. Inline buy/sell for Uniswap V2 tokens (where the
// fresh trenches memecoins live); an honest deep-link for V3/V4/other pads until
// those routers are wired.
export function TokenDrawer({ coin, onClose }: { coin: DrawerCoin | null; onClose: () => void }) {
  useEffect(() => {
    if (!coin) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [coin, onClose])

  if (!coin) return null
  const tradeable = coin.dex === 'uniswap-v2-robinhood' || coin.dex === 'uniswap-v3-robinhood'
  const dexName = dexLabel(coin.dex)
  const chart = `https://dexscreener.com/robinhood/${coin.pool}`
  const explorer = `https://robinhoodchain.blockscout.com/token/${coin.address}`

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Trade ${coin.symbol}`}>
        <button className="drawer-x" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <div className="drawer-head">
          <Avatar className="drawer-img" image={coin.image ?? undefined} symbol={coin.symbol} addr={coin.address} />
          <div className="drawer-id">
            <div className="drawer-sym">{coin.symbol}<span className={`drawer-chg ${coin.chg24 >= 0 ? 'up' : 'down'}`}>{coin.chg24 >= 0 ? '+' : ''}{coin.chg24.toFixed(1)}%</span></div>
            <div className="drawer-name">{coin.name}</div>
          </div>
          <div className="drawer-price">{price(coin.priceUsd)}</div>
        </div>

        <div className="drawer-links">
          <span className="drawer-dex">{dexName}</span>
          <a href={chart} target="_blank" rel="noopener noreferrer">Chart <ArrowSquareOut size={12} /></a>
          <a href={explorer} target="_blank" rel="noopener noreferrer">Explorer <ArrowSquareOut size={12} /></a>
        </div>

        {tradeable ? (
          <TerminalTrade token={{ address: coin.address, pool: coin.pool, symbol: coin.symbol, dex: coin.dex, priceUsd: coin.priceUsd }} />
        ) : (
          <div className="drawer-ext">
            <p>Inline trading covers <b>Uniswap V2 & V3</b> for now. <b>{coin.symbol}</b> trades on <b>{dexName}</b> — V4 routing is next.</p>
            <a className="tt-go" href={chart} target="_blank" rel="noopener noreferrer">Trade on {dexName} <ArrowSquareOut size={14} /></a>
          </div>
        )}
      </aside>
    </div>
  )
}

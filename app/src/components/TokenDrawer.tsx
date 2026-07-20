import { useEffect } from 'react'
import { ArrowSquareOut, X } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { TerminalTrade } from './TerminalTrade'

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

const DEX_LABEL: Record<string, string> = {
  'uniswap-v2-robinhood': 'Uniswap V2',
  'uniswap-v3-robinhood': 'Uniswap V3',
  'uniswap-v4-robinhood': 'Uniswap V4',
  'pancakeswap-v3-robinhood': 'PancakeSwap V3',
  'pancakeswap-v2-robinhood': 'PancakeSwap V2',
  robinswap: 'RobinSwap',
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
  const dexLabel = DEX_LABEL[coin.dex] ?? coin.dex
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
          <span className="drawer-dex">{dexLabel}</span>
          <a href={chart} target="_blank" rel="noopener noreferrer">Chart <ArrowSquareOut size={12} /></a>
          <a href={explorer} target="_blank" rel="noopener noreferrer">Explorer <ArrowSquareOut size={12} /></a>
        </div>

        {tradeable ? (
          <TerminalTrade token={{ address: coin.address, pool: coin.pool, symbol: coin.symbol, dex: coin.dex, priceUsd: coin.priceUsd }} />
        ) : (
          <div className="drawer-ext">
            <p>Inline trading covers <b>Uniswap V2 & V3</b> for now. <b>{coin.symbol}</b> trades on <b>{dexLabel}</b> — V4 routing is next.</p>
            <a className="tt-go" href={chart} target="_blank" rel="noopener noreferrer">Trade on {dexLabel} <ArrowSquareOut size={14} /></a>
          </div>
        )}
      </aside>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, launchpadLive } from '../config/contracts'
import { launchpadAbi, erc20Abi } from '../abis'
import { DEFAULT_CHAIN } from '../lib/chains'
import { fetchTokenHistory, fetchApiTrades, watchLive, fetchEthUsd, fetchWalletTrades, avgEntryPrice, fetchHolders, type TradePoint, type HoldersData } from '../lib/trades'
import { loadToken, fmtUsd, short, xUrl, tgUrl } from '../lib/token'
import { TokenChart } from '../components/TokenChart'
import { TradeFeed } from '../components/TradeFeed'
import { TradePanel } from '../components/TradePanel'
import { CoinComments } from '../components/CoinComments'
import { Avatar } from '../components/Avatar'
import { toast } from 'sonner'
import { ShareNetwork, XLogo, GlobeSimple, TelegramLogo } from '@phosphor-icons/react'

type MarkerTrade = TradePoint & { kind: 'dev' | 'you' }

export function CoinPage() {
  const { address, publicClient, chainId } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = launchpadLive(d)

  const { addr: addrParam } = useParams()
  const addr = (addrParam ?? '').toLowerCase() as `0x${string}`
  const valid = /^0x[a-f0-9]{40}$/.test(addr)

  const [token, setToken] = useState<import('../lib/token').Listed | null | undefined>(undefined)
  const [curveSupply, setCurveSupply] = useState<bigint>(0n)
  const [points, setPoints] = useState<TradePoint[]>([])
  const [ethUsd, setEthUsd] = useState(3000)
  const [gradPrice, setGradPrice] = useState(0)
  const [devTrades, setDevTrades] = useState<TradePoint[]>([])
  const [myTrades, setMyTrades] = useState<TradePoint[]>([])
  const [holders, setHolders] = useState<HoldersData | null>(null)
  const [ethBal, setEthBal] = useState<bigint | null>(null)
  const [tokBal, setTokBal] = useState<bigint | null>(null)
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState(false)

  const onCurve = token ? !token.graduated : false

  // Reset to the loading state whenever the routed coin changes; scroll to top.
  useEffect(() => { setToken(undefined); setCurveSupply(0n); window.scrollTo(0, 0) }, [addr])

  // Resolve the coin (indexer API, on-chain fallback) + the curve supply. Reloads
  // silently on `done` (post-trade) to refresh mcap/progress without a skeleton flash.
  useEffect(() => {
    if (!live || !valid || !d) { if (!valid) setToken(null); return }
    let off = false
    loadToken(addr, publicClient, d).then((t) => { if (!off) setToken(t) }).catch(() => { if (!off) setToken(null) })
    publicClient.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: 'CURVE_SUPPLY' })
      .then((s) => { if (!off) setCurveSupply(s as bigint) }).catch(() => {})
    return () => { off = true }
  }, [addr, valid, live, d, publicClient, done])

  // ETH/USD (for mcap denomination) + the graduation-target price.
  useEffect(() => {
    if (!live || !d) return
    let off = false
    fetchEthUsd(publicClient, d.router, d.weth, d.usdg, 3000).then((v) => { if (!off) setEthUsd(v) }).catch(() => {})
    ;(async () => {
      try {
        const [ive, ivt, cs] = await Promise.all([
          publicClient.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: 'initialVirtualEth' }) as Promise<bigint>,
          publicClient.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: 'INITIAL_VIRTUAL_TOKEN' }) as Promise<bigint>,
          publicClient.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: 'CURVE_SUPPLY' }) as Promise<bigint>,
        ])
        const iVE = Number(ive), IVT = Number(ivt), vTokGrad = IVT - Number(cs)
        const vEthGrad = (iVE * IVT) / vTokGrad
        if (!off) setGradPrice(vEthGrad / vTokGrad)
      } catch { /* leave 0 => no line */ }
    })()
    return () => { off = true }
  }, [live, d, publicClient])

  // Wallet balances for the trade panel.
  useEffect(() => {
    if (!live || !address || !token) { setEthBal(null); setTokBal(null); return }
    let off = false
    Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({ address: token.addr, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ]).then(([e, t]) => { if (!off) { setEthBal(e); setTokBal(t) } }).catch(() => {})
    return () => { off = true }
  }, [live, address, token, publicClient, done])

  // Full price history (curve + pool) + the phase-appropriate live feed.
  useEffect(() => {
    if (!live || !token || !d) { setPoints([]); return }
    let off = false
    setPoints([])
    const append = (p: TradePoint) => { if (!off) setPoints((prev) => [...prev, p]) }
    ;(async () => {
      const api = await fetchApiTrades(token.addr).catch(() => null)
      if (off) return
      if (api && api.length) { setPoints(api); return }
      const chain = await fetchTokenHistory(publicClient, d.launchpad, d.router, token.addr, d.weth).catch(() => [])
      if (!off) setPoints(chain)
    })()
    const unsub = watchLive(token.addr, append)
    return () => { off = true; unsub() }
  }, [live, token, publicClient, d])

  // Dev + your own trades, for entry markers + the average-entry line.
  useEffect(() => {
    if (!live || !token || !d) { setDevTrades([]); setMyTrades([]); return }
    let off = false
    setDevTrades([]); setMyTrades([])
    fetchWalletTrades(publicClient, d.launchpad, d.router, token.addr, d.weth, token.creator)
      .then((t) => { if (!off) setDevTrades(t) }).catch(() => {})
    if (address) {
      fetchWalletTrades(publicClient, d.launchpad, d.router, token.addr, d.weth, address)
        .then((t) => { if (!off) setMyTrades(t) }).catch(() => {})
    }
    return () => { off = true }
  }, [live, token, address, publicClient, d, done])

  // Top holders + count, refreshed as trades land.
  useEffect(() => {
    if (!live || !token) { setHolders(null); return }
    let off = false
    const load = () => fetchHolders(token.addr).then((h) => { if (!off) setHolders(h) }).catch(() => {})
    load()
    const iv = setInterval(load, 15000)
    return () => { off = true; clearInterval(iv) }
  }, [live, token])

  const markers = useMemo<MarkerTrade[]>(() => [
    ...devTrades.map((t) => ({ ...t, kind: 'dev' as const })),
    ...myTrades.map((t) => ({ ...t, kind: 'you' as const })),
  ], [devTrades, myTrades])
  const avgEntry = useMemo(() => avgEntryPrice(myTrades), [myTrades])
  const change24h = useMemo(() => {
    if (points.length < 2) return null
    const last = points[points.length - 1]
    const past = points.find((p) => p.time >= last.time - 86400) ?? points[0]
    if (!past.price || past === last) return null
    return ((last.price - past.price) / past.price) * 100
  }, [points])
  const stats = useMemo(() => {
    if (!points.length) return null
    const cut = points[points.length - 1].time - 86400
    let vol = 0, buys = 0, sells = 0
    for (const p of points) {
      if (p.time < cut) continue
      vol += Number(formatUnits(p.ethAmount, 18)) * ethUsd
      if (p.isBuy) buys++; else sells++
    }
    return { vol, buys, sells }
  }, [points, ethUsd])

  const copyAddr = () => { if (token) { navigator.clipboard?.writeText(token.addr); setCopied(true); toast.success('Contract address copied'); setTimeout(() => setCopied(false), 1200) } }
  const share = () => {
    if (!token) return
    const text = `${token.name || token.symbol} ($${token.symbol}) on LittleJohn 🏹`
    const url = `https://littlejo.hn/coin/${token.addr}`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener')
  }

  if (!live) {
    return <div className="card"><div className="title">Coin</div><div className="sub">The launchpad is not live on this network yet.</div></div>
  }
  if (!valid || token === null) {
    return (
      <div className="empty">
        <div className="empty-title">No such coin</div>
        <div className="empty-sub">This address isn't a coin in the trenches. <NavLink to="/">Back to the board →</NavLink></div>
      </div>
    )
  }
  if (token === undefined) {
    return (
      <div className="coinlayout">
        <NavLink to="/" className="back-board">← the trenches</NavLink>
        <div className="coinmain"><div className="chart-canvas" style={{ height: 420 }} /></div>
        <div className="coinside"><div className="card" style={{ height: 260 }} /></div>
      </div>
    )
  }

  const progress = curveSupply > 0n ? Number((token.tokensSold * 1000n) / curveSupply) / 10 : 0

  return (
    <div className="coinlayout">
      <NavLink to="/" className="back-board">← the trenches</NavLink>
      <div className="coinmain">
        {token.banner && <img className="coin-banner" src={token.banner} alt="" />}
        <div className="card coinhead">
          <span className="coinhead-frame">
            <Avatar className="coinhead-av" image={token.image} symbol={token.symbol} addr={token.addr} />
          </span>
          <div className="coinhead-info">
            <div className="coinhead-name">{token.name || token.symbol}</div>
            <div className="coinhead-sub">
              <span>${token.symbol}</span>
              <span className={onCurve ? 'pill gold' : 'pill good'}>{onCurve ? 'on the curve' : 'graduated'}</span>
              <button className="addr-copy" onClick={copyAddr} title="Copy contract address">{copied ? 'copied ✓' : short(token.addr)}</button>
              {token.twitter && <a className="social-link" href={xUrl(token.twitter)} target="_blank" rel="noreferrer" title="X"><XLogo size={15} weight="fill" /></a>}
              {token.website && <a className="social-link" href={token.website} target="_blank" rel="noreferrer" title="Website"><GlobeSimple size={15} /></a>}
              {token.telegram && <a className="social-link" href={tgUrl(token.telegram)} target="_blank" rel="noreferrer" title="Telegram"><TelegramLogo size={15} weight="fill" /></a>}
              <button className="social-link" onClick={share} title="Share on X"><ShareNetwork size={15} /></button>
            </div>
            <div className="coinhead-stats">
              <span className="num mc">{fmtUsd(token.mcap * ethUsd)}<em>mcap</em></span>
              {change24h != null && (
                <span className={`num chg ${change24h >= 0 ? 'up' : 'down'}`}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%<em>24h</em></span>
              )}
              <span className="by">by <span className="by-addr">{short(token.creator)}</span></span>
            </div>
            {token.description && <div className="coin-desc">{token.description}</div>}
          </div>
        </div>

        {onCurve && (
          <div className="curvebar" title={`${progress}% to graduation`}>
            <div className="curvebar-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            <span className="curvebar-label">{progress}% to graduation</span>
          </div>
        )}

        <TokenChart addr={token.addr} points={points} ethUsd={ethUsd} gradPrice={gradPrice} markers={markers} avgEntry={avgEntry} />

        {points.length > 0 && (
          <div className="card">
            <div className="feed-title">Recent trades</div>
            <TradeFeed points={points} ethUsd={ethUsd} />
          </div>
        )}

        <CoinComments token={token.addr} />
      </div>

      <div className="coinside">
        <TradePanel token={token} onCurve={onCurve} ethBal={ethBal} tokBal={tokBal} ethUsd={ethUsd} onTraded={() => setDone((v) => !v)} />

        {stats && (
          <div className="card sidestats">
            <div className="sidestats-title">Stats <span className="tag">24h</span></div>
            <div className="sgrid">
              <div className="scell"><span className="k">Volume</span><span className="v num">{fmtUsd(stats.vol)}</span></div>
              <div className="scell"><span className="k">Trades</span><span className="v num">{stats.buys + stats.sells}</span></div>
              <div className="scell"><span className="k">Buys</span><span className="v num up">{stats.buys}</span></div>
              <div className="scell"><span className="k">Sells</span><span className="v num down">{stats.sells}</span></div>
            </div>
          </div>
        )}

        <div className="card sidestats">
          <div className="sidestats-title">Holders {holders && <span className="tag">{holders.count}</span>}</div>
          <div className="sgrid audit">
            <div className="scell"><span className="k">Holders</span><span className="v num">{holders ? holders.count : '-'}</span></div>
            <div className="scell"><span className="k">Dev</span><span className="v num">{holders ? `${holders.devPct.toFixed(1)}%` : '-'}</span></div>
            <div className="scell">
              <span className="k">Top 10</span>
              <span className="v num">
                {holders
                  ? `${holders.holders.filter((h) => !h.label || h.label === 'dev').slice(0, 10).reduce((s, h) => s + h.pct, 0).toFixed(1)}%`
                  : '-'}
              </span>
            </div>
          </div>
          {holders && holders.holders.length > 0 && (
            <div className="holders-list">
              {holders.holders.slice(0, 12).map((h, i) => (
                <div className={`holder-row${h.label ? ' sys' : ''}`} key={h.address}>
                  <span className="hrank">{i + 1}</span>
                  <span className={`haddr ${h.label ?? ''}`}>
                    {h.label === 'curve' ? 'Bonding curve'
                      : h.label === 'pool' ? 'Liquidity pool'
                      : h.label === 'dev' ? 'Dev'
                      : `${h.address.slice(0, 6)}…${h.address.slice(-4)}`}
                  </span>
                  <span className="hpct num">{h.pct.toFixed(2)}%</span>
                  <span className="hbar"><span style={{ width: `${Math.min(100, h.pct)}%` }} /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

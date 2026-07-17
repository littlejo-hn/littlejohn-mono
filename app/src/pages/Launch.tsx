import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseEther } from 'viem'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { deployment, launchpadLive } from '../config/contracts'
import { launchpadAbi } from '../abis'
import { DEFAULT_CHAIN } from '../lib/chains'
import { txError } from '../lib/tx'
import { fetchEthUsd } from '../lib/trades'
import { Avatar } from '../components/Avatar'
import { toast } from 'sonner'
import { BoardSkeleton } from '../components/Skeleton'
import { TrendUp, Sparkle, ChartLineUp, GraduationCap, SealCheck } from '@phosphor-icons/react'
import { loadTokenOnChain, fmtUsd, short, type Listed } from '../lib/token'

// Compact "time since launch" for the card stat strip.
function fmtAge(ts?: number): string {
  if (!ts) return 'new'
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

type Feed = 'trending' | 'new' | 'mcap' | 'graduating' | 'graduated'
const FEEDS: { id: Feed; label: string; Ico: typeof TrendUp }[] = [
  { id: 'trending', label: 'Trending', Ico: TrendUp },
  { id: 'new', label: 'New', Ico: Sparkle },
  { id: 'mcap', label: 'Market cap', Ico: ChartLineUp },
  { id: 'graduating', label: 'Graduating', Ico: GraduationCap },
  { id: 'graduated', label: 'Graduated', Ico: SealCheck },
]

export function Launch() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = launchpadLive(d)
  const navigate = useNavigate()

  const [tokens, setTokens] = useState<Listed[]>([])
  const [curveSupply, setCurveSupply] = useState<bigint>(0n)
  const [ethUsd, setEthUsd] = useState(3000)
  const [feed, setFeed] = useState<Feed>('trending')
  const [loaded, setLoaded] = useState(false)
  const [done, setDone] = useState(false)

  // Load the launched-token list. API-first (indexer-backed board, fast + scales),
  // falls back to reading straight from the chain when the API is unavailable
  // (local dev, or before the indexer has caught up).
  const loadTokens = useCallback(async () => {
    if (!live) { setTokens([]); return }
    const supply = (await publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'CURVE_SUPPLY' })) as bigint
    setCurveSupply(supply)

    // Local-fork dev (VITE_RPC_URL set): the indexer API serves remote data and hides
    // locally-seeded tokens — read straight from the chain (below) instead of the API.
    if (!import.meta.env.VITE_RPC_URL) try {
      const res = await fetch('/api/board?sort=mcap&limit=200')
      if (res.ok) {
        const data = (await res.json()) as { tokens?: Array<{ address: `0x${string}`; symbol: string | null; name: string | null; image: string | null; price: number | null; mcap: number | null; graduated: boolean; tokens_sold: string | null; creator: string | null; vol_eth: number; created_ts: number | null; creator_name: string | null; creator_avatar: string | null }> }
        const rows = data.tokens ?? []
        if (rows.length) {
          const apiList: Listed[] = rows.map((r) => ({
            addr: r.address,
            symbol: r.symbol ?? '',
            name: r.name ?? undefined,
            image: r.image ?? undefined,
            graduated: !!r.graduated,
            tokensSold: BigInt(r.tokens_sold ?? '0'),
            price: r.price ?? 0,
            mcap: r.mcap ?? 0,
            creator: (r.creator ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            volEth: r.vol_eth ?? 0,
            createdTs: r.created_ts ?? 0,
            creatorName: r.creator_name,
            creatorAvatar: r.creator_avatar,
          }))
          setTokens(apiList)
          setLoaded(true)
          return
        }
      }
    } catch { /* fall back to on-chain reads */ }

    const count = (await publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'tokenCount' })) as bigint
    const n = Number(count)
    // Load every token in PARALLEL (was sequential = mega slow on a full board).
    const loadOne = async (i: number): Promise<Listed | null> => {
      try {
        const addr = (await publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'allTokens', args: [BigInt(i)] })) as `0x${string}`
        return await loadTokenOnChain(addr, publicClient, d!)
      } catch { return null } // skip a token that fails to load; one bad token must not blank the board
    }
    const list = (await Promise.all(Array.from({ length: n }, (_, i) => loadOne(i)))).filter((t): t is Listed => t !== null)
    setTokens(list)
    setLoaded(true)
  }, [live, d, publicClient])

  useEffect(() => { loadTokens() }, [loadTokens, done])

  // ETH/USD, for market-cap denomination on the board cards.
  useEffect(() => {
    if (!live || !d) return
    let off = false
    fetchEthUsd(publicClient, d.router, d.weth, d.usdg, 3000).then((v) => { if (!off) setEthUsd(v) }).catch(() => {})
    return () => { off = true }
  }, [live, d, publicClient])

  // One-click 0.1 ETH buy from a board card (5% slippage headroom).
  const quickBuy = async (t: Listed, e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (!walletClient || !address) { toast.error('Connect a wallet to trade'); return }
    if (!isSupported) { toast.error(`Switch to ${DEFAULT_CHAIN.name}`); return }
    const tid = toast.loading(`Buying ${t.symbol}…`)
    try {
      const value = parseEther('0.1')
      const quoted = (await publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'quoteBuy', args: [t.addr, value] })) as bigint
      const minOut = quoted - (quoted * 500n) / 10000n
      const hash = await walletClient.writeContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'buy', args: [t.addr, minOut], value, account: address, chain: null })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`Bought ${t.symbol}`, { id: tid })
      setDone((v) => !v)
    } catch (err) { toast.error(txError(err), { id: tid }) }
  }

  const pctOf = (t: Listed) => (curveSupply > 0n ? Math.round((Number(t.tokensSold) / Number(curveSupply)) * 100) : 0)

  const shown = useMemo(() => {
    const list = [...tokens]
    switch (feed) {
      case 'new': return list.sort((a, b) => (b.createdTs ?? 0) - (a.createdTs ?? 0))
      case 'mcap': return list.sort((a, b) => b.mcap - a.mcap)
      case 'graduating': return list.filter((t) => !t.graduated).sort((a, b) => (a.tokensSold > b.tokensSold ? -1 : 1))
      case 'graduated': return list.filter((t) => t.graduated).sort((a, b) => b.mcap - a.mcap)
      default: return list.sort((a, b) => (b.volEth ?? 0) - (a.volEth ?? 0)) // trending
    }
  }, [tokens, feed])
  const trending = useMemo(
    () => [...tokens].sort((a, b) => (b.volEth ?? 0) - (a.volEth ?? 0) || b.mcap - a.mcap).slice(0, 5),
    [tokens],
  )

  if (!live) {
    return (
      <div className="card">
        <div className="title">Launch</div>
        <div className="sub">The launchpad is not live on this network yet.</div>
      </div>
    )
  }

  return (
    <>
    {!loaded && tokens.length === 0 && (
      <>
        <div className="board-title">The board</div>
        <BoardSkeleton />
      </>
    )}
    {loaded && tokens.length === 0 && (
      <div className="empty">
        <div className="empty-title">No coins in the trenches yet</div>
        <div className="empty-sub">Be the first — hit Create and launch one.</div>
      </div>
    )}
    {tokens.length > 0 && (
      <>
        {trending.length > 0 && (
          <div className="trending">
            <div className="board-title">Trending</div>
            <div className="trending-row">
              {trending.map((t) => (
                <button key={t.addr} className="tcard" onClick={() => navigate(`/coin/${t.addr}`)}>
                  <Avatar className="tcard-img" image={t.image} symbol={t.symbol} addr={t.addr} />
                  <div className="tcard-overlay">
                    <div className="tcard-mc">{fmtUsd(t.mcap * ethUsd)}</div>
                    <div className="tcard-name">{t.name || t.symbol}<span className="tcard-sym"> {t.symbol}</span></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="explore-head">
          <div className="board-title">Explore coins</div>
          <div className="feed-pills">
            {FEEDS.map(({ id, label, Ico }) => (
              <button key={id} className={`fpill ${feed === id ? 'on' : ''}`} onClick={() => setFeed(id)}>
                <Ico size={15} weight={feed === id ? 'fill' : 'regular'} />{label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && (
          <div className="empty"><div className="empty-title">Nothing in the trenches yet</div><div className="empty-sub">Be the first to launch a coin.</div></div>
        )}
        <div className="board">
          {shown.map((t) => {
            const p = pctOf(t)
            return (
              <button key={t.addr} className={`bcard ${t.graduated ? 'grad' : ''}`} onClick={() => navigate(`/coin/${t.addr}`)}>
                <div className="bcard-imgwrap">
                  <Avatar className="bcard-img" image={t.image} symbol={t.symbol} addr={t.addr} />
                  <span className={`bcard-pill ${t.graduated ? 'pill good' : 'pill gold'}`}>{t.graduated ? 'grad' : `${p}%`}</span>
                  {!t.graduated && <span className="qbuy" role="button" tabIndex={0} onClick={(e) => quickBuy(t, e)}>⚡ 0.1</span>}
                  {!t.graduated && <div className="bcard-bar"><i style={{ width: `${Math.min(p, 100)}%` }} /></div>}
                </div>
                <div className="bcard-body">
                  <div className="bcard-name">{t.name || t.symbol}</div>
                  <div className="bcard-sym">${t.symbol}</div>
                  <div className="bcard-foot">
                    <span className="bcard-mc">{fmtUsd(t.mcap * ethUsd)}<em>MC</em></span>
                    <span className="bcard-vol">{fmtUsd((t.volEth ?? 0) * ethUsd)} vol · {fmtAge(t.createdTs)}</span>
                  </div>
                  <div className="bcard-creator">
                    <Avatar className="bcard-creator-av" image={t.creatorAvatar ?? undefined} symbol={t.creatorName || t.creator} addr={t.creator} />
                    <span>{t.creatorName || short(t.creator)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </>
    )}
    </>
  )
}

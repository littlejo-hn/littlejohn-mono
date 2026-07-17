import { useEffect, useState } from 'react'
import { parseEther, parseUnits, formatUnits } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment } from '../config/contracts'
import { launchpadAbi, routerAbi } from '../abis'
import { DEFAULT_CHAIN } from '../lib/chains'
import { ensureAllowance, txError } from '../lib/tx'
import { fmtAmount } from '../lib/format'
import { fmtUsd, type Listed } from '../lib/token'
import { toast } from 'sonner'

const DEADLINE_S = 1200
type Side = 'buy' | 'sell'

// The buy/sell box. Self-contained: owns amount/side/slippage + the quote poll and
// the trade tx. Works on the bonding curve pre-graduation and the ve(3,3) pool after.
export function TradePanel({ token, onCurve, ethBal, tokBal, ethUsd, onTraded }: {
  token: Listed; onCurve: boolean; ethBal: bigint | null; tokBal: bigint | null; ethUsd: number; onTraded: () => void
}) {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)

  const [side, setSide] = useState<Side>('buy')
  const [amountIn, setAmountIn] = useState('')
  const [out, setOut] = useState<bigint | null>(null)
  const [slipBps, setSlipBps] = useState<bigint>(100n) // 1%
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Reset the form when the coin or venue changes.
  useEffect(() => { setAmountIn(''); setOut(null) }, [token.addr])

  // Quote: same inputs, different venue depending on graduation.
  useEffect(() => {
    if (!d || !amountIn) { setOut(null); return }
    let off = false
    const t = setTimeout(async () => {
      try {
        const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, 18)
        if (inWei <= 0n) { setOut(null); return }
        let result: bigint
        if (onCurve) {
          result = (await publicClient.readContract({
            address: d.launchpad, abi: launchpadAbi,
            functionName: side === 'buy' ? 'quoteBuy' : 'quoteSell', args: [token.addr, inWei],
          })) as bigint
        } else {
          const route = side === 'buy'
            ? [{ from: d.weth, to: token.addr, stable: false }]
            : [{ from: token.addr, to: d.weth, stable: false }]
          const amounts = (await publicClient.readContract({
            address: d.router, abi: routerAbi, functionName: 'getAmountsOut', args: [inWei, route],
          })) as bigint[]
          result = amounts[amounts.length - 1]
        }
        if (!off) setOut(result)
      } catch {
        if (!off) setOut(null)
      }
    }, 300)
    return () => { off = true; clearTimeout(t) }
  }, [token.addr, amountIn, side, onCurve, d, publicClient])

  const trade = async () => {
    if (!walletClient || !address || !d || out == null) return
    setBusy(true); setErr(null)
    try {
      const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, 18)
      const minOut = out - (out * slipBps) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_S)
      let hash: `0x${string}`

      if (onCurve && side === 'buy') {
        hash = await walletClient.writeContract({
          address: d.launchpad, abi: launchpadAbi, functionName: 'buy', args: [token.addr, minOut],
          value: inWei, account: address, chain: null,
        })
      } else if (onCurve && side === 'sell') {
        await ensureAllowance(publicClient, walletClient, token.addr, address, d.launchpad, inWei)
        hash = await walletClient.writeContract({
          address: d.launchpad, abi: launchpadAbi, functionName: 'sell', args: [token.addr, inWei, minOut],
          account: address, chain: null,
        })
      } else if (!onCurve && side === 'buy') {
        hash = await walletClient.writeContract({
          address: d.router, abi: routerAbi, functionName: 'swapExactETHForTokens',
          args: [minOut, [{ from: d.weth, to: token.addr, stable: false }], address, deadline],
          value: inWei, account: address, chain: null,
        })
      } else {
        await ensureAllowance(publicClient, walletClient, token.addr, address, d.router, inWei)
        hash = await walletClient.writeContract({
          address: d.router, abi: routerAbi, functionName: 'swapExactTokensForETH',
          args: [inWei, minOut, [{ from: token.addr, to: d.weth, stable: false }], address, deadline],
          account: address, chain: null,
        })
      }
      const tid = toast.loading(`${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}…`)
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${token.symbol}`, { id: tid })
      setAmountIn(''); setOut(null); onTraded()
    } catch (e) {
      toast.error(txError(e))
      setErr(txError(e))
    } finally {
      setBusy(false)
    }
  }

  const payLabel = side === 'buy' ? 'ETH' : token.symbol
  const getLabel = side === 'buy' ? token.symbol : 'ETH'
  const bal = side === 'buy' ? ethBal : tokBal
  const balDec = 18
  const overBalance = bal != null && amountIn ? (side === 'buy' ? parseEther(amountIn || '0') : parseUnits(amountIn || '0', 18)) > bal : false
  const payUsd = amountIn ? (side === 'buy' ? Number(amountIn) * ethUsd : Number(amountIn) * token.price * ethUsd) : 0
  const impact = (() => {
    if (!amountIn || out == null || token.price <= 0) return null
    const inN = Number(amountIn), outN = Number(formatUnits(out, 18))
    if (!(inN > 0) || !(outN > 0)) return null
    const eff = side === 'buy' ? inN / outN : outN / inN // ETH per whole token
    const imp = side === 'buy' ? (eff - token.price) / token.price : (token.price - eff) / token.price
    return isFinite(imp) ? Math.max(0, imp * 100) : null
  })()

  return (
    <div className="card">
      <div className="tabs seg">
        <button className={side === 'buy' ? 'active' : ''} onClick={() => { setSide('buy'); setAmountIn(''); setOut(null) }}>Buy</button>
        <button className={side === 'sell' ? 'active' : ''} onClick={() => { setSide('sell'); setAmountIn(''); setOut(null) }}>Sell</button>
      </div>
      <div className="field">
        <div className="row"><label>You pay</label><span className="tok">{payLabel}</span></div>
        <input inputMode="decimal" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ''))} />
        {payUsd > 0 && <div className="pay-usd">≈ {fmtUsd(payUsd)}</div>}
        {side === 'buy' && (
          <div className="quickbuy">
            {['0.01', '0.05', '0.1'].map((v) => (
              <button key={v} className="chip" onClick={() => setAmountIn(v)}>{v}</button>
            ))}
            {bal != null && <button className="chip" onClick={() => setAmountIn(formatUnits(bal, balDec))}>Max</button>}
          </div>
        )}
        {side === 'sell' && bal != null && bal > 0n && (
          <div className="quickbuy">
            {[25, 50, 75, 100].map((p) => (
              <button key={p} className="chip" onClick={() => setAmountIn(formatUnits((bal * BigInt(p)) / 100n, balDec))}>{p}%</button>
            ))}
          </div>
        )}
        {bal != null && <div className="bal">Balance {fmtAmount(bal, balDec)}</div>}
      </div>
      <div className="field">
        <div className="row"><label>You receive</label><span className="tok">{getLabel}</span></div>
        <input readOnly placeholder="0.0" value={out != null ? fmtAmount(out, 18, 6) : ''} />
        {impact != null && impact >= 0.05 && <div className={`impact ${impact >= 3 ? 'hi' : ''}`}>Price impact ~{impact.toFixed(2)}%</div>}
      </div>
      <div className="sliprow">
        <span className="slip-label">Slippage</span>
        {([['0.5%', 50n], ['1%', 100n], ['2%', 200n]] as const).map(([l, b]) => (
          <button key={l} className={`chip ${slipBps === b ? 'on' : ''}`} onClick={() => setSlipBps(b)}>{l}</button>
        ))}
      </div>
      <button className="btn" disabled={busy || !address || !isSupported || out == null || overBalance} onClick={trade}>
        {!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : overBalance ? 'Insufficient balance'
          : busy ? <><span className="spinner" /> {side === 'buy' ? 'Buying' : 'Selling'}</>
          : side === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
      </button>
      {err && <div className="err">{err}</div>}
      <div className="sub" style={{ marginTop: '.5rem', textAlign: 'center', fontSize: '.78rem' }}>
        {onCurve ? 'Trading on the bonding curve.' : 'Trading the graduated ve(3,3) pool.'}
      </div>
    </div>
  )
}

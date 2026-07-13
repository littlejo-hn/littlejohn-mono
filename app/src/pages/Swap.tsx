import { useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, coreLive } from '../config/contracts'
import { erc20Abi, routerAbi } from '../abis'
import { DEFAULT_CHAIN } from '../lib/chains'
import { fmtAmount } from '../lib/format'

type Tok = { sym: string; addr: Address; dec: number }

const DEADLINE_MIN = 20
const SLIPPAGE_BPS = 50n // 0.5%

export function Swap() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = coreLive(d)

  const tokens: Tok[] = useMemo(
    () => (live ? [
      { sym: 'JOHN', addr: d!.john, dec: 18 },
      { sym: 'WETH', addr: d!.weth, dec: 18 },
      { sym: 'USDG', addr: d!.usdg, dec: 6 },
    ] : []),
    [live, d],
  )

  const [fromI, setFromI] = useState(0)
  const [toI, setToI] = useState(1)
  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState<bigint | null>(null)
  const [bal, setBal] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const from = tokens[fromI]
  const to = tokens[toI]

  useEffect(() => {
    if (!live || !address || !from) { setBal(null); return }
    let off = false
    publicClient
      .readContract({ address: from.addr, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => !off && setBal(b as bigint))
      .catch(() => setBal(null))
    return () => { off = true }
  }, [live, address, from, publicClient, done])

  useEffect(() => {
    if (!live || !from || !to || !amountIn) { setAmountOut(null); return }
    let off = false
    const t = setTimeout(async () => {
      try {
        const inWei = parseUnits(amountIn, from.dec)
        if (inWei <= 0n) { setAmountOut(null); return }
        const amounts = (await publicClient.readContract({
          address: d!.router,
          abi: routerAbi,
          functionName: 'getAmountsOut',
          args: [inWei, [{ from: from.addr, to: to.addr, stable: false }]],
        })) as bigint[]
        if (!off) setAmountOut(amounts[amounts.length - 1])
      } catch {
        if (!off) setAmountOut(null)
      }
    }, 300)
    return () => { off = true; clearTimeout(t) }
  }, [live, from, to, amountIn, publicClient, d])

  const flip = () => { setFromI(toI); setToI(fromI); setAmountIn(''); setAmountOut(null) }

  const swap = async () => {
    if (!walletClient || !address || !from || !to || !amountOut) return
    setBusy(true); setErr(null); setDone(false)
    try {
      const inWei = parseUnits(amountIn, from.dec)
      const allowance = (await publicClient.readContract({
        address: from.addr, abi: erc20Abi, functionName: 'allowance', args: [address, d!.router],
      })) as bigint
      if (allowance < inWei) {
        const approveHash = await walletClient.writeContract({
          address: from.addr, abi: erc20Abi, functionName: 'approve', args: [d!.router, inWei],
          account: address, chain: null,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
      const minOut = amountOut - (amountOut * SLIPPAGE_BPS) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MIN * 60)
      const hash = await walletClient.writeContract({
        address: d!.router, abi: routerAbi, functionName: 'swapExactTokensForTokens',
        args: [inWei, minOut, [{ from: from.addr, to: to.addr, stable: false }], address, deadline],
        account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone(true); setAmountIn(''); setAmountOut(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!live) {
    return (
      <div className="card">
        <div className="title">Swap</div>
        <div className="sub">Trade on the band&apos;s pools.</div>
        <hr className="hr" />
        <div className="notice">Swaps go live at launch. The venue is deployed, gauges are being armed. <b>Heist Season 0</b> is how you get in early.</div>
      </div>
    )
  }

  const overBalance = bal != null && amountIn ? parseUnits(amountIn || '0', from.dec) > bal : false

  return (
    <div className="card">
      <div className="field">
        <div className="row"><label>You pay</label>
          <select className="tok" value={fromI} onChange={(e) => setFromI(Number(e.target.value))}>
            {tokens.map((t, i) => <option key={t.sym} value={i} disabled={i === toI}>{t.sym}</option>)}
          </select>
        </div>
        <input inputMode="decimal" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ''))} />
        {bal != null && <div className="bal">Balance {fmtAmount(bal, from.dec)} <button className="pill" style={{ marginLeft: 6 }} onClick={() => setAmountIn(formatUnits(bal, from.dec))}>Max</button></div>}
      </div>

      <div className="mid"><button className="swapper" onClick={flip} title="Flip">↓</button></div>

      <div className="field">
        <div className="row"><label>You receive</label>
          <select className="tok" value={toI} onChange={(e) => setToI(Number(e.target.value))}>
            {tokens.map((t, i) => <option key={t.sym} value={i} disabled={i === fromI}>{t.sym}</option>)}
          </select>
        </div>
        <input readOnly placeholder="0.0" value={amountOut != null ? fmtAmount(amountOut, to.dec, 6) : ''} />
      </div>

      <button className="btn" disabled={busy || !address || !isSupported || !amountOut || overBalance} onClick={swap}>
        {!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : overBalance ? 'Insufficient balance' : busy ? <><span className="spinner" /> Swapping…</> : 'Swap'}
      </button>
      {done && <div className="ok">Swapped. The band took its toll.</div>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

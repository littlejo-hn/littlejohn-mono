import { useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, coreLive } from '../config/contracts'
import { routerAbi, pairAbi } from '../abis'
import { tokenList, type Tok, minWithSlippage, deadline } from '../lib/tokens'
import { ensureAllowance, txError } from '../lib/tx'
import { DEFAULT_CHAIN } from '../lib/chains'
import { fmtAmount } from '../lib/format'

type Mode = 'add' | 'remove'

export function Pools() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = coreLive(d)
  const tokens = useMemo(() => (live ? tokenList(d!) : []), [live, d])

  const [mode, setMode] = useState<Mode>('add')
  const [aI, setAI] = useState(0)
  const [bI, setBI] = useState(2) // JOHN / USDG by default
  const [stable, setStable] = useState(false)
  const [amtA, setAmtA] = useState('')
  const [amtB, setAmtB] = useState('')
  const [lpAmt, setLpAmt] = useState('')
  const [lpBal, setLpBal] = useState<bigint | null>(null)
  const [pair, setPair] = useState<Address | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const A = tokens[aI]
  const B = tokens[bI]

  // resolve the pair address + the user's LP balance
  useEffect(() => {
    if (!live || !A || !B) { setPair(null); setLpBal(null); return }
    let off = false
    ;(async () => {
      try {
        const p = (await publicClient.readContract({
          address: d!.router, abi: routerAbi, functionName: 'pairFor', args: [A.addr, B.addr, stable],
        })) as Address
        if (off) return
        setPair(p)
        if (address) {
          const bal = (await publicClient.readContract({ address: p, abi: pairAbi, functionName: 'balanceOf', args: [address] })) as bigint
          if (!off) setLpBal(bal)
        }
      } catch { if (!off) { setPair(null); setLpBal(null) } }
    })()
    return () => { off = true }
  }, [live, A, B, stable, address, publicClient, d, done])

  const addLiquidity = async () => {
    if (!walletClient || !address || !A || !B || !amtA || !amtB) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const wa = parseUnits(amtA, A.dec)
      const wb = parseUnits(amtB, B.dec)
      await ensureAllowance(publicClient, walletClient, A.addr, address, d!.router, wa)
      await ensureAllowance(publicClient, walletClient, B.addr, address, d!.router, wb)
      const hash = await walletClient.writeContract({
        address: d!.router, abi: routerAbi, functionName: 'addLiquidity',
        args: [A.addr, B.addr, stable, wa, wb, minWithSlippage(wa), minWithSlippage(wb), address, deadline()],
        account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Liquidity added.'); setAmtA(''); setAmtB('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const removeLiquidity = async () => {
    if (!walletClient || !address || !A || !B || !pair || !lpAmt) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const lp = parseUnits(lpAmt, 18)
      // compute expected token amounts from reserves for slippage mins
      const [meta, total] = await Promise.all([
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' }) as Promise<readonly [bigint, bigint, bigint, bigint, boolean, Address, Address]>,
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'totalSupply' }) as Promise<bigint>,
      ])
      const [, , r0, r1, , t0] = meta
      const rA = t0.toLowerCase() === A.addr.toLowerCase() ? r0 : r1
      const rB = t0.toLowerCase() === A.addr.toLowerCase() ? r1 : r0
      const expA = total > 0n ? (rA * lp) / total : 0n
      const expB = total > 0n ? (rB * lp) / total : 0n
      await ensureAllowance(publicClient, walletClient, pair, address, d!.router, lp)
      const hash = await walletClient.writeContract({
        address: d!.router, abi: routerAbi, functionName: 'removeLiquidity',
        args: [A.addr, B.addr, stable, lp, minWithSlippage(expA), minWithSlippage(expB), address, deadline()],
        account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Liquidity removed.'); setLpAmt('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  if (!live) {
    return (
      <div className="card">
        <div className="title">Pools</div>
        <div className="sub">Provide liquidity, earn $JOHN emissions.</div>
        <hr className="hr" />
        <div className="notice">Liquidity pools open at launch. Deep stable pairs (USDG/USDe) and the memecoin gauges come first.</div>
      </div>
    )
  }

  const TokenSelect = ({ v, on, exclude }: { v: number; on: (i: number) => void; exclude: number }) => (
    <select className="tok" value={v} onChange={(e) => on(Number(e.target.value))}>
      {tokens.map((t: Tok, i: number) => <option key={t.sym} value={i} disabled={i === exclude}>{t.sym}</option>)}
    </select>
  )

  return (
    <div className="card">
      <nav className="tabs" style={{ margin: '0 0 0.9rem' }}>
        <button className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>Add</button>
        <button className={mode === 'remove' ? 'active' : ''} onClick={() => setMode('remove')}>Remove</button>
      </nav>

      <div className="kv"><span className="k">Pair type</span><span className="v">
        <button className={`pill ${stable ? '' : 'gold'}`} onClick={() => setStable(false)} style={{ marginRight: 6 }}>Volatile</button>
        <button className={`pill ${stable ? 'gold' : ''}`} onClick={() => setStable(true)}>Stable</button>
      </span></div>
      <hr className="hr" />

      {mode === 'add' ? (
        <>
          <div className="field">
            <div className="row"><label>Token A</label><TokenSelect v={aI} on={setAI} exclude={bI} /></div>
            <input inputMode="decimal" placeholder="0.0" value={amtA} onChange={(e) => setAmtA(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <div style={{ height: 8 }} />
          <div className="field">
            <div className="row"><label>Token B</label><TokenSelect v={bI} on={setBI} exclude={aI} /></div>
            <input inputMode="decimal" placeholder="0.0" value={amtB} onChange={(e) => setAmtB(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <button className="btn" disabled={busy || !address || !isSupported || !amtA || !amtB} onClick={addLiquidity}>
            {!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : busy ? <><span className="spinner" /> Adding…</> : 'Add liquidity'}
          </button>
        </>
      ) : (
        <>
          <div className="kv"><span className="k">{A.sym} / {B.sym} {stable ? 'stable' : 'volatile'} LP</span>
            <span className="v">{lpBal != null ? fmtAmount(lpBal, 18) : '…'}</span></div>
          <div className="field" style={{ marginTop: 8 }}>
            <div className="row"><label>LP to remove</label>
              {lpBal != null && <button className="pill" onClick={() => setLpAmt(formatUnits(lpBal, 18))}>Max</button>}
            </div>
            <input inputMode="decimal" placeholder="0.0" value={lpAmt} onChange={(e) => setLpAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <button className="btn" disabled={busy || !address || !isSupported || !lpAmt || !lpBal} onClick={removeLiquidity}>
            {!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : busy ? <><span className="spinner" /> Removing…</> : 'Remove liquidity'}
          </button>
        </>
      )}
      {done && <div className="ok">{done}</div>}
      {err && <div className="err">{err}</div>}
      <div className="sub" style={{ marginTop: '0.8rem' }}>Stake LP into a gauge to earn $JOHN emissions. Gauge staking UI lands next.</div>
    </div>
  )
}

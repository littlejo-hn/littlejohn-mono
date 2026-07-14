import { useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, coreLive, ZERO } from '../config/contracts'
import { routerAbi, pairAbi, voterAbi, gaugeAbi } from '../abis'
import { tokenList, type Tok, minWithSlippage, deadline } from '../lib/tokens'
import { ensureAllowance, txError } from '../lib/tx'
import { DEFAULT_CHAIN } from '../lib/chains'
import { fmtAmount } from '../lib/format'

type Mode = 'add' | 'remove' | 'stake'

export function Pools() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = coreLive(d)
  const tokens = useMemo(() => (live ? tokenList(d!) : []), [live, d])

  const [mode, setMode] = useState<Mode>('add')
  const [aI, setAI] = useState(0)
  const [bI, setBI] = useState(2)
  const [stable, setStable] = useState(false)
  const [amtA, setAmtA] = useState('')
  const [amtB, setAmtB] = useState('')
  const [lpAmt, setLpAmt] = useState('')
  const [stakeAmt, setStakeAmt] = useState('')
  const [unstakeAmt, setUnstakeAmt] = useState('')
  const [lpBal, setLpBal] = useState<bigint | null>(null)
  const [pair, setPair] = useState<Address | null>(null)
  const [gauge, setGauge] = useState<Address | null>(null)
  const [staked, setStaked] = useState<bigint | null>(null)
  const [earned, setEarned] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const A = tokens[aI]
  const B = tokens[bI]

  useEffect(() => {
    if (!live || !A || !B) { setPair(null); setLpBal(null); setGauge(null); setStaked(null); setEarned(null); return }
    let off = false
    ;(async () => {
      try {
        const p = (await publicClient.readContract({ address: d!.router, abi: routerAbi, functionName: 'pairFor', args: [A.addr, B.addr, stable] })) as Address
        if (off) return
        setPair(p)
        const g = (await publicClient.readContract({ address: d!.voter, abi: voterAbi, functionName: 'gauges', args: [p] })) as Address
        if (off) return
        setGauge(g !== ZERO ? g : null)
        if (address) {
          const [bal, stk, ern] = await Promise.all([
            publicClient.readContract({ address: p, abi: pairAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
            g !== ZERO ? publicClient.readContract({ address: g, abi: gaugeAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint> : Promise.resolve(0n),
            g !== ZERO ? publicClient.readContract({ address: g, abi: gaugeAbi, functionName: 'earned', args: [d!.john, address] }) as Promise<bigint> : Promise.resolve(0n),
          ])
          if (off) return
          setLpBal(bal); setStaked(stk); setEarned(ern)
        }
      } catch { if (!off) { setPair(null); setLpBal(null); setGauge(null) } }
    })()
    return () => { off = true }
  }, [live, A, B, stable, address, publicClient, d, done])

  const addLiquidity = async () => {
    if (!walletClient || !address || !A || !B || !amtA || !amtB) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const wa = parseUnits(amtA, A.dec), wb = parseUnits(amtB, B.dec)
      await ensureAllowance(publicClient, walletClient, A.addr, address, d!.router, wa)
      await ensureAllowance(publicClient, walletClient, B.addr, address, d!.router, wb)
      const hash = await walletClient.writeContract({
        address: d!.router, abi: routerAbi, functionName: 'addLiquidity',
        args: [A.addr, B.addr, stable, wa, wb, minWithSlippage(wa), minWithSlippage(wb), address, deadline()], account: address, chain: null,
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
      const [meta, total] = await Promise.all([
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'metadata' }) as Promise<readonly [bigint, bigint, bigint, bigint, boolean, Address, Address]>,
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'totalSupply' }) as Promise<bigint>,
      ])
      const [, , r0, r1, , t0] = meta
      const isA0 = t0.toLowerCase() === A.addr.toLowerCase()
      const expA = total > 0n ? ((isA0 ? r0 : r1) * lp) / total : 0n
      const expB = total > 0n ? ((isA0 ? r1 : r0) * lp) / total : 0n
      await ensureAllowance(publicClient, walletClient, pair, address, d!.router, lp)
      const hash = await walletClient.writeContract({
        address: d!.router, abi: routerAbi, functionName: 'removeLiquidity',
        args: [A.addr, B.addr, stable, lp, minWithSlippage(expA), minWithSlippage(expB), address, deadline()], account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Liquidity removed.'); setLpAmt('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const stakeLp = async () => {
    if (!walletClient || !address || !gauge || !pair || !stakeAmt) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const amt = parseUnits(stakeAmt, 18)
      await ensureAllowance(publicClient, walletClient, pair, address, gauge, amt)
      const hash = await walletClient.writeContract({ address: gauge, abi: gaugeAbi, functionName: 'deposit', args: [amt, 0n], account: address, chain: null })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Staked. Earning $JOHN emissions.'); setStakeAmt('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const unstakeLp = async () => {
    if (!walletClient || !address || !gauge || !unstakeAmt) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const hash = await walletClient.writeContract({ address: gauge, abi: gaugeAbi, functionName: 'withdraw', args: [parseUnits(unstakeAmt, 18)], account: address, chain: null })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Unstaked.'); setUnstakeAmt('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const claimRewards = async () => {
    if (!walletClient || !address || !gauge) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const hash = await walletClient.writeContract({ address: gauge, abi: gaugeAbi, functionName: 'getReward', args: [address, [d!.john]], account: address, chain: null })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Rewards claimed.')
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
  const switchMsg = !address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : null

  return (
    <div className="card">
      <nav className="tabs" style={{ margin: '0 0 0.9rem' }}>
        {(['add', 'remove', 'stake'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{m}</button>
        ))}
      </nav>

      <div className="kv"><span className="k">{A.sym} / {B.sym}</span><span className="v">
        <button className={`pill ${stable ? '' : 'gold'}`} onClick={() => setStable(false)} style={{ marginRight: 6 }}>Volatile</button>
        <button className={`pill ${stable ? 'gold' : ''}`} onClick={() => setStable(true)}>Stable</button>
      </span></div>
      <hr className="hr" />

      {mode === 'add' && (
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
          <button className="btn" disabled={busy || !!switchMsg || !amtA || !amtB} onClick={addLiquidity}>
            {switchMsg ?? (busy ? <><span className="spinner" /> Adding…</> : 'Add liquidity')}
          </button>
        </>
      )}

      {mode === 'remove' && (
        <>
          <div className="kv"><span className="k">Your LP</span><span className="v">{lpBal != null ? fmtAmount(lpBal, 18) : '…'}</span></div>
          <div className="field" style={{ marginTop: 8 }}>
            <div className="row"><label>LP to remove</label>
              {lpBal != null && <button className="pill" onClick={() => setLpAmt(formatUnits(lpBal, 18))}>Max</button>}
            </div>
            <input inputMode="decimal" placeholder="0.0" value={lpAmt} onChange={(e) => setLpAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <button className="btn" disabled={busy || !!switchMsg || !lpAmt || !lpBal} onClick={removeLiquidity}>
            {switchMsg ?? (busy ? <><span className="spinner" /> Removing…</> : 'Remove liquidity')}
          </button>
        </>
      )}

      {mode === 'stake' && (
        gauge == null ? (
          <div className="notice">No gauge for this pair yet. Gauges get created as the ecosystem arms up. Until then, LP still earns swap fees.</div>
        ) : (
          <>
            <div className="kv"><span className="k">Unstaked LP</span><span className="v">{lpBal != null ? fmtAmount(lpBal, 18) : '…'}</span></div>
            <div className="kv"><span className="k">Staked LP</span><span className="v">{staked != null ? fmtAmount(staked, 18) : '…'}</span></div>
            <div className="kv"><span className="k">Earned</span><span className="v">{earned != null ? fmtAmount(earned) : '…'} JOHN</span></div>
            <div className="field" style={{ marginTop: 10 }}>
              <div className="row"><label>Stake LP</label>{lpBal != null && <button className="pill" onClick={() => setStakeAmt(formatUnits(lpBal, 18))}>Max</button>}</div>
              <input inputMode="decimal" placeholder="0.0" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <button className="btn" disabled={busy || !!switchMsg || !stakeAmt} onClick={stakeLp}>{switchMsg ?? (busy ? <><span className="spinner" /> Staking…</> : 'Stake')}</button>
            <div className="field" style={{ marginTop: 10 }}>
              <div className="row"><label>Unstake LP</label>{staked != null && staked > 0n && <button className="pill" onClick={() => setUnstakeAmt(formatUnits(staked, 18))}>Max</button>}</div>
              <input inputMode="decimal" placeholder="0.0" value={unstakeAmt} onChange={(e) => setUnstakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <button className="btn ghost" disabled={busy || !!switchMsg || !unstakeAmt} onClick={unstakeLp}>{busy ? '…' : 'Unstake'}</button>
            <button className="btn" disabled={busy || !!switchMsg || !earned} onClick={claimRewards} style={{ marginTop: 8 }}>
              {busy ? '…' : `Claim ${earned != null ? fmtAmount(earned) : '0'} JOHN`}
            </button>
          </>
        )
      )}

      {done && <div className="ok">{done}</div>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

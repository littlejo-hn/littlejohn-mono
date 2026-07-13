import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseUnits, type Address } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, coreLive } from '../config/contracts'
import { escrowAbi, voterAbi, pairAbi } from '../abis'
import { ensureAllowance, txError } from '../lib/tx'
import { DEFAULT_CHAIN } from '../lib/chains'
import { fmtAmount, shortAddr } from '../lib/format'

const DURATIONS: { label: string; secs: number }[] = [
  { label: '1 week', secs: 604800 },
  { label: '1 month', secs: 2592000 },
  { label: '6 months', secs: 15552000 },
  { label: '1 year', secs: 31536000 },
  { label: '2 years', secs: 63072000 },
  { label: '4 years (max)', secs: 126144000 },
]

type LockRow = { tokenId: bigint; amount: bigint; end: bigint; power: bigint }
type Pool = { addr: Address; symbol: string }

export function Lock() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = coreLive(d)

  const [amount, setAmount] = useState('')
  const [durIdx, setDurIdx] = useState(3)
  const [locks, setLocks] = useState<LockRow[]>([])
  const [pools, setPools] = useState<Pool[]>([])
  const [voteLock, setVoteLock] = useState<string>('')
  const [votePool, setVotePool] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const nowSecs = Math.floor(Date.now() / 1000)

  const loadLocks = useCallback(async () => {
    if (!live || !address) { setLocks([]); return }
    try {
      const n = (await publicClient.readContract({ address: d!.escrow, abi: escrowAbi, functionName: 'balanceOf', args: [address] })) as bigint
      const rows: LockRow[] = []
      for (let i = 0n; i < n && i < 20n; i++) {
        const tokenId = (await publicClient.readContract({ address: d!.escrow, abi: escrowAbi, functionName: 'tokenOfOwnerByIndex', args: [address, i] })) as bigint
        const [locked, power] = await Promise.all([
          publicClient.readContract({ address: d!.escrow, abi: escrowAbi, functionName: 'locked', args: [tokenId] }) as Promise<readonly [bigint, bigint]>,
          publicClient.readContract({ address: d!.escrow, abi: escrowAbi, functionName: 'balanceOfNFT', args: [tokenId] }) as Promise<bigint>,
        ])
        rows.push({ tokenId, amount: locked[0], end: locked[1], power })
      }
      setLocks(rows)
    } catch { setLocks([]) }
  }, [live, address, publicClient, d])

  const loadPools = useCallback(async () => {
    if (!live) return
    try {
      const len = (await publicClient.readContract({ address: d!.voter, abi: voterAbi, functionName: 'length' })) as bigint
      const out: Pool[] = []
      for (let i = 0n; i < len && i < 12n; i++) {
        const addr = (await publicClient.readContract({ address: d!.voter, abi: voterAbi, functionName: 'pools', args: [i] })) as Address
        let symbol = shortAddr(addr)
        try { symbol = (await publicClient.readContract({ address: addr, abi: pairAbi, functionName: 'symbol' })) as string } catch { /* keep short addr */ }
        out.push({ addr, symbol })
      }
      setPools(out)
    } catch { setPools([]) }
  }, [live, publicClient, d])

  useEffect(() => { loadLocks() }, [loadLocks, done])
  useEffect(() => { loadPools() }, [loadPools])

  const createLock = async () => {
    if (!walletClient || !address || !amount) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const value = parseUnits(amount, 18)
      await ensureAllowance(publicClient, walletClient, d!.john, address, d!.escrow, value)
      const hash = await walletClient.writeContract({
        address: d!.escrow, abi: escrowAbi, functionName: 'create_lock',
        args: [value, BigInt(DURATIONS[durIdx].secs)], account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Locked. Your veJOHN is live. Go vote.'); setAmount('')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const withdraw = async (tokenId: bigint) => {
    if (!walletClient || !address) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const hash = await walletClient.writeContract({ address: d!.escrow, abi: escrowAbi, functionName: 'withdraw', args: [tokenId], account: address, chain: null })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Withdrawn.')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const castVote = async () => {
    if (!walletClient || !address || !voteLock || !votePool) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const hash = await walletClient.writeContract({
        address: d!.voter, abi: voterAbi, functionName: 'vote',
        args: [BigInt(voteLock), [votePool as Address], [100n]], account: address, chain: null,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setDone('Vote cast. You earn this pool’s fees and tolls this epoch.')
    } catch (e) { setErr(txError(e)) } finally { setBusy(false) }
  }

  const switchMsg = useMemo(() => (!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : null), [address, isSupported])

  if (!live) {
    return (
      <div className="card">
        <div className="title">Lock <span className="em">&amp; vote</span></div>
        <div className="sub">Lock $JOHN for up to 4 years to get veJOHN. Vote weekly, take 100% of the fees and tolls from the pools you back.</div>
        <hr className="hr" />
        <div className="notice">Locking opens at TGE. Heist rewards already arrive as locked veJOHN, so you&apos;ll be voting from day one.</div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="title">Lock <span className="em">$JOHN</span></div>
        <div className="sub">Longer locks, more voting power. Max 4 years.</div>
        <hr className="hr" />
        <div className="field">
          <div className="row"><label>Amount</label><span className="tok">JOHN</span></div>
          <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <div className="row"><label>Lock for</label>
            <select className="tok" value={durIdx} onChange={(e) => setDurIdx(Number(e.target.value))}>
              {DURATIONS.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}
            </select>
          </div>
        </div>
        <button className="btn" disabled={busy || !!switchMsg || !amount} onClick={createLock}>
          {switchMsg ?? (busy ? <><span className="spinner" /> Locking…</> : 'Lock')}
        </button>
      </div>

      {locks.length > 0 && (
        <div className="card">
          <div className="title" style={{ fontSize: '1.1rem' }}>Your locks</div>
          {locks.map((l) => {
            const expired = Number(l.end) <= nowSecs
            return (
              <div key={l.tokenId.toString()}>
                <hr className="hr" />
                <div className="kv"><span className="k">veJOHN #{l.tokenId.toString()}</span><span className="v">{fmtAmount(l.power)} power</span></div>
                <div className="kv"><span className="k">Locked</span><span className="v">{fmtAmount(l.amount)} JOHN</span></div>
                <div className="kv"><span className="k">{expired ? 'Unlocked' : 'Unlocks'}</span><span className="v">
                  {expired ? <button className="pill gold" disabled={busy} onClick={() => withdraw(l.tokenId)}>Withdraw</button>
                    : new Date(Number(l.end) * 1000).toLocaleDateString()}
                </span></div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card">
        <div className="title" style={{ fontSize: '1.1rem' }}>Vote</div>
        <div className="sub">Direct emissions to a pool. You collect its fees + tolls this epoch.</div>
        <hr className="hr" />
        {locks.length === 0 ? (
          <div className="notice">Lock $JOHN first to get a veJOHN vote.</div>
        ) : pools.length === 0 ? (
          <div className="notice">No gauges yet. Pools get gauges as the ecosystem arms up.</div>
        ) : (
          <>
            <div className="field">
              <div className="row"><label>Vote with</label>
                <select className="tok" value={voteLock} onChange={(e) => setVoteLock(e.target.value)}>
                  <option value="">Select lock</option>
                  {locks.map((l) => <option key={l.tokenId.toString()} value={l.tokenId.toString()}>#{l.tokenId.toString()} · {fmtAmount(l.power)}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <div className="row"><label>For pool (100%)</label>
                <select className="tok" value={votePool} onChange={(e) => setVotePool(e.target.value)}>
                  <option value="">Select pool</option>
                  {pools.map((p) => <option key={p.addr} value={p.addr}>{p.symbol}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" disabled={busy || !!switchMsg || !voteLock || !votePool} onClick={castVote}>
              {switchMsg ?? (busy ? <><span className="spinner" /> Voting…</> : 'Cast vote')}
            </button>
            <div className="sub" style={{ marginTop: '0.7rem' }}>Multi-pool weighted voting lands next; for now this votes 100% to one pool.</div>
          </>
        )}
        {done && <div className="ok">{done}</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, ZERO } from '../config/contracts'
import { heistsAbi } from '../abis'
import { fmtAmount, fmtDuration } from '../lib/format'
import { DEFAULT_CHAIN } from '../lib/chains'

type ClaimEntry = { index: number; address: string; amount: string; proof: Hex[] }
type SeasonFile = { root: Hex; count: number; total: string; claims: ClaimEntry[] }

const SEASON_ID = 0

export function Claim() {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const heists = d?.heists
  const heistsLive = !!heists && heists !== ZERO

  const [file, setFile] = useState<SeasonFile | null>(null)
  const [entry, setEntry] = useState<ClaimEntry | null>(null)
  const [claimed, setClaimed] = useState<boolean | null>(null)
  const [lockSecs, setLockSecs] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  useEffect(() => {
    fetch(`./claims/season-${SEASON_ID}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setFile)
      .catch(() => setFile(null))
  }, [])

  useEffect(() => {
    if (!file || !address) { setEntry(null); return }
    setEntry(file.claims.find((c) => c.address.toLowerCase() === address.toLowerCase()) ?? null)
  }, [file, address])

  useEffect(() => {
    if (!heistsLive || !entry) return
    let cancelled = false
    ;(async () => {
      try {
        const [season, isC] = await Promise.all([
          publicClient.readContract({ address: heists!, abi: heistsAbi, functionName: 'seasons', args: [BigInt(SEASON_ID)] }),
          publicClient.readContract({ address: heists!, abi: heistsAbi, functionName: 'isClaimed', args: [BigInt(SEASON_ID), BigInt(entry.index)] }),
        ])
        if (cancelled) return
        setLockSecs(Number((season as readonly [Hex, bigint, boolean])[1]))
        setClaimed(isC as boolean)
      } catch {
        /* season not open yet */
      }
    })()
    return () => { cancelled = true }
  }, [heistsLive, heists, entry, publicClient])

  const claim = async () => {
    if (!walletClient || !address || !entry || !heists) return
    setBusy(true); setErr(null)
    try {
      const hash = await walletClient.writeContract({
        address: heists,
        abi: heistsAbi,
        functionName: 'claim',
        args: [BigInt(SEASON_ID), BigInt(entry.index), BigInt(entry.amount), entry.proof],
        account: address,
        chain: null,
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setClaimed(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="title">Heist <span className="em">Season {SEASON_ID}</span></div>
      <div className="sub">Earned $JOHN, delivered as locked veJOHN. You don&apos;t farm us and leave. You join the band and eat every week.</div>
      <hr className="hr" />

      {!address && <div className="notice">Connect your wallet to check your allocation.</div>}

      {address && !file && (
        <div className="notice">Season {SEASON_ID} allocations aren&apos;t published yet. Come back when the Heist opens.</div>
      )}

      {address && file && !entry && (
        <div className="notice">No allocation for <b>{address.slice(0, 6)}…{address.slice(-4)}</b> in Season {SEASON_ID}. LP, lock, refer, and make noise to earn the next one.</div>
      )}

      {address && entry && (
        <>
          <div className="kv"><span className="k">Your allocation</span><span className="v">{fmtAmount(BigInt(entry.amount))} JOHN</span></div>
          <div className="kv"><span className="k">Delivered as</span><span className="v">veJOHN locked {lockSecs ? fmtDuration(lockSecs) : '≥ 1 year'}</span></div>
          <div className="kv"><span className="k">Status</span><span className="v">
            {claimed === true ? <span className="pill good">Claimed</span> : claimed === false ? <span className="pill gold">Unclaimed</span> : <span className="pill">…</span>}
          </span></div>

          {!heistsLive && <div className="err">Distributor not live on this network yet.</div>}
          {!isSupported && address && <div className="err">Switch to {DEFAULT_CHAIN.name} to claim.</div>}

          {claimed !== true && (
            <button className="btn" disabled={busy || !heistsLive || !isSupported} onClick={claim}>
              {busy ? <><span className="spinner" /> Claiming…</> : 'Claim veJOHN'}
            </button>
          )}
          {claimed === true && <div className="ok">Locked in. Your veJOHN is voting and earning fees.</div>}
          {txHash && <div className="sub">tx {txHash.slice(0, 10)}…</div>}
          {err && <div className="err">{err}</div>}
        </>
      )}
    </div>
  )
}

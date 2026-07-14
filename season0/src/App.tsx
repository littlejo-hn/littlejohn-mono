import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { connect, currentAddress, signAction } from './wallet'
import { apiJoin, apiMe, apiLeaderboard, apiSubmit, type Me, type LeaderRow } from './api'

const refFromUrl = new URLSearchParams(location.search).get('ref') || undefined
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// Season 0 weights, mirrored for the UI (source of truth is functions/_lib.ts)
const WEIGHTS = { mindshare: 40, testnet: 30, referrals: 20, poi: 10 }

export function App() {
  const [addr, setAddr] = useState<Address | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [participants, setParticipants] = useState(0)
  const [xHandle, setXHandle] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadMe = useCallback(async (a: string) => { try { setMe(await apiMe(a)) } catch { setMe(null) } }, [])
  const loadBoard = useCallback(async () => {
    try { const r = await apiLeaderboard(); setBoard(r.leaderboard); setParticipants(r.participants) } catch { /* empty */ }
  }, [])

  useEffect(() => { currentAddress().then((a) => { setAddr(a); if (a) loadMe(a) }); loadBoard() }, [loadMe, loadBoard])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const doConnect = () => run('connect', async () => { const a = await connect(); setAddr(a); await loadMe(a) })
  const doJoin = () => run('join', async () => {
    if (!addr) return
    const { ts, signature } = await signAction(addr, 'join')
    await apiJoin(addr, signature, ts, refFromUrl, xHandle || undefined)
    await loadMe(addr)
  })
  const doSubmit = () => run('submit', async () => {
    if (!addr || !url) return
    const { ts, signature } = await signAction(addr, 'submit')
    await apiSubmit(addr, signature, ts, url.trim())
    setUrl(''); await loadMe(addr)
  })

  const referralLink = me?.code ? `${location.origin}/?ref=${me.code}` : ''
  const copyRef = () => { navigator.clipboard.writeText(referralLink); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark" />Heist <span className="em" style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', marginLeft: 4 }}>Season 0</span></div>
        {addr ? <span className="pill good">{short(addr)}</span>
          : <button className="pill gold" onClick={doConnect} disabled={busy === 'connect'}>{busy === 'connect' ? '…' : 'Connect'}</button>}
      </header>

      {/* intro / join */}
      {!me?.joined && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div className="title">Scout the <span className="em">job.</span></div>
          <div className="sub">LittleJohn hasn&apos;t launched yet. Earn your cut of the genesis $JOHN now: make noise, run the testnet, bring the crew. Rewards land as locked veJOHN at TGE. No deposits, ever.</div>
          <hr className="hr" />
          <div className="kv"><span className="k">Make noise (mindshare)</span><span className="v">{WEIGHTS.mindshare}%</span></div>
          <div className="kv"><span className="k">Run the testnet</span><span className="v">{WEIGHTS.testnet}%</span></div>
          <div className="kv"><span className="k">Bring the crew (referrals)</span><span className="v">{WEIGHTS.referrals}%</span></div>
          <div className="kv"><span className="k">Show intent (bridge / LP)</span><span className="v">{WEIGHTS.poi}%</span></div>
          <hr className="hr" />
          {refFromUrl && <div className="sub">Joining with referral <b>{refFromUrl}</b>.</div>}
          <div className="field" style={{ marginTop: 8 }}>
            <div className="row"><label>Your X handle (optional)</label></div>
            <input placeholder="@handle" value={xHandle} onChange={(e) => setXHandle(e.target.value)} />
          </div>
          <button className="btn" disabled={!addr || busy === 'join'} onClick={addr ? doJoin : doConnect}>
            {!addr ? 'Connect wallet' : busy === 'join' ? 'Signing…' : 'Join the Heist'}
          </button>
          <div className="sub" style={{ marginTop: 6 }}>You sign a message to prove the wallet is yours. It costs no gas and moves no funds.</div>
        </div>
      )}

      {/* joined: your standing */}
      {me?.joined && (
        <>
          <div className="card" style={{ marginTop: '1.25rem' }}>
            <div className="kv"><span className="k">Your rank</span><span className="v">#{me.rank} of {me.participants}</span></div>
            <div className="kv"><span className="k">Total score</span><span className="v">{me.total?.toLocaleString()}</span></div>
            <hr className="hr" />
            <div className="kv"><span className="k">Mindshare</span><span className="v">{me.points?.mindshare ?? 0}</span></div>
            <div className="kv"><span className="k">Testnet</span><span className="v">{me.points?.testnet ?? 0}</span></div>
            <div className="kv"><span className="k">Referrals</span><span className="v">{me.points?.referrals ?? 0}</span></div>
            <div className="kv"><span className="k">Proof of interest</span><span className="v">{me.points?.poi ?? 0}</span></div>
          </div>

          {/* referral */}
          <div className="card">
            <div className="title" style={{ fontSize: '1.1rem' }}>Bring the crew</div>
            <div className="sub">You earn when someone you refer actually shows up and earns. Capped, so quality beats spam.</div>
            <div className="field" style={{ marginTop: 8 }}>
              <div className="row"><label>Your referral link</label><button className="pill gold" onClick={copyRef}>{copied ? 'Copied' : 'Copy'}</button></div>
              <input readOnly value={referralLink} />
            </div>
          </div>

          {/* mindshare */}
          <div className="card">
            <div className="title" style={{ fontSize: '1.1rem' }}>Make noise</div>
            <div className="sub">Post about LittleJohn on X, submit the link. The Merry Men score it on quality, not impressions.</div>
            <div className="field" style={{ marginTop: 8 }}>
              <div className="row"><label>X post link</label></div>
              <input placeholder="https://x.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <button className="btn" disabled={!url || busy === 'submit'} onClick={doSubmit}>{busy === 'submit' ? 'Signing…' : 'Submit for scoring'}</button>
            {me.submissions && me.submissions.length > 0 && (
              <>
                <hr className="hr" />
                {me.submissions.slice(0, 6).map((s) => (
                  <div className="kv" key={s.id}>
                    <span className="k" style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url.replace(/^https?:\/\//, '')}</span>
                    <span className="v"><span className={`pill ${s.status === 'approved' ? 'good' : s.status === 'rejected' ? '' : 'gold'}`}>{s.status === 'approved' ? `+${s.score}` : s.status}</span></span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* testnet quests (stub until deploy) */}
          <div className="card">
            <div className="title" style={{ fontSize: '1.1rem' }}>Run the testnet</div>
            <div className="sub">Swap, add liquidity, lock veJOHN, vote, claim a test Heist. Depth counts, not clicks.</div>
            <hr className="hr" />
            <div className="notice">Testnet quests open the moment the deployment is live. Your actions there get scored automatically.</div>
          </div>

          {/* proof of interest */}
          <div className="card">
            <div className="title" style={{ fontSize: '1.1rem' }}>Show intent</div>
            <div className="sub">Real skin in the game, no custody with us: bridge assets to Robinhood Chain, or LP on Morpho / Uniswap. Counted automatically.</div>
          </div>
        </>
      )}

      {/* leaderboard */}
      <div className="card">
        <div className="title" style={{ fontSize: '1.1rem' }}>Leaderboard <span className="sub" style={{ display: 'inline' }}>· {participants} in the band</span></div>
        <hr className="hr" />
        {board.length === 0 ? <div className="notice">Empty. Be the first name on the board.</div> : board.slice(0, 25).map((r) => (
          <div className="kv" key={r.rank}>
            <span className="k">#{r.rank} {r.xHandle ? `@${r.xHandle}` : r.wallet}</span>
            <span className="v">{r.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {err && <div className="err">{err}</div>}
      <div className="footer">
        <div>Every swap pays the band.</div>
        <div className="warn">No token yet. Anyone selling you $JOHN is robbing you. Season 0 never asks you to deposit.</div>
      </div>
    </div>
  )
}

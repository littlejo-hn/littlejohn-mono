import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProfile, type Profile } from '../lib/social'
import { Avatar } from '../components/Avatar'
import { fmtUsd, short } from '../lib/token'

type Coin = { address: string; symbol: string; name: string | null; image: string | null; mcap: number | null; graduated: boolean }

export function UserPage() {
  const { addr = '' } = useParams()
  const lower = addr.toLowerCase()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [coins, setCoins] = useState<Coin[]>([])

  useEffect(() => {
    if (!/^0x[0-9a-f]{40}$/.test(lower)) return
    getProfile(lower).then(setProfile)
    fetch(`/api/search?q=${lower}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.coins) setCoins(d.coins as Coin[]) })
      .catch(() => {})
  }, [lower])

  if (!/^0x[0-9a-f]{40}$/.test(lower)) {
    return <div className="card"><div className="title">Not found</div></div>
  }

  return (
    <div className="userpage">
      <div className="card user-head">
        <Avatar className="user-av" image={profile?.avatar ?? undefined} symbol={profile?.username ?? addr} addr={addr} />
        <div className="user-info">
          <div className="user-name">{profile?.username || short(addr)}</div>
          <div className="user-addr num">{addr}</div>
          {profile?.bio && <div className="user-bio">{profile.bio}</div>}
        </div>
      </div>

      <div className="board-title" style={{ margin: '.2rem 0' }}>Coins created <span className="tag">{coins.length}</span></div>
      {coins.length === 0 && <div className="empty"><div className="empty-sub">No coins launched yet.</div></div>}
      <div className="board">
        {coins.map((c) => (
          <Link key={c.address} className="bcard" to={`/coin/${c.address}`}>
            <div className="bcard-imgwrap">
              <Avatar className="bcard-img" image={c.image ?? undefined} symbol={c.symbol} addr={c.address} />
              {c.graduated && <span className="bcard-pill pill good">grad</span>}
            </div>
            <div className="bcard-body">
              <div className="bcard-name">{c.name || c.symbol}</div>
              <div className="bcard-sym">${c.symbol}</div>
              <div className="bcard-mc">{fmtUsd((c.mcap ?? 0) * 3000)} <span>MC</span></div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

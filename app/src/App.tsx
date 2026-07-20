import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Rocket, Plus, ArrowsLeftRight, Drop, Lock as LockIcon, Target, MagnifyingGlass, type Icon } from '@phosphor-icons/react'
import { Toaster } from 'sonner'
import { ConnectButton } from './components/ConnectButton'
import { SearchModal } from './components/SearchModal'
import { Claim } from './pages/Claim'
import { Create } from './pages/Create'
import { Launch } from './pages/Launch'
import { Trenches } from './pages/Trenches'
import { CoinPage } from './pages/CoinPage'
import { ProfilePage } from './pages/ProfilePage'
import { UserPage } from './pages/UserPage'
import { Swap } from './pages/Swap'
import { Pools } from './pages/Pools'
import { Lock } from './pages/Lock'
import { useWallet } from './lib/wallet'
import { DEFAULT_CHAIN } from './lib/chains'

const NAV: { to: string; label: string; Ico: Icon }[] = [
  { to: '/', label: 'Trenches', Ico: Rocket },
  { to: '/create', label: 'Create', Ico: Plus },
  { to: '/swap', label: 'Swap', Ico: ArrowsLeftRight },
  { to: '/pools', label: 'Pools', Ico: Drop },
  { to: '/lock', label: 'Lock', Ico: LockIcon },
  { to: '/heist', label: 'Heist', Ico: Target },
]

// Decorative sparkline. Not a price feed, no oracle: a fixed on-brand flourish.
function Sparkline({ points }: { points: number[] }) {
  const w = 120, h = 38
  const max = Math.max(...points), min = Math.min(...points)
  const span = max - min || 1
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - ((p - min) / span) * (h - 6) - 3).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sg${points[0]}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={`url(#sg${points[0]})`} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}


export function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { address, isSupported, switchToDefault } = useWallet()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // "/" opens the search palette (unless you're typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault(); setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Toaster theme="dark" position="bottom-right" richColors toastOptions={{ style: { fontFamily: 'var(--sans)' } }} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(addr) => { navigate(`/coin/${addr}`); setSearchOpen(false) }} />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <NavLink to="/" className="brand" aria-label="LittleJohn home" onClick={() => setMenuOpen(false)}>
          <span className="diamond" />
          <span>LittleJohn</span>
        </NavLink>
        <nav className="sidenav">
          {NAV.map((t) => {
            const Ico = t.Ico
            return (
              <NavLink key={t.to} to={t.to} end={t.to === '/'} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {({ isActive }) => (
                  <><Ico className="sidenav-ico" size={20} weight={isActive ? 'fill' : 'regular'} /><span>{t.label}</span></>
                )}
              </NavLink>
            )
          })}
        </nav>
        <span className="season sidebar-season"><i />Heist Season 0 · live</span>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span /><span /><span />
          </button>
          <button className="nav-search" onClick={() => setSearchOpen(true)} aria-label="Search coins">
            <MagnifyingGlass size={16} className="nav-search-ico" />
            <span className="nav-search-ph">Search coins…</span>
            <span className="nav-keys"><kbd className="nav-kbd">/</kbd></span>
          </button>
          <div className="topbar-right">
            <button className="nav-create" onClick={() => navigate('/create')}><Plus size={16} weight="bold" /> Create</button>
            <ConnectButton />
          </div>
        </header>

      <main className="stage">
        {address && !isSupported && (
          <div className="notice netwarn">
            Wrong network.
            <button className="pill gold" onClick={() => switchToDefault()} style={{ marginLeft: 6 }}>
              Switch to {DEFAULT_CHAIN.name}
            </button>
          </div>
        )}

        <div key={pathname} className={`page-enter ${pathname === '/' || pathname.startsWith('/coin/') || pathname.startsWith('/u/') ? 'stage-wide' : 'stage-inner'}`}>
          <Routes>
            <Route path="/" element={<Trenches />} />
            <Route path="/launch" element={<Launch />} />
            <Route path="/coin/:addr" element={<CoinPage />} />
            <Route path="/create" element={<Create onCreated={() => navigate('/')} />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/lock" element={<Lock />} />
            <Route path="/heist" element={<Claim />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:addr" element={<UserPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {pathname === '/swap' && (
          <div className="statcards">
            <div className="statcard">
              <div className="sc-k">Fees to lockers</div>
              <div className="sc-v">100%</div>
              <div className="sc-sub">veJOHN takes the toll</div>
              <Sparkline points={[3, 4, 3.4, 5, 4.6, 6.2, 6, 7.4]} />
            </div>
            <div className="statcard">
              <div className="sc-k">Heist</div>
              <div className="sc-v">Season 0</div>
              <div className="sc-sub">Live now · earn locked veJOHN</div>
              <Sparkline points={[2, 2.6, 2.2, 3.4, 4, 3.8, 5.2, 5.6]} />
            </div>
          </div>
        )}
      </main>

      <footer className="foot">
        <div className="foot-scam">
          No token yet. Anyone selling you $JOHN is a highwayman. Verify contract addresses before signing.
        </div>
      </footer>

      </div>
    </div>
  )
}

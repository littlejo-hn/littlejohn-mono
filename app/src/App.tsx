import { useState } from 'react'
import { ConnectButton } from './components/ConnectButton'
import { Claim } from './pages/Claim'
import { Swap } from './pages/Swap'
import { Pools } from './pages/Pools'
import { Lock } from './pages/Lock'
import { useWallet } from './lib/wallet'
import { DEFAULT_CHAIN } from './lib/chains'

type Tab = 'swap' | 'pools' | 'lock' | 'heist'
const TABS: { id: Tab; label: string }[] = [
  { id: 'swap', label: 'Swap' },
  { id: 'pools', label: 'Pools' },
  { id: 'lock', label: 'Lock' },
  { id: 'heist', label: 'Heist' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('swap')
  const { address, isSupported, switchToDefault } = useWallet()

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark" />LittleJohn</div>
        <ConnectButton />
      </header>

      {address && !isSupported && (
        <div className="notice" style={{ marginTop: '1rem' }}>
          Wrong network. <button className="pill gold" onClick={() => switchToDefault()} style={{ marginLeft: 6 }}>
            Switch to {DEFAULT_CHAIN.name}
          </button>
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'swap' && <Swap />}
      {tab === 'pools' && <Pools />}
      {tab === 'lock' && <Lock />}
      {tab === 'heist' && <Claim />}

      <div className="footer">
        <div>Every swap pays the band. <span className="em" style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic' }} /></div>
        <div className="warn">Verify contract addresses before signing. No token yet. Anyone selling you $JOHN is robbing you.</div>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, SignOut, UserCircle } from '@phosphor-icons/react'
import { useWallet } from '../lib/wallet'
import { shortAddr } from '../lib/format'
import { DEFAULT_CHAIN } from '../lib/chains'

export function ConnectButton() {
  const { address, hasWallet, connect, disconnect, isSupported, switchToDefault } = useWallet()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!hasWallet) return <a className="wallet" href="https://rabby.io" target="_blank" rel="noreferrer">Install a wallet</a>
  if (!address) return <button className="wallet connect" disabled={busy} onClick={() => run(connect)}>{busy ? 'Connecting…' : 'Connect wallet'}</button>
  if (!isSupported) return <button className="wallet" disabled={busy} onClick={() => run(switchToDefault)}>Switch to {DEFAULT_CHAIN.testnet ? 'Testnet' : 'Robinhood'}</button>

  return (
    <div className="wallet-wrap" ref={ref}>
      <button className="wallet addr" onClick={() => setOpen((o) => !o)}><i className="wdot" />{shortAddr(address)}</button>
      {open && (
        <div className="wallet-menu">
          <div className="wallet-menu-addr">{shortAddr(address)}</div>
          <button onClick={() => { navigate('/profile'); setOpen(false) }}><UserCircle size={15} /> Profile</button>
          <button onClick={() => { navigator.clipboard?.writeText(address); toast.success('Address copied'); setOpen(false) }}><Copy size={15} /> Copy address</button>
          <button onClick={() => { disconnect(); setOpen(false); toast.success('Disconnected') }}><SignOut size={15} /> Disconnect</button>
        </div>
      )}
    </div>
  )
}

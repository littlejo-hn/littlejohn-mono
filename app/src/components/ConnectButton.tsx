import { useState } from 'react'
import { useWallet } from '../lib/wallet'
import { shortAddr } from '../lib/format'
import { DEFAULT_CHAIN } from '../lib/chains'

export function ConnectButton() {
  const { address, hasWallet, connect, isSupported, switchToDefault } = useWallet()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!hasWallet) {
    return <a className="pill" href="https://rabby.io" target="_blank" rel="noreferrer">Install a wallet</a>
  }
  if (!address) {
    return <button className="pill gold" disabled={busy} onClick={() => run(connect)}>{busy ? '…' : 'Connect'}</button>
  }
  if (!isSupported) {
    return <button className="pill" disabled={busy} onClick={() => run(switchToDefault)} title={err ?? ''}>Switch to {DEFAULT_CHAIN.testnet ? 'Testnet' : 'Robinhood'}</button>
  }
  return <span className="pill good" title={address}>{shortAddr(address)}</span>
}

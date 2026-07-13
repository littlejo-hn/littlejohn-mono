import { deployment, coreLive } from '../config/contracts'
import { useWallet } from '../lib/wallet'
import { DEFAULT_CHAIN } from '../lib/chains'

export function Lock() {
  const { chainId } = useWallet()
  const live = coreLive(deployment(chainId ?? DEFAULT_CHAIN.id))
  return (
    <div className="card">
      <div className="title">Lock <span className="em">&amp; vote</span></div>
      <div className="sub">Lock $JOHN for up to 4 years to get veJOHN. Vote each week and take 100% of the fees and tolls from the pools you back.</div>
      <hr className="hr" />
      {!live ? (
        <div className="notice">Locking opens at TGE. Heist rewards already arrive as locked veJOHN, so you&apos;ll be voting from day one.</div>
      ) : (
        <div className="notice">Lock creation + weekly gauge voting UI wiring in progress.</div>
      )}
    </div>
  )
}

import { deployment, coreLive } from '../config/contracts'
import { useWallet } from '../lib/wallet'
import { DEFAULT_CHAIN } from '../lib/chains'

export function Pools() {
  const { chainId } = useWallet()
  const live = coreLive(deployment(chainId ?? DEFAULT_CHAIN.id))
  return (
    <div className="card">
      <div className="title">Pools</div>
      <div className="sub">Provide liquidity, earn $JOHN emissions. Stake into a gauge and the fees go to voters. That&apos;s the trade.</div>
      <hr className="hr" />
      {!live ? (
        <div className="notice">Liquidity pools open at launch. Deep stable pairs (USDG/USDe) and the memecoin gauges come first.</div>
      ) : (
        <div className="notice">Pool management UI wiring in progress. Add/remove liquidity and gauge staking land here.</div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, parseEther, parseUnits, formatUnits, type Address } from 'viem'
import { toast } from 'sonner'
import { useWallet } from '../lib/wallet'
import { robinhoodMainnet } from '../lib/chains'
import { V2_DEX } from '../config/contracts'
import { erc20Abi, uniV2RouterAbi } from '../abis'
import { ensureAllowance, txError } from '../lib/tx'
import { fmtAmount } from '../lib/format'

const MAINNET = robinhoodMainnet.id // 4663 — trenches tokens are mainnet
const DEADLINE_S = 1200
type Side = 'buy' | 'sell'

// The terminal buy/sell box for a chain-wide trenches token. Routes ETH<->token
// through the RH Uniswap V2 router (fee-on-transfer variants, so taxed memecoins
// don't revert). Quotes come from a dedicated mainnet read client so they work no
// matter what chain the wallet is on; execution requires the wallet on mainnet.
// No terminal fee yet — the FeeRouter give-back skim is the deliberate next step.
export function TerminalTrade({ token }: { token: { address: string; symbol: string; priceUsd: number } }) {
  const { address, walletClient, chainId, connect, switchTo } = useWallet()
  const dex = V2_DEX[MAINNET]
  const tokenAddr = token.address as Address

  // Reads always hit mainnet, independent of the wallet's current chain.
  const read = useMemo(
    () => createPublicClient({ chain: robinhoodMainnet, transport: http(robinhoodMainnet.rpcUrls.default.http[0], { retryCount: 2, timeout: 8_000 }) }),
    [],
  )

  const [side, setSide] = useState<Side>('buy')
  const [amountIn, setAmountIn] = useState('')
  const [out, setOut] = useState<bigint | null>(null)
  const [dec, setDec] = useState(18)
  const [ethBal, setEthBal] = useState<bigint | null>(null)
  const [tokBal, setTokBal] = useState<bigint | null>(null)
  const [slipBps, setSlipBps] = useState<bigint>(300n) // 3% — trenches are volatile/taxed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0) // bump to refetch balances after a trade

  const onMainnet = chainId === MAINNET
  const path = useMemo<Address[]>(
    () => (side === 'buy' ? [dex.weth, tokenAddr] : [tokenAddr, dex.weth]),
    [side, dex.weth, tokenAddr],
  )

  // Token decimals (once per token).
  useEffect(() => {
    let off = false
    read.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'decimals' })
      .then((d) => !off && setDec(Number(d)))
      .catch(() => !off && setDec(18))
    return () => { off = true }
  }, [tokenAddr, read])

  // Balances.
  useEffect(() => {
    if (!address) { setEthBal(null); setTokBal(null); return }
    let off = false
    read.getBalance({ address }).then((b) => !off && setEthBal(b)).catch(() => !off && setEthBal(null))
    read.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => !off && setTokBal(b as bigint)).catch(() => !off && setTokBal(null))
    return () => { off = true }
  }, [address, tokenAddr, read, nonce])

  // Reset form when the token or side changes.
  useEffect(() => { setAmountIn(''); setOut(null); setErr(null) }, [tokenAddr, side])

  // Quote (debounced).
  useEffect(() => {
    if (!amountIn) { setOut(null); return }
    let off = false
    const t = setTimeout(async () => {
      try {
        const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, dec)
        if (inWei <= 0n) { setOut(null); return }
        const amounts = (await read.readContract({
          address: dex.router, abi: uniV2RouterAbi, functionName: 'getAmountsOut', args: [inWei, path],
        })) as bigint[]
        if (!off) setOut(amounts[amounts.length - 1])
      } catch {
        if (!off) setOut(null) // no WETH-paired route (e.g. USDG-only pool) — degrade to the deep-link
      }
    }, 300)
    return () => { off = true; clearTimeout(t) }
  }, [amountIn, side, dec, path, dex.router, read])

  const trade = async () => {
    if (!walletClient || !address || out == null) return
    setBusy(true); setErr(null)
    try {
      const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, dec)
      const minOut = out - (out * slipBps) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_S)
      let hash: `0x${string}`
      if (side === 'buy') {
        hash = await walletClient.writeContract({
          address: dex.router, abi: uniV2RouterAbi,
          functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
          args: [minOut, path, address, deadline], value: inWei, account: address, chain: null,
        })
      } else {
        await ensureAllowance(read, walletClient, tokenAddr, address, dex.router, inWei)
        hash = await walletClient.writeContract({
          address: dex.router, abi: uniV2RouterAbi,
          functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
          args: [inWei, minOut, path, address, deadline], account: address, chain: null,
        })
      }
      const tid = toast.loading(`${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}…`)
      await read.waitForTransactionReceipt({ hash })
      toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${token.symbol}`, { id: tid })
      setAmountIn(''); setOut(null); setNonce((n) => n + 1)
    } catch (e) {
      setErr(txError(e)); toast.error(txError(e))
    } finally {
      setBusy(false)
    }
  }

  const bal = side === 'buy' ? ethBal : tokBal
  const balDec = side === 'buy' ? 18 : dec
  const overBalance = bal != null && amountIn ? parseUnits(amountIn || '0', balDec) > bal : false
  const outDec = side === 'buy' ? dec : 18
  const minOutDisp = out != null ? out - (out * slipBps) / 10000n : null

  return (
    <div className="tt">
      <div className="tt-tabs">
        <button className={side === 'buy' ? 'buy on' : 'buy'} onClick={() => setSide('buy')}>Buy</button>
        <button className={side === 'sell' ? 'sell on' : 'sell'} onClick={() => setSide('sell')}>Sell</button>
      </div>

      <div className="tt-field">
        <div className="tt-row"><span>You pay</span><span className="tt-tok">{side === 'buy' ? 'ETH' : token.symbol}</span></div>
        <input inputMode="decimal" placeholder="0.0" value={amountIn}
          onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ''))} />
        <div className="tt-chips">
          {side === 'buy'
            ? ['0.01', '0.05', '0.1', '0.25'].map((v) => <button key={v} onClick={() => setAmountIn(v)}>{v}</button>)
            : [25, 50, 75, 100].map((p) => (
                <button key={p} disabled={!tokBal} onClick={() => tokBal && setAmountIn(formatUnits((tokBal * BigInt(p)) / 100n, dec))}>{p}%</button>
              ))}
        </div>
        {bal != null && <div className="tt-bal">Balance {fmtAmount(bal, balDec)} {side === 'buy' ? 'ETH' : token.symbol}</div>}
      </div>

      <div className="tt-field">
        <div className="tt-row"><span>You receive</span><span className="tt-tok">{side === 'buy' ? token.symbol : 'ETH'}</span></div>
        <input readOnly placeholder="0.0" value={out != null ? fmtAmount(out, outDec, 6) : ''} />
        {minOutDisp != null && <div className="tt-min">Min after {Number(slipBps) / 100}% slippage · {fmtAmount(minOutDisp, outDec, 6)} {side === 'buy' ? token.symbol : 'ETH'}</div>}
      </div>

      <div className="tt-slip">
        <span>Slippage</span>
        {([['1%', 100n], ['3%', 300n], ['5%', 500n], ['10%', 1000n]] as const).map(([l, b]) => (
          <button key={l} className={slipBps === b ? 'on' : ''} onClick={() => setSlipBps(b)}>{l}</button>
        ))}
      </div>

      {!address ? (
        <button className="tt-go" onClick={() => connect().catch((e) => setErr(txError(e)))}>Connect wallet</button>
      ) : !onMainnet ? (
        <button className="tt-go warn" onClick={() => switchTo(MAINNET).catch((e) => setErr(txError(e)))}>Switch to Robinhood Chain</button>
      ) : (
        <button className="tt-go" disabled={busy || out == null || overBalance} onClick={trade}>
          {overBalance ? 'Insufficient balance' : busy ? <><span className="spinner" /> {side === 'buy' ? 'Buying' : 'Selling'}…</>
            : out == null && amountIn ? 'No V2 route' : side === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
        </button>
      )}
      {err && <div className="tt-err">{err}</div>}
      <div className="tt-foot">Routes through Uniswap V2 · no terminal fee yet · not financial advice</div>
    </div>
  )
}

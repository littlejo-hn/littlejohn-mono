import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, encodeFunctionData, parseEther, parseUnits, formatUnits, type Address } from 'viem'
import { toast } from 'sonner'
import { useWallet } from '../lib/wallet'
import { robinhoodMainnet } from '../lib/chains'
import { V2_DEX, V3_DEX } from '../config/contracts'
import { erc20Abi, uniV2RouterAbi, uniV3PoolAbi, uniV3QuoterAbi, uniV3RouterAbi } from '../abis'
import { ensureAllowance, txError } from '../lib/tx'
import { fmtAmount } from '../lib/format'

const MAINNET = robinhoodMainnet.id // 4663 — trenches tokens are mainnet
const DEADLINE_S = 1200
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address // SwapRouter02 sentinel
type Side = 'buy' | 'sell'
type Venue = 'v2' | 'v3'

function venueFor(dex: string): Venue | null {
  if (dex === 'uniswap-v2-robinhood') return 'v2'
  if (dex === 'uniswap-v3-robinhood') return 'v3'
  return null
}

// The terminal buy/sell box for a chain-wide trenches token. Routes ETH<->token
// through the RH Uniswap V2 or V3 router depending on where the token's pool lives
// (V2: fee-on-transfer swap variants; V3: read the pool's fee tier, exactInputSingle,
// unwrap on sell via multicall). Quotes come from a dedicated mainnet read client so
// they work no matter what chain the wallet is on; execution requires mainnet. No
// terminal fee yet — the FeeRouter give-back skim is the deliberate next step.
export function TerminalTrade({ token }: { token: { address: string; pool: string; symbol: string; dex: string; priceUsd: number } }) {
  const { address, walletClient, chainId, connect, switchTo } = useWallet()
  const V2 = V2_DEX[MAINNET]
  const V3 = V3_DEX[MAINNET]
  const weth = V2.weth
  const tokenAddr = token.address as Address
  const venue = venueFor(token.dex)

  // Reads always hit mainnet, independent of the wallet's current chain.
  const read = useMemo(
    () => createPublicClient({ chain: robinhoodMainnet, transport: http(robinhoodMainnet.rpcUrls.default.http[0], { retryCount: 2, timeout: 8_000 }) }),
    [],
  )

  const [side, setSide] = useState<Side>('buy')
  const [amountIn, setAmountIn] = useState('')
  const [out, setOut] = useState<bigint | null>(null)
  const [dec, setDec] = useState(18)
  const [v3fee, setV3fee] = useState<number | null>(null)
  const [routeOk, setRouteOk] = useState(true) // false = pool isn't WETH-paired (v1 single-hop only)
  const [ethBal, setEthBal] = useState<bigint | null>(null)
  const [tokBal, setTokBal] = useState<bigint | null>(null)
  const [slipBps, setSlipBps] = useState<bigint>(300n) // 3% — trenches are volatile/taxed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0) // bump to refetch balances after a trade

  const onMainnet = chainId === MAINNET
  const path = useMemo<Address[]>(
    () => (side === 'buy' ? [weth, tokenAddr] : [tokenAddr, weth]),
    [side, weth, tokenAddr],
  )

  // Token decimals (once per token).
  useEffect(() => {
    let off = false
    read.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'decimals' })
      .then((d) => !off && setDec(Number(d)))
      .catch(() => !off && setDec(18))
    return () => { off = true }
  }, [tokenAddr, read])

  // V3: read the pool's fee tier + confirm it's WETH-paired (single-hop only for v1).
  useEffect(() => {
    if (venue !== 'v3') { setV3fee(null); setRouteOk(true); return }
    let off = false
    const p = token.pool as Address
    Promise.all([
      read.readContract({ address: p, abi: uniV3PoolAbi, functionName: 'fee' }),
      read.readContract({ address: p, abi: uniV3PoolAbi, functionName: 'token0' }),
      read.readContract({ address: p, abi: uniV3PoolAbi, functionName: 'token1' }),
    ]).then(([fee, t0, t1]) => {
      if (off) return
      const paired = [String(t0).toLowerCase(), String(t1).toLowerCase()].includes(weth.toLowerCase())
      setV3fee(Number(fee)); setRouteOk(paired)
    }).catch(() => { if (!off) { setV3fee(null); setRouteOk(false) } })
    return () => { off = true }
  }, [venue, token.pool, read, weth])

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

  // Quote (debounced) — branches by venue.
  useEffect(() => {
    if (!amountIn) { setOut(null); return }
    let off = false
    const t = setTimeout(async () => {
      try {
        const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, dec)
        if (inWei <= 0n) { setOut(null); return }
        let result: bigint | null = null
        if (venue === 'v2') {
          const amounts = (await read.readContract({
            address: V2.router, abi: uniV2RouterAbi, functionName: 'getAmountsOut', args: [inWei, path],
          })) as bigint[]
          result = amounts[amounts.length - 1]
        } else if (venue === 'v3' && v3fee != null && routeOk) {
          const tokenIn = side === 'buy' ? weth : tokenAddr
          const tokenOut = side === 'buy' ? tokenAddr : weth
          const res = (await read.readContract({
            address: V3.quoter, abi: uniV3QuoterAbi, functionName: 'quoteExactInputSingle',
            args: [{ tokenIn, tokenOut, amountIn: inWei, fee: v3fee, sqrtPriceLimitX96: 0n }],
          })) as readonly [bigint, bigint, number, bigint]
          result = res[0]
        }
        if (!off) setOut(result)
      } catch {
        if (!off) setOut(null) // no route at this venue — degrade to the deep-link
      }
    }, 300)
    return () => { off = true; clearTimeout(t) }
  }, [amountIn, side, dec, venue, v3fee, routeOk, path, weth, tokenAddr, V2.router, V3.quoter, read])

  const trade = async () => {
    if (!walletClient || !address || out == null) return
    if (venue === 'v3' && v3fee == null) return
    setBusy(true); setErr(null)
    try {
      const inWei = side === 'buy' ? parseEther(amountIn) : parseUnits(amountIn, dec)
      const minOut = out - (out * slipBps) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_S)
      let hash: `0x${string}`

      if (venue === 'v2') {
        if (side === 'buy') {
          hash = await walletClient.writeContract({
            address: V2.router, abi: uniV2RouterAbi,
            functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
            args: [minOut, path, address, deadline], value: inWei, account: address, chain: null,
          })
        } else {
          await ensureAllowance(read, walletClient, tokenAddr, address, V2.router, inWei)
          hash = await walletClient.writeContract({
            address: V2.router, abi: uniV2RouterAbi,
            functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
            args: [inWei, minOut, path, address, deadline], account: address, chain: null,
          })
        }
      } else {
        const fee = v3fee as number
        if (side === 'buy') {
          hash = await walletClient.writeContract({
            address: V3.router, abi: uniV3RouterAbi, functionName: 'exactInputSingle',
            args: [{ tokenIn: weth, tokenOut: tokenAddr, fee, recipient: address, amountIn: inWei, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
            value: inWei, account: address, chain: null,
          })
        } else {
          await ensureAllowance(read, walletClient, tokenAddr, address, V3.router, inWei)
          // SwapRouter02 has no native-ETH unwrap on sells: swap to WETH held by the
          // router (recipient = ADDRESS_THIS), then unwrapWETH9 to the user, atomically.
          const swapCall = encodeFunctionData({
            abi: uniV3RouterAbi, functionName: 'exactInputSingle',
            args: [{ tokenIn: tokenAddr, tokenOut: weth, fee, recipient: ADDRESS_THIS, amountIn: inWei, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
          })
          const unwrapCall = encodeFunctionData({
            abi: uniV3RouterAbi, functionName: 'unwrapWETH9', args: [minOut, address],
          })
          hash = await walletClient.writeContract({
            address: V3.router, abi: uniV3RouterAbi, functionName: 'multicall',
            args: [[swapCall, unwrapCall]], account: address, chain: null,
          })
        }
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
  const noRoute = venue === 'v3' && !routeOk

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

      {noRoute ? (
        <button className="tt-go" disabled>No direct WETH route</button>
      ) : !address ? (
        <button className="tt-go" onClick={() => connect().catch((e) => setErr(txError(e)))}>Connect wallet</button>
      ) : !onMainnet ? (
        <button className="tt-go warn" onClick={() => switchTo(MAINNET).catch((e) => setErr(txError(e)))}>Switch to Robinhood Chain</button>
      ) : (
        <button className="tt-go" disabled={busy || out == null || overBalance} onClick={trade}>
          {overBalance ? 'Insufficient balance' : busy ? <><span className="spinner" /> {side === 'buy' ? 'Buying' : 'Selling'}…</>
            : out == null && amountIn ? 'No route' : side === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
        </button>
      )}
      {err && <div className="tt-err">{err}</div>}
      <div className="tt-foot">Routes through Uniswap {venue === 'v3' ? 'V3' : 'V2'} · no terminal fee yet · not financial advice</div>
    </div>
  )
}

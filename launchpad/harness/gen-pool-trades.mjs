// Creates a token, graduates it, then trades on the graduated ve(3,3) pool via
// the Router so the pool emits Sync events. Proves the chart's curve->pool
// continuation. Run from app dir: node ../launchpad/harness/gen-pool-trades.mjs
import { createWalletClient, createPublicClient, createTestClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'http://127.0.0.1:8545'
const LAUNCHPAD = '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
const ROUTER = '0x139D245cBe54dC332BbAf6191269b81D727466a8'
const WETH = '0xF13E5952780Cdcd2C17333129b5Bc5187ff07DC2'
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const chain = { id: 46630, name: 'rh-fork', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const account = privateKeyToAccount(KEY)
const wallet = createWalletClient({ account, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })

const padAbi = parseAbi([
  'function createToken(string name, string symbol, string metadataURI) payable returns (address)',
  'function buy(address token, uint256 minTokensOut) payable returns (uint256)',
  'function tokenCount() view returns (uint256)',
  'function allTokens(uint256) view returns (address)',
  'function getCurve(address token) view returns ((uint128 virtualEth, uint128 virtualToken, uint128 realEth, uint128 tokensSold, bool graduated, address creator, uint16 protocolFeeBps, uint16 creatorFeeBps) curve)',
])
const routerAbi = parseAbi([
  'function swapExactETHForTokens(uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) payable returns (uint256[])',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) returns (uint256[])',
  'function pairFor(address tokenA, address tokenB, bool stable) view returns (address)',
])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address spender, uint256 value) returns (bool)'])

const send = async (req) => { const h = await wallet.writeContract(req); await pub.waitForTransactionReceipt({ hash: h }); return h }
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo))
// Far-future deadline: the fork's block.timestamp drifts ahead of wall clock
// because the generators advance time, so a wall-clock deadline would expire.
const dl = () => 9_999_999_999n

async function main() {
  console.log('creating + graduating POOL token...')
  await send({ address: LAUNCHPAD, abi: padAbi, functionName: 'createToken', args: ['Pool Demo', 'POOL', 'ipfs://pool'] })
  const count = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'tokenCount' })
  const token = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'allTokens', args: [count - 1n] })
  // buy it out -> graduates atomically
  await send({ address: LAUNCHPAD, abi: padAbi, functionName: 'buy', args: [token, 0n], value: 5_000_000_000_000_000n })
  const c = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'getCurve', args: [token] })
  console.log('token:', token, '| graduated:', c.graduated)

  const pair = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: 'pairFor', args: [token, WETH, false] })
  console.log('pool:', pair)
  await send({ address: token, abi: erc20, functionName: 'approve', args: [ROUTER, 2n ** 255n] })

  const STEPS = 30
  for (let i = 0; i < STEPS; i++) {
    const bal = await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [account.address] })
    const doBuy = bal === 0n || Math.random() < 0.55
    try {
      if (doBuy) {
        const value = BigInt(rand(20, 120)) * 10n ** 12n
        await send({ address: ROUTER, abi: routerAbi, functionName: 'swapExactETHForTokens', args: [0n, [{ from: WETH, to: token, stable: false }], account.address, dl()], value })
      } else {
        const amt = (bal * BigInt(rand(5, 25))) / 100n
        await send({ address: ROUTER, abi: routerAbi, functionName: 'swapExactTokensForETH', args: [amt, 0n, [{ from: token, to: WETH, stable: false }], account.address, dl()] })
      }
    } catch (e) { console.log(`step ${i}: ${doBuy ? 'buy' : 'sell'} reverted (${String(e).split('\n')[0].slice(0, 50)})`) }
    if (i % 5 === 0) console.log(`pool step ${i}: ${doBuy ? 'BUY ' : 'SELL'}`)
    if (i % 3 === 2) { await test.increaseTime({ seconds: rand(30, 90) }); await test.mine({ blocks: 1 }) }
  }
  console.log('done. graduated token with pool history:', token)
}
main().catch((e) => { console.error(e); process.exit(1) })

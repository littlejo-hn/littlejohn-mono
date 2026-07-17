// Trade generator for the anvil fork. Creates a fresh token and fires a stream
// of randomized buys/sells so the frontend chart + feed have live data to build
// against. Run from the app dir so viem resolves: `node ../launchpad/harness/gen-trades.mjs`
import { createWalletClient, createPublicClient, createTestClient, http, parseAbi, parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'http://127.0.0.1:8545'
const LAUNCHPAD = '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
// well-known anvil account 0 (local only, not a secret)
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const chain = { id: 46630, name: 'rh-fork', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const account = privateKeyToAccount(KEY)
const wallet = createWalletClient({ account, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })

const padAbi = parseAbi([
  'function createToken(string name, string symbol, string metadataURI) payable returns (address)',
  'function buy(address token, uint256 minTokensOut) payable returns (uint256)',
  'function sell(address token, uint256 tokenAmount, uint256 minEthOut) returns (uint256)',
  'function tokenCount() view returns (uint256)',
  'function allTokens(uint256) view returns (address)',
  'function getCurve(address token) view returns ((uint128 virtualEth, uint128 virtualToken, uint128 realEth, uint128 tokensSold, bool graduated, address creator, uint16 protocolFeeBps, uint16 creatorFeeBps) curve)',
])
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
])

const send = async (req) => { const hash = await wallet.writeContract(req); await pub.waitForTransactionReceipt({ hash }); return hash }
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo))

async function main() {
  console.log('creating CHART token...')
  await send({ address: LAUNCHPAD, abi: padAbi, functionName: 'createToken', args: ['Chart Demo', 'CHART', 'ipfs://chart'] })
  const count = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'tokenCount' })
  const token = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'allTokens', args: [count - 1n] })
  console.log('token:', token)

  // approve once for sells
  await send({ address: token, abi: erc20, functionName: 'approve', args: [LAUNCHPAD, 2n ** 255n] })

  const STEPS = 60
  for (let i = 0; i < STEPS; i++) {
    const c = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'getCurve', args: [token] })
    if (c.graduated) { console.log(`step ${i}: GRADUATED, stopping`); break }
    const bal = await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [account.address] })

    // 62% buys, and sell only when we hold something. Small sizes keep it on the curve for many candles.
    const doBuy = bal === 0n || Math.random() < 0.62
    try {
      if (doBuy) {
        const value = BigInt(rand(10, 55)) * 10n ** 12n // 0.00001 .. 0.000055 ETH
        await send({ address: LAUNCHPAD, abi: padAbi, functionName: 'buy', args: [token, 0n], value })
      } else {
        const amt = (bal * BigInt(rand(20, 60))) / 100n
        await send({ address: LAUNCHPAD, abi: padAbi, functionName: 'sell', args: [token, amt, 0n] })
      }
    } catch (e) { console.log(`step ${i}: ${doBuy ? 'buy' : 'sell'} reverted (${String(e).split('\n')[0].slice(0, 60)})`) }

    const c2 = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'getCurve', args: [token] })
    const price = Number(c2.virtualEth) / Number(c2.virtualToken)
    if (i % 5 === 0) console.log(`step ${i}: ${doBuy ? 'BUY ' : 'SELL'} | price=${price.toExponential(3)} | sold=${(Number(c2.tokensSold) / 1e24).toFixed(1)}M`)

    // advance time every few trades so candles spread across minutes
    // (wrapped: a pruned fork can reject the empty-block mine — don't let it kill the run)
    if (i % 3 === 2) { try { await test.increaseTime({ seconds: rand(30, 90) }); await test.mine({ blocks: 1 }) } catch { /* keep seeding at current time */ } }
  }
  console.log('done. token:', token)
}
main().catch((e) => { console.error(e); process.exit(1) })

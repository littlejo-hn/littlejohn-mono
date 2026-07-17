// Seed a batch of test coins on Robinhood testnet so the board/trenches fill out
// with real-looking coins + images. Pulls name/symbol/image from pump.fun's public
// API (testnet throwaway data), creates each on our launchpad with a randomized
// dev buy so market caps + curve progress vary. Run from the app dir:
//   node ../launchpad/harness/seed-coins.mjs
import { createWalletClient, createPublicClient, http, parseAbi, parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'https://rpc.testnet.chain.robinhood.com'
const LAUNCHPAD = '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
const KEY = process.env.PRIVATE_KEY
if (!KEY) { console.error('set PRIVATE_KEY'); process.exit(1) }

const chain = { id: 46630, name: 'rh-test', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const account = privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY)
const wallet = createWalletClient({ account, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })

const padAbi = parseAbi([
  'function createToken(string name, string symbol, string metadataURI) payable returns (address)',
  'function tokenCount() view returns (uint256)',
])

const rand = (lo, hi) => lo + Math.random() * (hi - lo)

async function fetchPumpCoins() {
  const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=80&sort=market_cap&order=DESC&includeNsfw=false'
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
  const body = await r.json()
  const arr = Array.isArray(body) ? body : body.coins ?? body.data ?? []
  // Keep coins whose image is on ipfs.io (allowed via CSP) with sane name/symbol.
  return arr.filter(
    (c) => c.image_uri && c.image_uri.startsWith('https://ipfs.io/ipfs/') && c.symbol && c.symbol.length <= 11 && c.name && c.name.length <= 40,
  )
}

function metadataURI(c) {
  const json = JSON.stringify({ name: c.name, symbol: c.symbol, image: c.image_uri, description: c.description || '' })
  return 'data:application/json,' + encodeURIComponent(json)
}

async function main() {
  const bal = await pub.getBalance({ address: account.address })
  console.log('seeder:', account.address, '| balance', formatEther(bal), 'ETH')

  const coins = (await fetchPumpCoins()).slice(0, 24)
  console.log(`fetched ${coins.length} pump.fun coins with ipfs images`)
  if (!coins.length) { console.error('no coins to seed'); process.exit(1) }

  let made = 0
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i]
    // Tiny budget: give the first few a small dev buy so the trending row has varied
    // caps; the rest are created at the curve floor (gas only). Re-read balance each
    // loop so gas is accounted for, and stop with a buffer left.
    const value = i < 5 ? parseEther(rand(0.0006, 0.0016).toFixed(4)) : 0n
    const cur = await pub.getBalance({ address: account.address })
    if (cur < value + parseEther('0.0015')) { console.log('low on ETH, stopping'); break }
    try {
      const hash = await wallet.writeContract({
        address: LAUNCHPAD, abi: padAbi, functionName: 'createToken',
        args: [c.name, c.symbol, metadataURI(c)], value,
      })
      await pub.waitForTransactionReceipt({ hash })
      made++
      console.log(`${i + 1}/${coins.length}  ${c.symbol.padEnd(11)} buy ${formatEther(value)} ETH  ${hash.slice(0, 10)}`)
    } catch (e) {
      console.log(`${i + 1}: ${c.symbol} failed: ${String(e).split('\n')[0].slice(0, 70)}`)
    }
  }
  const count = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'tokenCount' })
  console.log(`done. created ${made} coins. launchpad now holds ${count} tokens.`)
}
main().catch((e) => { console.error(e); process.exit(1) })

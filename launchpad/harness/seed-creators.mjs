// Seed test coins under SEVERAL distinct creator wallets so the board shows a mix
// of creators + avatars (not just the single seeder). Generates fresh wallets,
// funds each from PRIVATE_KEY, and has each create a handful of coins — some with
// real pump.fun images, some with no image (placeholder → gradient tile).
//
// Writes a manifest to /tmp/creators.json so the follow-up step can create the
// matching social profiles (usernames + avatars). Run from the app dir:
//   node ../launchpad/harness/seed-creators.mjs
import { createWalletClient, createPublicClient, http, parseAbi, parseEther, formatEther } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { writeFileSync } from 'node:fs'

const RPC = 'https://rpc.testnet.chain.robinhood.com'
const LAUNCHPAD = '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
const KEY = process.env.PRIVATE_KEY
if (!KEY) { console.error('set PRIVATE_KEY'); process.exit(1) }

const chain = { id: 46630, name: 'rh-test', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const seeder = privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY)
const seederWallet = createWalletClient({ account: seeder, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })

const padAbi = parseAbi([
  'function createToken(string name, string symbol, string metadataURI) payable returns (address)',
  'function tokenCount() view returns (uint256)',
])

const rand = (lo, hi) => lo + Math.random() * (hi - lo)

// The creator personas. hasAvatar=false → the profile gets a username but no
// avatar, exercising the gradient-fallback path on the board.
const CREATORS = [
  { username: 'degenmax',    bio: 'aping since genesis block',        hasAvatar: true,  coins: 5 },
  { username: 'sol_sensei',  bio: 'teaching the trenches, one candle at a time', hasAvatar: true, coins: 5 },
  { username: 'vibecatcher', bio: 'only good vibes and green candles', hasAvatar: true,  coins: 5 },
  { username: 'anon0x',      bio: '',                                  hasAvatar: false, coins: 4 },
]

async function fetchPumpCoins() {
  const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=120&sort=market_cap&order=DESC&includeNsfw=false'
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
  const body = await r.json()
  const arr = Array.isArray(body) ? body : body.coins ?? body.data ?? []
  return arr.filter(
    (c) => c.image_uri && c.image_uri.startsWith('https://ipfs.io/ipfs/') && c.symbol && c.symbol.length <= 11 && c.name && c.name.length <= 40,
  )
}

// metadata WITH image (real) or WITHOUT (placeholder → board shows gradient tile).
function metadataURI(c, withImage) {
  const obj = { name: c.name, symbol: c.symbol, description: c.description || '' }
  if (withImage) obj.image = c.image_uri
  return 'data:application/json,' + encodeURIComponent(JSON.stringify(obj))
}

async function main() {
  const bal = await pub.getBalance({ address: seeder.address })
  console.log('seeder', seeder.address, '| balance', formatEther(bal), 'ETH')

  const pool = await fetchPumpCoins()
  console.log(`fetched ${pool.length} pump.fun coins with ipfs images`)
  if (pool.length < 20) { console.error('not enough source coins'); process.exit(1) }

  const FUND = parseEther('0.0006') // per creator: gas for ~5 creates + a couple tiny dev buys
  const manifest = []
  let picks = 0

  for (const persona of CREATORS) {
    // fresh wallet
    const pk = generatePrivateKey()
    const acct = privateKeyToAccount(pk)
    const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) })

    // fund it
    const fundHash = await seederWallet.sendTransaction({ to: acct.address, value: FUND, account: seeder, chain: null })
    await pub.waitForTransactionReceipt({ hash: fundHash })
    console.log(`\n${persona.username}  ${acct.address}  funded ${formatEther(FUND)} ETH`)

    let made = 0
    for (let i = 0; i < persona.coins; i++) {
      const c = pool[picks++ % pool.length]
      // every 3rd coin is a placeholder (no image) to vary the board
      const withImage = i % 3 !== 2
      // first 2 coins per creator get a tiny dev buy so caps vary
      const value = i < 2 ? parseEther(rand(0.0001, 0.0003).toFixed(4)) : 0n
      const cur = await pub.getBalance({ address: acct.address })
      if (cur < value + parseEther('0.00005')) { console.log('  creator low on ETH, stopping'); break }
      try {
        const hash = await wallet.writeContract({
          address: LAUNCHPAD, abi: padAbi, functionName: 'createToken',
          args: [c.name, c.symbol, metadataURI(c, withImage)], value, account: acct, chain: null,
        })
        await pub.waitForTransactionReceipt({ hash })
        made++
        console.log(`  ${made}. ${c.symbol.padEnd(11)} ${withImage ? 'img ' : 'PLACEHOLDER'}  buy ${formatEther(value)}`)
      } catch (e) {
        console.log(`  x ${c.symbol} failed: ${String(e).split('\n')[0].slice(0, 70)}`)
      }
    }
    manifest.push({ address: acct.address, username: persona.username, bio: persona.bio, hasAvatar: persona.hasAvatar, made })
  }

  writeFileSync('/tmp/creators.json', JSON.stringify(manifest, null, 2))
  const count = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'tokenCount' })
  console.log(`\ndone. launchpad now holds ${count} tokens. manifest → /tmp/creators.json`)
}
main().catch((e) => { console.error(e); process.exit(1) })

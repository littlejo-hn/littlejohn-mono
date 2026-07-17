// Live proof for the firehose LiveFeed refactor: connect a browser-style WebSocket
// to /ws/<token>, fire ONE real testnet buy on that coin, and assert the trade
// frame arrives over the socket (i.e. the single hub poller routed it by tag).
// Run from app dir so viem resolves:
//   node ../launchpad/harness/firehose-proof.mjs
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import WebSocket from 'ws'

const WORKER = 'littlejohn-indexer.spirits-defi.workers.dev'
const RPC = 'https://rpc.testnet.chain.robinhood.com'
const LAUNCHPAD = '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
const KEY = process.env.PRIVATE_KEY
if (!KEY) { console.error('set PRIVATE_KEY'); process.exit(1) }

const chain = { id: 46630, name: 'rh-test', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const account = privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY)
const wallet = createWalletClient({ account, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })

const padAbi = parseAbi([
  'function buy(address token, uint256 minTokensOut) payable returns (uint256)',
  'function tokenCount() view returns (uint256)',
  'function allTokens(uint256) view returns (address)',
])

async function main() {
  // Pick the most recently created coin so it is still on the curve.
  const count = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'tokenCount' })
  const token = await pub.readContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'allTokens', args: [count - 1n] })
  console.log('coin under test:', token, `(#${count})`)

  const ws = new WebSocket(`wss://${WORKER}/ws/${token}`)
  let got = null
  ws.on('message', (d) => {
    const s = d.toString()
    if (s === 'pong') return
    try { const m = JSON.parse(s); if (m.type === 'trade') { got = m; console.log('FRAME:', s) } } catch {}
  })

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  console.log('socket open; waiting 2s for the hub to pin its cursor to head...')
  await new Promise((r) => setTimeout(r, 2000))

  console.log('firing a real buy (0.00002 ETH)...')
  const hash = await wallet.writeContract({ address: LAUNCHPAD, abi: padAbi, functionName: 'buy', args: [token, 0n], value: 20n * 10n ** 12n })
  await pub.waitForTransactionReceipt({ hash })
  console.log('buy mined:', hash)

  // Give the 1s poll loop a few ticks to see and fan out the trade.
  for (let i = 0; i < 12 && !got; i++) { ws.send('ping'); await new Promise((r) => setTimeout(r, 1000)) }
  ws.close()

  if (got && got.trader.toLowerCase() === account.address.toLowerCase() && got.isBuy) {
    console.log('\nPASS: firehose pushed our buy over the socket, routed by token tag.')
    process.exit(0)
  }
  console.log('\nFAIL: no matching trade frame arrived.')
  process.exit(2)
}
main().catch((e) => { console.error(e); process.exit(1) })

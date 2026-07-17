import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
const RPC='http://127.0.0.1:8545', LAUNCHPAD='0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3'
const KEY='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const chain={id:46630,name:'f',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[RPC]}}}
const acct=privateKeyToAccount(KEY)
const w=createWalletClient({account:acct,chain,transport:http(RPC)}), p=createPublicClient({chain,transport:http(RPC)})
const abi=parseAbi(['function createToken(string,string,string) payable returns (address)'])
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#D4A94E"/><text x="32" y="44" font-size="34" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#070A08">P</text></svg>`
const img='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')
const meta={name:'Pixel Bandit',symbol:'PIX',description:'a test coin with a picture',image:img,twitter:'https://x.com/littlejo_hn'}
const uri='data:application/json;base64,'+Buffer.from(JSON.stringify(meta)).toString('base64')
const h=await w.writeContract({address:LAUNCHPAD,abi,functionName:'createToken',args:['Pixel Bandit','PIX',uri],value:200000000000000n})
await p.waitForTransactionReceipt({hash:h})
console.log('created PIX with image, tx',h)

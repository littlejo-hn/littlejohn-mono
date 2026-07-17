import { defineChain } from 'viem'

// Dev-only: point the whole app at a local anvil fork by setting
// VITE_RPC_URL=http://127.0.0.1:8545 (see launchpad/harness). Unset in prod.
const RPC_OVERRIDE = import.meta.env.VITE_RPC_URL as string | undefined

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
})

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_OVERRIDE || 'https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
})

export const CHAINS = { [robinhoodMainnet.id]: robinhoodMainnet, [robinhoodTestnet.id]: robinhoodTestnet } as const
export type SupportedChainId = keyof typeof CHAINS

// Launch on testnet first; flip to mainnet at TGE.
export const DEFAULT_CHAIN = robinhoodTestnet

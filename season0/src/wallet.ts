import { createWalletClient, custom, getAddress, type Address } from 'viem'

export async function connect(): Promise<Address> {
  if (!window.ethereum) throw new Error('No wallet found. Install MetaMask or Rabby.')
  const accts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  return getAddress(accts[0])
}

export async function currentAddress(): Promise<Address | null> {
  if (!window.ethereum) return null
  const accts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[]
  return accts[0] ? getAddress(accts[0]) : null
}

// must match functions/_lib.ts actionMessage exactly
function actionMessage(address: string, action: string, ts: string): string {
  return `LittleJohn Heist Season 0\nWallet: ${address}\nAction: ${action}\nTime: ${ts}`
}

export async function signAction(address: Address, action: string): Promise<{ ts: string; signature: string }> {
  const ts = new Date().toISOString()
  const client = createWalletClient({ transport: custom(window.ethereum!) })
  const signature = await client.signMessage({ account: address, message: actionMessage(address, action, ts) })
  return { ts, signature }
}

import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  numberToHex,
} from 'viem'
import { CHAINS, DEFAULT_CHAIN, type SupportedChainId } from './chains'

type WalletState = {
  address: Address | null
  chainId: number | null
  isSupported: boolean
  hasWallet: boolean
  connect: () => Promise<void>
  switchToDefault: () => Promise<void>
  walletClient: WalletClient | null
  publicClient: PublicClient
}

const WalletContext = createContext<WalletState | null>(null)

function publicFor(chainId: number): PublicClient {
  const chain = CHAINS[chainId as SupportedChainId] ?? DEFAULT_CHAIN
  return createPublicClient({ chain, transport: http() })
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const hasWallet = typeof window !== 'undefined' && !!window.ethereum

  const refresh = useCallback(async () => {
    if (!window.ethereum) return
    const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[]
    setAddress((accounts[0] as Address) ?? null)
    const cid = (await window.ethereum.request({ method: 'eth_chainId' })) as string
    setChainId(parseInt(cid, 16))
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    refresh()
    const onAccounts = (...a: unknown[]) => setAddress(((a[0] as string[])[0] as Address) ?? null)
    const onChain = (...a: unknown[]) => setChainId(parseInt(a[0] as string, 16))
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChain)
    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccounts)
      window.ethereum?.removeListener('chainChanged', onChain)
    }
  }, [refresh])

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('No wallet found. Install MetaMask or Rabby.')
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    await refresh()
  }, [refresh])

  const switchToDefault = useCallback(async () => {
    if (!window.ethereum) return
    const hexId = numberToHex(DEFAULT_CHAIN.id)
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
    } catch {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexId,
          chainName: DEFAULT_CHAIN.name,
          nativeCurrency: DEFAULT_CHAIN.nativeCurrency,
          rpcUrls: DEFAULT_CHAIN.rpcUrls.default.http,
          blockExplorerUrls: [DEFAULT_CHAIN.blockExplorers!.default.url],
        }],
      })
    }
  }, [])

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!window.ethereum || !chainId) return null
    const chain = CHAINS[chainId as SupportedChainId]
    if (!chain) return null
    return createWalletClient({ chain, transport: custom(window.ethereum) })
  }, [chainId])

  const publicClient = useMemo(() => publicFor(chainId ?? DEFAULT_CHAIN.id), [chainId])

  const value: WalletState = {
    address,
    chainId,
    isSupported: chainId != null && chainId in CHAINS,
    hasWallet,
    connect,
    switchToDefault,
    walletClient,
    publicClient,
  }
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}

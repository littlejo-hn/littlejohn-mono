import type { Address } from 'viem'

export const ZERO = '0x0000000000000000000000000000000000000000' as Address

export type Deployment = {
  john: Address
  escrow: Address
  router: Address
  voter: Address
  heists: Address
  weth: Address
  usdg: Address
  usde: Address
}

// Filled after each broadcast. Core addresses are ZERO until deployed; the UI
// shows a "not live yet" state while they are. WETH/USDG on mainnet are the
// verified canonical tokens (see contracts/DEPLOY.md).
export const DEPLOYMENTS: Record<number, Deployment> = {
  4663: {
    john: ZERO,
    escrow: ZERO,
    router: ZERO,
    voter: ZERO,
    heists: ZERO,
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    usde: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
  },
  46630: {
    john: ZERO,
    escrow: ZERO,
    router: ZERO,
    voter: ZERO,
    heists: ZERO,
    weth: ZERO,
    usdg: ZERO,
    usde: ZERO,
  },
}

export function deployment(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId]
}

export function coreLive(d: Deployment | undefined): d is Deployment {
  return !!d && d.heists !== ZERO && d.router !== ZERO
}

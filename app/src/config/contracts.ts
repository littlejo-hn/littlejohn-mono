import type { Address } from 'viem'

export const ZERO = '0x0000000000000000000000000000000000000000' as Address

export type Deployment = {
  john: Address
  escrow: Address
  router: Address
  voter: Address
  heists: Address
  launchpad: Address
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
    launchpad: ZERO,
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    usde: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
  },
  46630: {
    john: '0xaB1335a48626DCF81C553771239DABa4429B29C3',
    escrow: '0x681238CD67ef7d5f89d63999ac885583662fe7c6',
    router: '0x139D245cBe54dC332BbAf6191269b81D727466a8',
    voter: '0x1340186d89767826f5C048BE90C3257297869702',
    heists: '0xFd8698a3a4c3197ea40D407e094AE26c53FddF98',
    launchpad: '0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3',
    weth: '0xF13E5952780Cdcd2C17333129b5Bc5187ff07DC2',
    usdg: '0xc614ae754F338271fCDDb949037b8d3579D1dc35',
    usde: ZERO,
  },
}

// The chain's own dominant DEX (Uniswap V2 on Robinhood), used by the terminal to
// execute swaps on chain-wide trenches tokens — separate from our own venue above,
// which is frozen on mainnet until "the day". Verified on-chain: router.factory()
// round-trips the canonical factory (0x8bcE…937f, same deployer, 2.26M txs) and
// router.WETH() matches our WETH. NOT the aggregator 0xbde9…f405 (non-standard) nor
// the low-tx secondary 0x07E9…78a6. Only V2-pool tokens route here; V3/V4 deep-link.
export const V2_DEX: Record<number, { router: Address; weth: Address }> = {
  4663: {
    router: '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba',
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  },
}

// Uniswap V3 on Robinhood — SwapRouter02 + QuoterV2, both verified on-chain
// (router.WETH9()/factory() and a live QuoterV2 round-trip; see the V3 lookup).
// SwapRouter02 also routes V2, but we keep the V2 path on the dedicated V2 router.
export const V3_DEX: Record<number, { router: Address; quoter: Address; weth: Address }> = {
  4663: {
    router: '0xCaf681a66D020601342297493863E78C959E5cb2',
    quoter: '0x8a49d86832f1fB6b4dDD04A37A2023A0b688e1B6',
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  },
}

export function deployment(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId]
}

export function coreLive(d: Deployment | undefined): d is Deployment {
  return !!d && d.heists !== ZERO && d.router !== ZERO
}

export function launchpadLive(d: Deployment | undefined): d is Deployment {
  return !!d && d.launchpad !== ZERO && d.router !== ZERO
}

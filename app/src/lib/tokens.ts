import type { Address } from 'viem'
import { ZERO, type Deployment } from '../config/contracts'

export type Tok = { sym: string; addr: Address; dec: number }

// Canonical tokens only. USDG is 6 decimals, USDe 18; mismatches matter for pricing.
// USDG/USDe is the flagship stable pair (real, deep stables on Robinhood Chain;
// USDC/USDT have no canonical liquid deployment there). Zero addresses are dropped.
export function tokenList(d: Deployment): Tok[] {
  return [
    { sym: 'JOHN', addr: d.john, dec: 18 },
    { sym: 'WETH', addr: d.weth, dec: 18 },
    { sym: 'USDG', addr: d.usdg, dec: 6 },
    { sym: 'USDe', addr: d.usde, dec: 18 },
  ].filter((t) => t.addr !== ZERO)
}

export const SLIPPAGE_BPS = 50n // 0.5%
export const DEADLINE_MIN = 20

export function minWithSlippage(amount: bigint): bigint {
  return amount - (amount * SLIPPAGE_BPS) / 10000n
}

export function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MIN * 60)
}

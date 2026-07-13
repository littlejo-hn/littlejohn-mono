import type { Address } from 'viem'
import type { Deployment } from '../config/contracts'

export type Tok = { sym: string; addr: Address; dec: number }

export function tokenList(d: Deployment): Tok[] {
  return [
    { sym: 'JOHN', addr: d.john, dec: 18 },
    { sym: 'WETH', addr: d.weth, dec: 18 },
    { sym: 'USDG', addr: d.usdg, dec: 6 },
  ]
}

export const SLIPPAGE_BPS = 50n // 0.5%
export const DEADLINE_MIN = 20

export function minWithSlippage(amount: bigint): bigint {
  return amount - (amount * SLIPPAGE_BPS) / 10000n
}

export function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MIN * 60)
}

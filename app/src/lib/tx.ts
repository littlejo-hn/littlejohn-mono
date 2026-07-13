import type { Address, PublicClient, WalletClient } from 'viem'
import { erc20Abi } from '../abis'

/** Approve `spender` for `amount` of `token` if the current allowance is short. */
export async function ensureAllowance(
  pub: PublicClient,
  wallet: WalletClient,
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const cur = (await pub.readContract({
    address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender],
  })) as bigint
  if (cur >= amount) return
  const hash = await wallet.writeContract({
    address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount],
    account: owner, chain: null,
  })
  await pub.waitForTransactionReceipt({ hash })
}

export function txError(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e)
}

import { formatUnits, type Address } from 'viem'

export function shortAddr(a?: Address | string | null): string {
  if (!a) return ''
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function fmtAmount(wei: bigint, decimals = 18, maxFrac = 4): string {
  const s = formatUnits(wei, decimals)
  const [int, frac = ''] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, '')
  return trimmed ? `${grouped}.${trimmed}` : grouped
}

export function fmtDuration(seconds: number | bigint): string {
  const s = Number(seconds)
  const days = Math.round(s / 86400)
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`
  return `${days} days`
}

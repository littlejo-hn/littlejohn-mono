import NumberFlow from '@number-flow/react'

// Smooth animated numbers for the terminal (NumberFlow odometer transitions on every
// refresh + the per-second age tick). Guards match the old string formatters so brand-
// new firehose rows (0 price/vol) still read as "—" rather than "$0".

// en-US so currency renders "$" (not "US$") and compact suffixes are uppercase K/M/B.
const L = 'en-US'

export function Usd({ v }: { v: number }) {
  if (!isFinite(v) || v <= 0) return <>—</>
  // Inline so TS checks each literal against NumberFlow's (narrower) Format type.
  if (v >= 1)
    return <NumberFlow locales={L} value={v} format={{ notation: 'compact', compactDisplay: 'short', style: 'currency', currency: 'USD', maximumFractionDigits: 1 }} />
  return <NumberFlow locales={L} value={v} format={{ style: 'currency', currency: 'USD', maximumSignificantDigits: 3 }} />
}

export function Pct({ v }: { v: number }) {
  return <NumberFlow locales={L} value={v / 100} format={{ style: 'percent', signDisplay: 'always', maximumFractionDigits: 1 }} />
}

export function Count({ v }: { v: number }) {
  return <NumberFlow locales={L} value={v} />
}

// Age since launch, recomputed from a shared `now` (ticks each second in the parent).
// NumberFlow makes the seconds roll smoothly — the "counting up by the second" effect.
export function LiveAge({ createdTs, now }: { createdTs: number; now: number }) {
  if (!createdTs) return <>—</>
  const s = Math.max(0, now - createdTs)
  if (s < 60) return <NumberFlow value={s} suffix="s" />
  if (s < 3600) return <NumberFlow value={Math.floor(s / 60)} suffix="m" />
  if (s < 86400) return <NumberFlow value={Math.floor(s / 3600)} suffix="h" />
  return <NumberFlow value={Math.floor(s / 86400)} suffix="d" />
}

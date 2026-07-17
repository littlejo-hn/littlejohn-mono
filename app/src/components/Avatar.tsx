// Token avatar: real image when present, else a deterministic gradient tile
// with the ticker initial (so nothing ever renders as a blank square).
import { useEffect, useState } from 'react'

function hueOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export function Avatar({ image, symbol, addr, className = '' }: {
  image?: string; symbol: string; addr: string; className?: string
}) {
  // Fall back to the gradient tile when the image fails to load or comes back
  // degenerate (a 1×1 placeholder), so a broken avatar never renders as a blank box.
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [image])

  if (image && !broken) {
    return (
      <img
        className={className}
        src={image}
        alt=""
        onError={() => setBroken(true)}
        onLoad={(e) => { if (e.currentTarget.naturalWidth <= 1) setBroken(true) }}
      />
    )
  }
  const hue = hueOf(addr || symbol)
  const letter = (symbol || '?').replace(/^\$/, '').charAt(0).toUpperCase()
  return (
    <span
      className={`${className} avatar-fb`}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 74% 52%), hsl(${(hue + 48) % 360} 70% 30%))` }}
      aria-hidden
    >{letter}</span>
  )
}

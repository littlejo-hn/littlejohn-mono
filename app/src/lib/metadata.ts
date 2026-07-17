// Coin metadata (image + socials). For now we embed a downscaled thumbnail as a
// data: URI so creation works with no backend. Production swap: pin the full
// image + JSON to IPFS (Pinata via a Pages Function) and store the ipfs:// URI.

export type CoinMeta = {
  name: string
  symbol: string
  description?: string
  image?: string
  banner?: string
  twitter?: string
  telegram?: string
  website?: string
}

const JSON_PREFIX = 'data:application/json;base64,'

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** Downscale to a small square-ish JPEG data URI to keep on-chain metadata small. */
export async function imageToThumb(file: File, size = 160): Promise<string> {
  const img = await loadImage(file)
  const scale = Math.min(size / img.width, size / img.height, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export function buildMetadataUri(m: CoinMeta): string {
  const json = JSON.stringify(m)
  return JSON_PREFIX + btoa(unescape(encodeURIComponent(json)))
}

/** Parse an on-chain metadataURI. Handles our data: URIs synchronously; returns
 *  null for ipfs://http (those resolve async via resolveMetadata). */
export function parseMetadata(uri: string): CoinMeta | null {
  try {
    if (uri.startsWith(JSON_PREFIX)) {
      return JSON.parse(decodeURIComponent(escape(atob(uri.slice(JSON_PREFIX.length)))))
    }
  } catch { /* malformed */ }
  return null
}

// Configurable so you can point at your dedicated Pinata gateway (fastest for
// your pinned content) via VITE_IPFS_GATEWAY. Both defaults below are CSP-allowed.
const IPFS_GATEWAY = (import.meta.env.VITE_IPFS_GATEWAY as string) || 'https://gateway.pinata.cloud/ipfs/'
export function ipfsToHttp(uri?: string): string | undefined {
  if (!uri) return undefined
  return uri.startsWith('ipfs://') ? IPFS_GATEWAY + uri.slice(7) : uri
}

/** Pin the image + metadata to IPFS via the /api/pin Pages Function. Falls back
 *  to an embedded data: URI when pinning is unavailable (local dev / no key). */
export async function uploadMetadata(meta: CoinMeta, file: File | null, banner: File | null = null): Promise<string> {
  try {
    const fd = new FormData()
    if (file) fd.append('image', file)
    if (banner) fd.append('banner', banner) // pin.ts can save this when it supports banners
    fd.append('meta', JSON.stringify(meta))
    const r = await fetch('/api/pin', { method: 'POST', body: fd })
    if (r.ok) { const j = (await r.json()) as { uri?: string }; if (j.uri) return j.uri }
  } catch { /* no pinning, fall through */ }
  const image = file ? await imageToThumb(file, 160) : meta.image
  const bannerThumb = banner ? await imageToThumb(banner, 400) : meta.banner
  return buildMetadataUri({ ...meta, image, banner: bannerThumb })
}

/** Resolve an on-chain metadataURI to metadata for display (data:, ipfs://, http). */
export async function resolveMetadata(uri: string): Promise<CoinMeta | null> {
  const sync = parseMetadata(uri)
  if (sync) return sync
  const url = ipfsToHttp(uri)
  if (!url || !url.startsWith('http')) return null
  try {
    // Bound the IPFS fetch — a dead/placeholder URI must not stall the whole board load.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3500)
    const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
    if (!r.ok) return null
    const m = (await r.json()) as CoinMeta
    if (m.image) m.image = ipfsToHttp(m.image)
    return m
  } catch { return null }
}

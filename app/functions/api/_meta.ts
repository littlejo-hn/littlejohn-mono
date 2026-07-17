// Resolve a token's on-chain metadataURI (data:, ipfs://, http(s)://) to display
// fields, edge-cached so each URI is fetched at most once per colo. Kept OUT of the
// indexer so IPFS latency never stalls sync, and because the board only ever shows
// a bounded page (<=200), so we only resolve what's visible, never all 100k tokens.

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export type Meta = {
  image: string | null
  description: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
}
const EMPTY: Meta = { image: null, description: null, twitter: null, telegram: null, website: null }

function ipfsToHttp(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined
  return uri.startsWith('ipfs://') ? GATEWAY + uri.slice('ipfs://'.length) : uri
}

function parseDataJson(uri: string): Record<string, unknown> | null {
  const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri)
  if (!m) return null
  try {
    const raw = m[1] ? atob(m[2]) : decodeURIComponent(m[2])
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function shape(obj: Record<string, unknown> | null): Meta {
  if (!obj) return EMPTY
  return {
    image: ipfsToHttp(str(obj.image) ?? undefined) ?? null,
    description: str(obj.description),
    twitter: str(obj.twitter),
    telegram: str(obj.telegram),
    website: str(obj.website),
  }
}

export async function resolveMeta(uri: string | null | undefined): Promise<Meta> {
  if (!uri) return EMPTY

  // data: URIs resolve inline — no network, no cache.
  const inline = parseDataJson(uri)
  if (inline) return shape(inline)

  const url = ipfsToHttp(uri)
  if (!url || !url.startsWith('http')) return EMPTY

  const cacheKey = new Request('https://meta.littlejohn/' + encodeURIComponent(url))
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return (await hit.json()) as Meta

  let meta = EMPTY
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (r.ok) meta = shape((await r.json()) as Record<string, unknown>)
  } catch {
    /* gateway slow/unreachable: leave empty, a later request retries */
  }

  // Cache real resolutions for a day; don't cache empties so they retry.
  if (meta.image || meta.description) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(meta), {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
      }),
    )
  }
  return meta
}

// Resolve many URIs with a small concurrency cap so a cold board doesn't fan out
// hundreds of gateway fetches at once.
export async function resolveMany(uris: (string | null | undefined)[], limit = 8): Promise<Meta[]> {
  const out: Meta[] = new Array(uris.length).fill(EMPTY)
  let next = 0
  const worker = async () => {
    while (next < uris.length) {
      const i = next++
      out[i] = await resolveMeta(uris[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, uris.length) }, worker))
  return out
}

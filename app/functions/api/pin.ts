// Cloudflare Pages Function: pin a coin's image + metadata to public IPFS via
// Pinata's V3 upload API, keeping the key server-side. Returns { uri: "ipfs://<metadataCID>" }.
//
// Setup: create a Pinata V3 key with "Files: Write" and set it as a secret:
//   wrangler pages secret put PINATA_JWT --project-name littlejohn-app
//
// Local dev (vite) does not run this; the frontend falls back to a data: URI.

interface Env { PINATA_JWT?: string }

const V3_UPLOAD = 'https://uploads.pinata.cloud/v3/files'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Upload one file to public IPFS, return its CID.
async function pinFile(file: File, name: string, jwt: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file, name)
  fd.append('network', 'public') // resolvable by gateways / third parties
  fd.append('name', name)
  const r = await fetch(V3_UPLOAD, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: fd })
  if (!r.ok) throw new Error(`pin failed ${r.status}: ${await r.text()}`)
  const j = (await r.json()) as { data: { cid: string } }
  return j.data.cid
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const jwt = env.PINATA_JWT
  if (!jwt) return json({ error: 'pinning not configured' }, 501)
  try {
    const form = await request.formData()
    const image = form.get('image')
    const meta = JSON.parse((form.get('meta') as string) || '{}') as Record<string, unknown>

    if (image && image instanceof File) {
      const cid = await pinFile(image, image.name || 'coin', jwt)
      meta.image = `ipfs://${cid}`
    }

    const metaFile = new File([JSON.stringify(meta)], 'metadata.json', { type: 'application/json' })
    const metaCid = await pinFile(metaFile, 'metadata.json', jwt)
    return json({ uri: `ipfs://${metaCid}` })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

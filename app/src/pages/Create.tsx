import { useEffect, useRef, useState } from 'react'
import { parseEther, formatEther } from 'viem'
import { useWallet } from '../lib/wallet'
import { deployment, launchpadLive } from '../config/contracts'
import { launchpadAbi } from '../abis'
import { toast } from 'sonner'
import { DEFAULT_CHAIN } from '../lib/chains'
import { txError } from '../lib/tx'
import { imageToThumb, uploadMetadata } from '../lib/metadata'
import { Avatar } from '../components/Avatar'

export function Create({ onCreated }: { onCreated: () => void }) {
  const { address, publicClient, walletClient, chainId, isSupported } = useWallet()
  const d = deployment(chainId ?? DEFAULT_CHAIN.id)
  const live = launchpadLive(d)

  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [desc, setDesc] = useState('')
  const [preview, setPreview] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [banner, setBanner] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [more, setMore] = useState(false)
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [website, setWebsite] = useState('')
  const [initialBuy, setInitialBuy] = useState('')
  const [creationFee, setCreationFee] = useState(0n)
  const [gradEth, setGradEth] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!live) return
    publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'creationFee' })
      .then((f) => setCreationFee(f as bigint)).catch(() => {})
    ;(async () => {
      try {
        const [ive, ivt, cs] = await Promise.all([
          publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'initialVirtualEth' }) as Promise<bigint>,
          publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'INITIAL_VIRTUAL_TOKEN' }) as Promise<bigint>,
          publicClient.readContract({ address: d!.launchpad, abi: launchpadAbi, functionName: 'CURVE_SUPPLY' }) as Promise<bigint>,
        ])
        const iVE = Number(ive), IVT = Number(ivt), CS = Number(cs)
        // ETH to buy the whole curve = graduation threshold (constant-product curve).
        setGradEth(((iVE * IVT) / (IVT - CS) - iVE) / 1e18)
      } catch { /* leave 0 → no warning */ }
    })()
  }, [live, d, publicClient])

  const onPick = async (f: File | null) => {
    setFile(f)
    if (f) { try { setPreview(await imageToThumb(f, 240)) } catch { setPreview('') } }
    else setPreview('')
  }
  const onPickBanner = async (f: File | null) => {
    setBanner(f)
    if (f) { try { setBannerPreview(await imageToThumb(f, 400)) } catch { setBannerPreview('') } }
    else setBannerPreview('')
  }

  const buyWei = (() => { try { return initialBuy ? parseEther(initialBuy) : 0n } catch { return 0n } })()
  const totalCost = creationFee + buyWei
  const graduates = gradEth > 0 && !!initialBuy && Number(initialBuy) >= gradEth
  const canSubmit = !!name.trim() && !!ticker.trim() && !busy && !!address && isSupported

  const launch = async () => {
    if (!walletClient || !address || !d) return
    setBusy(true); setErr(null)
    const tid = toast.loading('Uploading assets…')
    try {
      const uri = await uploadMetadata({
        name: name.trim(), symbol: ticker.trim().toUpperCase(), description: desc.trim() || undefined,
        twitter: twitter.trim() || undefined, telegram: telegram.trim() || undefined, website: website.trim() || undefined,
      }, file, banner)
      toast.loading('Confirm in your wallet…', { id: tid })
      const hash = await walletClient.writeContract({
        address: d.launchpad, abi: launchpadAbi, functionName: 'createToken',
        args: [name.trim(), ticker.trim().toUpperCase(), uri],
        value: totalCost, account: address, chain: null,
      })
      toast.loading('Launching…', { id: tid })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`$${ticker.trim().toUpperCase()} is live`, { id: tid })
      onCreated()
    } catch (e) {
      toast.error(txError(e), { id: tid })
      setErr(txError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!live) {
    return <div className="card"><div className="title">Launch</div><div className="sub">The launchpad is not live on this network yet.</div></div>
  }

  return (
    <div className="card create">
      <div className="title">Launch a <span className="em">coin</span></div>
      <div className="sub">Fair launch on a bonding curve. No presale, no team allocation, the whole supply trades.</div>
      <hr className="hr" />

      <div className="create-preview">
        <div className="clabel" style={{ margin: '0 0 .45rem' }}>Preview</div>
        <div className="bcard preview-card">
          <span className="bcard-pill pill gold">0%</span>
          <div className="bcard-head">
            {preview ? <img className="bcard-img" src={preview} alt="" /> : <Avatar className="bcard-img" symbol={ticker || '?'} addr={ticker || 'preview'} />}
            <div className="bcard-meta">
              <div className="bcard-sym">{ticker || 'TICKER'}</div>
              <div className="bcard-name">{name || 'Your coin'}</div>
            </div>
          </div>
          <div className="bcard-mc">$0 <span>MCAP</span></div>
          <div className="bcard-bar"><i style={{ width: '0%' }} /></div>
        </div>
      </div>

      <label className="clabel">Name</label>
      <input className="cinput" placeholder="Little John" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />

      <label className="clabel">Ticker</label>
      <input className="cinput" placeholder="JOHN" value={ticker} maxLength={10}
        onChange={(e) => setTicker(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} />

      <label className="clabel">Description</label>
      <textarea className="cinput" rows={3} placeholder="What's the story?" value={desc} maxLength={280} onChange={(e) => setDesc(e.target.value)} />

      <label className="clabel">Image</label>
      <button type="button" className="cimg" onClick={() => fileRef.current?.click()}>
        {preview ? <img src={preview} alt="preview" /> : <span>Select image</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0] ?? null)} />

      <label className="clabel">Banner (optional)</label>
      <button type="button" className="cimg cbanner" onClick={() => bannerRef.current?.click()}>
        {bannerPreview ? <img src={bannerPreview} alt="banner" /> : <span>Select banner · 3:1 cover</span>}
      </button>
      <input ref={bannerRef} type="file" accept="image/*" hidden onChange={(e) => onPickBanner(e.target.files?.[0] ?? null)} />

      <button type="button" className="cmore" onClick={() => setMore((v) => !v)}>{more ? 'Hide socials' : 'Add socials (optional)'}</button>
      {more && (
        <div className="csocials">
          <input className="cinput" placeholder="Twitter / X url" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
          <input className="cinput" placeholder="Telegram url" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          <input className="cinput" placeholder="Website url" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      )}

      <label className="clabel">Buy your coin (optional)</label>
      <div className="cbuy">
        <input className="cinput" inputMode="decimal" placeholder="0.0" value={initialBuy}
          onChange={(e) => setInitialBuy(e.target.value.replace(/[^0-9.]/g, ''))} />
        <span className="tok">ETH</span>
      </div>
      <div className="chint">A small first buy keeps snipers from taking your whole supply on launch.</div>
      {graduates && <div className="grad-warn">⚠ A first buy this large graduates your coin instantly (straight to the DEX). Any excess is refunded.</div>}

      <div className="kv" style={{ marginTop: '.6rem' }}>
        <span className="k">Cost</span>
        <span className="v">{formatEther(totalCost)} ETH{creationFee > 0n ? ` (fee ${formatEther(creationFee)} + buy)` : buyWei > 0n ? ' (dev buy)' : ' (free)'}</span>
      </div>

      <button className="btn" disabled={!canSubmit} onClick={launch}>
        {!address ? 'Connect wallet' : !isSupported ? `Switch to ${DEFAULT_CHAIN.name}` : busy ? <><span className="spinner" /> Launching</> : 'Launch coin'}
      </button>
      {err && <div className="err">{err}</div>}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../lib/wallet'
import { Avatar } from '../components/Avatar'
import { getProfile, saveProfile, signIn, getSession, uploadAvatar } from '../lib/social'

export function ProfilePage() {
  const { address, walletClient, connect, hasWallet } = useWallet()
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signed, setSigned] = useState(!!getSession())
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!address) return
    getProfile(address).then((p) => {
      if (p) { setUsername(p.username ?? ''); setBio(p.bio ?? ''); setAvatar(p.avatar) }
    })
  }, [address])

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    if (!signed) { toast.error('Sign in first'); return }
    setBusy(true)
    const res = await uploadAvatar(file)
    setBusy(false)
    if (res.ok && res.avatar) { setAvatar(res.avatar); toast.success('Avatar updated') }
    else toast.error(res.error ?? 'Upload failed')
  }

  const doSignIn = async () => {
    if (!address || !walletClient) { if (hasWallet) connect(); return }
    setBusy(true)
    try { await signIn(walletClient, address); setSigned(true); toast.success('Signed in') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Sign-in failed') }
    finally { setBusy(false) }
  }

  const save = async () => {
    setBusy(true)
    const res = await saveProfile({ username: username.trim() || null, bio: bio.trim() || null })
    setBusy(false)
    if (res.ok) toast.success('Profile saved')
    else { toast.error(res.error ?? 'Failed'); if (res.error === 'not signed in') setSigned(false) }
  }

  if (!address) {
    return (
      <div className="card">
        <div className="title">Your profile</div>
        <div className="sub">Connect your wallet to set up a profile.</div>
        <button className="btn" onClick={() => hasWallet && connect()} style={{ marginTop: '.8rem' }}>Connect wallet</button>
      </div>
    )
  }

  return (
    <div className="card profile-edit">
      <div className="title">Your profile</div>
      <div className="pf-addr num">{address}</div>

      <div className="pf-avatar-row">
        <button type="button" className="pf-avatar" onClick={() => fileRef.current?.click()} disabled={busy} title="Upload avatar">
          <Avatar className="pf-avatar-img" image={avatar ?? undefined} symbol={username || address} addr={address} />
          <span className="pf-avatar-edit">Change</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
        <div className="pf-hint">JPG / PNG / GIF, up to 2MB.</div>
      </div>

      <label className="pf-label">Username</label>
      <input className="pf-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="satoshi" maxLength={20} />
      <div className="pf-hint">3–20 letters, numbers, or underscores. Shown on your comments and coins.</div>

      <label className="pf-label">Bio</label>
      <textarea className="pf-input pf-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="gm from the trenches" maxLength={160} rows={3} />

      {signed ? (
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
      ) : (
        <button className="btn" disabled={busy} onClick={doSignIn}>{busy ? 'Signing in…' : 'Sign in to edit'}</button>
      )}
      <div className="sub" style={{ marginTop: '.7rem' }}>Avatars land once media storage is enabled.</div>
    </div>
  )
}

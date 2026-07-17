import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWallet } from '../lib/wallet'
import { fetchComments, postComment, signIn, getSession, type Comment } from '../lib/social'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const ago = (ts: number) => {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function CoinComments({ token }: { token: string }) {
  const { address, walletClient, connect, hasWallet } = useWallet()
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [signed, setSigned] = useState(!!getSession())

  const load = useCallback(() => { fetchComments(token).then(setComments) }, [token])
  useEffect(() => { load() }, [load])

  const doSignIn = async () => {
    if (!address || !walletClient) { if (hasWallet) connect(); return }
    setBusy(true)
    try {
      await signIn(walletClient, address)
      setSigned(true)
      toast.success('Signed in')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const res = await postComment(token, text)
    setBusy(false)
    if (res.ok) { setBody(''); load() }
    else { setSigned(false); toast.error(res.error ?? 'Failed to post') }
  }

  return (
    <div className="card comments">
      <div className="comments-title">Comments <span className="tag">{comments.length}</span></div>

      {signed && address ? (
        <div className="comment-compose">
          <textarea
            value={body}
            maxLength={500}
            placeholder="Say something to the trenches…"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          />
          <button className="btn sm" disabled={busy || !body.trim()} onClick={submit}>Post</button>
        </div>
      ) : (
        <button className="btn sm signin" disabled={busy} onClick={doSignIn}>
          {busy ? 'Signing in…' : !address ? 'Connect wallet to comment' : 'Sign in to comment'}
        </button>
      )}

      <div className="comment-list">
        {comments.length === 0 && <div className="comments-empty">No comments yet. Start the thread.</div>}
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <div className="comment-head">
              <Link className="comment-who" to={`/u/${c.author}`}>{c.username || short(c.author)}</Link>
              <span className="comment-age">{ago(c.ts)}</span>
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

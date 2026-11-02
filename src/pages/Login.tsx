import { useEffect, useState } from 'react'
import { getMe, logout, requestLogin, type Me } from '../lib/session'
import { Button, Card, Input } from '../components/ui'

export default function Login() {
  const params = new URLSearchParams(location.search)
  const next = params.get('next') ?? undefined
  const [me, setMe] = useState<Me | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<null | { emailConfigured: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe({ user: null }))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setSent(await requestLogin(email.trim(), next))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-stripes flex min-h-full items-center justify-center bg-linear-to-b from-[#1d4ed8] to-[#0f1b33] px-4 py-12">
      <Card className="pop-in w-full max-w-sm p-7 text-center">
        <div className="text-5xl">⚾</div>
        <h1 className="mt-2 text-2xl font-black">Dugout HQ</h1>

        {me?.user ? (
          <div className="mt-4 space-y-3 text-left">
            <p className="text-center text-sm text-slate-500">Signed in as <b>{me.user.email}</b></p>
            {me.superAdmin && <a href="/admin" className="block rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800">🛠️ Admin console</a>}
            {(me.clubs ?? []).map((c) => (
              <a key={c.slug} href={`/c/${c.slug}/`} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 font-bold ring-1 ring-slate-200 hover:bg-slate-100">
                {c.name} <span className="text-xs font-semibold text-slate-400">{c.role}</span>
              </a>
            ))}
            {!me.superAdmin && !(me.clubs ?? []).length && <p className="text-center text-sm text-slate-500">You’re not on any club yet. Ask your club admin to invite you.</p>}
            <button className="w-full text-center text-sm text-slate-500 underline" onClick={() => logout().then(() => location.reload())}>Sign out</button>
          </div>
        ) : sent ? (
          <div className="mt-4 space-y-2">
            <div className="text-4xl">📬</div>
            <p className="font-bold">Check your email</p>
            <p className="text-sm text-slate-500">If <b>{email}</b> has a Dugout HQ account, a sign-in link is on its way. It works once and expires in 30 minutes.</p>
            {!sent.emailConfigured && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Email delivery isn’t set up on this server yet, so ask your Dugout HQ admin for your sign-in link.</p>}
            <button className="text-sm text-slate-500 underline" onClick={() => setSent(null)}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-sm text-slate-500">Enter your email and we’ll send you a sign-in link. No password needed.</p>
            <Input type="email" required autoFocus placeholder="coach@yourclub.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy || me === null}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Button>
          </form>
        )}
        <a href="/" className="mt-6 block text-xs text-slate-400 hover:underline">See the demo club →</a>
      </Card>
    </div>
  )
}

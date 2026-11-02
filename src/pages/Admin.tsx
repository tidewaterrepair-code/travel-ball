// Your console: every club on the platform, and creating new ones.
import { useEffect, useState } from 'react'
import { adminClubs, adminCreateClub, getMe, logout, type AdminClub, type Me } from '../lib/session'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input } from '../components/ui'
import { timeAgo } from '../lib/utils'
import { celebrate } from '../components/feedback'

const slugify = (s: string) =>
  s.toLowerCase().replace(/\b(baseball|club|travel|organization|the)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export default function Admin() {
  const [me, setMe] = useState<Me | null>(null)
  const [clubs, setClubs] = useState<AdminClub[] | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '', demo: true })
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; link: string; url: string; emailed: boolean } | null>(null)

  const refresh = () => adminClubs().then((r) => setClubs(r.clubs)).catch((e) => setError(e.message))
  useEffect(() => {
    getMe().then((m) => {
      setMe(m)
      if (!m.user) location.href = '/login?next=/admin'
      else if (m.superAdmin) refresh()
    })
  }, [])

  if (!me) return <div className="p-10 text-center text-slate-500">Loading…</div>
  if (!me.superAdmin)
    return (
      <div className="p-10 text-center">
        <p className="font-bold">This page is for Dugout HQ admins.</p>
        <a className="text-brand underline" href="/login">Back to sign-in</a>
      </div>
    )

  const totalPlayers = clubs?.reduce((s, c) => s + c.players, 0) ?? 0
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">🛠️ Dugout HQ Admin</h1>
          <p className="text-sm text-slate-500">Signed in as {me.user?.email}</p>
        </div>
        <div className="flex gap-2">
          <a href="/" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50">🎨 Pitch demo</a>
          <Button variant="ghost" onClick={() => logout().then(() => (location.href = '/login'))}>Sign out</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Clubs', clubs?.length ?? '–'], ['Active players', totalPlayers], ['Staff accounts', clubs?.reduce((s, c) => s + c.members, 0) ?? '–']].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</div>
            <div className="text-3xl font-black tabular-nums">{v}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader icon="➕" title="Add a club" subtitle="Creates their space and emails the owner a sign-in link" />
          {created ? (
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
                🎉 <b>{created.name}</b> is live at <a className="underline" href={created.url}>{created.url}</a>
              </div>
              <p className="text-sm text-slate-600">{created.emailed ? 'We emailed the owner their sign-in link. You can also send it yourself:' : 'Email isn’t set up yet, so send the owner this sign-in link yourself (it works once and lasts 7 days):'}</p>
              <div className="flex gap-2">
                <Input readOnly value={created.link} onFocus={(e) => e.target.select()} aria-label="Owner sign-in link" />
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(created.link)}>Copy</Button>
              </div>
              <Button variant="ghost" onClick={() => setCreated(null)}>Add another club</Button>
            </div>
          ) : (
            <form
              className="space-y-3 px-5 pb-5"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                setError(null)
                try {
                  const r = await adminCreateClub(form)
                  setCreated({ name: form.name, ...r })
                  setForm({ name: '', slug: '', ownerEmail: '', demo: true })
                  setSlugTouched(false)
                  celebrate()
                  refresh()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Field label="Club name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} placeholder="Tidewater Sharks Baseball" /></Field>
              <Field label="Web address" hint={<>Their app: <b>{location.origin}/c/{form.slug || 'club-name'}/</b></>}>
                <Input required pattern="[a-z0-9](?:[a-z0-9\-]{0,38}[a-z0-9])?" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value.toLowerCase() }) }} />
              </Field>
              <Field label="Owner’s email"><Input required type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form.demo} onChange={(e) => setForm({ ...form, demo: e.target.checked })} className="mt-0.5" />
                <span>Start with sample players and schedule (great for a trial; they can clear it in Settings)</span>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create club ⚾'}</Button>
            </form>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader icon="🏟️" title="Clubs" subtitle="Everyone on Dugout HQ" />
          {!clubs ? <p className="px-5 pb-5 text-sm text-slate-500">Loading…</p> : clubs.length === 0 ? (
            <EmptyState emoji="⚾" title="No clubs yet">Add your first club on the left.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {clubs.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <a href={`/c/${c.slug}/`} className="font-bold hover:underline">{c.name}</a>
                    <div className="text-xs text-slate-500">/c/{c.slug} · created {timeAgo(c.created_at.replace(' ', 'T') + 'Z')} · active {timeAgo(c.updated_at.replace(' ', 'T') + 'Z')}</div>
                  </div>
                  <Badge>{c.teams} teams</Badge>
                  <Badge tone="blue">{c.players} players</Badge>
                  <Badge tone="violet">{c.leads} leads</Badge>
                  <Badge tone="green">{c.members} staff</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClub, useData } from '../lib/store'
import { Avatar, Badge, Button, Card, CardHeader, Input, Meter } from '../components/ui'
import { TrendChart } from '../components/charts'
import { toast } from '../components/feedback'
import { EVENT_TYPES } from '../lib/types'
import { addDays, balance, compactMoney, daysUntil, fmtDate, fmtTime, paidTotal, payStatus, relativeDay, timeAgo, toDateISO, todayISO, uid, cx } from '../lib/utils'
import { addTask } from '../lib/ops'
import { teamBaseName } from '../lib/brand'
import { ClubLogo } from '../components/ClubLogo'
import { BrandWizard } from '../components/BrandWizard'
import { IS_CLUB } from '../lib/mode'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function ScoreTile({ label, value, sub, to, emoji }: { label: string; value: string; sub: string; to: string; emoji: string }) {
  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl bg-navy p-4 text-white shadow-md ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="absolute -right-3 -bottom-4 text-6xl opacity-10 transition group-hover:scale-110 group-hover:opacity-20" aria-hidden>{emoji}</div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="score-digits mt-1 text-3xl font-black text-accent sm:text-4xl">{value}</div>
      <div className="mt-1 text-xs text-slate-300">{sub}</div>
    </Link>
  )
}

export default function Dashboard() {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const set = useClub((s) => s.set)
  const { settings, leads, players, registrations, events, teams, tasks, shoutouts, activity, automations } = data
  const [newTask, setNewTask] = useState('')
  const [branding, setBranding] = useState(false)

  const season = registrations.filter((r) => r.season === settings.seasonYear)
  const collected = season.reduce((s, r) => s + paidTotal(r), 0)
  const outstanding = season.reduce((s, r) => s + balance(r), 0)
  const pastDueCount = season.filter((r) => payStatus(r) === 'pastdue').length
  const active = players.filter((p) => p.status === 'active')
  const openLeads = leads.filter((l) => !['committed', 'lost'].includes(l.stage))
  const newThisWeek = leads.filter((l) => daysUntil(l.createdAt) >= -7).length

  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.end) >= new Date()).sort((a, b) => a.start.localeCompare(b.start)),
    [events],
  )
  const nextBig = upcoming.find((e) => e.type === 'tournament' || e.type === 'tryout')
  const nextFew = upcoming.filter((e) => e.type !== 'practice').slice(0, 5)
  const practicesThisWeek = upcoming.filter((e) => e.type === 'practice' && daysUntil(e.start) < 7).length

  const signupTrend = useMemo(() => {
    const days = 30
    const start = addDays(new Date(), -(days - 1))
    return Array.from({ length: days }, (_, i) => {
      const d = toDateISO(addDays(start, i))
      return { label: fmtDate(d), value: leads.filter((l) => toDateISO(new Date(l.createdAt)) === d).length }
    })
  }, [leads])

  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due))
  const playerById = (id: string) => players.find((p) => p.id === id)

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="field-stripes relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand to-navy p-6 text-white shadow-lg sm:p-8">
        {settings.banner && (
          <>
            <img src={settings.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-luminosity" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-r from-navy/80 via-brand/40 to-transparent" aria-hidden />
          </>
        )}
        <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full border-[14px] border-dashed border-white/10" aria-hidden />
        {!IS_CLUB && !settings.logo && !settings.website && (
          <button onClick={() => setBranding(true)} className="absolute top-3 right-3 z-10 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25">🎨 Customize for a club</button>
        )}
        <div className={cx('relative flex flex-wrap items-end justify-between gap-4', !IS_CLUB && !settings.logo && !settings.website && 'pt-6')}>
          <div className="flex items-center gap-4">
            <div className="hidden shrink-0 sm:block"><ClubLogo size={76} /></div>
            <div>
            <p className="text-sm font-semibold text-white/70">{greeting()}, Coach 👋</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Let’s play ball, {teamBaseName(settings.name).split(' ')[0]}!</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              {newThisWeek} new signups this week · {practicesThisWeek} practices on deck · {pastDueCount} families need a payment nudge
            </p>
            </div>
          </div>
          {nextBig && (
            <div className="rounded-2xl bg-white/12 px-5 py-4 ring-1 ring-white/20 backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">{new Date(nextBig.start) <= new Date() ? 'Happening now' : 'Next up'}</div>
              <div className="mt-0.5 font-black">{EVENT_TYPES.find((t) => t.id === nextBig.type)?.emoji} {nextBig.title}</div>
              {new Date(nextBig.start) <= new Date() ? (
                <div className="mt-1 text-sm text-white/80"><span className="mr-1 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Live through {fmtDate(nextBig.end, { weekday: 'long' })} · {nextBig.location}</div>
              ) : daysUntil(nextBig.start) === 0 ? (
                <div className="score-digits mt-1 text-3xl font-black text-accent">TODAY!</div>
              ) : (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="score-digits text-4xl font-black text-accent">{daysUntil(nextBig.start)}</span>
                  <span className="text-sm text-white/80">{daysUntil(nextBig.start) === 1 ? 'day' : 'days'} away · {fmtDate(nextBig.start, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ScoreTile to="/leads" emoji="🧢" label="Open leads" value={String(openLeads.length)} sub={`${leads.filter((l) => l.stage === 'new').length} brand new`} />
        <ScoreTile to="/players" emoji="⚾" label="Active players" value={String(active.length)} sub={`across ${teams.length} teams`} />
        <ScoreTile to="/payments" emoji="💵" label="Dues collected" value={compactMoney(collected)} sub={`${Math.round((collected / Math.max(1, collected + outstanding)) * 100)}% of season fees`} />
        <ScoreTile to="/payments" emoji="⏳" label="Still owed" value={compactMoney(outstanding)} sub={`${pastDueCount} past due`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader icon="📈" title="Tryout signups" subtitle="New interest per day, last 30 days" action={<Link to="/leads" className="text-sm font-semibold text-brand hover:underline">Open board →</Link>} />
            <div className="px-5 pb-5">
              <TrendChart points={signupTrend} label="Tryout signups per day over the last 30 days" />
            </div>
          </Card>

          <Card>
            <CardHeader icon="⚾" title="Teams at a glance" action={<Link to="/teams" className="text-sm font-semibold text-brand hover:underline">All teams →</Link>} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {teams.map((t) => {
                const roster = active.filter((p) => p.teamId === t.id)
                const regs = season.filter((r) => r.teamId === t.id)
                const paidUp = regs.filter((r) => balance(r) === 0).length
                return (
                  <Link key={t.id} to={`/teams?team=${t.id}`} className="group rounded-xl p-3 ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand/40">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: t.color }}>{t.ageGroup}U</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{t.name}</div>
                        <div className="truncate text-xs text-slate-500">{t.headCoach}</div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div className="font-bold text-slate-800">{roster.length}/{t.rosterLimit}</div>
                        roster
                      </div>
                    </div>
                    <Meter className="mt-3" value={roster.length} max={t.rosterLimit} color={t.color} label={`${t.name} roster spots filled`} />
                    <div className="mt-1.5 text-[11px] text-slate-500">{paidUp} of {regs.length} families paid in full · {t.rosterLimit - roster.length > 0 ? `${t.rosterLimit - roster.length} open spots` : 'Full roster'}</div>
                  </Link>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHeader icon="⚡" title="Autopilot" subtitle="Automations working for you in the background" action={<Link to="/settings" className="text-sm font-semibold text-brand hover:underline">Manage →</Link>} />
            <ul className="divide-y divide-slate-100 px-5 pb-3">
              {automations.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className={cx('h-2.5 w-2.5 rounded-full', a.enabled ? 'bg-emerald-500 shadow-[0_0_0_4px] shadow-emerald-100' : 'bg-slate-300')} />
                  <span className="flex-1 text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{a.runs} runs</span>
                  <Badge tone={a.enabled ? 'green' : 'slate'}>{a.enabled ? 'On' : 'Paused'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon="📅" title="Coming up" action={<Link to="/schedule" className="text-sm font-semibold text-brand hover:underline">Schedule →</Link>} />
            <ul className="space-y-2 px-5 pb-5">
              {nextFew.map((e) => {
                const meta = EVENT_TYPES.find((t) => t.id === e.type)!
                const going = Object.values(e.rsvps).filter((r) => r === 'yes').length
                return (
                  <li key={e.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-white py-1 shadow-sm ring-1 ring-slate-200">
                      <span className="text-[10px] font-bold uppercase text-red-600">{fmtDate(e.start, { month: 'short' })}</span>
                      <span className="text-lg font-black leading-none">{new Date(e.start).getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{meta.emoji} {e.title}</div>
                      <div className="truncate text-xs text-slate-500">{relativeDay(e.start)} · {fmtTime(e.start)} · {e.location}</div>
                      {e.teamIds.length > 0 && <div className="mt-0.5 text-[11px] text-emerald-700">{going} players confirmed</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader icon="✅" title="Staff to-dos" subtitle={`${openTasks.length} open`} />
            <ul className="px-3 pb-2">
              {openTasks.slice(0, 6).map((t) => {
                const late = t.due < todayISO()
                return (
                  <li key={t.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                      aria-label={`Mark "${t.title}" done`}
                      onChange={() => {
                        set('tasks', (ts) => ts.map((x) => (x.id === t.id ? { ...x, done: true } : x)))
                        toast('✅', 'Task done!', t.title)
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.title}</div>
                      <div className={cx('text-xs', late ? 'font-semibold text-red-600' : 'text-slate-500')}>{late ? 'Overdue · ' : ''}{relativeDay(t.due)} · {t.assignee}</div>
                    </div>
                  </li>
                )
              })}
              {openTasks.length === 0 && <li className="px-2 py-4 text-center text-sm text-slate-500">All caught up! 🙌</li>}
            </ul>
            <form
              className="flex gap-2 border-t border-slate-100 px-5 py-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newTask.trim()) return
                apply((d) => addTask(d, { title: newTask.trim(), due: todayISO(), assignee: 'Me' }))
                setNewTask('')
              }}
            >
              <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a to-do…" aria-label="New to-do" />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-gradient-to-r from-accent to-amber-300 px-5 py-3">
              <h3 className="font-black text-slate-900">🌟 Player shoutouts</h3>
              <p className="text-xs text-slate-800/80">Celebrate the big moments</p>
            </div>
            <ul className="space-y-3 p-5">
              {shoutouts.slice(0, 3).map((s) => {
                const p = playerById(s.playerId)
                const team = teams.find((t) => t.id === p?.teamId)
                if (!p) return null
                return (
                  <li key={s.id} className="flex gap-3">
                    <Avatar name={`${p.firstName} ${p.lastName}`} color={team?.color} />
                    <div>
                      <div className="text-sm font-bold">{p.firstName} {p.lastName} <span className="font-normal text-slate-500">· {team?.name} #{p.jersey}</span></div>
                      <div className="text-sm text-slate-700">{s.text}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
            <ShoutoutForm onAdd={(playerId, text) => {
              set('shoutouts', (s) => [{ id: uid('sh'), playerId, text, createdAt: new Date().toISOString() }, ...s])
              toast('🌟', 'Shoutout posted!', 'Share it with families from Messages.')
            }} />
          </Card>

          <Card>
            <CardHeader icon="🔔" title="Recent activity" />
            <ul className="space-y-2.5 px-5 pb-5">
              {activity.slice(0, 7).map((a) => (
                <li key={a.id} className="flex gap-2.5 text-sm">
                  <span>{a.emoji}</span>
                  <span className="flex-1 text-slate-700">{a.text}</span>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <BrandWizard open={branding} onClose={() => setBranding(false)} />
    </div>
  )
}

function ShoutoutForm({ onAdd }: { onAdd: (playerId: string, text: string) => void }) {
  const { players, teams } = useData()
  const [open, setOpen] = useState(false)
  const [pid, setPid] = useState('')
  const [text, setText] = useState('')
  if (!open)
    return (
      <div className="px-5 pb-4">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>+ Give a shoutout</Button>
      </div>
    )
  return (
    <form
      className="space-y-2 border-t border-slate-100 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pid || !text.trim()) return
        onAdd(pid, text.trim())
        setText('')
        setOpen(false)
      }}
    >
      <select className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Player">
        <option value="">Pick a player…</option>
        {teams.map((t) => (
          <optgroup key={t.id} label={t.name}>
            {players.filter((p) => p.teamId === t.id && p.status === 'active').map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Walk-off single to win it! 🎉" aria-label="Shoutout" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="accent">Post shoutout</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}

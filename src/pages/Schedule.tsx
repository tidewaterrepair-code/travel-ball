import { useMemo, useState } from 'react'
import { useClub, useData } from '../lib/store'
import { EVENT_TYPES, type ClubEvent, type EventType, type RSVP } from '../lib/types'
import { addDays, cx, fmtDate, fmtTime, relativeDay, toDateISO, uid } from '../lib/utils'
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui'
import { toast } from '../components/feedback'

const typeStyle: Record<EventType, string> = {
  practice: 'bg-sky-50 ring-sky-200',
  game: 'bg-emerald-50 ring-emerald-200',
  tournament: 'bg-amber-50 ring-amber-300',
  tryout: 'bg-violet-50 ring-violet-200',
  fundraiser: 'bg-pink-50 ring-pink-200',
  meeting: 'bg-slate-50 ring-slate-200',
}

function toICS(events: ClubEvent[], org: string) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s = '') => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//Dugout HQ//${org}//EN`,
    ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.id}@dugouthq`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(e.start)}`, `DTEND:${f(e.end)}`, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.address ?? e.location)}`, `DESCRIPTION:${esc([e.notes, e.hotel && `Hotel: ${e.hotel}`].filter(Boolean).join('\n'))}`, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n')
}

export default function Schedule() {
  const data = useData()
  const { events, teams, settings } = data
  const [team, setTeam] = useState('')
  const [type, setType] = useState<EventType | ''>('')
  const [range, setRange] = useState<'upcoming' | 'past'>('upcoming')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const list = useMemo(() => {
    const now = new Date()
    return events
      .filter((e) => (range === 'upcoming' ? new Date(e.end) >= now : new Date(e.end) < now))
      .filter((e) => !team || e.teamIds.length === 0 || e.teamIds.includes(team))
      .filter((e) => !type || e.type === type)
      .sort((a, b) => (range === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)))
  }, [events, team, type, range])

  const groups = useMemo(() => {
    const m = new Map<string, ClubEvent[]>()
    for (const e of list.slice(0, 80)) {
      const k = toDateISO(new Date(e.start))
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [list])

  const exportICS = () => {
    const blob = new Blob([toICS(list, settings.name)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(teams.find((t) => t.id === team)?.name ?? settings.name).replace(/\s+/g, '-')}.ics`
    a.click()
    toast('📆', 'Calendar file downloaded', 'Families can import it into Google, Apple or Outlook calendars.')
  }

  const open = events.find((e) => e.id === openId) ?? null
  return (
    <div>
      <PageHeader
        emoji="📅"
        title="Schedule"
        subtitle="Practices, games, tournaments and tryouts — with RSVPs so you know who’s showing up."
        actions={<><Button variant="secondary" onClick={exportICS}>📆 Add to calendar</Button><Button onClick={() => setAdding(true)}>+ New event</Button></>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Tabs value={range} onChange={setRange} options={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }]} />
        <Select className="w-auto" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <div className="flex flex-wrap gap-1">
          {EVENT_TYPES.map((t) => (
            <button key={t.id} onClick={() => setType(type === t.id ? '' : t.id)} className={cx('rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition', type === t.id ? 'bg-navy text-white ring-navy' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <Card><EmptyState emoji="🌤️" title="Nothing on the schedule">Add a practice, game or tournament to get started.</EmptyState></Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, evs]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-black text-slate-700">
                {relativeDay(day)}
                <span className="text-xs font-medium text-slate-400">{fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {evs.map((e) => <EventCard key={e.id} e={e} onOpen={() => setOpenId(e.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {open && <EventDrawer key={open.id} event={open} onClose={() => setOpenId(null)} />}
      {adding && <EventModal onClose={() => setAdding(false)} defaultTeam={team} />}
    </div>
  )
}

function EventCard({ e, onOpen }: { e: ClubEvent; onOpen: () => void }) {
  const { teams, players } = useData()
  const meta = EVENT_TYPES.find((t) => t.id === e.type)!
  const roster = players.filter((p) => p.status === 'active' && e.teamIds.includes(p.teamId ?? ''))
  const yes = roster.filter((p) => e.rsvps[p.id] === 'yes').length
  const multiDay = toDateISO(new Date(e.start)) !== toDateISO(new Date(e.end))
  return (
    <button onClick={onOpen} className={cx('pop-in rounded-2xl p-4 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-md', typeStyle[e.type])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{meta.emoji} {meta.label}</div>
          <div className="truncate font-black">{e.title}</div>
        </div>
        <div className="shrink-0 text-right text-xs font-bold text-slate-700">{fmtTime(e.start)}{multiDay && <div className="font-medium text-slate-500">thru {fmtDate(e.end, { weekday: 'short' })}</div>}</div>
      </div>
      <div className="mt-1 truncate text-xs text-slate-600">📍 {e.location}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {e.teamIds.length === 0 ? <Badge tone="brand">Whole club</Badge> : e.teamIds.map((id) => {
          const t = teams.find((x) => x.id === id)
          return t ? <span key={id} className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: t.color }}>{t.ageGroup}U</span> : null
        })}
        {roster.length > 0 && <span className="ml-auto text-xs font-semibold text-emerald-700">✅ {yes}/{roster.length}</span>}
      </div>
    </button>
  )
}

function EventDrawer({ event, onClose }: { event: ClubEvent; onClose: () => void }) {
  const data = useData()
  const set = useClub((s) => s.set)
  const meta = EVENT_TYPES.find((t) => t.id === event.type)!
  const roster = data.players.filter((p) => p.status === 'active' && event.teamIds.includes(p.teamId ?? '')).sort((a, b) => a.lastName.localeCompare(b.lastName))
  const counts = { yes: 0, maybe: 0, no: 0, none: 0 }
  roster.forEach((p) => counts[event.rsvps[p.id] ?? 'none']++)
  const setRsvp = (pid: string, r: RSVP) => set('events', (es) => es.map((e) => (e.id === event.id ? { ...e, rsvps: { ...e.rsvps, [pid]: r } } : e)))
  const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(event.address ?? event.location)}`

  return (
    <Drawer
      open
      onClose={onClose}
      title={<div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">{meta.emoji} {meta.label}</div>{event.title}</div>}
      footer={
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={() => {
            if (!confirm('Delete this event?')) return
            set('events', (es) => es.filter((e) => e.id !== event.id))
            toast('🗑️', 'Event deleted')
            onClose()
          }}
        >
          Delete event
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2 text-sm">
          <div className="rounded-xl bg-slate-50 px-3 py-2">🕐 {fmtDate(event.start, { weekday: 'long', month: 'long', day: 'numeric' })}, {fmtTime(event.start)} – {toDateISO(new Date(event.start)) !== toDateISO(new Date(event.end)) ? `${fmtDate(event.end, { weekday: 'short', month: 'short', day: 'numeric' })} ` : ''}{fmtTime(event.end)}</div>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="block rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100">📍 {event.location} <span className="text-brand">· Directions ↗</span></a>
          {event.opponent && <div className="rounded-xl bg-slate-50 px-3 py-2">🆚 {event.opponent}</div>}
          {event.hotel && <div className="rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">🏨 {event.hotel}</div>}
          {event.notes && <div className="rounded-xl bg-slate-50 px-3 py-2 whitespace-pre-wrap">📝 {event.notes}</div>}
        </div>

        {roster.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black">Who’s coming?</h3>
              <div className="flex gap-1 text-xs">
                <Badge tone="green">✓ {counts.yes}</Badge><Badge tone="amber">? {counts.maybe}</Badge><Badge tone="red">✗ {counts.no}</Badge><Badge>… {counts.none}</Badge>
              </div>
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {roster.map((p) => {
                const r = event.rsvps[p.id]
                return (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm font-medium">{p.firstName} {p.lastName} <span className="text-slate-400">#{p.jersey}</span></span>
                    {(['yes', 'maybe', 'no'] as RSVP[]).map((opt) => (
                      <button key={opt} onClick={() => setRsvp(p.id, opt)} aria-pressed={r === opt} aria-label={`${p.firstName} ${opt}`} className={cx('h-7 w-7 rounded-full text-xs font-black transition', r === opt ? (opt === 'yes' ? 'bg-emerald-500 text-white' : opt === 'maybe' ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white') : 'bg-slate-100 text-slate-400 hover:bg-slate-200')}>
                        {opt === 'yes' ? '✓' : opt === 'maybe' ? '?' : '✗'}
                      </button>
                    ))}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {event.type === 'tryout' && (
          <div>
            <h3 className="mb-2 text-sm font-black">Signed up for this tryout</h3>
            <ul className="space-y-1 text-sm">
              {data.leads.filter((l) => l.tryoutEventId === event.id).map((l) => <li key={l.id} className="rounded-lg bg-violet-50 px-3 py-1.5">🧢 {l.playerFirst} {l.playerLast} <span className="text-slate-500">· {l.parentName}</span></li>)}
              {data.leads.filter((l) => l.tryoutEventId === event.id).length === 0 && <li className="text-slate-500">No one assigned yet — set tryouts from the Leads board.</li>}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function EventModal({ onClose, defaultTeam }: { onClose: () => void; defaultTeam: string }) {
  const data = useData()
  const set = useClub((s) => s.set)
  const tomorrow = toDateISO(addDays(new Date(), 1))
  const [v, setV] = useState({ type: 'practice' as EventType, title: '', teamIds: defaultTeam ? [defaultTeam] : ([] as string[]), date: tomorrow, endDate: tomorrow, startTime: '17:30', endTime: '19:00', location: '', opponent: '', hotel: '', notes: '', repeat: 1 })
  const firstTeam = data.teams.find((t) => t.id === v.teamIds[0])
  const autoTitle = v.title || (v.type === 'game' && v.opponent ? `${firstTeam?.name ?? 'Thunder'} vs ${v.opponent}` : `${firstTeam && v.teamIds.length === 1 ? firstTeam.name + ' ' : ''}${EVENT_TYPES.find((t) => t.id === v.type)!.label}`)

  return (
    <Modal open onClose={onClose} title="📅 New event" wide>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          const created: ClubEvent[] = []
          for (let w = 0; w < Math.max(1, v.repeat); w++) {
            const s = addDays(new Date(`${v.date}T${v.startTime}`), w * 7)
            const end = addDays(new Date(`${v.type === 'tournament' ? v.endDate : v.date}T${v.endTime}`), w * 7)
            created.push({ id: uid('evt'), type: v.type, title: autoTitle, teamIds: v.teamIds, start: s.toISOString(), end: end.toISOString(), location: v.location, opponent: v.opponent || undefined, hotel: v.hotel || undefined, notes: v.notes || undefined, rsvps: {} })
          }
          set('events', (es) => [...es, ...created])
          toast('📅', created.length > 1 ? `${created.length} events added` : 'Event added', autoTitle)
          onClose()
        }}
      >
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">What kind of event?</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {EVENT_TYPES.map((t) => (
              <button type="button" key={t.id} onClick={() => setV({ ...v, type: t.id })} className={cx('rounded-xl px-2 py-2 text-center text-xs font-bold ring-1 transition', v.type === t.id ? 'bg-brand text-white ring-brand' : 'bg-white ring-slate-200 hover:bg-slate-50')}>
                <div className="text-xl">{t.emoji}</div>{t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Teams (none = whole club)</span>
          <div className="flex flex-wrap gap-1.5">
            {data.teams.map((t) => {
              const on = v.teamIds.includes(t.id)
              return <button type="button" key={t.id} aria-pressed={on} onClick={() => setV({ ...v, teamIds: on ? v.teamIds.filter((x) => x !== t.id) : [...v.teamIds, t.id] })} className={cx('rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition', on ? 'text-white' : 'bg-white text-slate-600 ring-slate-200')} style={on ? { background: t.color, ['--tw-ring-color' as string]: t.color } : undefined}>{t.name}</button>
            })}
          </div>
        </div>
        <Field label="Title" className="sm:col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={autoTitle} /></Field>
        <Field label={v.type === 'tournament' ? 'Start date' : 'Date'}><Input type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value, endDate: e.target.value > v.endDate ? e.target.value : v.endDate })} /></Field>
        {v.type === 'tournament' ? <Field label="End date"><Input type="date" required value={v.endDate} min={v.date} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field> : (
          <Field label="Repeat weekly" hint="Great for practices"><Select value={v.repeat} onChange={(e) => setV({ ...v, repeat: Number(e.target.value) })}>{[1, 2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? 'Just once' : `${n} weeks`}</option>)}</Select></Field>
        )}
        <Field label="Start time"><Input type="time" required value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
        <Field label="End time"><Input type="time" required value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
        <Field label="Location" className="sm:col-span-2"><Input required value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Riverside Park Field 2" /></Field>
        {v.type === 'game' && <Field label="Opponent" className="sm:col-span-2"><Input value={v.opponent} onChange={(e) => setV({ ...v, opponent: e.target.value })} /></Field>}
        {v.type === 'tournament' && <Field label="Hotel block" className="sm:col-span-2"><Input value={v.hotel} onChange={(e) => setV({ ...v, hotel: e.target.value })} placeholder="Hotel name, team rate, booking code" /></Field>}
        <Field label="Notes for families" className="sm:col-span-2"><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Arrive 45 min early. Gray pants." /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Add to schedule</Button></div>
      </form>
    </Modal>
  )
}

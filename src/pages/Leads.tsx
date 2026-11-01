import { useMemo, useState } from 'react'
import { useClub, useData } from '../lib/store'
import { LEAD_SOURCES, LEAD_STAGES, POSITIONS, type Lead, type LeadSource, type LeadStage, type Position } from '../lib/types'
import { addLead, moveLead, updateLead } from '../lib/ops'
import { ageGroupLabel, baseballAge, cx, fmtDate, fmtTime, recommendTeam, timeAgo } from '../lib/utils'
import { Badge, Button, Drawer, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { celebrate, cheer, toast } from '../components/feedback'

const stageColor: Record<LeadStage, string> = {
  new: 'border-t-sky-500', contacted: 'border-t-indigo-500', tryout: 'border-t-amber-500', offered: 'border-t-violet-500', committed: 'border-t-emerald-500', lost: 'border-t-slate-400',
}

export function useLeadMover() {
  const apply = useClub((s) => s.apply)
  return (lead: Lead, stage: LeadStage, teamId?: string | null) => {
    apply((d) => moveLead(d, lead.id, stage, teamId))
    const st = LEAD_STAGES.find((s) => s.id === stage)!
    if (stage === 'committed') {
      celebrate()
      toast('🎉', `${lead.playerFirst} is officially on the team!`, 'Family profile, registration and welcome email created.')
    } else if (stage === 'tryout') toast('🧢', 'Tryout invite sent', `${lead.parentName} got the tryout details email.`)
    else toast(st.emoji, `Moved to ${st.label}`, `${lead.playerFirst} ${lead.playerLast}`)
  }
}

export default function Leads() {
  const data = useData()
  const { leads, settings, teams } = data
  const move = useLeadMover()
  const [q, setQ] = useState('')
  const [source, setSource] = useState<LeadSource | ''>('')
  const [age, setAge] = useState('')
  const [showLost, setShowLost] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<LeadStage | null>(null)

  const filtered = useMemo(
    () =>
      leads.filter((l) => {
        if (q && !`${l.playerFirst} ${l.playerLast} ${l.parentName} ${l.email}`.toLowerCase().includes(q.toLowerCase())) return false
        if (source && l.source !== source) return false
        if (age && String(baseballAge(l.birthDate, settings)) !== age) return false
        return true
      }),
    [leads, q, source, age, settings],
  )
  const stages = LEAD_STAGES.filter((s) => showLost || s.id !== 'lost')
  const ages = [...new Set(teams.map((t) => t.ageGroup))].sort((a, b) => a - b)
  const open = leads.find((l) => l.id === openId) ?? null
  const signupUrl = `${location.origin}${location.pathname}#/join`

  return (
    <div>
      <PageHeader
        emoji="🧢"
        title="Tryouts & Leads"
        subtitle="Every family interested in your club, from first click to committed. Drag cards between columns."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(signupUrl)
                toast('🔗', 'Signup link copied!', 'Paste it in your Instagram bio, flyers, or group texts.')
              }}
            >
              🔗 Copy signup link
            </Button>
            <Button onClick={() => setAdding(true)}>+ Add lead</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="🔍 Search player or parent…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        <Select className="w-auto" value={source} onChange={(e) => setSource(e.target.value as LeadSource)} aria-label="Filter by source">
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select className="w-auto" value={age} onChange={(e) => setAge(e.target.value)} aria-label="Filter by age group">
          <option value="">All ages</option>
          {ages.map((a) => <option key={a} value={a}>{a}U</option>)}
        </Select>
        <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} className="accent-[var(--brand)]" />
          Show “Not this year”
        </label>
      </div>

      <div className="scrollbar-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {stages.map((s) => {
          const items = filtered.filter((l) => l.stage === s.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          return (
            <section
              key={s.id}
              aria-label={s.label}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(s.id)
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => {
                const l = leads.find((x) => x.id === dragId)
                if (l && l.stage !== s.id) move(l, s.id)
                setDragId(null)
                setOverStage(null)
              }}
              className={cx(
                'flex w-72 shrink-0 snap-start flex-col rounded-2xl border-t-4 bg-slate-200/50 transition',
                stageColor[s.id],
                overStage === s.id && 'bg-brand/10 ring-2 ring-brand/40',
              )}
            >
              <header className="flex items-center justify-between px-3 pt-3 pb-2">
                <div>
                  <h2 className="text-sm font-black">{s.emoji} {s.label}</h2>
                  <p className="text-[11px] text-slate-500">{s.hint}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">{items.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                {items.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onDragStart={() => setDragId(l.id)} />
                ))}
                {items.length === 0 && <div className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">Nobody on deck</div>}
              </div>
            </section>
          )
        })}
      </div>

      <LeadDrawer key={openId ?? "none"} lead={open} onClose={() => setOpenId(null)} />
      <AddLeadModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function LeadCard({ lead, onOpen, onDragStart }: { lead: Lead; onOpen: () => void; onDragStart: () => void }) {
  const { settings } = useData()
  const age = baseballAge(lead.birthDate, settings)
  const isFresh = Date.now() - new Date(lead.createdAt).getTime() < 86400000 * 2
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="pop-in group w-full cursor-grab rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{lead.playerFirst} {lead.playerLast}</div>
          <div className="truncate text-xs text-slate-500">{lead.parentName}</div>
        </div>
        {age != null && <span className="rounded-lg bg-navy px-1.5 py-0.5 text-xs font-black text-accent">{ageGroupLabel(age)}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {lead.positions.slice(0, 3).map((p) => <Badge key={p}>{p}</Badge>)}
        {isFresh && lead.stage === 'new' && <Badge tone="amber">✨ New</Badge>}
        {lead.rating != null && <span className="text-xs text-amber-500">{'★'.repeat(lead.rating)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>{lead.source}</span>
        <span>{timeAgo(lead.createdAt)}</span>
      </div>
    </button>
  )
}

function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const move = useLeadMover()
  const [teamChoice, setTeamChoice] = useState<string>('')
  if (!lead) return null
  const age = baseballAge(lead.birthDate, data.settings)
  const rec = recommendTeam(age, data.teams, data.players)
  const tryouts = data.events.filter((e) => e.type === 'tryout' && new Date(e.end) >= new Date())
  const tryout = data.events.find((e) => e.id === lead.tryoutEventId)
  const patch = (p: Partial<Lead>) => apply((d) => updateLead(d, lead.id, p))
  const chosenTeam = teamChoice || rec?.id || ''

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <div className="truncate">{lead.playerFirst} {lead.playerLast}</div>
          <div className="text-xs font-medium text-slate-500">{LEAD_STAGES.find((s) => s.id === lead.stage)?.emoji} {LEAD_STAGES.find((s) => s.id === lead.stage)?.label} · signed up {timeAgo(lead.createdAt)}</div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-navy p-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Age group</div>
            <div className="score-digits text-3xl font-black text-accent">{age != null ? ageGroupLabel(age) : '—'}</div>
            <div className="text-[11px] text-slate-400">Born {fmtDate(lead.birthDate, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Best fit</div>
            <div className="mt-1 font-black">{rec?.name ?? 'No matching team'}</div>
            <div className="text-[11px] text-slate-400">{rec ? rec.headCoach : 'Add a team in Teams'}</div>
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <a className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100" href={`mailto:${lead.email}`}>✉️ <span className="truncate">{lead.email}</span></a>
          <a className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100" href={`tel:${lead.phone}`}>📱 {lead.phone}</a>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">👤 Parent: {lead.parentName}</div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">🧤 {lead.positions.join(', ') || 'No positions listed'} · {lead.experience}</div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">📣 Heard about us: {lead.source}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Move to</div>
          <div className="flex flex-wrap gap-2">
            {LEAD_STAGES.filter((s) => s.id !== lead.stage && s.id !== 'committed').map((s) => (
              <Button key={s.id} size="sm" variant="secondary" onClick={() => move(lead, s.id)}>{s.emoji} {s.label}</Button>
            ))}
          </div>
        </div>

        <Field label="Tryout session">
          <Select value={lead.tryoutEventId ?? ''} onChange={(e) => patch({ tryoutEventId: e.target.value || undefined })}>
            <option value="">Not scheduled</option>
            {tryouts.map((t) => <option key={t.id} value={t.id}>{t.title} — {fmtDate(t.start, { weekday: 'short', month: 'short', day: 'numeric' })} {fmtTime(t.start)}</option>)}
          </Select>
          {tryout && <p className="mt-1 text-xs text-slate-500">📍 {tryout.location}</p>}
        </Field>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Coach evaluation</div>
          <div className="flex gap-1" role="radiogroup" aria-label="Tryout rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={lead.rating === n} aria-label={`${n} stars`} onClick={() => patch({ rating: n })} className={cx('text-3xl transition hover:scale-110', (lead.rating ?? 0) >= n ? 'text-amber-400' : 'text-slate-200')}>★</button>
            ))}
          </div>
        </div>

        <Field label="Notes">
          <Textarea defaultValue={lead.notes} onBlur={(e) => patch({ notes: e.target.value })} placeholder="Strong arm, quick hands at SS…" />
        </Field>

        {lead.stage !== 'committed' ? (
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div className="font-bold text-emerald-900">🎉 Ready to join?</div>
            <p className="mt-1 text-xs text-emerald-800">Committing creates their family profile and season registration, places them on a roster, and sends the welcome email.</p>
            <div className="mt-3 flex gap-2">
              <Select value={chosenTeam} onChange={(e) => setTeamChoice(e.target.value)} aria-label="Team">
                {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === rec?.id ? ' (recommended)' : ''}</option>)}
              </Select>
              <Button className="shrink-0 bg-emerald-600" onClick={() => { move(lead, 'committed', chosenTeam || null); onClose() }}>Commit ⚾</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">✅ {lead.playerFirst} is on the roster. {cheer()}</div>
        )}
      </div>
    </Drawer>
  )
}

export interface LeadFormValue {
  parentName: string
  email: string
  phone: string
  playerFirst: string
  playerLast: string
  birthDate: string
  positions: Position[]
  experience: string
  source: LeadSource
}
export const emptyLead: LeadFormValue = { parentName: '', email: '', phone: '', playerFirst: '', playerLast: '', birthDate: '', positions: [], experience: '', source: 'Website' }

export function LeadFields({ v, onChange, showAge = true }: { v: LeadFormValue; onChange: (v: LeadFormValue) => void; showAge?: boolean }) {
  const data = useData()
  const age = v.birthDate ? baseballAge(v.birthDate, data.settings) : null
  const rec = recommendTeam(age, data.teams, data.players)
  const set = <K extends keyof LeadFormValue>(k: K, val: LeadFormValue[K]) => onChange({ ...v, [k]: val })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Player first name"><Input required value={v.playerFirst} onChange={(e) => set('playerFirst', e.target.value)} autoComplete="off" /></Field>
      <Field label="Player last name"><Input required value={v.playerLast} onChange={(e) => set('playerLast', e.target.value)} autoComplete="off" /></Field>
      <Field label="Player birthday" className="sm:col-span-2" hint={showAge && age != null ? <span className="font-semibold text-brand">⚾ That’s our {ageGroupLabel(age)} age group{rec ? ` — ${rec.name}` : ''} for the {data.settings.seasonYear} season!</span> : 'We use this to find the right age group.'}>
        <Input required type="date" value={v.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Positions they love</span>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((p) => {
            const on = v.positions.includes(p)
            return (
              <button type="button" key={p} aria-pressed={on} onClick={() => set('positions', on ? v.positions.filter((x) => x !== p) : [...v.positions, p])} className={cx('rounded-full px-3 py-1.5 text-sm font-bold transition', on ? 'bg-brand text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                {p}
              </button>
            )
          })}
        </div>
      </div>
      <Field label="Baseball experience" className="sm:col-span-2"><Input value={v.experience} onChange={(e) => set('experience', e.target.value)} placeholder="e.g. 2 years rec league, some pitching" /></Field>
      <Field label="Parent / guardian name"><Input required value={v.parentName} onChange={(e) => set('parentName', e.target.value)} autoComplete="name" /></Field>
      <Field label="Mobile phone"><Input required type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></Field>
      <Field label="Email" className="sm:col-span-2"><Input required type="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
      <Field label="How did you hear about us?" className="sm:col-span-2">
        <Select value={v.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
          {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
    </div>
  )
}

function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apply = useClub((s) => s.apply)
  const [v, setV] = useState<LeadFormValue>({ ...emptyLead, source: 'Referral' })
  return (
    <Modal open={open} onClose={onClose} title="➕ Add a lead" wide>
      <form
        id="add-lead"
        onSubmit={(e) => {
          e.preventDefault()
          apply((d) => addLead(d, v).data)
          toast('📥', 'Lead added', `${v.playerFirst} ${v.playerLast} is in “New Interest”.`)
          setV({ ...emptyLead, source: 'Referral' })
          onClose()
        }}
      >
        <LeadFields v={v} onChange={setV} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add lead</Button>
        </div>
      </form>
    </Modal>
  )
}

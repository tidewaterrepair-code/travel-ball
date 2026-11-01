import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClub, useData } from '../lib/store'
import type { Player, Position, Team } from '../lib/types'
import { ageGroupLabel, balance, baseballAge, cx, recommendTeam, uid } from '../lib/utils'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, JerseyBadge, Meter, Modal, PageHeader, Tabs } from '../components/ui'
import { toast } from '../components/feedback'

// Field coordinates on a 400x360 diamond
const SPOTS: Record<Exclude<Position, 'UT'>, [number, number]> = {
  P: [200, 262], C: [200, 322], '1B': [302, 214], '2B': [262, 158], SS: [138, 158], '3B': [98, 214], LF: [82, 92], CF: [200, 48], RF: [318, 92],
}

function Diamond({ roster, color }: { roster: Player[]; color: string }) {
  const byPos = (pos: Position) => roster.filter((p) => p.positions[0] === pos)
  return (
    <svg viewBox="0 0 400 360" className="mx-auto block w-full max-w-md" role="img" aria-label="Players by primary position on the field">
      <defs>
        <radialGradient id="grass" cx="50%" cy="90%" r="90%"><stop offset="0" stopColor="#4ade80" /><stop offset="1" stopColor="#15803d" /></radialGradient>
      </defs>
      <path d="M200 350 L10 160 A 270 270 0 0 1 390 160 Z" fill="url(#grass)" />
      <path d="M200 340 L95 235 A 150 150 0 0 1 305 235 Z" fill="#d6a46b" />
      <path d="M200 300 L255 245 L200 190 L145 245 Z" fill="#4ade80" stroke="#fff" strokeWidth={2} />
      <circle cx={200} cy={245} r={11} fill="#d6a46b" />
      {[[200, 302], [257, 245], [200, 188], [143, 245]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width={10} height={10} fill="#fff" transform={`rotate(45 ${x} ${y})`} />)}
      {(Object.keys(SPOTS) as (keyof typeof SPOTS)[]).map((pos) => {
        const [x, y] = SPOTS[pos]
        const ps = byPos(pos)
        const name = ps[0] ? `${ps[0].firstName} ${ps[0].lastName[0]}.` : 'Open'
        return (
          <g key={pos}>
            <rect x={x - 46} y={y - 15} width={92} height={30} rx={15} fill={ps.length ? '#fff' : 'rgba(255,255,255,.5)'} stroke={ps.length ? color : 'transparent'} strokeWidth={2} />
            <text x={x - 34} y={y + 4} fontSize={11} fontWeight={900} fill={color}>{pos}</text>
            <text x={x - 14} y={y + 4} fontSize={11} fontWeight={600} fill="#0f172a">{name.length > 11 ? name.slice(0, 10) + '…' : name}</text>
            {ps.length > 1 && (
              <g>
                <circle cx={x + 44} cy={y - 12} r={9} fill="#0f1b33" />
                <text x={x + 44} y={y - 8.5} fontSize={10} fontWeight={800} fill="#fff" textAnchor="middle">+{ps.length - 1}</text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function Teams() {
  const data = useData()
  const set = useClub((s) => s.set)
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'cards' | 'field'>('cards')
  const [editing, setEditing] = useState<Team | 'new' | null>(null)
  const { teams, players, settings, registrations } = data
  const team = teams.find((t) => t.id === params.get('team')) ?? teams[0]
  const active = players.filter((p) => p.status === 'active')
  const roster = team ? active.filter((p) => p.teamId === team.id).sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99)) : []
  const unassigned = active.filter((p) => !p.teamId)

  const assign = (p: Player, teamId: string | null) => {
    set('players', (ps) => ps.map((x) => (x.id === p.id ? { ...x, teamId } : x)))
    set('registrations', (rs) => rs.map((r) => (r.playerId === p.id && r.season === settings.seasonYear ? { ...r, teamId } : r)))
  }

  const autoPlace = () => {
    let placed = 0
    const working = [...players]
    for (const p of unassigned) {
      const t = recommendTeam(baseballAge(p.birthDate, settings), teams, working)
      if (t) {
        assign(p, t.id)
        const i = working.findIndex((w) => w.id === p.id)
        working[i] = { ...p, teamId: t.id }
        placed++
      }
    }
    toast('🪄', `Placed ${placed} player${placed === 1 ? '' : 's'}`, 'Each player went to their age group, filling open spots first.')
  }

  return (
    <div>
      <PageHeader
        emoji="⚾"
        title="Teams & Rosters"
        subtitle="Build rosters, see who plays where, and print a lineup card in one click."
        actions={<><Button variant="secondary" onClick={() => window.print()}>🖨️ Print roster</Button><Button onClick={() => setEditing('new')}>+ New team</Button></>}
      />

      <div className="scrollbar-thin -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {teams.map((t) => {
          const n = active.filter((p) => p.teamId === t.id).length
          const on = t.id === team?.id
          return (
            <button key={t.id} onClick={() => setParams({ team: t.id })} className={cx('flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-1 transition', on ? 'bg-white shadow-md ring-2' : 'bg-white/60 ring-slate-200 hover:bg-white')} style={on ? { ['--tw-ring-color' as string]: t.color } : undefined}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black text-white" style={{ background: t.color }}>{t.ageGroup}U</span>
              {t.name}
              <span className="text-xs font-semibold text-slate-400">{n}/{t.rosterLimit}</span>
            </button>
          )
        })}
      </div>

      {!team ? (
        <Card><EmptyState emoji="⚾" title="No teams yet">Create your first team to start building rosters.</EmptyState></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="field-stripes flex flex-wrap items-center justify-between gap-4 p-5 text-white" style={{ background: `linear-gradient(135deg, ${team.color}, #0f1b33)` }}>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-white/70">{ageGroupLabel(team.ageGroup)} · {settings.seasonYear}</div>
                  <h2 className="text-2xl font-black">{team.name}</h2>
                  <div className="text-sm text-white/80">{team.headCoach} · 📍 {team.practiceLocation}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="score-digits text-4xl font-black">{roster.length}<span className="text-xl text-white/60">/{team.rosterLimit}</span></div>
                    <div className="text-xs text-white/70">roster spots</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(team)}>Edit</Button>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 pt-4">
                <Tabs value={view} onChange={setView} options={[{ id: 'cards', label: '🃏 Roster' }, { id: 'field', label: '🏟️ On the field' }]} />
                <Meter className="ml-4 hidden max-w-40 sm:block" value={roster.length} max={team.rosterLimit} color={team.color} label="Roster filled" />
              </div>
              <div className="p-5">
                {roster.length === 0 ? (
                  <EmptyState emoji="🧢" title="Empty dugout">Assign players from the unassigned list or commit leads from Tryouts.</EmptyState>
                ) : view === 'field' ? (
                  <Diamond roster={roster} color={team.color} />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roster.map((p) => {
                      const reg = registrations.find((r) => r.playerId === p.id && r.season === settings.seasonYear)
                      return (
                        <div key={p.id} className="group flex items-center gap-3 rounded-xl p-2.5 ring-1 ring-slate-200 hover:bg-slate-50">
                          <JerseyBadge number={p.jersey} color={team.color} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold">{p.firstName} {p.lastName}</div>
                            <div className="flex gap-1 text-xs text-slate-500">{p.positions.join(' · ')} <span className="text-slate-300">|</span> B/T {p.bats}/{p.throws}</div>
                          </div>
                          {reg && balance(reg) === 0 && <span title="Paid in full">💚</span>}
                          <select aria-label={`Move ${p.firstName}`} value={p.teamId ?? ''} onChange={(e) => { assign(p, e.target.value || null); toast('🔁', `${p.firstName} moved`, e.target.value ? teams.find((t) => t.id === e.target.value)?.name : 'Unassigned') }} className="w-8 cursor-pointer rounded-lg bg-transparent text-xs text-slate-400 opacity-60 group-hover:opacity-100">
                            <option value={team.id}>⋯</option>
                            {teams.filter((t) => t.id !== team.id).map((t) => <option key={t.id} value={t.id}>Move to {t.name}</option>)}
                            <option value="">Remove from team</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader icon="🪑" title="Unassigned players" subtitle="Committed but not on a roster yet" action={unassigned.length > 0 && <Button size="sm" variant="accent" onClick={autoPlace}>🪄 Auto-place</Button>} />
              <ul className="space-y-2 px-5 pb-5">
                {unassigned.map((p) => {
                  const age = baseballAge(p.birthDate, settings)
                  const rec = recommendTeam(age, teams, players)
                  return (
                    <li key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{p.firstName} {p.lastName}</div>
                        <div className="text-xs text-slate-500">{age != null ? ageGroupLabel(age) : ''} · {p.positions.join(', ') || '—'}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => { assign(p, team.id); toast('⚾', `${p.firstName} added to ${team.name}`) }}>
                        + {team.ageGroup}U
                      </Button>
                      {rec && rec.id !== team.id && <Badge tone="brand">fits {rec.ageGroup}U</Badge>}
                    </li>
                  )
                })}
                {unassigned.length === 0 && <li className="py-4 text-center text-sm text-slate-500">Everyone has a team! 🙌</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader icon="🧮" title="Position depth" subtitle="Primary + secondary positions" />
              <div className="grid grid-cols-5 gap-2 px-5 pb-5">
                {(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as Position[]).map((pos) => {
                  const n = roster.filter((p) => p.positions.includes(pos)).length
                  return (
                    <div key={pos} className={cx('rounded-xl py-2 text-center ring-1', n === 0 ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200')}>
                      <div className="text-[11px] font-bold text-slate-500">{pos}</div>
                      <div className={cx('text-lg font-black', n === 0 && 'text-red-600')}>{n}</div>
                    </div>
                  )
                })}
              </div>
              {roster.filter((p) => p.positions.includes('P')).length < 4 && <p className="-mt-2 px-5 pb-4 text-xs text-amber-700">⚠️ Tournament weekends usually need 4+ arms. Consider developing more pitchers.</p>}
            </Card>
          </div>
        </div>
      )}

      {editing && <TeamModal team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => setParams({ team: id })} />}
    </div>
  )
}

const TEAM_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899', '#1d4ed8', '#334155']

function TeamModal({ team, onClose, onSaved }: { team: Team | null; onClose: () => void; onSaved: (id: string) => void }) {
  const data = useData()
  const set = useClub((s) => s.set)
  const [v, setV] = useState<Team>(
    team ?? { id: uid('team'), name: `${data.settings.name.split(' ')[1] ?? 'Club'} 13U`, ageGroup: 13, headCoach: '', coachEmail: '', color: TEAM_COLORS[data.teams.length % TEAM_COLORS.length], rosterLimit: 12, fee: data.settings.defaultFee, practiceLocation: '' },
  )
  const playerCount = data.players.filter((p) => p.teamId === v.id).length
  return (
    <Modal open onClose={onClose} title={team ? `Edit ${team.name}` : '⚾ New team'}>
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          set('teams', (ts) => (team ? ts.map((t) => (t.id === v.id ? v : t)) : [...ts, v].sort((a, b) => a.ageGroup - b.ageGroup)))
          toast('⚾', team ? 'Team updated' : 'Team created!', v.name)
          onSaved(v.id)
          onClose()
        }}
      >
        <Field label="Team name" className="col-span-2"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Age group"><Input required type="number" min={6} max={18} value={v.ageGroup} onChange={(e) => setV({ ...v, ageGroup: Number(e.target.value) })} /></Field>
        <Field label="Roster limit"><Input required type="number" min={1} value={v.rosterLimit} onChange={(e) => setV({ ...v, rosterLimit: Number(e.target.value) })} /></Field>
        <Field label="Head coach"><Input value={v.headCoach} onChange={(e) => setV({ ...v, headCoach: e.target.value })} placeholder="Coach Smith" /></Field>
        <Field label="Coach email"><Input type="email" value={v.coachEmail} onChange={(e) => setV({ ...v, coachEmail: e.target.value })} /></Field>
        <Field label="Season fee ($)"><Input type="number" min={0} value={v.fee} onChange={(e) => setV({ ...v, fee: Number(e.target.value) })} /></Field>
        <Field label="Practice field"><Input value={v.practiceLocation} onChange={(e) => setV({ ...v, practiceLocation: e.target.value })} /></Field>
        <div className="col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Team color</span>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLORS.map((c) => <button type="button" key={c} aria-label={`Color ${c}`} onClick={() => setV({ ...v, color: c })} className={cx('h-8 w-8 rounded-full ring-offset-2 transition', v.color === c && 'ring-2 ring-slate-900')} style={{ background: c }} />)}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 pt-2">
          {team ? (
            <Button
              variant="ghost"
              className="text-red-600"
              onClick={() => {
                if (!confirm(`Delete ${team.name}? ${playerCount} players will become unassigned.`)) return
                set('teams', (ts) => ts.filter((t) => t.id !== team.id))
                set('players', (ps) => ps.map((p) => (p.teamId === team.id ? { ...p, teamId: null } : p)))
                set('registrations', (rs) => rs.map((r) => (r.teamId === team.id ? { ...r, teamId: null } : r)))
                // Drop events that belonged only to this team; detach it from shared ones.
                set('events', (es) =>
                  es
                    .filter((e) => !(e.teamIds.length === 1 && e.teamIds[0] === team.id))
                    .map((e) => (e.teamIds.includes(team.id) ? { ...e, teamIds: e.teamIds.filter((id) => id !== team.id) } : e)),
                )
                toast('🗑️', 'Team deleted')
                onClose()
              }}
            >
              Delete team
            </Button>
          ) : <span />}
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
        </div>
      </form>
    </Modal>
  )
}

import { useMemo, useState } from 'react'
import { useClub, useData } from '../lib/store'
import { POSITIONS, type Family, type Hand, type Player } from '../lib/types'
import { newRegistration } from '../lib/ops'
import { ageGroupLabel, balance, baseballAge, cx, download, fmtDate, money, payStatus, recommendTeam, toCSV, uid } from '../lib/utils'
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { toast } from '../components/feedback'

export default function Players() {
  const data = useData()
  const { players, families, teams, registrations, settings } = data
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [status, setStatus] = useState<'active' | 'all' | 'inactive' | 'alumni'>('active')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const famById = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families])
  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  const regFor = (p: Player) => registrations.find((r) => r.playerId === p.id && r.season === settings.seasonYear)

  const rows = players
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !team || (team === 'none' ? !p.teamId : p.teamId === team))
    .filter((p) => {
      if (!q) return true
      const f = famById[p.familyId]
      return `${p.firstName} ${p.lastName} ${f?.parentName} ${f?.email} ${p.jersey}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName))

  const exportCSV = () => {
    download(
      `players-${settings.seasonYear}.csv`,
      toCSV(rows.map((p) => {
        const f = famById[p.familyId]
        const r = regFor(p)
        return {
          First: p.firstName, Last: p.lastName, Birthday: p.birthDate, 'Age Group': ageGroupLabel(baseballAge(p.birthDate, settings) ?? 0),
          Team: teamById[p.teamId ?? '']?.name ?? '', Jersey: p.jersey, Positions: p.positions.join(' '), Bats: p.bats, Throws: p.throws,
          Parent: f?.parentName, Email: f?.email, Phone: f?.phone, 'Jersey Size': p.jerseySize, 'Pants Size': p.pantsSize, 'Hat Size': p.hatSize,
          Balance: r ? balance(r) : '',
        }
      })),
    )
  }

  const open = players.find((p) => p.id === openId) ?? null
  return (
    <div>
      <PageHeader
        emoji="👨‍👩‍👦"
        title="Families & Players"
        subtitle={`${players.filter((p) => p.status === 'active').length} active players from ${families.length} families — one place for every contact, size, and note.`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV}>⬇️ Export CSV</Button>
            <Button onClick={() => setAdding(true)}>+ Add player</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="🔍 Search name, parent, email, #…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        <Select className="w-auto" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="none">Unassigned</option>
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="alumni">Alumni</option>
          <option value="all">Everyone</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState emoji="🔍" title="No players match">Try a different search or filter.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Player</th>
                  <th className="hidden px-4 py-3 md:table-cell">Team</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Positions</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Parent</th>
                  <th className="px-4 py-3 text-right">Dues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => {
                  const f = famById[p.familyId]
                  const t = teamById[p.teamId ?? '']
                  const r = regFor(p)
                  const st = r ? payStatus(r) : null
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(p.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${p.firstName} ${p.lastName}`} color={t?.color ?? '#94a3b8'} />
                          <div>
                            <div className="font-bold">{p.firstName} {p.lastName} {p.jersey && <span className="font-normal text-slate-400">#{p.jersey}</span>}</div>
                            <div className="text-xs text-slate-500">{ageGroupLabel(baseballAge(p.birthDate, settings) ?? 0)} · B/T {p.bats}/{p.throws}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">{t ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />{t.name}</span> : <Badge tone="amber">Unassigned</Badge>}</td>
                      <td className="hidden px-4 py-3 lg:table-cell"><div className="flex gap-1">{p.positions.map((x) => <Badge key={x}>{x}</Badge>)}</div></td>
                      <td className="hidden px-4 py-3 sm:table-cell"><div>{f?.parentName}</div><div className="text-xs text-slate-500">{f?.phone}</div></td>
                      <td className="px-4 py-3 text-right">
                        {st === 'paid' && <Badge tone="green">✓ Paid</Badge>}
                        {st === 'ontrack' && <Badge tone="blue">{money(balance(r!))} left</Badge>}
                        {st === 'pastdue' && <Badge tone="red">⚠ Past due</Badge>}
                        {!st && <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <PlayerDrawer key={open.id} player={open} onClose={() => setOpenId(null)} />}
      <AddPlayerModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function PlayerDrawer({ player, onClose }: { player: Player; onClose: () => void }) {
  const data = useData()
  const set = useClub((s) => s.set)
  const family = data.families.find((f) => f.id === player.familyId)
  const siblings = data.players.filter((p) => p.familyId === player.familyId && p.id !== player.id)
  const reg = data.registrations.find((r) => r.playerId === player.id && r.season === data.settings.seasonYear)
  const age = baseballAge(player.birthDate, data.settings)
  const patchP = (p: Partial<Player>) => set('players', (ps) => ps.map((x) => (x.id === player.id ? { ...x, ...p } : x)))
  const patchF = (p: Partial<Family>) => set('families', (fs) => fs.map((x) => (x.id === player.familyId ? { ...x, ...p } : x)))
  const team = data.teams.find((t) => t.id === player.teamId)

  return (
    <Drawer open onClose={onClose} title={<div className="flex items-center gap-3"><Avatar name={`${player.firstName} ${player.lastName}`} color={team?.color} size={40} /><div><div>{player.firstName} {player.lastName}</div><div className="text-xs font-medium text-slate-500">{age != null ? ageGroupLabel(age) : ''} · born {fmtDate(player.birthDate, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div></div>}>
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3">
          <Field label="Team" className="col-span-2">
            <Select
              value={player.teamId ?? ''}
              onChange={(e) => {
                const teamId = e.target.value || null
                patchP({ teamId })
                if (reg) set('registrations', (rs) => rs.map((r) => (r.id === reg.id ? { ...r, teamId } : r)))
              }}
            >
              <option value="">Unassigned</option>
              {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Jersey #"><Input defaultValue={player.jersey} onBlur={(e) => patchP({ jersey: e.target.value })} inputMode="numeric" /></Field>
          <Field label="Status">
            <Select value={player.status} onChange={(e) => patchP({ status: e.target.value as Player['status'] })}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="alumni">Alumni</option>
            </Select>
          </Field>
          <Field label="Bats">
            <Select value={player.bats} onChange={(e) => patchP({ bats: e.target.value as Hand })}><option value="R">Right</option><option value="L">Left</option><option value="S">Switch</option></Select>
          </Field>
          <Field label="Throws">
            <Select value={player.throws} onChange={(e) => patchP({ throws: e.target.value as Hand })}><option value="R">Right</option><option value="L">Left</option></Select>
          </Field>
          <div className="col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Positions</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.map((pos) => {
                const on = player.positions.includes(pos)
                return <button key={pos} aria-pressed={on} onClick={() => patchP({ positions: on ? player.positions.filter((x) => x !== pos) : [...player.positions, pos] })} className={cx('rounded-full px-2.5 py-1 text-xs font-bold', on ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600')}>{pos}</button>
              })}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-black">👕 Uniform sizes</h3>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Jersey"><Input defaultValue={player.jerseySize} onBlur={(e) => patchP({ jerseySize: e.target.value })} /></Field>
            <Field label="Pants"><Input defaultValue={player.pantsSize} onBlur={(e) => patchP({ pantsSize: e.target.value })} /></Field>
            <Field label="Hat"><Input defaultValue={player.hatSize} onBlur={(e) => patchP({ hatSize: e.target.value })} /></Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-black">👨‍👩‍👦 Family</h3>
          {family && (
            <div className="grid gap-2">
              <Field label="Parent / guardian"><Input defaultValue={family.parentName} onBlur={(e) => patchF({ parentName: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email"><Input defaultValue={family.email} onBlur={(e) => patchF({ email: e.target.value })} /></Field>
                <Field label="Phone"><Input defaultValue={family.phone} onBlur={(e) => patchF({ phone: e.target.value })} /></Field>
              </div>
              <Field label="Second parent / guardian"><Input defaultValue={family.secondaryParent} onBlur={(e) => patchF({ secondaryParent: e.target.value })} placeholder="Optional" /></Field>
              <div className="flex gap-2">
                <a href={`mailto:${family.email}`} className="flex-1 rounded-xl bg-slate-100 py-2 text-center text-sm font-semibold hover:bg-slate-200">✉️ Email</a>
                <a href={`sms:${family.phone}`} className="flex-1 rounded-xl bg-slate-100 py-2 text-center text-sm font-semibold hover:bg-slate-200">💬 Text</a>
                <a href={`tel:${family.phone}`} className="flex-1 rounded-xl bg-slate-100 py-2 text-center text-sm font-semibold hover:bg-slate-200">📞 Call</a>
              </div>
              {siblings.length > 0 && <p className="text-xs text-slate-500">Siblings in club: {siblings.map((s) => s.firstName).join(', ')}</p>}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-black">💵 {data.settings.seasonYear} dues</h3>
          {reg ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span>Season fee</span><b>{money(reg.fee)}</b></div>
              {reg.discount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span>−{money(reg.discount)}</span></div>}
              {reg.fundraisingCredit > 0 && <div className="flex justify-between text-slate-600"><span>Fundraising credit</span><span>−{money(reg.fundraisingCredit)}</span></div>}
              <div className="flex justify-between text-slate-600"><span>Paid</span><span>−{money(reg.payments.reduce((s, p) => s + p.amount, 0))}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-black"><span>Balance</span><span>{money(balance(reg))}</span></div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                set('registrations', (rs) => [...rs, newRegistration(data, player)])
                toast('📝', 'Registration created', `${player.firstName} is registered for ${data.settings.seasonYear}.`)
              }}
            >
              + Register for {data.settings.seasonYear}
            </Button>
          )}
        </section>

        <Field label="Medical / allergy notes"><Textarea defaultValue={player.medicalNotes} onBlur={(e) => patchP({ medicalNotes: e.target.value })} placeholder="Allergies, inhaler, etc. Coaches can see this." /></Field>
      </div>
    </Drawer>
  )
}

function AddPlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const blank = { firstName: '', lastName: '', birthDate: '', teamId: '', jersey: '', parentName: '', email: '', phone: '', familyId: '' }
  const [v, setV] = useState(blank)
  const age = v.birthDate ? baseballAge(v.birthDate, data.settings) : null
  const rec = recommendTeam(age, data.teams, data.players)
  const upd = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal open={open} onClose={onClose} title="➕ Add a player" wide>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          apply((d0) => {
            const d = structuredClone(d0)
            let famId = v.familyId
            if (!famId) {
              famId = uid('fam')
              d.families.push({ id: famId, parentName: v.parentName, email: v.email, phone: v.phone, createdAt: new Date().toISOString() })
            }
            const p: Player = { id: uid('ply'), familyId: famId, firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate, teamId: v.teamId || rec?.id || null, jersey: v.jersey || undefined, positions: [], bats: 'R', throws: 'R', status: 'active' }
            d.players.push(p)
            d.registrations.push(newRegistration(d, p))
            return d
          })
          toast('⚾', 'Player added!', `${v.firstName} ${v.lastName} is on the roster.`)
          setV(blank)
          onClose()
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="First name"><Input required value={v.firstName} onChange={upd('firstName')} /></Field>
        <Field label="Last name"><Input required value={v.lastName} onChange={upd('lastName')} /></Field>
        <Field label="Birthday" hint={age != null ? `${ageGroupLabel(age)} age group${rec ? ` · suggests ${rec.name}` : ''}` : undefined}><Input required type="date" value={v.birthDate} onChange={upd('birthDate')} /></Field>
        <Field label="Team">
          <Select value={v.teamId} onChange={upd('teamId')}>
            <option value="">{rec ? `Auto: ${rec.name}` : 'Unassigned'}</option>
            {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Family" className="sm:col-span-2" hint="Pick an existing family to add a sibling.">
          <Select value={v.familyId} onChange={upd('familyId')}>
            <option value="">New family</option>
            {[...data.families].sort((a, b) => a.parentName.localeCompare(b.parentName)).map((f) => <option key={f.id} value={f.id}>{f.parentName} ({f.email})</option>)}
          </Select>
        </Field>
        {!v.familyId && (
          <>
            <Field label="Parent name"><Input required value={v.parentName} onChange={upd('parentName')} /></Field>
            <Field label="Phone"><Input required type="tel" value={v.phone} onChange={upd('phone')} /></Field>
            <Field label="Email" className="sm:col-span-2"><Input required type="email" value={v.email} onChange={upd('email')} /></Field>
          </>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add player</Button>
        </div>
      </form>
    </Modal>
  )
}

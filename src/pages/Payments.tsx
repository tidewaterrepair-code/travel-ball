import { useMemo, useState } from 'react'
import { useClub, useData } from '../lib/store'
import { PAYMENT_METHODS, PAYMENT_PLANS, type PaymentMethod, type PaymentPlan, type Registration } from '../lib/types'
import { recordPayment } from '../lib/ops'
import { amountDue, balance, cx, download, fmtDate, installmentSchedule, mergeTemplate, money, nextInstallment, paidTotal, pastDue, payStatus, planFor, playerContext, toCSV, todayISO, uid } from '../lib/utils'
import { Badge, Button, Card, EmptyState, Field, Input, Meter, Modal, PageHeader, Select, Tabs } from '../components/ui'
import { celebrate, cheer, toast } from '../components/feedback'

type Filter = 'all' | 'pastdue' | 'ontrack' | 'paid'

export default function Payments() {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const { registrations, players, families, teams, settings } = data
  const [filter, setFilter] = useState<Filter>('all')
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const season = registrations.filter((r) => r.season === settings.seasonYear)
  const rows = useMemo(
    () =>
      season
        .map((r) => {
          const p = players.find((x) => x.id === r.playerId)
          const f = p && families.find((x) => x.id === p.familyId)
          return { r, p, f, t: teams.find((x) => x.id === r.teamId), status: payStatus(r) }
        })
        .filter((x) => x.p && x.f)
        .filter((x) => filter === 'all' || x.status === filter)
        .filter((x) => !team || x.r.teamId === team)
        .filter((x) => !q || `${x.p!.firstName} ${x.p!.lastName} ${x.f!.parentName}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => pastDue(b.r) - pastDue(a.r) || balance(b.r) - balance(a.r)),
    [season, players, families, teams, filter, team, q],
  )

  const collected = season.reduce((s, r) => s + paidTotal(r), 0)
  const owed = season.reduce((s, r) => s + balance(r), 0)
  const late = season.filter((r) => payStatus(r) === 'pastdue')
  const lateAmt = late.reduce((s, r) => s + pastDue(r), 0)
  const credits = season.reduce((s, r) => s + r.fundraisingCredit, 0)

  const remindLate = () => {
    const tpl = data.templates.find((t) => t.id === 'tpl_reminder')!
    apply((d0) => {
      const d = structuredClone(d0)
      for (const r of late) {
        const p = d.players.find((x) => x.id === r.playerId)!
        const f = d.families.find((x) => x.id === p.familyId)!
        const ctx = playerContext(d, p)
        d.messages.unshift({ id: uid('msg'), audience: 'unpaid', audienceLabel: `Reminder · ${f.parentName}`, subject: mergeTemplate(tpl.subject, ctx), body: mergeTemplate(tpl.body, ctx), recipients: [f.email], sentAt: new Date().toISOString(), automated: false })
      }
      d.activity.unshift({ id: uid('act'), at: new Date().toISOString(), emoji: '💳', text: `Sent ${late.length} friendly payment reminders` })
      return d
    })
    toast('💳', `${late.length} friendly reminders sent`, 'Each one is personalized with the family’s balance and due date.')
  }

  const exportCSV = () =>
    download(`dues-${settings.seasonYear}.csv`, toCSV(rows.map(({ r, p, f, t, status }) => ({ Player: `${p!.firstName} ${p!.lastName}`, Parent: f!.parentName, Email: f!.email, Team: t?.name ?? '', Plan: planFor(r.plan).label, Fee: r.fee, Discount: r.discount, 'Fundraising Credit': r.fundraisingCredit, Paid: paidTotal(r), Balance: balance(r), 'Past Due': pastDue(r), Status: status }))))

  const open = season.find((r) => r.id === openId) ?? null
  return (
    <div>
      <PageHeader
        emoji="💵"
        title="Dues & Payments"
        subtitle={`${settings.seasonYear} season fees, payment plans, and who needs a friendly nudge.`}
        actions={<><Button variant="secondary" onClick={exportCSV}>⬇️ Export</Button><Button variant="accent" disabled={!late.length} onClick={remindLate}>💳 Remind {late.length} past-due</Button></>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Collected', value: money(collected), sub: `${Math.round((collected / Math.max(1, collected + owed)) * 100)}% of season`, tone: 'text-emerald-600' },
          { label: 'Still owed', value: money(owed), sub: `${season.filter((r) => balance(r) > 0).length} families`, tone: 'text-slate-900' },
          { label: 'Past due', value: money(lateAmt), sub: `${late.length} families behind plan`, tone: 'text-red-600' },
          { label: 'Fundraising credits', value: money(credits), sub: 'applied to balances', tone: 'text-amber-600' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className={cx('mt-1 text-2xl font-black tabular-nums', s.tone)}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Everyone' }, { id: 'pastdue', label: `⚠ Past due (${late.length})` }, { id: 'ontrack', label: 'On track' }, { id: 'paid', label: '✓ Paid in full' }]} />
        <Select className="w-auto" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Input className="max-w-xs" placeholder="🔍 Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dues" />
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState emoji="💸" title="Nothing here">{filter === 'pastdue' ? 'Nobody is behind. Ballgame! 🙌' : 'No registrations match.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ r, p, f, t, status }) => {
              const due = amountDue(r)
              const nxt = nextInstallment(r)
              return (
                <li key={r.id}>
                  <button onClick={() => setOpenId(r.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{p!.firstName} {p!.lastName}</div>
                      <div className="truncate text-xs text-slate-500">{f!.parentName} · {t?.name ?? 'No team'}</div>
                    </div>
                    <div className="hidden text-xs text-slate-500 sm:block">
                      <div className="font-semibold text-slate-700">{planFor(r.plan).label}</div>
                      {nxt ? <div>Next: {money(nxt.amount)} · {fmtDate(nxt.due)}</div> : <div>All done 🎉</div>}
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="mb-1 flex justify-between text-xs"><span className="font-semibold tabular-nums">{money(paidTotal(r))}</span><span className="text-slate-400 tabular-nums">of {money(due)}</span></div>
                      <Meter value={paidTotal(r)} max={due} color={status === 'pastdue' ? '#dc2626' : status === 'paid' ? '#16a34a' : 'var(--brand)'} label="Paid toward season fee" />
                    </div>
                    <div className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-auto">
                      {status === 'paid' && <Badge tone="green">✓ Paid</Badge>}
                      {status === 'ontrack' && <Badge tone="blue">{money(balance(r))} left</Badge>}
                      {status === 'pastdue' && <Badge tone="red">⚠ {money(pastDue(r))} late</Badge>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {open && <RegistrationModal key={open.id} reg={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function RegistrationModal({ reg, onClose }: { reg: Registration; onClose: () => void }) {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const set = useClub((s) => s.set)
  const p = data.players.find((x) => x.id === reg.playerId)!
  const f = data.families.find((x) => x.id === p.familyId)!
  const nxt = nextInstallment(reg)
  const [amount, setAmount] = useState(String(nxt?.amount ?? balance(reg)))
  const [method, setMethod] = useState<PaymentMethod>('Card')
  const [date, setDate] = useState(todayISO())
  const patch = (x: Partial<Registration>) => set('registrations', (rs) => rs.map((r) => (r.id === reg.id ? { ...r, ...x } : r)))
  const sched = installmentSchedule({ plan: reg.plan, firstDueDate: reg.firstDueDate, total: amountDue(reg) })
  let running = 0
  const paid = paidTotal(reg)

  return (
    <Modal open onClose={onClose} title={`💵 ${p.firstName} ${p.lastName}`} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy p-4 text-white">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Balance</div>
            <div className="score-digits text-4xl font-black text-accent">{money(balance(reg))}</div>
            <div className="text-xs text-slate-300">{money(paid)} paid of {money(amountDue(reg))} · {f.parentName}</div>
          </div>
          {balance(reg) > 0 && (
            <form
              className="space-y-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200"
              onSubmit={(e) => {
                e.preventDefault()
                const amt = Number(amount)
                if (!(amt > 0)) return
                const willBePaid = amt >= balance(reg) - 0.009
                apply((d) => recordPayment(d, reg.id, { amount: amt, method, date }))
                if (willBePaid) {
                  celebrate()
                  toast('🏆', `${p.firstName} is PAID IN FULL!`, 'Receipt emailed to the family.')
                } else toast('💰', cheer(), `${money(amt)} recorded · receipt emailed`)
                onClose()
              }}
            >
              <div className="font-bold text-emerald-900">Record a payment</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount"><Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
                <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((m) => <button type="button" key={m} onClick={() => setMethod(m)} className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', method === m ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white ring-emerald-200')}>{m}</button>)}
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-emerald-600">Record {money(Number(amount) || 0, true)}</Button>
                <Button variant="secondary" onClick={() => setAmount(String(balance(reg)))}>Pay off</Button>
              </div>
            </form>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Payment plan">
              <Select value={reg.plan} onChange={(e) => patch({ plan: e.target.value as PaymentPlan })}>
                {PAYMENT_PLANS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </Select>
            </Field>
            <Field label="First due"><Input type="date" value={reg.firstDueDate} onChange={(e) => patch({ firstDueDate: e.target.value })} /></Field>
            <Field label="Season fee"><Input type="number" defaultValue={reg.fee} onBlur={(e) => patch({ fee: Number(e.target.value) || 0 })} /></Field>
            <Field label="Discount"><Input type="number" defaultValue={reg.discount} onBlur={(e) => patch({ discount: Number(e.target.value) || 0 })} /></Field>
            <Field label="Fundraising credit" className="col-span-2" hint="Credits from car washes, raffles, etc. reduce what the family owes."><Input type="number" defaultValue={reg.fundraisingCredit} onBlur={(e) => patch({ fundraisingCredit: Number(e.target.value) || 0 })} /></Field>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-black">📆 Installments</h3>
            <ul className="space-y-1.5">
              {sched.map((i, idx) => {
                running += i.amount
                const covered = paid >= running - 0.009
                const lateNow = !covered && i.due < todayISO()
                return (
                  <li key={idx} className={cx('flex items-center justify-between rounded-xl px-3 py-2 text-sm ring-1', covered ? 'bg-emerald-50 ring-emerald-200' : lateNow ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200')}>
                    <span>{covered ? '✅' : lateNow ? '⚠️' : '⏳'} {fmtDate(i.due, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <b className="tabular-nums">{money(i.amount, true)}</b>
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-black">🧾 Payment history</h3>
            {reg.payments.length === 0 ? <p className="text-sm text-slate-500">No payments yet.</p> : (
              <ul className="space-y-1.5">
                {[...reg.payments].reverse().map((x) => (
                  <li key={x.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span>{fmtDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' })} · <span className="text-slate-500">{x.method}</span></span>
                    <span className="flex items-center gap-2">
                      <b className="tabular-nums">{money(x.amount, true)}</b>
                      <button aria-label="Remove payment" className="text-slate-300 hover:text-red-500" onClick={() => confirm('Remove this payment?') && patch({ payments: reg.payments.filter((y) => y.id !== x.id) })}>✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

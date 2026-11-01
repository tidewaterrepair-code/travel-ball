import { useMemo, useState } from 'react'
import { useData } from '../lib/store'
import { LEAD_SOURCES, LEAD_STAGES } from '../lib/types'
import { addMonths, balance, download, money, paidTotal, payStatus, toCSV } from '../lib/utils'
import { Button, Card, CardHeader, PageHeader, Tabs } from '../components/ui'
import { BarList, ColumnChart, SERIES } from '../components/charts'

export default function Reports() {
  const data = useData()
  const { registrations, teams, leads, players, settings } = data
  const [showTable, setShowTable] = useState(false)
  const season = registrations.filter((r) => r.season === settings.seasonYear)

  const byTeam = teams.map((t) => {
    const regs = season.filter((r) => r.teamId === t.id)
    return {
      team: t,
      collected: regs.reduce((s, r) => s + paidTotal(r), 0),
      owed: regs.reduce((s, r) => s + balance(r), 0),
      players: players.filter((p) => p.teamId === t.id && p.status === 'active').length,
      pastDue: regs.filter((r) => payStatus(r) === 'pastdue').length,
    }
  })

  const monthly = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i - 5)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const total = season.flatMap((r) => r.payments).filter((p) => p.date.startsWith(key)).reduce((s, p) => s + p.amount, 0)
      return { label: d.toLocaleDateString('en-US', { month: 'short' }), value: Math.round(total), sub: `${money(total)} collected` }
    })
  }, [season])

  const funnel = LEAD_STAGES.filter((s) => s.id !== 'lost').map((s, i, arr) => {
    // A lead "reached" a stage if it is at that stage or any later one (lost leads excluded).
    const reached = leads.filter((l) => l.stage !== 'lost' && arr.findIndex((x) => x.id === l.stage) >= i).length
    return { key: s.id, label: `${s.emoji} ${s.label}`, value: reached }
  })
  const totalLeads = leads.length
  const committed = leads.filter((l) => l.stage === 'committed').length

  const sources = LEAD_SOURCES.map((src) => {
    const ls = leads.filter((l) => l.source === src)
    const won = ls.filter((l) => l.stage === 'committed').length
    return { src, total: ls.length, won }
  }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total)

  const exportFinance = () =>
    download(`finance-by-team-${settings.seasonYear}.csv`, toCSV(byTeam.map((b) => ({ Team: b.team.name, Players: b.players, Collected: b.collected, Outstanding: b.owed, 'Past Due Families': b.pastDue }))))

  const totalCollected = byTeam.reduce((s, b) => s + b.collected, 0)
  const totalOwed = byTeam.reduce((s, b) => s + b.owed, 0)

  return (
    <div>
      <PageHeader emoji="📊" title="Reports" subtitle="The numbers behind your club — revenue, recruiting, and rosters." actions={<Button variant="secondary" onClick={exportFinance}>⬇️ Export finance CSV</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Season revenue (booked)', value: money(totalCollected + totalOwed) },
          { label: 'Collected to date', value: money(totalCollected) },
          { label: 'Lead → player conversion', value: `${Math.round((committed / Math.max(1, totalLeads)) * 100)}%` },
          { label: 'Avg fee per player', value: money((totalCollected + totalOwed) / Math.max(1, season.length)) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs font-semibold text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-black tabular-nums">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon="💵" title="Revenue by team" subtitle="Collected vs. still owed this season" action={<Tabs value={showTable ? 't' : 'c'} onChange={(v) => setShowTable(v === 't')} options={[{ id: 'c', label: 'Chart' }, { id: 't', label: 'Table' }]} />} />
          <div className="px-5 pb-5">
            {showTable ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Team</th><th className="text-right">Collected</th><th className="text-right">Owed</th><th className="text-right">Past due</th></tr></thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {byTeam.map((b) => <tr key={b.team.id}><td className="py-2 font-semibold">{b.team.name}</td><td className="text-right">{money(b.collected)}</td><td className="text-right">{money(b.owed)}</td><td className="text-right">{b.pastDue}</td></tr>)}
                </tbody>
              </table>
            ) : (
              <BarList
                money
                series={[{ label: 'Collected', color: SERIES[0] }, { label: 'Still owed', color: SERIES[1] }]}
                rows={byTeam.map((b) => ({ key: b.team.id, label: b.team.name, values: [b.collected, b.owed], sub: `${money(b.collected)} of ${money(b.collected + b.owed)}` }))}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon="📆" title="Payments collected by month" subtitle="Last 6 months" />
          <div className="px-5 pb-5"><ColumnChart data={monthly} label="Dollars collected per month for the last six months" /></div>
        </Card>

        <Card>
          <CardHeader icon="🧢" title="Recruiting funnel" subtitle={`${totalLeads} total leads · ${committed} committed`} />
          <div className="px-5 pb-5">
            <BarList series={[{ label: 'Leads', color: SERIES[0] }]} rows={funnel.map((f) => ({ key: f.key, label: f.label, values: [f.value], sub: `${f.value} · ${Math.round((f.value / Math.max(1, funnel[0].value)) * 100)}%` }))} />
          </div>
        </Card>

        <Card>
          <CardHeader icon="📣" title="Where families find you" subtitle="Leads by source, with how many committed" />
          <div className="px-5 pb-5">
            <BarList
              series={[{ label: 'Committed', color: SERIES[2] }, { label: 'Other leads', color: SERIES[0] }]}
              rows={sources.map((s) => ({ key: s.src, label: s.src, values: [s.won, s.total - s.won], sub: `${s.total} leads · ${s.won} committed` }))}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

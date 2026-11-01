import { useRef, useState } from 'react'
import { useClub, useData } from '../lib/store'
import type { ClubData, OrgSettings, Template } from '../lib/types'
import { rolloverSeason } from '../lib/ops'
import { ageGroupLabel, baseballAge, cx, download, recommendTeam } from '../lib/utils'
import { Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { celebrate, toast } from '../components/feedback'
import { BrandWizard } from '../components/BrandWizard'
import { ClubLogo } from '../components/ClubLogo'

const MASCOTS = ['⚡', '⚾', '🦅', '🐻', '🦈', '🐍', '🔥', '🌪️', '🐝', '🦂', '🐺', '🏴‍☠️', '🦬', '🐊', '🚀', '⭐']
const PALETTES: [string, string, string][] = [
  ['Royal & Gold', '#1d4ed8', '#f59e0b'],
  ['Crimson & Steel', '#b91c1c', '#e5e7eb'],
  ['Forest & Cream', '#166534', '#fde68a'],
  ['Purple Reign', '#6d28d9', '#facc15'],
  ['Navy & Orange', '#1e3a8a', '#fb923c'],
  ['Teal Wave', '#0f766e', '#fbbf24'],
  ['Blackout', '#111827', '#22d3ee'],
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Settings() {
  const data = useData()
  const store = useClub()
  const { settings, automations, templates } = data
  const s = (p: Partial<OrgSettings>) => store.set('settings', (x) => ({ ...x, ...p }))
  const [tpl, setTpl] = useState<Template | null>(null)
  const [rollover, setRollover] = useState(false)
  const [branding, setBranding] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <PageHeader emoji="⚙️" title="Club Settings" subtitle="Make it yours — colors, season rules, automations, and templates." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon="🎨" title="Branding" subtitle="Shows across the app and on your public signup page" />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-center gap-4 rounded-2xl bg-navy p-4 text-white">
              <ClubLogo size={64} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-black">{settings.name}</div>
                <div className="truncate text-xs text-white/60">{settings.website ?? 'Paste a club website to auto-brand everything'}</div>
              </div>
              <Button variant="accent" size="sm" onClick={() => setBranding(true)}>🎨 Customize</Button>
            </div>
            <Field label="Club name"><Input value={settings.name} onChange={(e) => s({ name: e.target.value })} /></Field>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mascot</span>
              <div className="flex flex-wrap gap-1.5">
                {MASCOTS.map((m) => <button key={m} aria-label={`Mascot ${m}`} onClick={() => s({ mascot: m })} className={cx('flex h-10 w-10 items-center justify-center rounded-xl text-xl transition', settings.mascot === m ? 'bg-brand shadow-md ring-2 ring-brand ring-offset-2' : 'bg-slate-100 hover:bg-slate-200')}>{m}</button>)}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Club colors</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PALETTES.map(([name, p, a]) => (
                  <button key={name} onClick={() => s({ primaryColor: p, accentColor: a })} className={cx('flex items-center gap-2 rounded-xl p-2 text-left text-xs font-semibold ring-1 transition', settings.primaryColor === p && settings.accentColor === a ? 'ring-2 ring-slate-900' : 'ring-slate-200 hover:bg-slate-50')}>
                    <span className="flex"><span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: p }} /><span className="-ml-1.5 h-5 w-5 rounded-full ring-2 ring-white" style={{ background: a }} /></span>
                    {name}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex items-center gap-2">Primary <input type="color" value={settings.primaryColor} onChange={(e) => s({ primaryColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded" /></label>
                <label className="flex items-center gap-2">Accent <input type="color" value={settings.accentColor} onChange={(e) => s({ accentColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded" /></label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact email"><Input type="email" value={settings.contactEmail} onChange={(e) => s({ contactEmail: e.target.value })} /></Field>
              <Field label="City"><Input value={settings.city} onChange={(e) => s({ city: e.target.value })} /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon="📏" title="Season & age rules" />
          <div className="space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Season year"><Input type="number" value={settings.seasonYear} onChange={(e) => s({ seasonYear: Number(e.target.value) })} /></Field>
              <Field label="Default season fee"><Input type="number" value={settings.defaultFee} onChange={(e) => s({ defaultFee: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Age cutoff date" hint={<>A player’s age group is their age on this date of the season year. USSSA uses <b>April 30</b>. Example: a player born June 1, {settings.seasonYear - 10} plays <b>{ageGroupLabel(baseballAge(`${settings.seasonYear - 10}-06-01`, settings) ?? 0)}</b>.</>}>
              <div className="flex gap-2">
                <Select value={settings.ageCutoffMonth} onChange={(e) => s({ ageCutoffMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>
                <Input type="number" min={1} max={31} value={settings.ageCutoffDay} onChange={(e) => s({ ageCutoffDay: Number(e.target.value) })} />
              </div>
            </Field>
            <div className="rounded-2xl bg-gradient-to-br from-navy to-brand p-4 text-white">
              <div className="font-black">🔄 Season rollover</div>
              <p className="mt-1 text-sm text-white/80">Ready for {settings.seasonYear + 1}? Move every player up to their new age group, create fresh registrations, and graduate players who aged out.</p>
              <Button variant="accent" className="mt-3" onClick={() => setRollover(true)}>Preview rollover →</Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon="⚡" title="Automations" subtitle="Little helpers that do the busywork for you" />
          <ul className="divide-y divide-slate-100 px-5 pb-3">
            {automations.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm font-bold">{a.name}</div>
                  <div className="text-xs text-slate-500">{a.description}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{a.runs} runs so far</div>
                </div>
                <button
                  role="switch"
                  aria-checked={a.enabled}
                  aria-label={a.name}
                  onClick={() => store.set('automations', (as) => as.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)))}
                  className={cx('relative mt-1 h-6 w-11 shrink-0 rounded-full transition', a.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
                >
                  <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', a.enabled ? 'left-[22px]' : 'left-0.5')} />
                </button>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-xs text-slate-500">📨 <b>Email delivery:</b> demo mode. Messages are personalized and logged in Messages. Connect an email provider at launch to deliver them to inboxes. See the README.</p>
        </Card>

        <Card>
          <CardHeader icon="📝" title="Message templates" action={<Button size="sm" variant="secondary" onClick={() => setTpl({ id: `tpl_${Date.now()}`, name: 'New template', emoji: '✉️', subject: '', body: 'Hi {{parentFirst}},\n\n' })}>+ New</Button>} />
          <ul className="space-y-1.5 px-5 pb-5">
            {templates.map((t) => (
              <li key={t.id}>
                <button onClick={() => setTpl(t)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-slate-50">
                  <span className="text-xl">{t.emoji}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{t.name}</span><span className="block truncate text-xs text-slate-500">{t.subject}</span></span>
                  {['tpl_lead_welcome', 'tpl_tryout', 'tpl_welcome', 'tpl_receipt'].includes(t.id) && <Badge tone="amber">⚡ auto</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon="💾" title="Your data" subtitle="Data is saved in this browser. Download a backup any time." />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            <Button variant="secondary" onClick={() => download(`dugout-hq-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')}>⬇️ Download backup</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>⬆️ Restore backup</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const parsed = JSON.parse(await file.text()) as ClubData
                  if (parsed.version !== 1 || !Array.isArray(parsed.players)) throw new Error('bad')
                  store.replace(parsed)
                  toast('✅', 'Backup restored', `${parsed.players.length} players loaded.`)
                } catch {
                  toast('⚠️', 'That file doesn’t look like a Dugout HQ backup')
                }
                e.target.value = ''
              }}
            />
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => { if (confirm('Reload the demo club? This replaces everything currently in the app.')) { store.resetDemo(); toast('🔄', 'Demo club reloaded') } }}>Reload demo data</Button>
            <Button variant="danger" onClick={() => { if (confirm('Start a brand-new empty club? This erases all current data in this browser.')) { store.startFresh(); toast('⚾', 'Fresh start!', 'Add your teams to begin.') } }}>Start a fresh club</Button>
          </div>
        </Card>
      </div>

      {tpl && <TemplateModal tpl={tpl} onClose={() => setTpl(null)} />}
      {rollover && <RolloverModal onClose={() => setRollover(false)} />}
      <BrandWizard open={branding} onClose={() => setBranding(false)} />
    </div>
  )
}

function TemplateModal({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
  const set = useClub((s) => s.set)
  const exists = useData().templates.some((t) => t.id === tpl.id)
  const [v, setV] = useState(tpl)
  return (
    <Modal open onClose={onClose} title={`${v.emoji} ${exists ? 'Edit' : 'New'} template`} wide>
      <div className="grid gap-3">
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Emoji"><Input value={v.emoji} onChange={(e) => setV({ ...v, emoji: e.target.value })} /></Field>
          <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        </div>
        <Field label="Subject"><Input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
        <Field label="Body" hint="Use {{parentFirst}}, {{playerFirst}}, {{teamName}}, {{coachName}}, {{balance}}, {{nextDue}}, {{ageGroup}}, {{orgName}}"><Textarea rows={10} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        <div className="flex justify-between">
          {exists && !['tpl_lead_welcome', 'tpl_tryout', 'tpl_welcome', 'tpl_receipt', 'tpl_reminder'].includes(tpl.id) ? (
            <Button variant="ghost" className="text-red-600" onClick={() => { set('templates', (ts) => ts.filter((t) => t.id !== tpl.id)); onClose() }}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { set('templates', (ts) => (exists ? ts.map((t) => (t.id === v.id ? v : t)) : [...ts, v])); toast('📝', 'Template saved'); onClose() }}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function RolloverModal({ onClose }: { onClose: () => void }) {
  const data = useData()
  const replace = useClub((s) => s.replace)
  const next = { ...data.settings, seasonYear: data.settings.seasonYear + 1 }
  const maxAge = Math.max(0, ...data.teams.map((t) => t.ageGroup))
  const active = data.players.filter((p) => p.status === 'active')
  const preview = data.teams.map((t) => ({
    team: t,
    incoming: active.filter((p) => {
      const age = baseballAge(p.birthDate, next)
      return age != null && age <= maxAge && recommendTeam(age, data.teams, [])?.id === t.id
    }).length,
  }))
  const graduating = active.filter((p) => (baseballAge(p.birthDate, next) ?? 0) > maxAge).length

  return (
    <Modal open onClose={onClose} title={`🔄 Roll over to ${next.seasonYear}`}>
      <p className="text-sm text-slate-600">Here’s what your rosters will look like after everyone moves up an age group:</p>
      <ul className="mt-3 space-y-1.5">
        {preview.map(({ team, incoming }) => (
          <li key={team.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: team.color }} />{team.name}</span>
            <span className={cx('font-bold', incoming > team.rosterLimit && 'text-red-600')}>{incoming} players{incoming > team.rosterLimit ? ` (over ${team.rosterLimit} limit)` : ''}</span>
          </li>
        ))}
        <li className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm"><span>🎓 Graduating (aged out)</span><b>{graduating}</b></li>
      </ul>
      <p className="mt-3 text-xs text-slate-500">Each player gets a new {next.seasonYear} registration. Committed and passed leads are cleared from the board. Download a backup first if you want a copy of this season.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Not yet</Button>
        <Button
          onClick={() => {
            const res = rolloverSeason(data)
            replace(res.data)
            celebrate()
            toast('🔄', `Welcome to the ${res.data.settings.seasonYear} season!`, `${res.moved} players moved up · ${res.graduated} graduated`)
            onClose()
          }}
        >
          Start {next.seasonYear} season
        </Button>
      </div>
    </Modal>
  )
}

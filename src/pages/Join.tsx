// Public, parent-facing tryout signup page. Share the link anywhere.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClub, useData } from '../lib/store'
import { addLead } from '../lib/ops'
import { ageGroupLabel, baseballAge, fmtDate, fmtTime, recommendTeam } from '../lib/utils'
import { Button, Card } from '../components/ui'
import { celebrate } from '../components/feedback'
import { LeadFields, emptyLead, type LeadFormValue } from './Leads'
import { ClubLogo } from '../components/ClubLogo'

export default function Join() {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const [v, setV] = useState<LeadFormValue>(emptyLead)
  const [done, setDone] = useState<LeadFormValue | null>(null)
  const { settings, teams, events } = data
  const tryouts = events.filter((e) => e.type === 'tryout' && new Date(e.end) >= new Date()).sort((a, b) => a.start.localeCompare(b.start))

  const age = done ? baseballAge(done.birthDate, settings) : null
  const rec = recommendTeam(age, teams, data.players)

  return (
    <div className="min-h-full bg-navy">
      <div className="field-stripes relative overflow-hidden bg-gradient-to-b from-brand to-navy px-4 pt-10 pb-28 text-center text-white">
        {settings.banner && (
          <>
            <img src={settings.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-b from-brand/50 to-navy" aria-hidden />
          </>
        )}
        <div className="absolute top-6 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rotate-45 rounded-3xl border-4 border-white/10" aria-hidden />
        <div className="relative mx-auto max-w-2xl">
          <ClubLogo size={96} className="mx-auto" />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-accent">{settings.seasonYear} Tryouts</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Join {settings.name}</h1>
          <p className="mx-auto mt-3 max-w-lg text-white/80">Competitive travel baseball with great coaches, great teammates, and a whole lot of fun. Tell us about your player and we’ll get you to tryouts!</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {teams.map((t) => <span key={t.id} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/20">{ageGroupLabel(t.ageGroup)}</span>)}
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-20 max-w-2xl px-4 pb-16">
        {done ? (
          <Card className="pop-in p-8 text-center">
            <div className="text-6xl">🎉</div>
            <h2 className="mt-3 text-2xl font-black">You’re on the list, {done.parentName.split(' ')[0]}!</h2>
            <p className="mt-2 text-slate-600">
              {done.playerFirst} will be in our <b className="text-brand">{age != null ? ageGroupLabel(age) : ''}</b> age group{rec ? <> — that’s <b>{rec.name}</b> with {rec.headCoach}</> : null}.
            </p>
            <p className="mt-1 text-sm text-slate-500">Check your inbox for a confirmation. A coach will reach out within 48 hours.</p>
            {tryouts.length > 0 && (
              <div className="mt-6 space-y-2 text-left">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Upcoming tryouts</div>
                {tryouts.map((t) => (
                  <div key={t.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="font-bold">🧢 {t.title}</div>
                    <div className="text-sm text-slate-600">{fmtDate(t.start, { weekday: 'long', month: 'long', day: 'numeric' })} at {fmtTime(t.start)} · {t.location}</div>
                  </div>
                ))}
              </div>
            )}
            <Button className="mt-6" variant="secondary" onClick={() => { setDone(null); setV(emptyLead) }}>Sign up another player</Button>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-black">⚾ Tryout interest form</h2>
            <p className="mb-5 text-sm text-slate-500">Takes about a minute. No commitment.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                apply((d) => addLead(d, { ...v, stage: 'new' }).data)
                setDone(v)
                celebrate()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <LeadFields v={v} onChange={setV} />
              <Button type="submit" size="lg" className="mt-6 w-full">Count me in! ⚾</Button>
              <p className="mt-3 text-center text-xs text-slate-400">Questions? Email <a className="underline" href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p>
            </form>
          </Card>
        )}
        <p className="mt-6 text-center text-xs text-white/40">
          Powered by Dugout HQ · <Link to="/" className="underline">Staff login</Link>
        </p>
      </div>
    </div>
  )
}

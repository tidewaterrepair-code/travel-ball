import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { useClub } from './lib/store'
import { applyBrand } from './lib/brand'
import { lookupWebsite } from './components/BrandWizard'
import { celebrate, toast } from './components/feedback'
import './index.css'
import { Layout, useBrandColors } from './components/Layout'
import { Toaster } from './components/feedback'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Join from './pages/Join'
import Players from './pages/Players'
import Teams from './pages/Teams'
import Schedule from './pages/Schedule'
import Payments from './pages/Payments'
import Messages from './pages/Messages'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Admin from './pages/Admin'
import { CLUB_SLUG, PAGE } from './lib/mode'
import { loadClub } from './lib/sync'
import { publicClub, type PublicClub } from './lib/session'
import { buildEmpty } from './lib/seed'
import type { ClubData, ClubEvent, Player, Team } from './lib/types'

/** Pitch links (#/?brand=club-site.com) open the demo already dressed in that club's colors. */
function PitchLinkBranding() {
  const [params, setParams] = useSearchParams()
  const apply = useClub((s) => s.apply)
  const website = useClub((s) => s.data.settings.website)
  const [loading, setLoading] = useState(false)
  const started = useRef(false)
  const target = params.get('brand')

  useEffect(() => {
    if (PAGE !== 'demo' || !target || started.current) return
    started.current = true
    const clear = () => setParams((p) => { p.delete('brand'); return p }, { replace: true })
    const norm = (u?: string) => (u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
    if (norm(website) === norm(target)) return clear()
    setLoading(true)
    lookupWebsite(target)
      .then((d) => {
        apply((data) => applyBrand(data, { ...d, renameTeams: true }))
        celebrate()
        toast('👋', `Welcome, ${d.name}!`, 'This is Dugout HQ, built for your club.')
      })
      .catch((e) => toast('⚠️', 'Couldn’t load that club’s branding', e instanceof Error ? e.message : undefined))
      .finally(() => {
        setLoading(false)
        clear()
      })
  }, [target, website, apply, setParams])

  if (!loading) return null
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-navy text-white">
      <div className="animate-bounce text-6xl">⚾</div>
      <div className="text-lg font-black">Getting your dugout ready…</div>
      <div className="text-sm text-white/60">Dressing the app in your club colors</div>
    </div>
  )
}

/** Shape the public tryout info like club data so the signup page can render it. */
function publicToClubData(p: PublicClub): ClubData {
  const d = buildEmpty()
  d.settings = { ...d.settings, ...(p.settings as Partial<ClubData['settings']>) }
  d.teams = p.teams.map((t): Team => ({ ...t, coachEmail: '', fee: 0, practiceLocation: '' }))
  d.players = Object.entries(p.rosterCounts).flatMap(([teamId, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${teamId}-${i}`, familyId: '', firstName: '', lastName: '', birthDate: '2000-01-01', teamId, positions: [], bats: 'R', throws: 'R', status: 'active' }) as Player),
  )
  d.events = p.tryouts.map((t): ClubEvent => ({ ...t, type: 'tryout', teamIds: [], rsvps: {} }))
  d.activity = []
  return d
}

/** Loads a real club before showing it; sends signed-out staff to sign-in. */
function ClubGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'notfound' | 'error'>('loading')
  useEffect(() => {
    const isPublicJoin = location.hash.startsWith('#/join')
    if (isPublicJoin) {
      publicClub(CLUB_SLUG!)
        .then((p) => {
          useClub.setState({ data: publicToClubData(p) })
          setState('ok')
        })
        .catch(() => setState('notfound'))
      return
    }
    loadClub().then((r) => {
      if (r === 'signedout') location.href = `/login?next=${encodeURIComponent(location.pathname)}`
      else setState(r)
    })
    const onRejected = (e: Event) => toast('🔒', 'That change wasn’t saved', (e as CustomEvent<string>).detail)
    window.addEventListener('dugout:rejected', onRejected)
    return () => window.removeEventListener('dugout:rejected', onRejected)
  }, [])

  if (state === 'ok') return <>{children}</>
  const msg = {
    loading: ['⚾', 'Warming up…', ''],
    forbidden: ['🔒', 'You’re not on this club’s staff', 'Ask the club admin to invite you, or sign in with a different email.'],
    notfound: ['🔍', 'Club not found', 'Check the web address.'],
    error: ['📡', 'Can’t reach the server', 'Check your connection and refresh.'],
  }[state]
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 bg-navy px-6 text-center text-white">
      <div className={state === 'loading' ? 'animate-bounce text-6xl' : 'text-6xl'}>{msg[0]}</div>
      <div className="text-xl font-black">{msg[1]}</div>
      {msg[2] && <p className="max-w-sm text-sm text-white/70">{msg[2]}</p>}
      {state !== 'loading' && <a href="/login" className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">Go to sign-in</a>}
    </div>
  )
}

function App() {
  useBrandColors()
  if (PAGE === 'login') return <Login />
  if (PAGE === 'admin') return <Admin />
  const routes = (
    <>
      <PitchLinkBranding />
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="players" element={<Players />} />
          <Route path="teams" element={<Teams />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="payments" element={<Payments />} />
          <Route path="messages" element={<Messages />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
  return PAGE === 'club' ? <ClubGate>{routes}</ClubGate> : routes
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

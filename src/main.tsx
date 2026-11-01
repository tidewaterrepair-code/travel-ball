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

/** Pitch links (#/?brand=club-site.com) open the demo already dressed in that club's colors. */
function PitchLinkBranding() {
  const [params, setParams] = useSearchParams()
  const apply = useClub((s) => s.apply)
  const website = useClub((s) => s.data.settings.website)
  const [loading, setLoading] = useState(false)
  const started = useRef(false)
  const target = params.get('brand')

  useEffect(() => {
    if (!target || started.current) return
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

function App() {
  useBrandColors()
  return (
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
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

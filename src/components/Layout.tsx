import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useData } from '../lib/store'
import { cx } from '../lib/utils'
import { ClubLogo } from './ClubLogo'
import { BrandWizard } from './BrandWizard'
import { SyncBadge, useIsAdmin } from './SyncBadge'
import { IS_CLUB } from '../lib/mode'

export const NAV = [
  { to: '/', label: 'Scoreboard', emoji: '🏟️', short: 'Home' },
  { to: '/leads', label: 'Tryouts & Leads', emoji: '🧢', short: 'Leads' },
  { to: '/players', label: 'Families & Players', emoji: '👨‍👩‍👦', short: 'Players' },
  { to: '/teams', label: 'Teams & Rosters', emoji: '⚾', short: 'Teams' },
  { to: '/schedule', label: 'Schedule', emoji: '📅', short: 'Schedule' },
  { to: '/payments', label: 'Dues & Payments', emoji: '💵', short: 'Dues' },
  { to: '/messages', label: 'Messages', emoji: '📣', short: 'Messages' },
  { to: '/reports', label: 'Reports', emoji: '📊', short: 'Reports' },
  { to: '/settings', label: 'Club Settings', emoji: '⚙️', short: 'Settings' },
]
const MOBILE_MAIN = ['/', '/leads', '/teams', '/schedule']

export function useBrandColors() {
  const { primaryColor, accentColor, darkColor, logo, name } = useData().settings
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--brand', primaryColor)
    root.setProperty('--accent', accentColor)
    root.setProperty('--navy', darkColor ?? '#0f1b33')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkColor ?? '#0f1b33')
  }, [primaryColor, accentColor, darkColor])
  useEffect(() => {
    document.title = `${name} · Dugout HQ`
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) return
    if (!icon.dataset.default) icon.dataset.default = icon.href
    icon.href = logo ?? icon.dataset.default
  }, [logo, name])
}

export function Layout() {
  const { settings, leads } = useData()
  const newLeads = leads.filter((l) => l.stage === 'new').length
  const [more, setMore] = useState(false)
  const [branding, setBranding] = useState(false)
  const isAdmin = useIsAdmin()
  const loc = useLocation()
  useEffect(() => {
    setMore(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  const link = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      className={({ isActive }) =>
        cx(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
          isActive ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/6 hover:text-white',
        )
      }
    >
      <span className="text-lg" aria-hidden>{n.emoji}</span>
      <span className="flex-1">{n.label}</span>
      {n.to === '/leads' && newLeads > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-black text-slate-900">{newLeads}</span>}
    </NavLink>
  )

  return (
    <div className="min-h-full lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <ClubLogo size={48} />
          <div className="min-w-0">
            <div className="truncate text-sm font-black leading-tight text-white">{settings.name}</div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">Dugout HQ</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{NAV.map(link)}</nav>
        <a href="#/join" target="_blank" rel="noreferrer" className="mt-4 rounded-2xl bg-gradient-to-br from-brand to-brand/60 p-4 text-white ring-1 ring-white/10 transition hover:brightness-110">
          <div className="text-xs font-bold uppercase tracking-wider text-white/70">Share with families</div>
          <div className="mt-1 font-black">Tryout signup page ↗</div>
          <div className="mt-1 text-xs text-white/70">New signups land in your Leads board automatically.</div>
        </a>
        {isAdmin && (
          <button onClick={() => setBranding(true)} className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-400 transition hover:bg-white/6 hover:text-white">
            🎨 {IS_CLUB ? 'Club branding' : 'Customize for a club'}
          </button>
        )}
        {IS_CLUB ? <SyncBadge /> : <div className="mt-1 px-3 text-[11px] text-slate-500">{settings.seasonYear} season</div>}
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-navy px-4 py-3 text-white lg:hidden">
        <ClubLogo size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">{settings.name}</div>
          {IS_CLUB ? <SyncBadge compact /> : <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">Dugout HQ · {settings.seasonYear}</div>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-slate-500')}>
            <span className="text-xl">{n.emoji}</span>
            {n.short}
            {n.to === '/leads' && newLeads > 0 && <span className="absolute top-1 right-[22%] h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-white" />}
          </NavLink>
        ))}
        <button onClick={() => setMore((m) => !m)} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', more ? 'text-brand' : 'text-slate-500')}>
          <span className="text-xl">☰</span>More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMore(false)}>
          <div className="pop-in absolute inset-x-3 bottom-20 rounded-3xl bg-navy p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="grid gap-1">{NAV.filter((n) => !MOBILE_MAIN.includes(n.to)).map(link)}</div>
            <a href="#/join" target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-white">🔗 Open tryout signup page</a>
            {isAdmin && <button onClick={() => { setMore(false); setBranding(true) }} className="mt-2 block w-full rounded-xl bg-white/10 px-3 py-2.5 text-left text-sm font-bold text-white">🎨 {IS_CLUB ? 'Club branding' : 'Customize for a club'}</button>}
            {IS_CLUB && <div className="px-1"><SyncBadge /></div>}
          </div>
        </div>
      )}
      <BrandWizard open={branding} onClose={() => setBranding(false)} />
    </div>
  )
}

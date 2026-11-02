import { useSync } from '../lib/sync'
import { logout } from '../lib/session'
import { cx } from '../lib/utils'

const LABEL = {
  loading: ['⏳', 'Loading…', 'text-slate-400'],
  saved: ['✓', 'All changes saved', 'text-emerald-400'],
  saving: ['⟳', 'Saving…', 'text-slate-300'],
  offline: ['⚠', 'Offline: will retry', 'text-amber-400'],
  error: ['⚠', 'Couldn’t save', 'text-red-400'],
  signedout: ['🔒', 'Signed out', 'text-red-400'],
} as const

/** Sidebar footer for real clubs: who's signed in, save status, sign out. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { status, email, role, error } = useSync()
  const [icon, label, color] = LABEL[status]
  if (compact) return <span className={cx('text-[10px] font-semibold', color)} title={error ?? label}>{icon} {label}</span>
  return (
    <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[11px]">
      <div className={cx('font-semibold', color)} title={error ?? undefined}>{icon} {label}</div>
      {status === 'signedout' && <a href={`/login?next=${encodeURIComponent(location.pathname)}`} className="mt-1 block font-bold text-white underline">Sign in again</a>}
      {email && (
        <div className="mt-1 flex items-center justify-between gap-2 text-slate-400">
          <span className="truncate" title={email}>{email} · {role}</span>
          <button className="shrink-0 underline hover:text-white" onClick={() => logout().finally(() => (location.href = '/login'))}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export const useIsAdmin = () => {
  const role = useSync((s) => s.role)
  return role === null || role === 'admin' // the demo (no role) behaves like an admin
}

import { useEffect, type ReactNode, type ButtonHTMLAttributes, type ComponentProps } from 'react'
import { cx, initials } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-sm',
  accent: 'bg-accent text-slate-900 hover:brightness-105 shadow-sm',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
    />
  )
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx('rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: string; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const tones = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  brand: 'bg-brand/10 text-brand',
}
export type Tone = keyof typeof tones
export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>
}

export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? 'var(--brand)' }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function JerseyBadge({ number, color }: { number?: string; color: string }) {
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white shadow-inner" style={{ background: color }}>
      {number ?? '–'}
    </span>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={typeof title === 'string' ? title : undefined} className={cx('pop-in flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className="slide-in flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 text-lg font-bold">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

const inputCls = 'rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand outline-none transition'
// Full width unless the caller sets its own width (w-auto, w-40, …).
const width = (c?: string) => (c && /(^|\s)w-/.test(c) ? '' : 'w-full')
export const Input = (p: ComponentProps<'input'>) => <input {...p} className={cx(inputCls, width(p.className), p.className)} />
export const Select = (p: ComponentProps<'select'>) => <select {...p} className={cx(inputCls, width(p.className), 'pr-8', p.className)} />
export const Textarea = (p: ComponentProps<'textarea'>) => <textarea {...p} className={cx(inputCls, width(p.className), 'min-h-24', p.className)} />

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-2 text-4xl">{emoji}</div>
      <p className="font-bold text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, emoji, subtitle, actions }: { title: string; emoji: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          <span aria-hidden>{emoji}</span> {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Meter: filled portion in the color, track a lighter step of it. */
export function Meter({ value, max, color = 'var(--brand)', className, label }: { value: number; max: number; color?: string; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full', className)} style={{ background: `color-mix(in srgb, ${color} 18%, white)` }} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

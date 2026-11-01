import confetti from 'canvas-confetti'
import { create } from 'zustand'

interface Toast {
  id: number
  emoji: string
  title: string
  body?: string
}

const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3800)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = (emoji: string, title: string, body?: string) => useToasts.getState().push({ emoji, title, body })

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Big moments (commits, paid-in-full) get confetti in club colors. */
export function celebrate() {
  if (reduceMotion()) return
  const css = getComputedStyle(document.documentElement)
  const colors = [css.getPropertyValue('--brand').trim() || '#1d4ed8', css.getPropertyValue('--accent').trim() || '#f59e0b', '#ffffff', '#dc2626']
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors, scalar: 0.9 })
  setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors }), 180)
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors }), 300)
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-left text-white shadow-xl ring-1 ring-white/10"
        >
          <span className="text-2xl leading-none">{t.emoji}</span>
          <span>
            <span className="block text-sm font-bold">{t.title}</span>
            {t.body && <span className="mt-0.5 block text-xs text-slate-300">{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

// Fun, rotating baseball-flavored copy
const CHEERS = ['Home run! 💥', 'Nice swing! ⚾', 'Right down the middle! 🎯', 'Safe at home! 🏠', 'Clutch! 🔥', 'Touch ’em all! 🙌']
export const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)]

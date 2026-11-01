import { useCallback, useEffect, useRef, useState } from 'react'
import { useClub, useData } from '../lib/store'
import {
  applyBrand, contrast, DEFAULT_THEME, ensureContrast, guessMascot, paletteFromImage, pickTheme, readFileAsDataUrl, shrinkImage, teamBaseName,
  type Swatch, type Theme, hexToRgb, rgbToHsl, rgbToHex, hslToRgb,
} from '../lib/brand'
import { Crest } from './ClubLogo'
import { Button, Field, Input, Modal, Tabs } from './ui'
import { celebrate, toast } from './feedback'
import { cx } from '../lib/utils'

const API = (import.meta.env.VITE_BRAND_API as string | undefined) || '/api/brand'

export interface BrandDraft {
  name: string
  website?: string
  logo: string | null
  banner: string | null
  swatches: string[]
  theme: Theme
  mascot: string
  email: string | null
}

interface BrandKitResponse {
  url: string
  name: string | null
  email: string | null
  logo: string | null
  banner: string | null
  themeColors: string[]
  cssColors: string[]
  error?: string
}

const darkFor = (primary: string) => {
  const [h, s] = rgbToHsl(hexToRgb(primary))
  return rgbToHex(hslToRgb(h, Math.min(s, 0.6), 0.11))
}

/** Turn a logo/banner image into a draft (shrinks images, extracts colors). */
async function draftFromImages(opts: { name: string; website?: string; logo: string | null; banner: string | null; siteColors?: string[]; email?: string | null }): Promise<BrandDraft> {
  const logo = opts.logo ? await shrinkImage(opts.logo, 320).catch(() => null) : null
  const banner = opts.banner ? await shrinkImage(opts.banner, 1600, 'image/jpeg', 0.82).catch(() => null) : null
  let palette: Swatch[] = []
  const colorSource = logo ?? banner
  if (colorSource) palette = await paletteFromImage(colorSource).catch(() => [])
  const site = opts.siteColors ?? []
  const theme = colorSource || site.length ? pickTheme(palette, site) : DEFAULT_THEME
  const swatches = [...new Set([...palette.filter((s) => s.chromatic).map((s) => s.hex), ...site, ...palette.filter((s) => !s.chromatic).map((s) => s.hex)])].slice(0, 12)
  return { name: opts.name, website: opts.website, logo, banner, swatches, theme, mascot: guessMascot(opts.name), email: opts.email ?? null }
}

export async function lookupWebsite(url: string): Promise<BrandDraft> {
  let res: Response
  try {
    res = await fetch(`${API}?url=${encodeURIComponent(url)}`)
  } catch {
    throw new Error('Couldn’t reach the lookup service. Check your connection, or upload their logo instead.')
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('json')
  if (!isJson) throw new Error('Website lookup isn’t turned on for this copy of the app (it needs the /api/brand server, see the README). You can still upload their logo.')
  const kit = (await res.json()) as BrandKitResponse
  if (!res.ok || kit.error) throw new Error(kit.error ?? 'Lookup failed')
  const host = new URL(kit.url).hostname.replace(/^www\./, '')
  return draftFromImages({ name: kit.name || host, website: kit.url, logo: kit.logo, banner: kit.banner, siteColors: [...kit.themeColors, ...kit.cssColors], email: kit.email })
}

export function pitchLink(website: string) {
  return `${location.origin}${location.pathname}#/?brand=${encodeURIComponent(website)}`
}

const LOADING_LINES = ['Scouting their website…', 'Studying the logo…', 'Mixing the team colors…', 'Lining the base paths…']

export function BrandWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const [mode, setMode] = useState<'web' | 'image'>('web')
  const [url, setUrl] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<BrandDraft | null>(null)
  const [slot, setSlot] = useState<'primary' | 'accent'>('primary')
  const [renameTeams, setRenameTeams] = useState(true)
  const [useBanner, setUseBanner] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1100)
    return () => clearInterval(t)
  }, [busy])

  const run = async (fn: () => Promise<BrandDraft>) => {
    setBusy(true)
    setError(null)
    try {
      setDraft(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onImage = useCallback(
    async (file: Blob) => {
      if (!file.type.startsWith('image/')) return setError('That file isn’t an image.')
      const src = await readFileAsDataUrl(file)
      const img = await new Promise<HTMLImageElement>((r) => {
        const i = new Image()
        i.onload = () => r(i)
        i.src = src
      })
      const wide = img.naturalWidth / Math.max(1, img.naturalHeight) > 1.8
      const name = uploadName.trim() || draft?.name || ''
      run(() => draftFromImages({ name: name || 'Your Club', logo: wide ? null : src, banner: wide ? src : null }))
    },
    [uploadName, draft?.name],
  )

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    if (!open) return
    const h = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) {
        setMode('image')
        onImage(f)
      }
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [open, onImage])

  const reset = () => {
    setDraft(null)
    setError(null)
    setUrl('')
  }
  const close = () => {
    reset()
    onClose()
  }

  const setColor = (hex: string) => {
    if (!draft) return
    const t = { ...draft.theme }
    if (slot === 'primary') {
      t.primary = ensureContrast(hex, '#ffffff', 4.5)
      t.dark = darkFor(hex)
      t.accent = ensureContrast(t.accent, t.dark, 4.5)
    } else t.accent = ensureContrast(hex, t.dark, 4.5)
    setDraft({ ...draft, theme: t })
  }

  const doApply = () => {
    if (!draft) return
    apply((d) => applyBrand(d, { name: draft.name, website: draft.website, logo: draft.logo, banner: useBanner ? draft.banner : null, theme: draft.theme, mascot: draft.mascot, email: draft.email, renameTeams }))
    celebrate()
    toast('🎨', `Welcome to ${draft.name}!`, 'The whole app is now in their colors.')
    close()
  }

  const base = draft ? teamBaseName(draft.name) : ''
  const ageEx = data.teams[1]?.ageGroup ?? 10

  return (
    <Modal open={open} onClose={close} title="🎨 Customize for a club" wide>
      {!draft ? (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">Dress the whole app in a club’s logo, colors and name. Great right before a pitch meeting.</p>
          <Tabs value={mode} onChange={(m) => { setMode(m); setError(null) }} options={[{ id: 'web', label: '🌐 From their website' }, { id: 'image', label: '🖼️ From a logo or screenshot' }]} />
          {mode === 'web' ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (url.trim()) run(() => lookupWebsite(url.trim())) }}>
              <Field label="Club website" hint="Their own site works best. Facebook and Instagram pages block lookups, so use a logo screenshot for those.">
                <div className="flex gap-2">
                  <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="tidewatersharksbaseball.com" inputMode="url" aria-label="Club website" />
                  <Button type="submit" disabled={busy || !url.trim()} className="shrink-0">{busy ? '⏳' : 'Look it up'}</Button>
                </div>
              </Field>
            </form>
          ) : (
            <div className="space-y-3">
              <Field label="Club name"><Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Tidewater Sharks Baseball" /></Field>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onImage(f) }}
                className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-brand hover:bg-brand/5"
              >
                <span className="text-4xl">🖼️</span>
                <span className="font-bold">Drop their logo or banner here</span>
                <span className="text-xs text-slate-500">or click to choose a file, or paste a screenshot (Ctrl/⌘ + V)</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = '' }} />
            </div>
          )}
          {busy && <div className="flex items-center gap-3 rounded-xl bg-brand/5 px-4 py-3 text-sm font-semibold text-brand"><span className="inline-block animate-spin">⚾</span>{LOADING_LINES[line]}</div>}
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">⚠️ {error}{mode === 'web' && <> <button className="font-bold underline" onClick={() => { setMode('image'); setError(null) }}>Upload a logo instead</button></>}</div>}
          {data.settings.logo || data.settings.website ? (
            <button
              className="text-xs text-slate-500 underline"
              onClick={() => {
                apply((d) => ({ ...d, settings: { ...d.settings, logo: undefined, banner: undefined, website: undefined, darkColor: undefined, primaryColor: DEFAULT_THEME.primary, accentColor: DEFAULT_THEME.accent } }))
                toast('↩️', 'Back to the default Dugout HQ look')
                close()
              }}
            >
              Remove current club branding
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Live preview */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
            <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-slate-200">
              <div className="flex">
                <div className="flex w-20 flex-col items-center gap-2 py-3" style={{ background: draft.theme.dark }}>
                  {draft.logo ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1"><img src={draft.logo} alt="" className="max-h-full max-w-full object-contain" /></span>
                  ) : (
                    <Crest name={draft.name} primary={draft.theme.primary} accent={draft.theme.accent} size={40} />
                  )}
                  {['🏟️', '🧢', '⚾', '📅', '💵'].map((e, i) => <span key={e} className={cx('rounded-lg px-2 py-1 text-sm', i === 0 && 'bg-white/15')}>{e}</span>)}
                </div>
                <div className="flex-1 bg-slate-100 p-3">
                  <div className="relative overflow-hidden rounded-xl p-3 text-white" style={{ background: `linear-gradient(135deg, ${draft.theme.primary}, ${draft.theme.dark})` }}>
                    {useBanner && draft.banner && <img src={draft.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity" />}
                    <div className="relative">
                      <div className="text-[10px] text-white/70">Good afternoon, Coach 👋</div>
                      <div className="text-sm leading-tight font-black">Let’s play ball, {base.split(' ')[0]}!</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[['OPEN LEADS', '17'], ['DUES', '$71.9K']].map(([l, v]) => (
                      <div key={l} className="rounded-lg p-2" style={{ background: draft.theme.dark }}>
                        <div className="text-[8px] font-bold tracking-widest text-slate-400">{l}</div>
                        <div className="score-digits text-lg font-black" style={{ color: draft.theme.accent }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-lg px-2 py-1 text-[11px] font-bold text-white" style={{ background: draft.theme.primary }}>+ Add lead</span>
                    <span className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-900" style={{ background: draft.theme.accent }}>💳 Remind</span>
                  </div>
                </div>
              </div>
            </div>
            {draft.website && (
              <p className="mt-2 truncate text-xs text-slate-500">From <a href={draft.website} target="_blank" rel="noreferrer" className="underline">{draft.website}</a></p>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Field label="Club name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, mascot: guessMascot(e.target.value, draft.mascot) })} /></Field>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colors</span>
                <Tabs value={slot} onChange={setSlot} options={[{ id: 'primary', label: <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: draft.theme.primary }} />Main</span> }, { id: 'accent', label: <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: draft.theme.accent }} />Accent</span> }]} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.swatches.map((hex) => (
                  <button key={hex} aria-label={`Use ${hex}`} onClick={() => setColor(hex)} className="h-8 w-8 rounded-full ring-1 ring-slate-300 transition hover:scale-110" style={{ background: hex }} />
                ))}
                <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-sm ring-1 ring-slate-300" title="Pick any color">
                  🎨<input type="color" className="sr-only" value={slot === 'primary' ? draft.theme.primary : draft.theme.accent} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Pick Main or Accent, then tap a color from their brand. Colors are adjusted automatically so text stays readable ({contrast(draft.theme.primary, '#ffffff').toFixed(1)}:1).</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={renameTeams} onChange={(e) => setRenameTeams(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
              <span>Rename demo teams to <b>{base} {ageEx}U</b>, etc.</span>
            </label>
            {draft.banner && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={useBanner} onChange={(e) => setUseBanner(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
                <span>Use their banner photo as header art</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="ghost" onClick={reset}>← Start over</Button>
              <span className="flex-1" />
              {draft.website && (
                <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(pitchLink(draft.website!)); toast('🔗', 'Pitch link copied!', 'Opens the demo already in their colors.') }}>🔗 Copy pitch link</Button>
              )}
              <Button onClick={doApply}>Make it theirs ⚾</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

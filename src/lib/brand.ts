// Brand kit → app theme. Color math is pure (unit-tested); canvas helpers run in the browser.
import type { ClubData, OrgSettings } from './types'

// ------------------------------------------------------------------ color math

export type RGB = [number, number, number]
export const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB
export const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Nudge lightness (keeping hue) until `color` reaches `ratio` against `against`. */
export function ensureContrast(color: string, against: string, ratio: number) {
  if (contrast(color, against) >= ratio) return color
  const [h, s, l] = rgbToHsl(hexToRgb(color))
  const lighten = luminance(against) < 0.2
  for (let i = 1; i <= 50; i++) {
    const nl = lighten ? Math.min(1, l + i * 0.02) : Math.max(0, l - i * 0.02)
    const c = rgbToHex(hslToRgb(h, s, nl))
    if (contrast(c, against) >= ratio) return c
  }
  return lighten ? '#ffffff' : '#000000'
}

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

// ------------------------------------------------------------------ palette

export interface Swatch {
  hex: string
  weight: number // share of visible pixels, 0..1
  chromatic: boolean
}

/** Bucket RGBA pixels into a small palette, most prominent first. */
export function paletteFromPixels(px: Uint8ClampedArray | number[], maxColors = 8): Swatch[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let visible = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    visible++
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bk.n++; bk.r += px[i]; bk.g += px[i + 1]; bk.b += px[i + 2]
    buckets.set(key, bk)
  }
  if (!visible) return []
  const raw = [...buckets.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as RGB, n: b.n }))
    .sort((a, b) => b.n - a.n)
  // Merge perceptually close buckets (anti-aliasing produces many near-duplicates).
  const merged: { rgb: RGB; n: number }[] = []
  for (const c of raw) {
    const near = merged.find((m) => Math.hypot(m.rgb[0] - c.rgb[0], m.rgb[1] - c.rgb[1], m.rgb[2] - c.rgb[2]) < 48)
    if (near) {
      const t = near.n + c.n
      near.rgb = near.rgb.map((v, i) => (v * near.n + c.rgb[i] * c.n) / t) as RGB
      near.n = t
    } else merged.push({ ...c })
  }
  return merged
    .filter((m) => m.n / visible >= 0.01)
    .slice(0, maxColors)
    .map((m) => {
      const [, s, l] = rgbToHsl(m.rgb)
      return { hex: rgbToHex(m.rgb), weight: m.n / visible, chromatic: s > 0.22 && l > 0.1 && l < 0.92 }
    })
}

export interface Theme {
  primary: string
  accent: string
  dark: string
}

export const DEFAULT_THEME: Theme = { primary: '#1d4ed8', accent: '#f59e0b', dark: '#0f1b33' }

/**
 * Pick app colors from what we found. Logo colors lead; site-declared colors
 * (theme-color, CSS) fill in. Output is adjusted for readable contrast:
 * primary carries white text, accent is read on the dark sidebar.
 */
export function pickTheme(logo: Swatch[], siteColors: string[] = []): Theme {
  const candidates: { hex: string; score: number }[] = []
  // Pixel averages drift a little (anti-aliasing, compression). If the site declares
  // a nearly identical color, use the site's exact hex.
  const snap = (hex: string) => {
    const rgb = hexToRgb(hex)
    const near = siteColors
      .map((c) => ({ c, d: Math.hypot(...hexToRgb(c).map((v, i) => v - rgb[i])) }))
      .sort((a, b) => a.d - b.d)[0]
    return near && near.d < 36 ? near.c : hex
  }
  logo.filter((s) => s.chromatic).forEach((s) => {
    const [, sat] = rgbToHsl(hexToRgb(s.hex))
    candidates.push({ hex: snap(s.hex), score: s.weight * (0.6 + sat) })
  })
  siteColors.forEach((hex, i) => {
    const [, s, l] = rgbToHsl(hexToRgb(hex))
    if (s > 0.22 && l > 0.08 && l < 0.92) candidates.push({ hex, score: 0.12 / (i + 1) })
  })
  candidates.sort((a, b) => b.score - a.score)

  let primary = candidates[0]?.hex
  if (!primary) {
    // Monochrome logo: use its darkest ink, or a classic navy.
    const darkInk = logo.filter((s) => !s.chromatic && luminance(s.hex) < 0.1).sort((a, b) => b.weight - a.weight)[0]
    primary = darkInk ? '#1f2937' : DEFAULT_THEME.primary
  }
  const [ph, ps] = rgbToHsl(hexToRgb(primary))
  const second = candidates.slice(1).find((c) => hueDist(rgbToHsl(hexToRgb(c.hex))[0], ph) >= 35)
  let accent = second?.hex
  if (!accent) {
    // One-color club: gold reads great with almost anything; pick a cooler accent for yellow/orange clubs.
    accent = ph >= 25 && ph <= 70 && ps > 0.3 ? '#38bdf8' : '#fbbf24'
  }

  const dark = rgbToHex(hslToRgb(ph, Math.min(ps, 0.6), 0.11))
  primary = ensureContrast(primary, '#ffffff', 4.5)
  accent = ensureContrast(accent, dark, 4.5)
  return { primary, accent, dark }
}

// ------------------------------------------------------------------ naming

const GENERIC_WORDS = /\b(baseball|softball|club|organization|org|association|assn|inc|llc|travel|youth|program|athletics|sports|team|teams|the|official|website|home|bc)\b/gi

/** "Tidewater Sharks Baseball Club" → "Tidewater Sharks" (used to name age-group teams). */
export function teamBaseName(clubName: string) {
  const base = clubName.replace(/[|–—:].*$/, '').replace(GENERIC_WORDS, ' ').replace(/\s+/g, ' ').trim()
  return base || clubName.trim()
}

const MASCOTS: [RegExp, string][] = [
  [/thunder|lightning|bolt|storm|volt|electric/i, '⚡'], [/eagle|hawk|falcon|osprey|raptor|bird|jays?|cardinal|oriole|owl/i, '🦅'],
  [/bear|grizzl|cubs?\b/i, '🐻'], [/shark|marlin|fish|barracuda/i, '🦈'], [/hurricane|tornado|cyclone|twister|wind/i, '🌪️'],
  [/fire|flame|blaze|heat|inferno|phoenix/i, '🔥'], [/hornet|bee|wasp|yellow ?jacket|sting/i, '🐝'], [/scorpion/i, '🦂'],
  [/wolf|wolves|husk(y|ies)/i, '🐺'], [/pirate|buccaneer|raider|corsair/i, '🏴‍☠️'], [/bison|buffalo|bull|longhorn|ram/i, '🦬'],
  [/gator|croc/i, '🐊'], [/rocket|astro|comet|jet/i, '🚀'], [/star|all-?star/i, '⭐'], [/snake|viper|cobra|python|rattler/i, '🐍'],
  [/lion|tiger|panther|cougar|jaguar|cat|lynx|bobcat|wildcat/i, '🐯'], [/dragon/i, '🐉'], [/knight|crusader|warrior|titan|spartan/i, '🛡️'],
  [/mustang|bronco|stallion|colt/i, '🐎'], [/dog|bulldog|hound/i, '🐶'], [/wave|tide|surf|ocean|wave/i, '🌊'], [/diamond|gem/i, '💎'],
]
export function guessMascot(name: string, fallback = '⚾') {
  return MASCOTS.find(([re]) => re.test(name))?.[1] ?? fallback
}

export function initialsOf(name: string) {
  const words = teamBaseName(name).split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w))
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? 'DH').slice(0, 2)).toUpperCase()
}

// ------------------------------------------------------------------ apply

export interface BrandChoice {
  name: string
  website?: string
  logo?: string | null
  banner?: string | null
  theme: Theme
  mascot: string
  email?: string | null
  renameTeams: boolean
}

/** Re-skin the club with a brand. Pure: returns new data. */
export function applyBrand(data: ClubData, b: BrandChoice): ClubData {
  const d = structuredClone(data)
  const settings: OrgSettings = {
    ...d.settings,
    name: b.name.trim() || d.settings.name,
    primaryColor: b.theme.primary,
    accentColor: b.theme.accent,
    darkColor: b.theme.dark,
    mascot: b.mascot,
    website: b.website,
    logo: b.logo ?? undefined,
    banner: b.banner ?? undefined,
    contactEmail: b.email || d.settings.contactEmail,
  }
  d.settings = settings
  if (b.renameTeams) {
    const base = teamBaseName(settings.name)
    const renames = new Map<string, string>()
    for (const t of d.teams) {
      const next = `${base} ${t.ageGroup}U`
      if (t.name !== next) renames.set(t.name, next)
      t.name = next
    }
    const swap = (s: string) => {
      for (const [from, to] of renames) s = s.split(from).join(to)
      return s
    }
    d.events.forEach((e) => (e.title = swap(e.title)))
    d.messages.forEach((m) => {
      m.subject = swap(m.subject)
      m.audienceLabel = swap(m.audienceLabel)
    })
    d.tasks.forEach((t) => (t.title = swap(t.title)))
  }
  d.activity.unshift({ id: `act_brand_${Date.now()}`, at: new Date().toISOString(), emoji: '🎨', text: `Dugout HQ is now dressed in ${settings.name} colors` })
  return d
}

// ------------------------------------------------------------------ browser helpers

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

/** Downscale an image (data URL) so it fits comfortably in local storage. */
export async function shrinkImage(src: string, maxSide: number, type: 'image/png' | 'image/jpeg' = 'image/png', quality = 0.85) {
  const img = await loadImage(src)
  const w = img.naturalWidth || 256, h = img.naturalHeight || 256
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL(type, quality)
}

export async function paletteFromImage(src: string) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  const side = 72
  const scale = side / Math.max(img.naturalWidth || side, img.naturalHeight || side)
  canvas.width = Math.max(1, Math.round((img.naturalWidth || side) * scale))
  canvas.height = Math.max(1, Math.round((img.naturalHeight || side) * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return paletteFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
}

export const readFileAsDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })

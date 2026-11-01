// Pure HTML → brand-hint extraction. No network, no Node APIs, so it's unit-testable.

export interface BrandHints {
  name: string | null
  description: string | null
  /** Logo candidates, best first, as absolute URLs. */
  logos: string[]
  /** Big promotional image (og:image / twitter:image), absolute URL. */
  banner: string | null
  /** Colors declared by the site (theme-color etc.), hex. */
  themeColors: string[]
  /** Most frequent non-neutral colors used in the page's inline CSS, hex. */
  cssColors: string[]
  /** Linked stylesheets worth scanning for colors, absolute URLs. */
  stylesheets: string[]
  email: string | null
}

type Attrs = Record<string, string>

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' }
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function parseAttrs(tag: string): Attrs {
  const out: Attrs = {}
  const re = /([^\s=/<>"']+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  return out
}

function tags(html: string, name: string): Attrs[] {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi')
  return (html.match(re) ?? []).map(parseAttrs)
}

function abs(url: string | undefined, base: string): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u || u.startsWith('data:') || u.startsWith('javascript:')) return null
  try {
    const r = new URL(u, base)
    return r.protocol === 'http:' || r.protocol === 'https:' ? r.href : null
  } catch {
    return null
  }
}

export function normalizeHex(c: string): string | null {
  const s = c.trim().toLowerCase()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
  return null
}

/** Is this hex a near-gray / near-white / near-black (not useful as a brand color)? */
export function isNeutralHex(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max - min < 28 || max < 24 || min > 235
}

/** Count brand-ish colors in CSS text, most frequent first. */
export function cssColorFrequency(css: string, limit = 8): string[] {
  const counts = new Map<string, number>()
  const re = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi
  for (const m of css.match(re) ?? []) {
    const hex = normalizeHex(m)
    if (!hex || isNeutralHex(hex)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([h]) => h)
}

const GENERIC_TITLE = /^(home|homepage|welcome|official (web)?site|index|main)$/i

/** "Home | Tidewater Sharks Baseball" → "Tidewater Sharks Baseball" */
export function cleanTitle(title: string): string {
  const parts = decodeEntities(title)
    .split(/\s+[|•·:–—-]\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter((p) => p && !GENERIC_TITLE.test(p))
  if (!parts.length) return decodeEntities(title).trim()
  return parts.find((p) => /baseball|softball|travel|club|academy|elite|select/i.test(p)) ?? parts.reduce((a, b) => (b.length > a.length ? b : a))
}

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]
      for (const i of items) if (i && typeof i === 'object') out.push(i)
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out
}

export function extractBrandHints(html: string, pageUrl: string): BrandHints {
  const head = html.slice(0, 400_000)
  const metas = tags(head, 'meta')
  const meta = (key: string) => metas.find((m) => (m.property ?? m.name ?? '').toLowerCase() === key)?.content?.trim() || null
  const links = tags(head, 'link')
  const ld = jsonLd(head)

  // ---- name
  const ldOrg = ld.find((i) => /SportsTeam|SportsOrganization|Organization|LocalBusiness/i.test(String(i['@type'] ?? '')))
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)
  const name =
    meta('og:site_name') ||
    (typeof ldOrg?.name === 'string' ? ldOrg.name : null) ||
    (titleMatch ? cleanTitle(titleMatch[1]) : null) ||
    meta('application-name')

  // ---- logo candidates (scored)
  const scored: { url: string; score: number }[] = []
  const add = (u: string | undefined | null, score: number) => {
    const a = abs(u ?? undefined, pageUrl)
    if (a) scored.push({ url: a, score })
  }
  for (const i of ld) {
    const logo = i.logo as unknown
    if (typeof logo === 'string') add(logo, 100)
    else if (logo && typeof logo === 'object' && typeof (logo as { url?: unknown }).url === 'string') add((logo as { url: string }).url, 100)
  }
  add(meta('og:logo'), 95)
  tags(html.slice(0, 600_000), 'img').forEach((img, idx) => {
    const hay = `${img.class ?? ''} ${img.id ?? ''} ${img.alt ?? ''} ${img.src ?? ''}`.toLowerCase()
    if (/logo|crest|emblem/.test(hay)) add(img.src ?? img['data-src'], 90 - Math.min(idx, 20))
  })
  for (const l of links) {
    const rel = (l.rel ?? '').toLowerCase()
    const size = Math.max(0, ...(l.sizes ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0))
    if (rel.includes('apple-touch-icon')) add(l.href, 70 + Math.min(size, 512) / 100)
    else if (/\bicon\b/.test(rel)) add(l.href, (l.href ?? '').endsWith('.svg') ? 66 : size >= 96 ? 60 + size / 100 : 35 + size / 100)
  }
  add(meta('msapplication-tileimage'), 50)
  const banner = abs(meta('og:image') ?? meta('og:image:url') ?? meta('twitter:image') ?? undefined, pageUrl)
  if (banner) add(banner, 20)
  add('/favicon.ico', 10)
  const seen = new Set<string>()
  const logos = scored.sort((a, b) => b.score - a.score).map((s) => s.url).filter((u) => !seen.has(u) && seen.add(u))

  // ---- colors
  const themeColors = [meta('theme-color'), meta('msapplication-tilecolor'), meta('msapplication-navbutton-color')]
    .map((c) => (c ? normalizeHex(c) : null))
    .filter((c): c is string => !!c && !isNeutralHex(c))
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + [...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';')
  const cssColors = cssColorFrequency(inlineCss)
  const stylesheets = links
    .filter((l) => (l.rel ?? '').toLowerCase().includes('stylesheet'))
    .map((l) => abs(l.href, pageUrl))
    .filter((u): u is string => !!u && !/fonts\.googleapis|font-awesome|fontawesome|bootstrap(\.min)?\.css|cdnjs/i.test(u))
    .slice(0, 3)

  const mail = /mailto:([^"'?\s>]+@[^"'?\s>]+)/i.exec(html)
  return {
    name: name ? decodeEntities(name).trim() : null,
    description: meta('og:description') ?? meta('description'),
    logos,
    banner,
    themeColors,
    cssColors,
    stylesheets,
    email: mail ? decodeEntities(mail[1]) : null,
  }
}

import { describe, expect, it } from 'vitest'
import { cleanTitle, cssColorFrequency, extractBrandHints } from '../../server/extract'
import { applyBrand, contrast, guessMascot, paletteFromPixels, pickTheme, teamBaseName } from './brand'
import { buildSeed } from './seed'

const SITE = `<!doctype html><html><head>
<title>Home | Tidewater Sharks Baseball</title>
<meta name="theme-color" content="#0E7490">
<meta property="og:image" content="/img/banner.jpg">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter">
<link rel="stylesheet" href="/css/site.css">
<style>.btn{background:#f97316}.nav{color:#0e7490;border-color:#F97316}body{color:#333;background:#fff}</style>
</head><body>
<header><a href="/"><img class="site-logo" src="/img/sharks-logo.svg" alt="Sharks"></a></header>
<a href="mailto:coach@tidewatersharks.com">Email us</a>
</body></html>`

describe('extractBrandHints', () => {
  const h = extractBrandHints(SITE, 'https://tidewatersharks.com/')
  it('finds the club name from the title', () => expect(h.name).toBe('Tidewater Sharks Baseball'))
  it('ranks a header logo image above icons, and resolves relative URLs', () => {
    expect(h.logos[0]).toBe('https://tidewatersharks.com/img/sharks-logo.svg')
    expect(h.logos[1]).toBe('https://tidewatersharks.com/apple-touch-icon.png')
    expect(h.logos).toContain('https://tidewatersharks.com/favicon.ico')
  })
  it('picks the share image as a banner', () => expect(h.banner).toBe('https://tidewatersharks.com/img/banner.jpg'))
  it('collects declared and CSS colors, ignoring neutrals', () => {
    expect(h.themeColors).toEqual(['#0e7490'])
    expect(h.cssColors.slice(0, 2).sort()).toEqual(['#0e7490', '#f97316'])
    expect(h.cssColors).not.toContain('#333333')
  })
  it('skips font/CDN stylesheets and finds the contact email', () => {
    expect(h.stylesheets).toEqual(['https://tidewatersharks.com/css/site.css'])
    expect(h.email).toBe('coach@tidewatersharks.com')
  })
  it('prefers og:site_name and JSON-LD logos', () => {
    const html = `<meta property="og:site_name" content="Bay Bombers &amp; Co"><script type="application/ld+json">{"@type":"SportsTeam","name":"X","logo":{"url":"https://cdn.x.com/l.png"}}</script>`
    const r = extractBrandHints(html, 'https://bb.com')
    expect(r.name).toBe('Bay Bombers & Co')
    expect(r.logos[0]).toBe('https://cdn.x.com/l.png')
  })
})

describe('naming helpers', () => {
  it('cleans page titles', () => {
    expect(cleanTitle('Welcome - Metro Mavericks Travel Baseball')).toBe('Metro Mavericks Travel Baseball')
    expect(cleanTitle('Bayside Bombers')).toBe('Bayside Bombers')
  })
  it('derives team base names and mascots', () => {
    expect(teamBaseName('Tidewater Sharks Baseball Club')).toBe('Tidewater Sharks')
    expect(teamBaseName('Metro Mavericks Travel Baseball')).toBe('Metro Mavericks')
    expect(guessMascot('Tidewater Sharks')).toBe('🦈')
    expect(guessMascot('Coastal Hurricanes')).toBe('🌪️')
    expect(guessMascot('Something Else')).toBe('⚾')
  })
  it('counts CSS colors by frequency', () => {
    expect(cssColorFrequency('a{color:#ff0000} b{color:#f00} c{color:rgb(0, 0, 255)}')).toEqual(['#ff0000', '#0000ff'])
  })
})

/** Build RGBA pixel data from [hex, count] pairs. */
const pixels = (...parts: [string, number][]) =>
  parts.flatMap(([hex, n]) => Array.from({ length: n }, () => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]).flat())

describe('palette + theme', () => {
  it('extracts dominant colors and ignores transparent pixels', () => {
    const px = [...pixels(['#0e7490', 600], ['#f97316', 250], ['#ffffff', 150]), ...Array(400).fill(0)]
    const pal = paletteFromPixels(px)
    expect(pal[0].hex).toBe('#0e7490')
    expect(pal[0].weight).toBeCloseTo(0.6, 2)
    expect(pal.find((s) => s.hex === '#ffffff')?.chromatic).toBe(false)
  })
  it('picks primary + contrasting accent and keeps text readable', () => {
    const t = pickTheme(paletteFromPixels(pixels(['#0e7490', 600], ['#f97316', 250], ['#ffffff', 150])))
    expect(t.primary).toBe('#0e7490')
    expect(contrast(t.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.accent, t.dark)).toBeGreaterThanOrEqual(4.5)
    expect(t.accent).not.toBe(t.primary)
  })
  it('darkens a too-light primary (yellow) so white text works', () => {
    const t = pickTheme(paletteFromPixels(pixels(['#facc15', 800])))
    expect(contrast(t.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('falls back sensibly for a black-and-white logo', () => {
    const t = pickTheme(paletteFromPixels(pixels(['#000000', 500], ['#ffffff', 500])))
    expect(t.primary).toBe('#1f2937')
    expect(contrast(t.accent, t.dark)).toBeGreaterThanOrEqual(4.5)
  })
  it('snaps slightly-off logo colors to the site’s exact brand hex', () => {
    const t = pickTheme(paletteFromPixels(pixels(['#11748e', 600], ['#e9731d', 300])), ['#0e7490', '#f97316'])
    expect(t.primary).toBe('#0e7490')
  })
  it('uses site colors when the logo has none', () => {
    const t = pickTheme([], ['#b91c1c', '#1d4ed8'])
    expect(t.primary).toBe('#b91c1c')
  })
})

describe('applyBrand', () => {
  it('re-skins settings and renames teams everywhere', () => {
    const d = buildSeed()
    const out = applyBrand(d, { name: 'Tidewater Sharks Baseball', website: 'https://ts.com/', logo: 'data:image/png;base64,AAA', banner: null, theme: { primary: '#0e7490', accent: '#fb923c', dark: '#0b2229' }, mascot: '🦈', email: 'coach@ts.com', renameTeams: true })
    expect(out.settings).toMatchObject({ name: 'Tidewater Sharks Baseball', primaryColor: '#0e7490', darkColor: '#0b2229', mascot: '🦈', contactEmail: 'coach@ts.com', logo: 'data:image/png;base64,AAA' })
    expect(out.teams.map((t) => t.name)).toContain('Tidewater Sharks 10U')
    expect(out.events.some((e) => e.title.includes('Thunder'))).toBe(false)
    expect(out.events.some((e) => e.title === 'Tidewater Sharks 12U Practice')).toBe(true)
    expect(d.teams[0].name).toBe('Thunder 9U') // input untouched
  })
})

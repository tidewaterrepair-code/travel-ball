// Server-side: fetch a club website and return its brand kit.
// Runs in the Vite dev/preview server and as a serverless function (api/brand.ts).
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { cssColorFrequency, extractBrandHints } from './extract.js'

export interface BrandKit {
  url: string
  name: string | null
  description: string | null
  email: string | null
  /** data: URI so the browser can read pixels and store it offline */
  logo: string | null
  banner: string | null
  themeColors: string[]
  cssColors: string[]
}

export class LookupError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const UA = 'Mozilla/5.0 (compatible; DugoutHQ-BrandBot/1.0; +https://github.com/)'
const MAX_HTML = 2_000_000
const MAX_CSS = 600_000
const MAX_IMAGE = 3_000_000
const TIMEOUT_MS = 9000

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  )
}

/** Block requests to localhost / private networks (SSRF protection). */
async function assertPublicUrl(raw: string) {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new LookupError('That doesn’t look like a web address.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LookupError('Only http and https addresses are supported.')
  if (u.username || u.password) throw new LookupError('Web addresses with passwords aren’t supported.')
  if (process.env.BRAND_ALLOW_PRIVATE === '1') return u
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new LookupError('That address isn’t public.')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new LookupError(`Couldn’t find ${host}. Check the spelling?`, 404)
  })
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new LookupError('That address isn’t public.')
  return u
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > max) throw new LookupError('File too large', 413)
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new LookupError('File too large', 413)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

/** fetch with manual redirects so every hop is re-checked against the SSRF guard. */
async function safeFetch(url: string, max: number, accept: string) {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current)
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.8' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current).href
      continue
    }
    if (!res.ok) throw new LookupError(`The site answered ${res.status}.`, 502)
    return { finalUrl: current, type: res.headers.get('content-type') ?? '', body: await readCapped(res, max) }
  }
  throw new LookupError('Too many redirects.', 502)
}

function sniffImageType(b: Uint8Array, declared: string): string | null {
  const head = new TextDecoder().decode(b.slice(0, 256)).trimStart().toLowerCase()
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp'
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon'
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return declared.startsWith('image/') ? declared.split(';')[0] : null
}

async function fetchImage(url: string): Promise<string | null> {
  try {
    const { body, type } = await safeFetch(url, MAX_IMAGE, 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8')
    const mime = sniffImageType(body, type)
    if (!mime || body.byteLength < 100) return null
    return `data:${mime};base64,${Buffer.from(body).toString('base64')}`
  } catch {
    return null
  }
}

export function normalizeInputUrl(input: string) {
  let s = input.trim()
  if (!s) throw new LookupError('Enter the club’s web address.')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s
}

export async function lookupBrand(input: string): Promise<BrandKit> {
  const url = normalizeInputUrl(input)
  let page
  try {
    page = await safeFetch(url, MAX_HTML, 'text/html,application/xhtml+xml')
  } catch (e) {
    if (e instanceof LookupError) throw e
    throw new LookupError('Couldn’t reach that website. It may be down or blocking lookups. Try uploading their logo instead.', 502)
  }
  if (!/html|xml|text\/plain/i.test(page.type) && page.type) throw new LookupError('That address isn’t a web page.', 422)
  const html = new TextDecoder().decode(page.body)
  const hints = extractBrandHints(html, page.finalUrl)

  // Linked CSS often holds the real brand colors.
  let cssColors = hints.cssColors
  if (cssColors.length < 3 && hints.stylesheets.length) {
    const sheets = await Promise.all(
      hints.stylesheets.map((s) => safeFetch(s, MAX_CSS, 'text/css').then((r) => new TextDecoder().decode(r.body)).catch(() => '')),
    )
    cssColors = cssColorFrequency(cssColors.join(' ') + '\n' + sheets.join('\n'))
  }

  // First logo candidate that actually downloads as an image wins.
  let logo: string | null = null
  for (const candidate of hints.logos.slice(0, 6)) {
    if (candidate === hints.banner && hints.logos.indexOf(candidate) > 0) continue
    logo = await fetchImage(candidate)
    if (logo) break
  }
  const banner = hints.banner ? await fetchImage(hints.banner) : null

  return {
    url: page.finalUrl,
    name: hints.name,
    description: hints.description,
    email: hints.email,
    logo,
    banner: banner && banner !== logo ? banner : null,
    themeColors: hints.themeColors,
    cssColors,
  }
}

/** Shared HTTP handler body: returns [status, json]. */
export async function handleBrandRequest(rawUrl: string | null): Promise<[number, unknown]> {
  if (!rawUrl) return [400, { error: 'Add ?url=their-website.com' }]
  try {
    return [200, await lookupBrand(rawUrl)]
  } catch (e) {
    if (e instanceof LookupError) return [e.status, { error: e.message }]
    return [500, { error: 'Something went wrong reading that site. Try uploading their logo instead.' }]
  }
}

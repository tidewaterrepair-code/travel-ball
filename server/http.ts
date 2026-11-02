import type { IncomingMessage, ServerResponse } from 'node:http'

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
}

export function send(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type, ...extra })
  res.end(body)
}

export const json = (res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) =>
  send(res, status, JSON.stringify(body), 'application/json', { 'cache-control': 'no-store', ...extra })

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function readJson<T>(req: IncomingMessage, maxBytes = 8_000_000): Promise<T> {
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Expected JSON')
  const chunks: Buffer[] = []
  let total = 0
  for await (const c of req) {
    total += (c as Buffer).length
    if (total > maxBytes) throw new HttpError(413, 'Too large')
    chunks.push(c as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

export function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function clientIp(req: IncomingMessage) {
  // Behind Caddy on the same box, the real address is the first X-Forwarded-For entry.
  const fwd = process.env.TRUST_PROXY !== '0' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  return fwd || req.socket.remoteAddress || 'unknown'
}

/** Simple fixed-window rate limiter keyed by bucket+ip. */
const hits = new Map<string, { count: number; reset: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k)
}, 60_000).unref()

export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  return ++h.count <= limit
}

/** Public base URL used in emailed links. */
export function appUrl(req: IncomingMessage) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]
  return `${proto}://${req.headers.host ?? 'localhost'}`
}

/** CSRF protection for cookie-authenticated writes: the request must come from our own pages. */
export function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return req.headers['sec-fetch-site'] === 'same-origin' || req.headers['sec-fetch-site'] === undefined
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

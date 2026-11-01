// Production server for a VPS: serves the built app and the /api/brand lookup.
// Zero runtime dependencies. Build with `npm run build`, run with `npm start`.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import { handleBrandRequest } from './brandLookup.js'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const ROOT = resolve(process.env.STATIC_DIR ?? join(process.cwd(), 'dist'))
/** Website lookups allowed per IP per minute (the endpoint fetches other sites, so keep it modest). */
const LOOKUP_LIMIT = Number(process.env.BRAND_RATE_LIMIT ?? 20)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt'])

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
}

// ---------------------------------------------------------------- rate limit
const hits = new Map<string, { count: number; reset: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [ip, h] of hits) if (h.reset < now) hits.delete(ip)
}, 60_000).unref()

function clientIp(req: IncomingMessage) {
  // Behind Caddy/nginx on the same box the real address is in X-Forwarded-For.
  const fwd = process.env.TRUST_PROXY !== '0' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  return fwd || req.socket.remoteAddress || 'unknown'
}

function allow(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 })
    return true
  }
  h.count++
  return h.count <= LOOKUP_LIMIT
}

// ---------------------------------------------------------------- handlers
function send(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type, ...extra })
  res.end(body)
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  let rel: string
  try {
    rel = decodeURIComponent(pathname)
  } catch {
    return send(res, 400, 'Bad request')
  }
  if (rel.includes('\0')) return send(res, 400, 'Bad request')
  let file = normalize(join(ROOT, rel))
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden')

  let info = await stat(file).catch(() => null)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info) {
    // The app uses hash routing, so unknown paths fall back to the app shell.
    if (extname(rel)) return send(res, 404, 'Not found')
    file = join(ROOT, 'index.html')
    info = await stat(file).catch(() => null)
    if (!info) return send(res, 500, 'App not built. Run `npm run build` first.')
  }

  const ext = extname(file).toLowerCase()
  const hashed = file.includes(`${sep}assets${sep}`)
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'last-modified': info.mtime.toUTCString(),
  }
  if (!hashed && req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']).getTime() >= Math.floor(info.mtime.getTime() / 1000) * 1000) {
    res.writeHead(304, headers)
    return res.end()
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    return res.end()
  }
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && info.size > 1024) {
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' })
    createReadStream(file).pipe(createGzip()).pipe(res)
  } else {
    res.writeHead(200, { ...headers, 'content-length': String(info.size) })
    createReadStream(file).pipe(res)
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', undefined, { allow: 'GET, HEAD' })

  if (url.pathname === '/healthz') return send(res, 200, JSON.stringify({ ok: true }), 'application/json', { 'cache-control': 'no-store' })

  if (url.pathname === '/api/brand') {
    const ip = clientIp(req)
    if (!allow(ip)) return send(res, 429, JSON.stringify({ error: 'Too many lookups. Wait a minute and try again.' }), 'application/json', { 'retry-after': '60' })
    const [status, body] = await handleBrandRequest(url.searchParams.get('url'))
    console.log(`[brand] ${ip} ${status} ${url.searchParams.get('url')}`)
    return send(res, status, JSON.stringify(body), 'application/json', { 'cache-control': status === 200 ? 'private, max-age=3600' : 'no-store' })
  }

  return serveStatic(req, res, url.pathname)
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e)
    if (!res.headersSent) send(res, 500, 'Server error')
    else res.end()
  })
})
server.requestTimeout = 30_000
server.headersTimeout = 15_000

readFile(join(ROOT, 'index.html'))
  .then(() => console.log(`Serving ${ROOT}`))
  .catch(() => console.warn(`⚠ ${ROOT}/index.html not found. Run \`npm run build\` before \`npm start\`.`))

server.listen(PORT, HOST, () => console.log(`⚾ Dugout HQ listening on http://${HOST}:${PORT}`))

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

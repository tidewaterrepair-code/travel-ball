// JSON API: auth (email sign-in links), club data sync, staff, public signup, super-admin.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ClubData, Lead, LeadSource, Position, Registration } from '../src/lib/types.js'
import { LEAD_SOURCES, POSITIONS } from '../src/lib/types.js'
import { addLead } from '../src/lib/ops.js'
import { buildEmpty, buildSeed } from '../src/lib/seed.js'
import { applyBrand, DEFAULT_THEME, guessMascot } from '../src/lib/brand.js'
import * as db from './db.js'
import { emailConfigured, loginEmail, sendEmail } from './email.js'
import { HttpError, appUrl, clientIp, cookies, json, rateLimit, readJson, sameOrigin, send } from './http.js'

const COOKIE = 'dhq_session'
const superAdmins = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const isSuperAdmin = (u: db.User | null) => !!u && superAdmins().includes(u.email.toLowerCase())
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

function currentUser(req: IncomingMessage) {
  return db.sessionUser(cookies(req)[COOKIE])
}

function requireUser(req: IncomingMessage) {
  const u = currentUser(req)
  if (!u) throw new HttpError(401, 'Please sign in.')
  return u
}

function clubAccess(req: IncomingMessage, slug: string, need: 'coach' | 'admin' = 'coach') {
  const user = requireUser(req)
  const club = db.clubBySlug(slug)
  if (!club) throw new HttpError(404, 'Club not found.')
  const role: db.Role | null = isSuperAdmin(user) ? 'admin' : db.roleIn(user.id, club.id)
  if (!role) throw new HttpError(403, 'You don’t have access to this club.')
  if (need === 'admin' && role !== 'admin') throw new HttpError(403, 'Only club admins can do that.')
  return { user, club, role }
}

function sessionCookie(req: IncomingMessage, token: string, maxAge: number) {
  const secure = appUrl(req).startsWith('https://') ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n.slice(0, 300) : null)

// ------------------------------------------------------------------ data validation

function isClubData(x: unknown): x is ClubData {
  if (!x || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  const arrays = ['teams', 'families', 'players', 'leads', 'events', 'registrations', 'templates', 'messages', 'tasks', 'automations', 'shoutouts', 'activity']
  return d.version === 1 && !!d.settings && typeof d.settings === 'object' && typeof (d.settings as { name?: unknown }).name === 'string' && arrays.every((k) => Array.isArray(d[k]))
}

/** Money fields a coach may not change (only admins handle dues). */
const moneyPrint = (r: Registration) => JSON.stringify([r.fee, r.discount, r.fundraisingCredit, r.plan, r.firstDueDate, r.payments])

export function coachViolation(before: ClubData, after: ClubData): string | null {
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) return 'Only club admins can change club settings.'
  if (JSON.stringify(before.templates) !== JSON.stringify(after.templates)) return 'Only club admins can edit message templates.'
  const auto = (d: ClubData) => JSON.stringify(d.automations.map((a) => [a.id, a.enabled]))
  if (auto(before) !== auto(after)) return 'Only club admins can turn automations on or off.'
  const next = new Map(after.registrations.map((r) => [r.id, r]))
  for (const r of before.registrations) {
    const n = next.get(r.id)
    if (!n || moneyPrint(n) !== moneyPrint(r)) return 'Only club admins can change dues and payments.'
  }
  const old = new Set(before.registrations.map((r) => r.id))
  if (after.registrations.some((r) => !old.has(r.id) && r.payments.length > 0)) return 'Only club admins can record payments.'
  return null
}

// ------------------------------------------------------------------ public info (tryout signup page)

export function publicClubInfo(d: ClubData) {
  const s = d.settings
  return {
    settings: { name: s.name, mascot: s.mascot, primaryColor: s.primaryColor, accentColor: s.accentColor, darkColor: s.darkColor, logo: s.logo, banner: s.banner, seasonYear: s.seasonYear, ageCutoffMonth: s.ageCutoffMonth, ageCutoffDay: s.ageCutoffDay, contactEmail: s.contactEmail, city: s.city, defaultFee: s.defaultFee },
    teams: d.teams.map((t) => ({ id: t.id, name: t.name, ageGroup: t.ageGroup, headCoach: t.headCoach, rosterLimit: t.rosterLimit, color: t.color })),
    // Just enough to compute open roster spots, nothing identifying.
    rosterCounts: Object.fromEntries(d.teams.map((t) => [t.id, d.players.filter((p) => p.teamId === t.id && p.status === 'active').length])),
    tryouts: d.events
      .filter((e) => e.type === 'tryout' && new Date(e.end) >= new Date())
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, location: e.location, notes: e.notes })),
  }
}

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function sanitizeLead(b: Record<string, unknown>) {
  const lead = {
    parentName: str(b.parentName),
    email: str(b.email, 200).toLowerCase(),
    phone: str(b.phone, 40),
    playerFirst: str(b.playerFirst, 60),
    playerLast: str(b.playerLast, 60),
    birthDate: str(b.birthDate, 10),
    positions: (Array.isArray(b.positions) ? b.positions : []).filter((p): p is Position => POSITIONS.includes(p as Position)).slice(0, 10),
    experience: str(b.experience, 500),
    source: (LEAD_SOURCES.includes(b.source as LeadSource) ? b.source : 'Website') as LeadSource,
  }
  if (!lead.parentName || !lead.playerFirst || !lead.playerLast || !EMAIL_RE.test(lead.email) || !/^\d{4}-\d{2}-\d{2}$/.test(lead.birthDate))
    throw new HttpError(400, 'Please fill in the player’s name, birthday, and a parent name and email.')
  return lead satisfies Omit<Lead, 'id' | 'stage' | 'createdAt' | 'updatedAt'>
}

// ------------------------------------------------------------------ sign-in pages (server-rendered, tiny)

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1b33;font-family:system-ui,sans-serif;color:#0f172a}
.card{background:#fff;border-radius:24px;padding:32px;max-width:380px;width:calc(100% - 32px);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}
button,a.btn{display:inline-block;background:#1d4ed8;color:#fff;border:0;border-radius:12px;padding:12px 22px;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none}
p{color:#475569}</style></head><body><div class="card"><div style="font-size:48px">⚾</div>${body}</div></body></html>`
}

// ------------------------------------------------------------------ router

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL) => unknown
const routes: [string, RegExp, Handler][] = []
const route = (method: string, pattern: RegExp, h: Handler) => routes.push([method, pattern, h])

// --- auth
route('POST', /^\/api\/auth\/request$/, async (req, res) => {
  const body = await readJson<{ email?: string; next?: string }>(req, 10_000)
  const email = str(body.email, 200).toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  const ip = clientIp(req)
  if (!rateLimit(`login-ip:${ip}`, 10, 15 * 60_000) || !rateLimit(`login-email:${email}`, 5, 15 * 60_000))
    throw new HttpError(429, 'Too many sign-in requests. Try again in a few minutes.')
  const existing = db.findUserByEmail(email)
  const user = existing ?? (superAdmins().includes(email) ? db.findOrCreateUser(email) : null)
  // Same answer either way, so the form doesn't reveal who has an account.
  if (user) {
    const token = db.createLoginToken(user.id, safeNext(body.next), 30)
    const link = `${appUrl(req)}/auth/verify?t=${token}`
    await sendEmail({ ...loginEmail(link, null), to: user.email })
  }
  json(res, 200, { ok: true, emailConfigured: emailConfigured() })
})

route('GET', /^\/auth\/verify$/, (req, res, _p, url) => {
  // A button + POST, so email link-scanners can't burn the one-time link.
  const t = (url.searchParams.get('t') ?? '').replace(/[^A-Za-z0-9_-]/g, '')
  send(res, 200, page('Sign in · Dugout HQ', `<h2>Welcome back!</h2><p>Tap below to finish signing in.</p>
    <form method="post" action="/auth/verify"><input type="hidden" name="t" value="${t}"><button type="submit">Sign in to Dugout HQ</button></form>`), 'text/html; charset=utf-8', { 'cache-control': 'no-store' })
})

route('POST', /^\/auth\/verify$/, async (req, res) => {
  if (!sameOrigin(req)) throw new HttpError(403, 'Bad origin')
  let raw = ''
  for await (const c of req) {
    raw += c
    if (raw.length > 2000) throw new HttpError(413, 'Too large')
  }
  const token = new URLSearchParams(raw).get('t') ?? ''
  const result = db.consumeLoginToken(token)
  if (!result) {
    return send(res, 400, page('Link expired · Dugout HQ', `<h2>That link has expired</h2><p>Sign-in links work once and expire. Request a fresh one.</p><a class="btn" href="/login">Get a new link</a>`), 'text/html; charset=utf-8')
  }
  const session = db.createSession(result.userId)
  const user = db.sessionUser(session)!
  const mine = db.memberships(user.id)
  const dest = safeNext(result.next) ?? (mine.length === 1 ? `/c/${mine[0].slug}/` : isSuperAdmin(user) ? '/admin' : '/login?pick=1')
  res.writeHead(303, { location: dest, 'set-cookie': sessionCookie(req, session, db.SESSION_DAYS * 86400), 'cache-control': 'no-store' })
  res.end()
})

route('POST', /^\/api\/auth\/logout$/, (req, res) => {
  const t = cookies(req)[COOKIE]
  if (t) db.deleteSession(t)
  json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) })
})

route('GET', /^\/api\/me$/, (req, res) => {
  const user = currentUser(req)
  if (!user) return json(res, 200, { user: null })
  const clubs = isSuperAdmin(user)
    ? db.allClubs().map((c) => ({ slug: c.slug, name: c.name, role: 'admin' as const }))
    : db.memberships(user.id).map((m) => ({ slug: m.slug, name: m.name, role: m.role }))
  json(res, 200, { user: { id: user.id, email: user.email }, clubs, superAdmin: isSuperAdmin(user), emailConfigured: emailConfigured() })
})

// --- club data
route('GET', /^\/api\/clubs\/([a-z0-9-]+)\/data$/, (req, res, [slug], url) => {
  const { club, role, user } = clubAccess(req, slug)
  const since = Number(url.searchParams.get('since') ?? -1)
  if (since === club.version) {
    res.writeHead(204, { 'cache-control': 'no-store' })
    return res.end()
  }
  const { version, data } = db.clubData(club.id)
  json(res, 200, { version, data, role, user: { email: user.email } })
})

route('PUT', /^\/api\/clubs\/([a-z0-9-]+)\/data$/, async (req, res, [slug]) => {
  const { club, role } = clubAccess(req, slug)
  const body = await readJson<{ baseVersion?: number; data?: unknown }>(req)
  if (typeof body.baseVersion !== 'number' || !isClubData(body.data)) throw new HttpError(400, 'Invalid club data.')
  const current = db.clubData(club.id)
  if (current.version !== body.baseVersion) return json(res, 409, current)
  if (role === 'coach') {
    const why = coachViolation(current.data, body.data)
    if (why) throw new HttpError(403, why)
  }
  const version = db.saveClubData(club.id, body.baseVersion, body.data)
  if (version == null) return json(res, 409, db.clubData(club.id))
  json(res, 200, { version })
})

// --- staff
route('GET', /^\/api\/clubs\/([a-z0-9-]+)\/members$/, (req, res, [slug]) => {
  const { club } = clubAccess(req, slug, 'admin')
  json(res, 200, { members: db.clubMembers(club.id) })
})

route('POST', /^\/api\/clubs\/([a-z0-9-]+)\/members$/, async (req, res, [slug]) => {
  const { club, user } = clubAccess(req, slug, 'admin')
  const body = await readJson<{ email?: string; role?: string }>(req, 10_000)
  const email = str(body.email, 200).toLowerCase()
  const role: db.Role = body.role === 'admin' ? 'admin' : 'coach'
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  if (!rateLimit(`invite:${user.id}`, 30, 60 * 60_000)) throw new HttpError(429, 'Too many invites. Try again later.')
  const invitee = db.findOrCreateUser(email)
  const elsewhere = db.memberships(invitee.id).some((m) => m.club_id !== club.id) || isSuperAdmin(invitee)
  db.setMembership(invitee.id, club.id, role)
  const token = db.createLoginToken(invitee.id, `/c/${club.slug}/`, 60 * 24 * 7)
  const link = `${appUrl(req)}/auth/verify?t=${token}`
  const emailed = await sendEmail({ ...loginEmail(link, club.name, user.email), to: email })
  // Only hand the link back if it can't open anyone's *other* clubs.
  json(res, 200, { ok: true, emailed, link: elsewhere ? null : link })
})

route('DELETE', /^\/api\/clubs\/([a-z0-9-]+)\/members\/(\d+)$/, (req, res, [slug, id]) => {
  const { club } = clubAccess(req, slug, 'admin')
  const members = db.clubMembers(club.id)
  const target = members.find((m) => m.id === Number(id))
  if (!target) throw new HttpError(404, 'Not a member.')
  if (target.role === 'admin' && members.filter((m) => m.role === 'admin').length === 1) throw new HttpError(400, 'A club needs at least one admin.')
  db.removeMembership(target.id, club.id)
  json(res, 200, { ok: true })
})

// --- public tryout signup
route('GET', /^\/api\/public\/clubs\/([a-z0-9-]+)$/, (_req, res, [slug]) => {
  const club = db.clubBySlug(slug)
  if (!club) throw new HttpError(404, 'Club not found.')
  json(res, 200, publicClubInfo(db.clubData(club.id).data), { 'cache-control': 'public, max-age=60' })
})

route('POST', /^\/api\/public\/clubs\/([a-z0-9-]+)\/leads$/, async (req, res, [slug]) => {
  const club = db.clubBySlug(slug)
  if (!club) throw new HttpError(404, 'Club not found.')
  const body = await readJson<Record<string, unknown>>(req, 20_000)
  if (body.website) return json(res, 200, { ok: true }) // honeypot: bots fill hidden fields
  if (!rateLimit(`lead:${slug}:${clientIp(req)}`, 6, 10 * 60_000)) throw new HttpError(429, 'Too many signups from this device. Try again shortly.')
  const lead = sanitizeLead(body)
  db.updateClubData(club.id, (d) => addLead(d, { ...lead, stage: 'new' }).data)
  json(res, 200, { ok: true })
})

// --- super admin (you)
route('GET', /^\/api\/admin\/clubs$/, (req, res) => {
  if (!isSuperAdmin(requireUser(req))) throw new HttpError(403, 'Admins only.')
  json(res, 200, { clubs: db.allClubs() })
})

route('POST', /^\/api\/admin\/clubs$/, async (req, res) => {
  if (!isSuperAdmin(requireUser(req))) throw new HttpError(403, 'Admins only.')
  const b = await readJson<{ name?: string; slug?: string; ownerEmail?: string; demo?: boolean }>(req, 10_000)
  const name = str(b.name, 80)
  const slug = str(b.slug, 40).toLowerCase()
  const ownerEmail = str(b.ownerEmail, 200).toLowerCase()
  if (!name) throw new HttpError(400, 'Club name is required.')
  if (!SLUG_RE.test(slug) || ['admin', 'api', 'login', 'auth', 'assets'].includes(slug)) throw new HttpError(400, 'Web address can use lowercase letters, numbers and dashes.')
  if (!EMAIL_RE.test(ownerEmail)) throw new HttpError(400, 'Owner email is invalid.')
  if (db.clubBySlug(slug)) throw new HttpError(409, 'That web address is taken.')

  let data = b.demo ? buildSeed() : buildEmpty()
  data = applyBrand(data, { name, theme: DEFAULT_THEME, mascot: guessMascot(name), renameTeams: true, email: ownerEmail })
  data.activity = [{ id: `act_${Date.now()}`, at: new Date().toISOString(), emoji: '⚾', text: `Welcome to Dugout HQ, ${name}!` }, ...(b.demo ? data.activity.slice(1) : [])]
  const club = db.createClub(slug, data)
  const owner = db.findOrCreateUser(ownerEmail)
  db.setMembership(owner.id, club.id, 'admin')
  const link = `${appUrl(req)}/auth/verify?t=${db.createLoginToken(owner.id, `/c/${slug}/`, 60 * 24 * 7)}`
  const emailed = await sendEmail({ ...loginEmail(link, name, 'Dugout HQ'), to: ownerEmail })
  json(res, 200, { club, link, emailed, url: `${appUrl(req)}/c/${slug}/` })
})

/** Returns true if the request was an API/auth route. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return false
  const match = routes.find(([m, re]) => m === req.method && re.test(url.pathname))
  if (!match) {
    if (url.pathname === '/api/brand') return false // handled by the brand lookup
    json(res, 404, { error: 'Not found' })
    return true
  }
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) throw new HttpError(403, 'Bad origin')
    const params = match[1].exec(url.pathname)!.slice(1)
    await match[2](req, res, params, url)
  } catch (e) {
    if (e instanceof HttpError) json(res, e.status, { error: e.message })
    else {
      console.error(e)
      json(res, 500, { error: 'Something went wrong. Please try again.' })
    }
  }
  return true
}

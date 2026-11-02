import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import * as db from './db'
import { handleApi } from './api'
import type { ClubData } from '../src/lib/types'

let server: Server
let base = ''
let dir = ''

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dugout-test-'))
  db.useDatabase(join(dir, 'test.db'))
  process.env.ADMIN_EMAILS = 'boss@dugouthq.test'
  delete process.env.RESEND_API_KEY
  process.env.TRUST_PROXY = '0'
  server = createServer((req, res) => void handleApi(req, res).then((h) => !h && (res.statusCode = 404, res.end())))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // Keep the "email not configured" logs out of the test output.
  console.log = () => {}
})
afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

async function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; origin?: string; form?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.origin) headers.origin = opts.origin
  let body: string | undefined
  if (opts.form !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const res = await fetch(base + path, { method: opts.method ?? 'GET', headers, body, redirect: 'manual' })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    /* html or empty */
  }
  return { status: res.status, json: json as Record<string, unknown> & { data?: ClubData; version?: number; error?: string }, headers: res.headers, text }
}

/** Sign in by consuming a one-time link token like the browser does. */
async function signIn(token: string) {
  const r = await req('/auth/verify', { method: 'POST', form: `t=${token}` })
  expect(r.status).toBe(303)
  const cookie = r.headers.get('set-cookie')!.split(';')[0]
  return { cookie, location: r.headers.get('location') }
}
const tokenFrom = (link: string) => new URL(link).searchParams.get('t')!

let admin = ''
let owner = ''
let coach = ''
let ownerLink = ''

describe('sign-in', () => {
  it('answers the same for unknown emails and creates no account', async () => {
    const r = await req('/api/auth/request', { method: 'POST', body: { email: 'nobody@x.com' } })
    expect(r.status).toBe(200)
    expect(db.findUserByEmail('nobody@x.com')).toBeUndefined()
  })
  it('lets a super admin in and sends them to the console', async () => {
    const u = db.findOrCreateUser('boss@dugouthq.test')
    const s = await signIn(db.createLoginToken(u.id, null))
    admin = s.cookie
    expect(s.location).toBe('/admin')
    const me = await req('/api/me', { cookie: admin })
    expect(me.json.superAdmin).toBe(true)
  })
  it('one-time links cannot be reused, and GET never consumes them', async () => {
    const u = db.findOrCreateUser('boss@dugouthq.test')
    const t = db.createLoginToken(u.id, null)
    const get = await req(`/auth/verify?t=${t}`)
    expect(get.status).toBe(200)
    expect(get.text).toContain('<form method="post"')
    await signIn(t)
    expect((await req('/auth/verify', { method: 'POST', form: `t=${t}` })).status).toBe(400)
  })
})

describe('admin creates a club', () => {
  it('validates input', async () => {
    const bad = await req('/api/admin/clubs', { method: 'POST', cookie: admin, body: { name: 'X', slug: 'Bad Slug!', ownerEmail: 'a@b.co' } })
    expect(bad.status).toBe(400)
    const anon = await req('/api/admin/clubs', { method: 'POST', body: { name: 'X', slug: 'x', ownerEmail: 'a@b.co' } })
    expect(anon.status).toBe(401)
  })
  it('creates a branded club with sample data and an owner link', async () => {
    const r = await req('/api/admin/clubs', { method: 'POST', cookie: admin, body: { name: 'Tidewater Sharks Baseball', slug: 'sharks', ownerEmail: 'owner@sharks.test', demo: true } })
    expect(r.status).toBe(200)
    ownerLink = r.json.link as string
    expect(r.json.emailed).toBe(false)
    const dup = await req('/api/admin/clubs', { method: 'POST', cookie: admin, body: { name: 'Again', slug: 'sharks', ownerEmail: 'o@s.test' } })
    expect(dup.status).toBe(409)
    const s = await signIn(tokenFrom(ownerLink))
    owner = s.cookie
    expect(s.location).toBe('/c/sharks/')
  })
})

describe('club data', () => {
  it('loads the club, with teams renamed to the club', async () => {
    const r = await req('/api/clubs/sharks/data', { cookie: owner })
    expect(r.status).toBe(200)
    expect(r.json.role).toBe('admin')
    expect(r.json.data!.teams[0].name).toBe('Tidewater Sharks 9U')
    expect((await req(`/api/clubs/sharks/data?since=${r.json.version}`, { cookie: owner })).status).toBe(204)
  })
  it('saves with optimistic concurrency (stale saves get 409 + latest)', async () => {
    const cur = await req('/api/clubs/sharks/data', { cookie: owner })
    const d = cur.json.data!
    d.tasks.unshift({ id: 't1', title: 'Order bats', due: '2026-11-05', done: false, assignee: 'Me', createdAt: '' })
    const ok = await req('/api/clubs/sharks/data', { method: 'PUT', cookie: owner, body: { baseVersion: cur.json.version, data: d } })
    expect(ok.status).toBe(200)
    expect(ok.json.version).toBe(cur.json.version! + 1)
    const stale = await req('/api/clubs/sharks/data', { method: 'PUT', cookie: owner, body: { baseVersion: cur.json.version, data: d } })
    expect(stale.status).toBe(409)
    expect(stale.json.data!.tasks[0].title).toBe('Order bats')
  })
  it('rejects junk and cross-site writes', async () => {
    const cur = await req('/api/clubs/sharks/data', { cookie: owner })
    expect((await req('/api/clubs/sharks/data', { method: 'PUT', cookie: owner, body: { baseVersion: cur.json.version, data: { hello: 1 } } })).status).toBe(400)
    const evil = await req('/api/clubs/sharks/data', { method: 'PUT', cookie: owner, origin: 'https://evil.example', body: { baseVersion: cur.json.version, data: cur.json.data } })
    expect(evil.status).toBe(403)
  })
  it('requires sign-in and membership', async () => {
    expect((await req('/api/clubs/sharks/data')).status).toBe(401)
    expect((await req('/api/clubs/nope/data', { cookie: owner })).status).toBe(404)
  })
})

describe('staff and roles', () => {
  it('owner invites a coach; link is returned for a brand-new user', async () => {
    const r = await req('/api/clubs/sharks/members', { method: 'POST', cookie: owner, body: { email: 'coach@sharks.test', role: 'coach' } })
    expect(r.status).toBe(200)
    expect(r.json.link).toBeTruthy()
    coach = (await signIn(tokenFrom(r.json.link as string))).cookie
    const members = await req('/api/clubs/sharks/members', { cookie: owner })
    expect((members.json.members as { email: string }[]).map((m) => m.email).sort()).toEqual(['coach@sharks.test', 'owner@sharks.test'])
  })
  it('coaches can run teams but not settings, money or staff', async () => {
    const cur = await req('/api/clubs/sharks/data', { cookie: coach })
    expect(cur.json.role).toBe('coach')
    const d = cur.json.data!
    d.tasks.unshift({ id: 't2', title: 'Rake the infield', due: '2026-11-05', done: false, assignee: 'Coach', createdAt: '' })
    const ok = await req('/api/clubs/sharks/data', { method: 'PUT', cookie: coach, body: { baseVersion: cur.json.version, data: d } })
    expect(ok.status).toBe(200)

    const s = structuredClone(d)
    s.settings.primaryColor = '#000000'
    expect((await req('/api/clubs/sharks/data', { method: 'PUT', cookie: coach, body: { baseVersion: ok.json.version, data: s } })).status).toBe(403)
    const m = structuredClone(d)
    m.registrations[0].payments.push({ id: 'x', amount: 50, date: '2026-11-01', method: 'Cash' })
    const money = await req('/api/clubs/sharks/data', { method: 'PUT', cookie: coach, body: { baseVersion: ok.json.version, data: m } })
    expect(money.status).toBe(403)
    expect(money.json.error).toMatch(/dues and payments/)
    expect((await req('/api/clubs/sharks/members', { cookie: coach })).status).toBe(403)
  })
  it('people from other clubs are kept out', async () => {
    const r = await req('/api/admin/clubs', { method: 'POST', cookie: admin, body: { name: 'Coastal Hurricanes', slug: 'canes', ownerEmail: 'owner@canes.test', demo: false } })
    const other = (await signIn(tokenFrom(r.json.link as string))).cookie
    expect((await req('/api/clubs/sharks/data', { cookie: other })).status).toBe(403)
  })
  it('invite links are not handed back for people who belong to other clubs', async () => {
    const r = await req('/api/clubs/sharks/members', { method: 'POST', cookie: owner, body: { email: 'owner@canes.test', role: 'coach' } })
    expect(r.status).toBe(200)
    expect(r.json.link).toBeNull()
  })
  it('a club always keeps an admin', async () => {
    const members = (await req('/api/clubs/sharks/members', { cookie: owner })).json.members as { id: number; email: string }[]
    const me = members.find((m) => m.email === 'owner@sharks.test')!
    expect((await req(`/api/clubs/sharks/members/${me.id}`, { method: 'DELETE', cookie: owner })).status).toBe(400)
  })
})

describe('public tryout signup', () => {
  it('shares only public info', async () => {
    const r = await req('/api/public/clubs/sharks')
    expect(r.status).toBe(200)
    const text = JSON.stringify(r.json)
    expect(text).toContain('Tidewater Sharks')
    expect(text).not.toMatch(/fam\.@example\.com|families|registrations|medical/)
  })
  it('adds a lead to the club board and runs the thank-you automation', async () => {
    const before = (await req('/api/clubs/sharks/data', { cookie: owner })).json.data!
    const r = await req('/api/public/clubs/sharks/leads', { method: 'POST', body: { parentName: 'Pat Lee', email: 'pat@lee.test', phone: '555', playerFirst: 'Sam', playerLast: 'Lee', birthDate: '2016-03-01', positions: ['SS', 'BAD'], source: 'Website' } })
    expect(r.status).toBe(200)
    const after = (await req('/api/clubs/sharks/data', { cookie: owner })).json.data!
    expect(after.leads.length).toBe(before.leads.length + 1)
    expect(after.leads[0]).toMatchObject({ playerFirst: 'Sam', stage: 'new', positions: ['SS'] })
    expect(after.messages[0].recipients).toEqual(['pat@lee.test'])
  })
  it('ignores bots (honeypot) and rejects incomplete forms', async () => {
    const count = (await req('/api/clubs/sharks/data', { cookie: owner })).json.data!.leads.length
    await req('/api/public/clubs/sharks/leads', { method: 'POST', body: { website: 'spam.com', parentName: 'Bot', email: 'b@b.co', playerFirst: 'B', playerLast: 'B', birthDate: '2016-01-01' } })
    expect((await req('/api/clubs/sharks/data', { cookie: owner })).json.data!.leads.length).toBe(count)
    expect((await req('/api/public/clubs/sharks/leads', { method: 'POST', body: { email: 'x' } })).status).toBe(400)
  })
})

describe('sessions and backups', () => {
  it('sign out ends the session', async () => {
    expect((await req('/api/auth/logout', { method: 'POST', cookie: coach, body: {} })).status).toBe(200)
    expect((await req('/api/clubs/sharks/data', { cookie: coach })).status).toBe(401)
  })
  it('makes a backup file', () => {
    const file = db.backup(3)
    expect(readdirSync(join(dir, 'backups'))).toContain(file.split('/').pop())
  })
})

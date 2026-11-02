// SQLite storage (built into Node 22+). One file, easy to back up.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import type { ClubData } from '../src/lib/types.js'

export type Role = 'admin' | 'coach'

export interface User { id: number; email: string; name: string | null; created_at: string }
export interface Club { id: number; slug: string; name: string; version: number; created_at: string; updated_at: string }
export interface Membership { club_id: number; slug: string; name: string; role: Role }

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'))
const DB_PATH = join(DATA_DIR, 'dugout.db')

let db: DatabaseSync | null = null

const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     name TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE clubs (
     id INTEGER PRIMARY KEY,
     slug TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     data TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE memberships (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('admin','coach')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, club_id)
   );
   CREATE TABLE login_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     next TEXT,
     expires_at INTEGER NOT NULL,
     used_at INTEGER
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX sessions_user ON sessions(user_id);`,
]

export function getDb(): DatabaseSync {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new DatabaseSync(process.env.DB_PATH ?? DB_PATH)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return db
}

/** For tests: use a fresh database at this path. */
export function useDatabase(path: string) {
  db?.close()
  db = null
  process.env.DB_PATH = path
  return getDb()
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)

// ------------------------------------------------------------------ users

export function findOrCreateUser(email: string): User {
  const d = getDb()
  const e = email.trim().toLowerCase()
  d.prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING').run(e)
  return d.prepare('SELECT * FROM users WHERE email = ?').get(e) as unknown as User
}

export function findUserByEmail(email: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as unknown as User | undefined
}

export function memberships(userId: number): Membership[] {
  return getDb()
    .prepare('SELECT m.club_id, c.slug, c.name, m.role FROM memberships m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ? ORDER BY c.name')
    .all(userId) as unknown as Membership[]
}

export function roleIn(userId: number, clubId: number): Role | null {
  const r = getDb().prepare('SELECT role FROM memberships WHERE user_id = ? AND club_id = ?').get(userId, clubId) as { role: Role } | undefined
  return r?.role ?? null
}

export function setMembership(userId: number, clubId: number, role: Role) {
  getDb()
    .prepare('INSERT INTO memberships (user_id, club_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, club_id) DO UPDATE SET role = excluded.role')
    .run(userId, clubId, role)
}

export function removeMembership(userId: number, clubId: number) {
  getDb().prepare('DELETE FROM memberships WHERE user_id = ? AND club_id = ?').run(userId, clubId)
}

export function clubMembers(clubId: number) {
  return getDb()
    .prepare(`SELECT u.id, u.email, u.name, m.role, m.created_at,
                (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
              FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? ORDER BY m.role, u.email`)
    .all(clubId) as unknown as { id: number; email: string; name: string | null; role: Role; created_at: string; last_login: string | null }[]
}

// ------------------------------------------------------------------ login links + sessions

export function createLoginToken(userId: number, next: string | null, ttlMinutes = 60 * 24) {
  const token = newToken()
  getDb().prepare('INSERT INTO login_tokens (token_hash, user_id, next, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, next, now() + ttlMinutes * 60)
  return token
}

/** Single use. Returns the user and where to send them, or null if invalid/expired/used. */
export function consumeLoginToken(token: string): { userId: number; next: string | null } | null {
  const d = getDb()
  const row = d.prepare('SELECT user_id, next, expires_at, used_at FROM login_tokens WHERE token_hash = ?').get(sha256(token)) as
    | { user_id: number; next: string | null; expires_at: number; used_at: number | null }
    | undefined
  if (!row || row.used_at || row.expires_at < now()) return null
  const res = d.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').run(now(), sha256(token))
  if (res.changes !== 1) return null
  return { userId: row.user_id, next: row.next }
}

export const SESSION_DAYS = 30

export function createSession(userId: number) {
  const token = newToken()
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, now() + SESSION_DAYS * 86400)
  return token
}

export function sessionUser(token: string | undefined): User | null {
  if (!token) return null
  const row = getDb()
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha256(token), now()) as unknown as User | undefined
  return row ?? null
}

export function deleteSession(token: string) {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function pruneExpired() {
  const d = getDb()
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now())
  d.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now() - 86400)
}

// ------------------------------------------------------------------ clubs

export function createClub(slug: string, data: ClubData): Club {
  const d = getDb()
  d.prepare('INSERT INTO clubs (slug, name, data) VALUES (?, ?, ?)').run(slug, data.settings.name, JSON.stringify(data))
  return clubBySlug(slug)!
}

export function clubBySlug(slug: string): Club | undefined {
  return getDb().prepare('SELECT id, slug, name, version, created_at, updated_at FROM clubs WHERE slug = ?').get(slug) as unknown as Club | undefined
}

export function clubData(clubId: number): { version: number; data: ClubData } {
  const r = getDb().prepare('SELECT version, data FROM clubs WHERE id = ?').get(clubId) as { version: number; data: string }
  return { version: r.version, data: JSON.parse(r.data) as ClubData }
}

/** Optimistic concurrency: only saves if nobody else saved since `baseVersion`. */
export function saveClubData(clubId: number, baseVersion: number, data: ClubData): number | null {
  const res = getDb()
    .prepare("UPDATE clubs SET data = ?, name = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?")
    .run(JSON.stringify(data), data.settings.name, clubId, baseVersion)
  return res.changes === 1 ? baseVersion + 1 : null
}

/** Read-modify-write in one transaction (used for server-side changes like public tryout signups). */
export function updateClubData(clubId: number, fn: (d: ClubData) => ClubData): number {
  const d = getDb()
  d.exec('BEGIN IMMEDIATE')
  try {
    const cur = clubData(clubId)
    const next = fn(cur.data)
    d.prepare("UPDATE clubs SET data = ?, name = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(next), next.settings.name, clubId)
    d.exec('COMMIT')
    return cur.version + 1
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

export function allClubs() {
  const rows = getDb()
    .prepare(`SELECT c.id, c.slug, c.name, c.version, c.created_at, c.updated_at, c.data,
                (SELECT COUNT(*) FROM memberships m WHERE m.club_id = c.id) AS members
              FROM clubs c ORDER BY c.created_at DESC`)
    .all() as unknown as (Club & { data: string; members: number })[]
  return rows.map(({ data, ...c }) => {
    const parsed = JSON.parse(data) as ClubData
    return {
      ...c,
      players: parsed.players.filter((p) => p.status === 'active').length,
      teams: parsed.teams.length,
      leads: parsed.leads.length,
    }
  })
}

// ------------------------------------------------------------------ backups

/** Consistent online backup; keeps the newest `keep` files. */
export function backup(keep = 14) {
  const dir = join(dirname(process.env.DB_PATH ?? DB_PATH), 'backups')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `dugout-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`)
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const old = readdirSync(dir).filter((f) => f.startsWith('dugout-') && f.endsWith('.db')).sort().reverse().slice(keep)
  for (const f of old) unlinkSync(join(dir, f))
  return file
}

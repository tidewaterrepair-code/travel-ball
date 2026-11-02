// Keeps a club's data in sync with the server.
// Local changes apply instantly; they're queued and saved in the background.
// If someone else saved first (409), we take their version and replay our queued changes on top.
import { create } from 'zustand'
import type { ClubData } from './types'
import { CLUB_SLUG } from './mode'

export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'error' | 'signedout'
export type Role = 'admin' | 'coach'

export const useSync = create<{ status: SyncStatus; role: Role | null; email: string | null; error: string | null }>(() => ({
  status: 'loading',
  role: null,
  email: null,
  error: null,
}))

type Op = (d: ClubData) => ClubData
let version = 0
let baseDoc: ClubData | null = null
let pending: Op[] = []
let inflight = false
let timer: ReturnType<typeof setTimeout> | undefined
let retryDelay = 1000
let onRejected: ((message: string) => void) | null = null

// Late-bound to avoid a circular import with the store.
let getData: () => ClubData = () => baseDoc!
let setData: (d: ClubData) => void = () => {}
export function bindStore(get: () => ClubData, set: (d: ClubData) => void, rejected: (message: string) => void) {
  getData = get
  setData = set
  onRejected = rejected
}

const api = (path = '') => `/api/clubs/${CLUB_SLUG}/data${path}`

export async function loadClub(): Promise<'ok' | 'signedout' | 'forbidden' | 'notfound' | 'error'> {
  try {
    const res = await fetch(api(), { credentials: 'same-origin' })
    if (res.status === 401) return 'signedout'
    if (res.status === 403) return 'forbidden'
    if (res.status === 404) return 'notfound'
    if (!res.ok) return 'error'
    const body = (await res.json()) as { version: number; data: ClubData; role: Role; user: { email: string } }
    version = body.version
    baseDoc = body.data
    pending = []
    setData(body.data)
    useSync.setState({ status: 'saved', role: body.role, email: body.user.email, error: null })
    startPolling()
    return 'ok'
  } catch {
    return 'error'
  }
}

export function enqueue(op: Op) {
  if (!baseDoc) return
  pending.push(op)
  useSync.setState({ status: 'saving' })
  clearTimeout(timer)
  timer = setTimeout(flush, 400)
}

async function flush() {
  if (inflight || !pending.length || !baseDoc) return
  inflight = true
  const snapshot = getData()
  const count = pending.length
  try {
    const res = await fetch(api(), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseVersion: version, data: snapshot }),
    })
    if (res.ok) {
      version = ((await res.json()) as { version: number }).version
      baseDoc = snapshot
      pending = pending.slice(count)
      retryDelay = 1000
      useSync.setState({ status: pending.length ? 'saving' : 'saved', error: null })
    } else if (res.status === 409) {
      // Someone else saved first: take theirs and replay our changes on top.
      const latest = (await res.json()) as { version: number; data: ClubData }
      version = latest.version
      baseDoc = latest.data
      setData(pending.reduce((d, op) => op(d), latest.data))
    } else if (res.status === 401) {
      useSync.setState({ status: 'signedout', error: 'Your session ended. Sign in again to keep saving.' })
      return
    } else if (res.status === 403 || res.status === 400 || res.status === 413) {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That change wasn’t allowed.'
      // Undo the rejected changes so the screen matches what's saved.
      pending = []
      setData(baseDoc)
      useSync.setState({ status: 'saved', error: null })
      onRejected?.(msg)
    } else throw new Error(String(res.status))
  } catch {
    useSync.setState({ status: 'offline', error: 'Can’t reach the server. Your changes will save when you’re back online.' })
    retryDelay = Math.min(retryDelay * 2, 30_000)
  } finally {
    inflight = false
  }
  if (pending.length && useSync.getState().status !== 'signedout') {
    clearTimeout(timer)
    timer = setTimeout(flush, useSync.getState().status === 'offline' ? retryDelay : 50)
  }
}

/** Pick up other coaches' changes. */
async function poll() {
  if (inflight || pending.length || document.hidden) return
  try {
    const res = await fetch(api(`?since=${version}`), { credentials: 'same-origin' })
    if (res.status === 200) {
      const body = (await res.json()) as { version: number; data: ClubData; role: Role }
      if (pending.length || inflight) return
      version = body.version
      baseDoc = body.data
      setData(body.data)
      useSync.setState({ role: body.role })
    } else if (res.status === 401) useSync.setState({ status: 'signedout' })
    if (useSync.getState().status === 'offline' && res.ok) useSync.setState({ status: 'saved', error: null })
  } catch {
    /* next poll will retry */
  }
}

let polling = false
function startPolling() {
  if (polling) return
  polling = true
  setInterval(poll, 15_000)
  window.addEventListener('focus', poll)
  window.addEventListener('online', () => void flush())
  window.addEventListener('beforeunload', (e) => {
    if (pending.length) e.preventDefault()
  })
}

export const hasPending = () => pending.length > 0

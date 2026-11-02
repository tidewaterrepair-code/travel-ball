// Small client for the sign-in and staff endpoints.
export interface Me {
  user: { id: number; email: string } | null
  clubs?: { slug: string; name: string; role: 'admin' | 'coach' }[]
  superAdmin?: boolean
  emailConfigured?: boolean
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export const getMe = () => call<Me>('/api/me')
export const requestLogin = (email: string, next?: string) => call<{ ok: true; emailConfigured: boolean }>('/api/auth/request', { method: 'POST', body: JSON.stringify({ email, next }) })
export const logout = () => call('/api/auth/logout', { method: 'POST', body: '{}' })

export interface Member { id: number; email: string; role: 'admin' | 'coach'; created_at: string; last_login: string | null }
export const listMembers = (slug: string) => call<{ members: Member[] }>(`/api/clubs/${slug}/members`)
export const inviteMember = (slug: string, email: string, role: 'admin' | 'coach') =>
  call<{ ok: true; emailed: boolean; link: string | null }>(`/api/clubs/${slug}/members`, { method: 'POST', body: JSON.stringify({ email, role }) })
export const removeMember = (slug: string, id: number) => call(`/api/clubs/${slug}/members/${id}`, { method: 'DELETE' })

export interface AdminClub { id: number; slug: string; name: string; created_at: string; updated_at: string; members: number; players: number; teams: number; leads: number }
export const adminClubs = () => call<{ clubs: AdminClub[] }>('/api/admin/clubs')
export const adminCreateClub = (b: { name: string; slug: string; ownerEmail: string; demo: boolean }) =>
  call<{ link: string; emailed: boolean; url: string }>('/api/admin/clubs', { method: 'POST', body: JSON.stringify(b) })

export interface PublicClub {
  settings: Record<string, unknown> & { name: string; seasonYear: number }
  teams: { id: string; name: string; ageGroup: number; headCoach: string; rosterLimit: number; color: string }[]
  rosterCounts: Record<string, number>
  tryouts: { id: string; title: string; start: string; end: string; location: string; notes?: string }[]
}
export const publicClub = (slug: string) => call<PublicClub>(`/api/public/clubs/${slug}`)
export const submitPublicLead = (slug: string, lead: Record<string, unknown>) =>
  call(`/api/public/clubs/${slug}/leads`, { method: 'POST', body: JSON.stringify(lead) })

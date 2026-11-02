import type { ClubData, Family, OrgSettings, Player, Registration, Team, PaymentPlan } from './types.js'
import { PAYMENT_PLANS } from './types.js'

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`

export const money = (n: number, cents = false) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents ? 2 : 0,
    minimumFractionDigits: cents ? 2 : 0,
  })

export const compactMoney = (n: number) =>
  Math.abs(n) >= 10000 ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : money(n)

export const todayISO = () => toDateISO(new Date())

export function toDateISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD as a *local* date (avoids the UTC off-by-one). */
export function parseDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  (s.length <= 10 ? parseDate(s) : new Date(s)).toLocaleDateString('en-US', opts)

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function daysUntil(iso: string, from = new Date()) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const t = iso.length <= 10 ? parseDate(iso) : new Date(iso)
  const b = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function relativeDay(iso: string) {
  const d = daysUntil(iso)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d > 1 && d < 7) return fmtDate(iso, { weekday: 'long' })
  if (d < 0 && d > -7) return `${-d} days ago`
  return fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return fmtDate(iso)
}

// ---------------------------------------------------------------- Baseball age

/**
 * Baseball age: the player's age on the cutoff date of the season year.
 * USSSA uses April 30; leagues can change this in Settings.
 */
export function baseballAge(birthDate: string, settings: Pick<OrgSettings, 'seasonYear' | 'ageCutoffMonth' | 'ageCutoffDay'>) {
  const b = parseDate(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const { seasonYear: y, ageCutoffMonth: m, ageCutoffDay: d } = settings
  let age = y - b.getFullYear()
  const birthdayAfterCutoff = b.getMonth() + 1 > m || (b.getMonth() + 1 === m && b.getDate() > d)
  if (birthdayAfterCutoff) age -= 1
  return age
}

export const ageGroupLabel = (n: number) => `${n}U`

/**
 * Suggest a team for a player: same age group first, otherwise the closest
 * age group *above* (players can play up, not down), preferring teams with open spots.
 */
export function recommendTeam(age: number | null, teams: Team[], players: Player[]): Team | null {
  if (age == null || teams.length === 0) return null
  const open = (t: Team) => t.rosterLimit - players.filter((p) => p.teamId === t.id && p.status === 'active').length
  const eligible = teams
    .filter((t) => t.ageGroup >= age)
    .sort((a, b) => a.ageGroup - b.ageGroup || open(b) - open(a))
  if (eligible.length) {
    const sameGroup = eligible.filter((t) => t.ageGroup === eligible[0].ageGroup)
    return sameGroup.find((t) => open(t) > 0) ?? sameGroup[0]
  }
  return null
}

// ---------------------------------------------------------------- Money

export const paidTotal = (r: Registration) => r.payments.reduce((s, p) => s + p.amount, 0)
export const amountDue = (r: Registration) => Math.max(0, r.fee - r.discount - r.fundraisingCredit)
export const balance = (r: Registration) => Math.max(0, amountDue(r) - paidTotal(r))

export function installmentSchedule(r: Pick<Registration, 'plan' | 'firstDueDate'> & { total: number }) {
  const n = PAYMENT_PLANS.find((p) => p.id === r.plan)?.installments ?? 1
  const base = Math.floor((r.total / n) * 100) / 100
  const out: { due: string; amount: number }[] = []
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? Math.round((r.total - base * (n - 1)) * 100) / 100 : base
    out.push({ due: toDateISO(addMonths(parseDate(r.firstDueDate), i)), amount })
  }
  return out
}

/** How much *should* have been paid by `asOf` according to the plan. */
export function expectedPaidBy(r: Registration, asOf = todayISO()) {
  return installmentSchedule({ plan: r.plan, firstDueDate: r.firstDueDate, total: amountDue(r) })
    .filter((i) => i.due <= asOf)
    .reduce((s, i) => s + i.amount, 0)
}

export function pastDue(r: Registration, asOf = todayISO()) {
  return Math.max(0, Math.round((expectedPaidBy(r, asOf) - paidTotal(r)) * 100) / 100)
}

export function nextInstallment(r: Registration) {
  const paid = paidTotal(r)
  let running = 0
  for (const i of installmentSchedule({ plan: r.plan, firstDueDate: r.firstDueDate, total: amountDue(r) })) {
    running += i.amount
    if (running > paid + 0.009) return { due: i.due, amount: Math.round((running - paid) * 100) / 100 }
  }
  return null
}

export type PayStatus = 'paid' | 'pastdue' | 'ontrack'
export function payStatus(r: Registration, asOf = todayISO()): PayStatus {
  if (balance(r) <= 0) return 'paid'
  if (pastDue(r, asOf) > 0) return 'pastdue'
  return 'ontrack'
}

export function planFor(plan: PaymentPlan) {
  return PAYMENT_PLANS.find((p) => p.id === plan)!
}

// ---------------------------------------------------------------- Templates

export interface MergeContext {
  parentName?: string
  playerFirst?: string
  playerName?: string
  teamName?: string
  coachName?: string
  balance?: number
  nextDue?: string
  orgName?: string
  ageGroup?: string
  signupLink?: string
}

export const MERGE_FIELDS: { key: keyof MergeContext | 'parentFirst'; label: string }[] = [
  { key: 'parentFirst', label: 'Parent first name' },
  { key: 'playerFirst', label: 'Player first name' },
  { key: 'teamName', label: 'Team name' },
  { key: 'coachName', label: 'Head coach' },
  { key: 'balance', label: 'Balance due' },
  { key: 'nextDue', label: 'Next due date' },
  { key: 'ageGroup', label: 'Age group' },
  { key: 'orgName', label: 'Club name' },
]

export function mergeTemplate(text: string, ctx: MergeContext) {
  const parentFirst = (ctx.parentName ?? '').split(' ')[0] || 'there'
  const values: Record<string, string> = {
    parentFirst,
    parentName: ctx.parentName ?? '',
    playerFirst: ctx.playerFirst ?? 'your player',
    playerName: ctx.playerName ?? '',
    teamName: ctx.teamName ?? 'the team',
    coachName: ctx.coachName ?? 'Coach',
    balance: ctx.balance != null ? money(ctx.balance) : '',
    nextDue: ctx.nextDue ? fmtDate(ctx.nextDue, { month: 'long', day: 'numeric' }) : '',
    orgName: ctx.orgName ?? '',
    ageGroup: ctx.ageGroup ?? '',
    signupLink: ctx.signupLink ?? '',
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m))
}

// ---------------------------------------------------------------- Lookups

export function playerContext(data: ClubData, player: Player): MergeContext {
  const fam = data.families.find((f) => f.id === player.familyId)
  const team = data.teams.find((t) => t.id === player.teamId)
  const reg = data.registrations.find((r) => r.playerId === player.id && r.season === data.settings.seasonYear)
  const next = reg ? nextInstallment(reg) : null
  return {
    parentName: fam?.parentName,
    playerFirst: player.firstName,
    playerName: `${player.firstName} ${player.lastName}`,
    teamName: team?.name,
    coachName: team?.headCoach,
    balance: reg ? balance(reg) : 0,
    nextDue: next?.due,
    orgName: data.settings.name,
    ageGroup: team ? ageGroupLabel(team.ageGroup) : undefined,
  }
}

export const familyOf = (data: ClubData, p: Player): Family | undefined => data.families.find((f) => f.id === p.familyId)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')

export function toCSV(rows: Record<string, string | number | undefined | null>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}

export function download(filename: string, content: string, type = 'text/csv') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

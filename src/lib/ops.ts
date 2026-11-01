// Pure business operations: (data, input) => new data.
// Automations live here so they behave identically in the UI and in tests.
import type {
  Audience, AutomationId, ClubData, Family, Lead, LeadStage, Message, Payment, Player, Registration, Task,
} from './types'
import {
  ageGroupLabel, baseballAge, mergeTemplate, playerContext, recommendTeam, uid, toDateISO, addDays,
  type MergeContext, balance,
} from './utils'

const clone = <T,>(x: T): T => structuredClone(x)

function log(d: ClubData, emoji: string, text: string) {
  d.activity.unshift({ id: uid('act'), at: new Date().toISOString(), emoji, text })
  d.activity = d.activity.slice(0, 60)
}

function automationOn(d: ClubData, id: AutomationId) {
  const a = d.automations.find((x) => x.id === id)
  return a?.enabled ? a : null
}

function sendAutomated(d: ClubData, id: AutomationId, templateId: string, to: string, ctx: MergeContext, label: string) {
  const a = automationOn(d, id)
  const tpl = d.templates.find((t) => t.id === templateId)
  if (!a || !tpl || !to) return
  a.runs += 1
  d.messages.unshift({
    id: uid('msg'),
    audience: 'all',
    audienceLabel: label,
    subject: mergeTemplate(tpl.subject, ctx),
    body: mergeTemplate(tpl.body, ctx),
    recipients: [to],
    sentAt: new Date().toISOString(),
    automated: true,
  })
}

export function leadContext(d: ClubData, l: Lead): MergeContext {
  const age = baseballAge(l.birthDate, d.settings)
  const team = recommendTeam(age, d.teams, d.players)
  return {
    parentName: l.parentName,
    playerFirst: l.playerFirst,
    playerName: `${l.playerFirst} ${l.playerLast}`,
    orgName: d.settings.name,
    ageGroup: age != null ? ageGroupLabel(age) : undefined,
    teamName: team?.name,
    coachName: team?.headCoach,
  }
}

export type NewLead = Omit<Lead, 'id' | 'stage' | 'createdAt' | 'updatedAt'> & { stage?: LeadStage }

export function addLead(data: ClubData, input: NewLead): { data: ClubData; lead: Lead } {
  const d = clone(data)
  const now = new Date().toISOString()
  const lead: Lead = { ...input, stage: input.stage ?? 'new', id: uid('lead'), createdAt: now, updatedAt: now }
  d.leads.unshift(lead)
  log(d, '📥', `New tryout signup: ${lead.playerFirst} ${lead.playerLast} (${lead.source})`)
  sendAutomated(d, 'welcomeLead', 'tpl_lead_welcome', lead.email, leadContext(d, lead), `Auto · ${lead.parentName}`)
  return { data: d, lead }
}

export function updateLead(data: ClubData, id: string, patch: Partial<Lead>): ClubData {
  const d = clone(data)
  const l = d.leads.find((x) => x.id === id)
  if (!l) return data
  Object.assign(l, patch, { updatedAt: new Date().toISOString() })
  return d
}

export function moveLead(data: ClubData, id: string, stage: LeadStage, teamId?: string | null): ClubData {
  const prev = data.leads.find((x) => x.id === id)
  if (!prev || prev.stage === stage) return data
  let d = updateLead(data, id, { stage })
  const l = d.leads.find((x) => x.id === id)!
  if (stage === 'tryout') {
    sendAutomated(d, 'tryoutInvite', 'tpl_tryout', l.email, leadContext(d, l), `Auto · ${l.parentName}`)
    log(d, '🧢', `${l.playerFirst} ${l.playerLast} is set for tryouts`)
  }
  if (stage === 'offered') log(d, '🤝', `Roster spot offered to ${l.playerFirst} ${l.playerLast}`)
  if (stage === 'committed' && !l.convertedPlayerId) d = convertLead(d, id, teamId)
  return d
}

/** Turn a committed lead into a family + player + season registration. */
export function convertLead(data: ClubData, leadId: string, teamId?: string | null): ClubData {
  const d = clone(data)
  const l = d.leads.find((x) => x.id === leadId)
  if (!l || l.convertedPlayerId) return data
  const age = baseballAge(l.birthDate, d.settings)
  const team = teamId === undefined ? recommendTeam(age, d.teams, d.players) : d.teams.find((t) => t.id === teamId) ?? null

  let fam = d.families.find((f) => f.email.toLowerCase() === l.email.toLowerCase())
  if (!fam) {
    fam = { id: uid('fam'), parentName: l.parentName, email: l.email, phone: l.phone, createdAt: new Date().toISOString() } satisfies Family
    d.families.push(fam)
  }
  const player: Player = {
    id: uid('ply'),
    familyId: fam.id,
    firstName: l.playerFirst,
    lastName: l.playerLast,
    birthDate: l.birthDate,
    teamId: team?.id ?? null,
    positions: l.positions,
    bats: 'R',
    throws: 'R',
    status: 'active',
  }
  d.players.push(player)
  d.registrations.push(newRegistration(d, player))
  l.convertedPlayerId = player.id
  l.stage = 'committed'

  log(d, '🎉', `${player.firstName} ${player.lastName} committed${team ? ` to ${team.name}` : ''}!`)
  sendAutomated(d, 'welcomeFamily', 'tpl_welcome', fam.email, playerContext(d, player), `Auto · ${fam.parentName}`)
  const taskAuto = automationOn(d, 'commitTask')
  if (taskAuto) {
    taskAuto.runs += 1
    d.tasks.unshift({
      id: uid('task'),
      title: `Order uniform for ${player.firstName} ${player.lastName}${team ? ` (${team.name})` : ''}`,
      due: toDateISO(addDays(new Date(), 7)),
      done: false,
      assignee: team?.headCoach.replace('Coach ', '') ?? 'Club admin',
      createdAt: new Date().toISOString(),
    })
  }
  return d
}

export function newRegistration(d: ClubData, p: Player): Registration {
  const team = d.teams.find((t) => t.id === p.teamId)
  const next = new Date()
  next.setMonth(next.getMonth() + 1, 1)
  return {
    id: uid('reg'),
    playerId: p.id,
    teamId: p.teamId,
    season: d.settings.seasonYear,
    fee: team?.fee ?? d.settings.defaultFee,
    discount: 0,
    fundraisingCredit: 0,
    plan: '3-pay',
    firstDueDate: toDateISO(next),
    payments: [],
    createdAt: new Date().toISOString(),
  }
}

export function recordPayment(data: ClubData, regId: string, p: Omit<Payment, 'id'>): ClubData {
  const d = clone(data)
  const reg = d.registrations.find((r) => r.id === regId)
  if (!reg) return data
  reg.payments.push({ ...p, id: uid('pay') })
  const player = d.players.find((x) => x.id === reg.playerId)
  const fam = player && d.families.find((f) => f.id === player.familyId)
  if (player && fam) {
    log(d, '💰', `$${p.amount.toLocaleString()} received for ${player.firstName} ${player.lastName} (${p.method})`)
    sendAutomated(d, 'paymentReceipt', 'tpl_receipt', fam.email, playerContext(d, player), `Auto · receipt · ${fam.parentName}`)
  }
  return d
}

// ------------------------------------------------------------- Messaging

export interface Recipient {
  email: string
  name: string
  ctx: MergeContext
}

export function audienceOptions(d: ClubData): { id: Audience; label: string }[] {
  return [
    { id: 'all', label: 'All club families' },
    ...d.teams.map((t) => ({ id: `team:${t.id}` as Audience, label: `${t.name} families` })),
    { id: 'unpaid', label: 'Families with a balance due' },
    { id: 'leads', label: 'Open tryout leads' },
  ]
}

export function audienceRecipients(d: ClubData, audience: Audience): Recipient[] {
  if (audience === 'leads') {
    return d.leads
      .filter((l) => !['committed', 'lost'].includes(l.stage))
      .map((l) => ({ email: l.email, name: l.parentName, ctx: leadContext(d, l) }))
  }
  let players = d.players.filter((p) => p.status === 'active')
  if (audience.startsWith('team:')) players = players.filter((p) => p.teamId === audience.slice(5))
  if (audience === 'unpaid') {
    players = players.filter((p) => {
      const reg = d.registrations.find((r) => r.playerId === p.id && r.season === d.settings.seasonYear)
      return reg && balance(reg) > 0
    })
  }
  const seen = new Set<string>()
  const out: Recipient[] = []
  for (const p of players) {
    const fam = d.families.find((f) => f.id === p.familyId)
    if (!fam || seen.has(fam.email)) continue
    seen.add(fam.email)
    out.push({ email: fam.email, name: fam.parentName, ctx: playerContext(d, p) })
  }
  return out
}

export function sendMessage(data: ClubData, m: { audience: Audience; audienceLabel: string; subject: string; body: string }): { data: ClubData; message: Message } {
  const d = clone(data)
  const recipients = audienceRecipients(d, m.audience).map((r) => r.email)
  const message: Message = { ...m, id: uid('msg'), recipients, sentAt: new Date().toISOString(), automated: false }
  d.messages.unshift(message)
  log(d, '📣', `Message sent to ${m.audienceLabel}: “${m.subject}”`)
  return { data: d, message }
}

// ------------------------------------------------------------- Season rollover

/**
 * Start a new season: bump the season year, move every active player up to the
 * team for their new baseball age, create fresh registrations, and graduate
 * players who aged out of the oldest team.
 */
export function rolloverSeason(data: ClubData): { data: ClubData; moved: number; graduated: number } {
  const d = clone(data)
  d.settings.seasonYear += 1
  let moved = 0
  let graduated = 0
  const maxAge = Math.max(...d.teams.map((t) => t.ageGroup))
  const assigned: Player[] = []
  for (const p of d.players.filter((x) => x.status === 'active')) {
    const age = baseballAge(p.birthDate, d.settings)
    if (age == null) continue
    if (age > maxAge) {
      p.status = 'alumni'
      p.teamId = null
      graduated++
      continue
    }
    const team = recommendTeam(age, d.teams, assigned)
    if (team?.id !== p.teamId) moved++
    p.teamId = team?.id ?? null
    assigned.push(p)
    d.registrations.push(newRegistration(d, p))
  }
  d.leads = d.leads.filter((l) => !['committed', 'lost'].includes(l.stage))
  log(d, '🔄', `Rolled over to the ${d.settings.seasonYear} season — ${moved} players moved up, ${graduated} graduated`)
  return { data: d, moved, graduated }
}

export function addTask(data: ClubData, t: Omit<Task, 'id' | 'createdAt' | 'done'>): ClubData {
  const d = clone(data)
  d.tasks.unshift({ ...t, id: uid('task'), done: false, createdAt: new Date().toISOString() })
  return d
}

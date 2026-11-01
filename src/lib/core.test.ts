import { describe, expect, it } from 'vitest'
import { buildEmpty, buildSeed } from './seed'
import { addLead, audienceRecipients, moveLead, recordPayment, rolloverSeason, sendMessage } from './ops'
import { balance, baseballAge, expectedPaidBy, installmentSchedule, mergeTemplate, nextInstallment, pastDue, payStatus, recommendTeam } from './utils'
import type { Registration, Team } from './types'

const usssa = { seasonYear: 2027, ageCutoffMonth: 4, ageCutoffDay: 30 }

describe('baseballAge', () => {
  it('uses age on the cutoff date of the season year', () => {
    expect(baseballAge('2017-04-30', usssa)).toBe(10) // birthday on cutoff counts
    expect(baseballAge('2017-05-01', usssa)).toBe(9) // day after cutoff
    expect(baseballAge('2016-12-31', usssa)).toBe(10)
    expect(baseballAge('2017-01-01', usssa)).toBe(10)
  })
  it('respects a custom cutoff', () => {
    expect(baseballAge('2017-06-01', { seasonYear: 2027, ageCutoffMonth: 8, ageCutoffDay: 31 })).toBe(10)
    expect(baseballAge('2017-09-01', { seasonYear: 2027, ageCutoffMonth: 8, ageCutoffDay: 31 })).toBe(9)
  })
})

describe('recommendTeam', () => {
  const t = (id: string, age: number, limit = 12): Team => ({ id, name: id, ageGroup: age, headCoach: '', coachEmail: '', color: '', rosterLimit: limit, fee: 0, practiceLocation: '' })
  it('picks the same age group, else plays up, never down', () => {
    const teams = [t('9u', 9), t('11u', 11)]
    expect(recommendTeam(9, teams, [])?.id).toBe('9u')
    expect(recommendTeam(10, teams, [])?.id).toBe('11u')
    expect(recommendTeam(12, teams, [])).toBeNull()
  })
  it('prefers a same-age team with open spots', () => {
    const teams = [t('10a', 10, 1), t('10b', 10, 12)]
    const full = [{ id: 'p', teamId: '10a', status: 'active' }] as never
    expect(recommendTeam(10, teams, full)?.id).toBe('10b')
  })
})

describe('payments', () => {
  const reg = (over: Partial<Registration> = {}): Registration => ({ id: 'r', playerId: 'p', teamId: null, season: 2027, fee: 1500, discount: 0, fundraisingCredit: 0, plan: '3-pay', firstDueDate: '2026-09-01', payments: [], createdAt: '', ...over })

  it('splits installments that sum to the total', () => {
    const s = installmentSchedule({ plan: 'monthly', firstDueDate: '2026-09-01', total: 1000 })
    expect(s).toHaveLength(6)
    expect(s.reduce((a, b) => a + b.amount, 0)).toBeCloseTo(1000, 2)
    expect(s[5].due).toBe('2027-02-01')
  })
  it('flags past due against the plan, with credits applied', () => {
    const r = reg({ fundraisingCredit: 300 }) // 1200 due -> 400/mo
    expect(expectedPaidBy(r, '2026-10-15')).toBe(800)
    expect(pastDue(r, '2026-10-15')).toBe(800)
    expect(payStatus(r, '2026-10-15')).toBe('pastdue')
    const r2 = reg({ fundraisingCredit: 300, payments: [{ id: 'a', amount: 800, date: '2026-10-01', method: 'Card' }] })
    expect(payStatus(r2, '2026-10-15')).toBe('ontrack')
    expect(nextInstallment(r2)).toEqual({ due: '2026-11-01', amount: 400 })
    const r3 = reg({ payments: [{ id: 'a', amount: 1500, date: '2026-10-01', method: 'Card' }] })
    expect(balance(r3)).toBe(0)
    expect(payStatus(r3)).toBe('paid')
  })
})

describe('mergeTemplate', () => {
  it('fills known fields and leaves unknown tokens alone', () => {
    expect(mergeTemplate('Hi {{parentFirst}}, {{playerFirst}} owes {{balance}} {{nope}}', { parentName: 'Sarah Miller', playerFirst: 'Jack', balance: 250 })).toBe('Hi Sarah, Jack owes $250 {{nope}}')
  })
})

describe('automations', () => {
  it('sends a thank-you email to a new signup', () => {
    const d0 = buildSeed()
    const before = d0.messages.length
    const { data, lead } = addLead(d0, { parentName: 'Pat Lee', email: 'pat@example.com', phone: '1', playerFirst: 'Sam', playerLast: 'Lee', birthDate: `${d0.settings.seasonYear - 10}-02-01`, positions: ['SS'], experience: '', source: 'Website' })
    expect(data.leads[0].id).toBe(lead.id)
    expect(data.messages.length).toBe(before + 1)
    expect(data.messages[0].recipients).toEqual(['pat@example.com'])
    expect(data.messages[0].body).toContain('10U')
    expect(data.messages[0].body).not.toContain('{{')
  })

  it('committing a lead creates family, player, registration, welcome email and task', () => {
    const d0 = buildSeed()
    const { data: d1, lead } = addLead(d0, { parentName: 'Pat Lee', email: 'pat@example.com', phone: '1', playerFirst: 'Sam', playerLast: 'Lee', birthDate: `${d0.settings.seasonYear - 12}-02-01`, positions: ['C'], experience: '', source: 'Referral' })
    const d2 = moveLead(d1, lead.id, 'committed')
    const player = d2.players.find((p) => p.firstName === 'Sam' && p.lastName === 'Lee')!
    expect(player).toBeTruthy()
    expect(player.teamId).toBe('team_12u')
    expect(d2.families.some((f) => f.email === 'pat@example.com')).toBe(true)
    expect(d2.registrations.some((r) => r.playerId === player.id)).toBe(true)
    expect(d2.messages[0].subject).toContain('Welcome to Thunder 12U')
    expect(d2.tasks[0].title).toContain('Order uniform for Sam Lee')
    // idempotent
    expect(moveLead(d2, lead.id, 'committed')).toBe(d2)
  })

  it('respects disabled automations', () => {
    const d0 = buildSeed()
    d0.automations.forEach((a) => (a.enabled = false))
    const { data } = addLead(d0, { parentName: 'A B', email: 'a@b.c', phone: '', playerFirst: 'X', playerLast: 'Y', birthDate: '2016-01-01', positions: [], experience: '', source: 'Flyer' })
    expect(data.messages.length).toBe(d0.messages.length)
  })

  it('records a payment and emails a receipt', () => {
    const d0 = buildSeed()
    const reg = d0.registrations.find((r) => balance(r) > 0)!
    const d1 = recordPayment(d0, reg.id, { amount: 100, method: 'Venmo', date: '2026-11-01' })
    const r1 = d1.registrations.find((r) => r.id === reg.id)!
    expect(balance(r1)).toBeCloseTo(balance(reg) - 100, 2)
    expect(d1.messages[0].subject).toContain('Payment received')
    expect(d0.registrations.find((r) => r.id === reg.id)!.payments.length).toBe(reg.payments.length) // input not mutated
  })
})

describe('messaging', () => {
  it('targets the right families', () => {
    const d = buildSeed()
    const team = audienceRecipients(d, 'team:team_10u')
    expect(team.length).toBe(d.players.filter((p) => p.teamId === 'team_10u' && p.status === 'active').length)
    expect(team.every((r) => r.ctx.teamName === 'Thunder 10U')).toBe(true)
    const unpaid = audienceRecipients(d, 'unpaid')
    expect(unpaid.every((r) => (r.ctx.balance ?? 0) > 0)).toBe(true)
    const { data, message } = sendMessage(d, { audience: 'all', audienceLabel: 'All', subject: 'Hi', body: 'Yo' })
    expect(message.recipients.length).toBe(new Set(d.families.map((f) => f.email)).size)
    expect(data.messages[0].id).toBe(message.id)
  })
})

describe('season rollover', () => {
  it('moves players up, graduates the oldest, and creates new registrations', () => {
    const d = buildSeed()
    const { data, moved, graduated } = rolloverSeason(d)
    expect(data.settings.seasonYear).toBe(d.settings.seasonYear + 1)
    expect(moved).toBeGreaterThan(0)
    expect(graduated).toBeGreaterThan(0) // 14U is the oldest team; 14-year-olds age out
    const active = data.players.filter((p) => p.status === 'active')
    for (const p of active) {
      expect(data.registrations.some((r) => r.playerId === p.id && r.season === data.settings.seasonYear)).toBe(true)
      const age = baseballAge(p.birthDate, data.settings)!
      const team = data.teams.find((t) => t.id === p.teamId)
      if (team) expect(team.ageGroup).toBeGreaterThanOrEqual(age)
    }
  })
})

describe('seed data', () => {
  it('places every seeded player in the team matching their baseball age', () => {
    const d = buildSeed()
    for (const p of d.players) {
      const team = d.teams.find((t) => t.id === p.teamId)!
      expect(baseballAge(p.birthDate, d.settings)).toBe(team.ageGroup)
    }
  })
  it('empty club has no records but keeps templates and automations', () => {
    const d = buildEmpty()
    expect(d.players).toHaveLength(0)
    expect(d.templates.length).toBeGreaterThan(0)
    expect(d.automations.every((a) => a.runs === 0)).toBe(true)
  })
})

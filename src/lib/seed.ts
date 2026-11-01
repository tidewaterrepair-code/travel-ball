// Demo data generator. Dates are relative to "now" so the demo always looks live.
import type {
  Automation, ClubData, ClubEvent, Family, Lead, LeadSource, LeadStage, Player, Position,
  Registration, Team, Template, Task, PaymentMethod, PaymentPlan, RSVP,
} from './types'
import { addDays, addMonths, amountDue, installmentSchedule, toDateISO, uid } from './utils'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Jackson', 'Mason', 'Liam', 'Noah', 'Carter', 'Brody', 'Luke', 'Cooper', 'Eli', 'Wyatt', 'Owen', 'Caleb', 'Hudson', 'Bryce', 'Tanner', 'Gavin', 'Landon', 'Mateo', 'Diego', 'Jayden', 'Isaiah', 'Micah', 'Chase', 'Ryder', 'Beckett', 'Colt', 'Grayson', 'Easton', 'Jace', 'Rhett', 'Nolan', 'Camden', 'Dominic', 'Xavier', 'Andre', 'Marcus', 'Theo', 'Asher', 'Kai', 'Bennett', 'Sawyer', 'Ty', 'Reid', 'Logan', 'Max', 'Ezra', 'Miles', 'Jalen', 'Rafael', 'Wesley', 'Ava', 'Harper']
const LAST = ['Miller', 'Johnson', 'Rodriguez', 'Williams', 'Brown', 'Davis', 'Garcia', 'Martinez', 'Thompson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Peterson', 'Gray']
const PARENT_FIRST = ['Sarah', 'Mike', 'Jessica', 'Chris', 'Amanda', 'Brian', 'Ashley', 'Kevin', 'Megan', 'Jason', 'Nicole', 'Ryan', 'Lauren', 'Matt', 'Kristen', 'David', 'Rachel', 'Tony', 'Heather', 'Marcus', 'Danielle', 'Steve', 'Tasha', 'Luis', 'Erin', 'Andre', 'Kelly', 'Josh', 'Monica', 'Greg']

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'tpl_lead_welcome',
    name: 'Thanks for your interest',
    emoji: '👋',
    subject: 'Thanks for your interest in {{orgName}}!',
    body: `Hi {{parentFirst}},

Thanks for telling us about {{playerFirst}}! Based on their birthday, {{playerFirst}} will play in our {{ageGroup}} age group this season.

A coach will reach out within 48 hours with tryout dates and what to bring (glove, bat, helmet, cleats, and a water bottle).

Play ball!
{{orgName}}`,
  },
  {
    id: 'tpl_tryout',
    name: 'Tryout invitation',
    emoji: '🧢',
    subject: "{{playerFirst}}'s tryout is set!",
    body: `Hi {{parentFirst}},

We're excited to see {{playerFirst}} at tryouts! Please arrive 20 minutes early to check in and warm up.

Bring: glove, bat, helmet, cleats, baseball pants, and water.

See you on the field,
{{orgName}}`,
  },
  {
    id: 'tpl_welcome',
    name: 'Welcome to the team',
    emoji: '🎉',
    subject: 'Welcome to {{teamName}}, {{playerFirst}}! ⚾',
    body: `Hi {{parentFirst}},

Welcome to the {{orgName}} family! {{playerFirst}} is officially on {{teamName}} with {{coachName}}.

What's next:
• Watch for the season schedule and practice times
• Uniform sizing — reply with jersey, pants, and hat sizes
• Season dues: {{balance}} remaining, next payment due {{nextDue}}

We can't wait for a great season together!
{{orgName}}`,
  },
  {
    id: 'tpl_reminder',
    name: 'Friendly payment reminder',
    emoji: '💳',
    subject: 'Quick reminder: {{playerFirst}} season dues',
    body: `Hi {{parentFirst}},

Just a friendly heads-up — {{playerFirst}}'s next payment is due {{nextDue}}. Remaining season balance: {{balance}}.

You can pay by card, Venmo, or Zelle. If you need to set up a different plan, just reply — we're happy to help.

Thank you!
{{orgName}}`,
  },
  {
    id: 'tpl_tournament',
    name: 'Tournament weekend info',
    emoji: '🏆',
    subject: '{{teamName}} tournament weekend — everything you need',
    body: `Hi {{parentFirst}},

Tournament weekend is almost here! Here's the plan for {{playerFirst}}:

• Arrive 60 minutes before first pitch
• Full uniform: game jersey, white pants, black belt and socks
• Pack sunscreen, snacks, and plenty of water
• Bracket and field assignments will be posted Friday night

Let's go {{teamName}}!
{{coachName}}`,
  },
  {
    id: 'tpl_rainout',
    name: 'Rainout / schedule change',
    emoji: '🌧️',
    subject: 'Schedule change for {{teamName}}',
    body: `Hi {{parentFirst}},

Mother Nature won this round — today's activity for {{teamName}} is cancelled. We'll post the make-up date as soon as we have it.

Stay dry!
{{coachName}}`,
  },
  {
    id: 'tpl_receipt',
    name: 'Payment receipt',
    emoji: '🧾',
    subject: 'Payment received — thank you!',
    body: `Hi {{parentFirst}},

We received your payment for {{playerFirst}} — thank you! Remaining season balance: {{balance}}.

{{orgName}}`,
  },
]

export const DEFAULT_AUTOMATIONS: Automation[] = [
  { id: 'welcomeLead', name: 'Instant thank-you to new signups', description: 'When a family fills out the tryout form, email them right away with their age group.', enabled: true, runs: 0 },
  { id: 'tryoutInvite', name: 'Tryout invitation', description: 'When a lead is moved to "Tryout Set", send the tryout details email.', enabled: true, runs: 0 },
  { id: 'welcomeFamily', name: 'Welcome-to-the-team email', description: 'When a player commits, create their family profile, registration, and send the welcome email.', enabled: true, runs: 0 },
  { id: 'paymentReceipt', name: 'Payment receipts', description: 'When a payment is recorded, email the family a receipt with their remaining balance.', enabled: true, runs: 0 },
  { id: 'commitTask', name: 'Uniform order task', description: 'When a player commits, add a staff task to order their uniform.', enabled: true, runs: 0 },
]

export function buildSeed(now = new Date()): ClubData {
  const r = rng(42)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const iso = (d: Date) => d.toISOString()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Fall/winter belongs to next year's spring/summer season.
  const seasonYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear()

  const settings = {
    name: 'Riverside Thunder Baseball',
    mascot: '⚡',
    primaryColor: '#1d4ed8',
    accentColor: '#f59e0b',
    seasonYear,
    ageCutoffMonth: 4,
    ageCutoffDay: 30,
    defaultFee: 1650,
    contactEmail: 'info@riversidethunder.com',
    city: 'Riverside',
  }

  const teamDefs: [number, string, string, string, number][] = [
    [9, 'Thunder 9U', 'Coach Dave Wilson', '#0ea5e9', 1450],
    [10, 'Thunder 10U', 'Coach Maria Lopez', '#22c55e', 1550],
    [11, 'Thunder 11U', 'Coach Ray Jenkins', '#f97316', 1650],
    [12, 'Thunder 12U', 'Coach Tom Bradley', '#a855f7', 1850],
    [14, 'Thunder 14U', 'Coach Andre Simmons', '#ef4444', 2150],
  ]
  const teams: Team[] = teamDefs.map(([age, name, coach, color, fee]) => ({
    id: `team_${age}u`,
    name,
    ageGroup: age,
    headCoach: coach,
    coachEmail: `${coach.split(' ')[1].toLowerCase()}@riversidethunder.com`,
    color,
    rosterLimit: age >= 13 ? 14 : 12,
    fee,
    practiceLocation: pick(['Riverside Park Field 2', 'Oak Hollow Sports Complex', 'Lincoln HS Practice Field']),
  }))

  const families: Family[] = []
  const players: Player[] = []
  const registrations: Registration[] = []
  const usedNames = new Set<string>()
  const posSets: Position[][] = [['P', 'SS'], ['C', '3B'], ['1B', 'P'], ['2B', 'SS'], ['CF', 'P'], ['LF', 'RF'], ['3B', 'P'], ['C'], ['SS', 'CF'], ['RF', '1B'], ['2B', 'LF'], ['P', 'UT']]
  const sizes = ['YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL']
  const plans: PaymentPlan[] = ['full', '3-pay', '3-pay', 'monthly', 'monthly']
  const methods: PaymentMethod[] = ['Card', 'Card', 'Venmo', 'Zelle', 'Check', 'Cash']
  const rosterTarget: Record<number, number> = { 9: 11, 10: 12, 11: 10, 12: 12, 14: 12 }

  const firstDue = toDateISO(addMonths(today, -2)).slice(0, 8) + '01'
  for (const team of teams) {
    const count = rosterTarget[team.ageGroup]
    const jerseys = new Set<number>()
    for (let i = 0; i < count; i++) {
      let first: string, last: string
      do {
        first = pick(FIRST.slice(0, 50))
        last = pick(LAST)
      } while (usedNames.has(first + last))
      usedNames.add(first + last)
      // Birth year so baseball age (Apr 30 of season year) == team age group
      const by = seasonYear - team.ageGroup - (r() < 0.5 ? 0 : 1)
      const month = by === seasonYear - team.ageGroup ? 1 + Math.floor(r() * 4) : 5 + Math.floor(r() * 8)
      const birth = `${by}-${String(month).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`
      const fam: Family = {
        id: uid('fam'),
        parentName: `${pick(PARENT_FIRST)} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}.fam@example.com`,
        phone: `(555) ${String(200 + Math.floor(r() * 700))}-${String(1000 + Math.floor(r() * 8999))}`,
        createdAt: iso(addDays(today, -60 - Math.floor(r() * 300))),
      }
      families.push(fam)
      let jersey: number
      do jersey = 1 + Math.floor(r() * 44)
      while (jerseys.has(jersey))
      jerseys.add(jersey)
      const sizeIdx = Math.min(sizes.length - 1, Math.max(0, team.ageGroup - 9 + Math.floor(r() * 3)))
      const p: Player = {
        id: uid('ply'),
        familyId: fam.id,
        firstName: first,
        lastName: last,
        birthDate: birth,
        teamId: team.id,
        jersey: String(jersey),
        positions: pick(posSets),
        bats: r() < 0.25 ? 'L' : r() < 0.1 ? 'S' : 'R',
        throws: r() < 0.15 ? 'L' : 'R',
        status: 'active',
        jerseySize: sizes[sizeIdx],
        pantsSize: sizes[sizeIdx],
        hatSize: pick(['S/M', 'M/L']),
      }
      players.push(p)

      const plan = pick(plans)
      const reg: Registration = {
        id: uid('reg'),
        playerId: p.id,
        teamId: team.id,
        season: seasonYear,
        fee: team.fee,
        discount: r() < 0.12 ? 150 : 0,
        fundraisingCredit: r() < 0.35 ? [50, 100, 150, 200][Math.floor(r() * 4)] : 0,
        plan,
        firstDueDate: firstDue,
        payments: [],
        createdAt: fam.createdAt,
      }
      // Pay according to plan, with a few families falling behind.
      const sched = installmentSchedule({ plan, firstDueDate: firstDue, total: amountDue(reg) })
      const behind = r() < 0.2
      for (const inst of sched) {
        if (inst.due > toDateISO(today)) break
        if (behind && inst !== sched[0]) break
        reg.payments.push({
          id: uid('pay'),
          amount: inst.amount,
          date: toDateISO(addDays(new Date(inst.due + 'T12:00'), -Math.floor(r() * 5))),
          method: pick(methods),
        })
      }
      registrations.push(reg)
    }
  }

  // ----- Leads
  const sources: LeadSource[] = ['Website', 'Website', 'Website', 'Referral', 'Referral', 'Social Media', 'Social Media', 'Tournament', 'Flyer']
  const stagePlan: LeadStage[] = ['new', 'new', 'new', 'new', 'new', 'new', 'contacted', 'contacted', 'contacted', 'contacted', 'tryout', 'tryout', 'tryout', 'tryout', 'tryout', 'offered', 'offered', 'committed', 'committed', 'committed', 'lost', 'lost']
  const experiences = ['Rec league 2 years', 'Little League all-stars', 'Played 1 season travel', 'New to baseball, very athletic', 'Rec league + pitching lessons', 'Moved from out of state, played travel']
  const leads: Lead[] = stagePlan.map((stage, i) => {
    const last = pick(LAST)
    const age = pick([9, 10, 10, 11, 11, 12, 12, 13, 14])
    const by = seasonYear - age
    const created = addDays(today, -Math.floor(r() * 35) - (stage === 'new' ? 0 : 5))
    const lead: Lead = {
      id: uid('lead'),
      parentName: `${pick(PARENT_FIRST)} ${last}`,
      email: `${last.toLowerCase()}${i}@example.com`,
      phone: `(555) ${String(200 + Math.floor(r() * 700))}-${String(1000 + Math.floor(r() * 8999))}`,
      playerFirst: pick(FIRST),
      playerLast: last,
      birthDate: `${by}-0${1 + Math.floor(r() * 3)}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`,
      positions: pick(posSets),
      experience: pick(experiences),
      source: pick(sources),
      stage,
      rating: stage === 'offered' || stage === 'committed' ? 4 + Math.floor(r() * 2) : stage === 'lost' ? 2 : undefined,
      createdAt: iso(created),
      updatedAt: iso(addDays(created, 2)),
    }
    if (stage === 'new' && i < 3) lead.createdAt = lead.updatedAt = iso(new Date(now.getTime() - (i + 1) * 3600_000 * 5))
    return lead
  })

  // ----- Events
  const events: ClubEvent[] = []
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d)
    x.setHours(h, m, 0, 0)
    return x
  }
  // Weekly practices: each team, Tue + Thu, 2 weeks back to 3 weeks forward
  const practiceDays = [2, 4]
  for (let off = -14; off <= 24; off++) {
    const d = addDays(today, off)
    if (!practiceDays.includes(d.getDay())) continue
    teams.forEach((t, ti) => {
      const start = at(d, 17 + (ti % 3), ti % 2 ? 30 : 0)
      events.push({
        id: uid('evt'),
        type: 'practice',
        title: `${t.name} Practice`,
        teamIds: [t.id],
        start: iso(start),
        end: iso(new Date(start.getTime() + 90 * 60000)),
        location: t.practiceLocation,
        rsvps: {},
      })
    })
  }
  const nextSat = addDays(today, ((6 - today.getDay() + 7) % 7) || 7)
  const tourneys: [number, string, string, string, string[]][] = [
    [0, 'Fall Classic Showdown', 'Diamond Ridge Complex', 'Hampton Inn Diamond Ridge — team rate $119/night', ['team_10u', 'team_11u', 'team_12u']],
    [14, 'Turkey Bowl Invitational', 'Coastal Sports Park', 'Courtyard Coastal — book by Friday, code THUNDER', ['team_9u', 'team_10u', 'team_14u']],
    [-7, 'Harvest Moon Tournament', 'Lakeside Fields', undefined as unknown as string, ['team_12u', 'team_14u']],
  ]
  for (const [off, title, loc, hotel, tids] of tourneys) {
    const s = at(addDays(nextSat, off), 8)
    const e = at(addDays(nextSat, off + 1), 18)
    events.push({ id: uid('evt'), type: 'tournament', title, teamIds: tids, start: iso(s), end: iso(e), location: loc, address: `${loc}, 1200 Tournament Way`, hotel, notes: 'Pool play Saturday, bracket Sunday. Gate fee $10/day per adult.', rsvps: {} })
  }
  const games: [number, string, string][] = [[3, 'team_11u', 'Bayside Bombers'], [5, 'team_9u', 'Metro Mavericks'], [10, 'team_14u', 'Northside Nationals']]
  for (const [off, tid, opp] of games) {
    const s = at(addDays(today, off), 18)
    const t = teams.find((x) => x.id === tid)!
    events.push({ id: uid('evt'), type: 'game', title: `${t.name} vs ${opp}`, teamIds: [tid], opponent: opp, start: iso(s), end: iso(new Date(s.getTime() + 2 * 3600000)), location: 'Riverside Park Field 1', rsvps: {} })
  }
  const tryout1 = at(addDays(today, 6), 9)
  const tryout2 = at(addDays(today, 13), 9)
  const tryoutA: ClubEvent = { id: 'evt_tryout_a', type: 'tryout', title: 'Spring Tryouts — 9U to 11U', teamIds: [], start: iso(tryout1), end: iso(new Date(tryout1.getTime() + 3 * 3600000)), location: 'Oak Hollow Sports Complex', notes: 'Check-in table opens 8:30. Bring glove, bat, helmet, cleats.', rsvps: {} }
  const tryoutB: ClubEvent = { id: 'evt_tryout_b', type: 'tryout', title: 'Spring Tryouts — 12U to 14U', teamIds: [], start: iso(tryout2), end: iso(new Date(tryout2.getTime() + 3 * 3600000)), location: 'Oak Hollow Sports Complex', notes: 'Pitchers will throw a 15-pitch bullpen.', rsvps: {} }
  events.push(tryoutA, tryoutB)
  const fund = at(addDays(today, 9), 11)
  events.push({ id: uid('evt'), type: 'fundraiser', title: 'Hot Dog & Car Wash Fundraiser', teamIds: [], start: iso(fund), end: iso(new Date(fund.getTime() + 4 * 3600000)), location: 'Main St Hardware parking lot', notes: 'Every family that volunteers 2 hours earns $50 in fundraising credit!', rsvps: {} })
  const meet = at(addDays(today, 4), 19)
  events.push({ id: uid('evt'), type: 'meeting', title: 'Spring Season Parent Meeting', teamIds: [], start: iso(meet), end: iso(new Date(meet.getTime() + 3600000)), location: 'Riverside Library Community Room', rsvps: {} })

  leads.forEach((l) => {
    if (l.stage === 'tryout') l.tryoutEventId = l.birthDate.slice(0, 4) >= String(seasonYear - 11) ? tryoutA.id : tryoutB.id
  })

  // RSVPs for upcoming team events
  for (const ev of events) {
    const daysOut = (new Date(ev.start).getTime() - today.getTime()) / 86400000
    const roster = players.filter((p) => ev.teamIds.includes(p.teamId ?? ''))
    for (const p of roster) {
      if (daysOut < 0 || r() < 0.85 - Math.min(daysOut, 20) / 30) {
        const x = r()
        ev.rsvps[p.id] = (x < 0.82 ? 'yes' : x < 0.92 ? 'maybe' : 'no') as RSVP
      }
    }
  }

  const tasks: Task[] = [
    { id: uid('task'), title: 'Book umpires for Fall Classic', due: toDateISO(addDays(today, 1)), done: false, assignee: 'Dave W.', createdAt: iso(today) },
    { id: uid('task'), title: 'Order 2 dozen game balls', due: toDateISO(today), done: false, assignee: 'Maria L.', createdAt: iso(today) },
    { id: uid('task'), title: 'Confirm Oak Hollow fields for tryouts', due: toDateISO(addDays(today, 3)), done: false, assignee: 'Ray J.', createdAt: iso(today) },
    { id: uid('task'), title: 'Print tryout check-in sheets', due: toDateISO(addDays(today, 5)), done: false, assignee: 'Tom B.', createdAt: iso(today) },
    { id: uid('task'), title: 'Upload 12U tournament photos', due: toDateISO(addDays(today, -1)), done: true, assignee: 'Andre S.', createdAt: iso(today) },
  ]

  const shoutouts = [
    { id: uid('sh'), playerId: players[14].id, text: 'Walk-off double in the Harvest Moon semis! 🔥', createdAt: iso(addDays(today, -6)) },
    { id: uid('sh'), playerId: players[3].id, text: 'Threw 3 perfect innings and cheered loudest from the dugout.', createdAt: iso(addDays(today, -3)) },
    { id: uid('sh'), playerId: players[40].id, text: 'Diving catch in center to save the game. Web gem of the year!', createdAt: iso(addDays(today, -1)) },
  ]

  const automations = DEFAULT_AUTOMATIONS.map((a) => ({ ...a, runs: { welcomeLead: 38, tryoutInvite: 21, welcomeFamily: 57, paymentReceipt: 143, commitTask: 57 }[a.id] }))

  return {
    version: 1,
    settings,
    teams,
    families,
    players,
    leads,
    events,
    registrations,
    templates: DEFAULT_TEMPLATES,
    messages: [
      { id: uid('msg'), audience: 'team:team_12u', audienceLabel: 'Thunder 12U families', subject: 'Thunder 12U tournament weekend — everything you need', body: 'Tournament weekend is almost here!…', recipients: families.slice(0, 12).map((f) => f.email), sentAt: iso(addDays(today, -8)), automated: false },
      { id: uid('msg'), audience: 'all', audienceLabel: 'All families', subject: 'Spring tryout dates are live!', body: 'Spread the word…', recipients: families.map((f) => f.email), sentAt: iso(addDays(today, -4)), automated: false },
    ],
    tasks,
    automations,
    shoutouts,
    activity: [
      { id: uid('act'), at: iso(new Date(now.getTime() - 5 * 3600000)), emoji: '📥', text: `New tryout signup: ${leads[0].playerFirst} ${leads[0].playerLast}` },
      { id: uid('act'), at: iso(new Date(now.getTime() - 26 * 3600000)), emoji: '💰', text: `Payment received from the ${families[5].parentName.split(' ')[1]} family` },
      { id: uid('act'), at: iso(new Date(now.getTime() - 50 * 3600000)), emoji: '🎉', text: `${leads[17].playerFirst} ${leads[17].playerLast} committed to the club` },
    ],
  }
}

/** A blank club, ready for a real organization to fill in. */
export function buildEmpty(now = new Date()): ClubData {
  const seed = buildSeed(now)
  return {
    ...seed,
    settings: { ...seed.settings, name: 'My Travel Baseball Club', contactEmail: '', city: '' },
    teams: [],
    families: [],
    players: [],
    leads: [],
    events: [],
    registrations: [],
    messages: [],
    tasks: [],
    shoutouts: [],
    automations: DEFAULT_AUTOMATIONS.map((a) => ({ ...a })),
    activity: [{ id: uid('act'), at: now.toISOString(), emoji: '⚾', text: 'Club created — welcome to Dugout HQ!' }],
  }
}

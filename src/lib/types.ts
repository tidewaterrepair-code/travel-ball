// Core data model for Dugout HQ.
// Everything is plain JSON so it can be persisted locally today and moved to
// a hosted database later without reshaping.

export type ID = string

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'UT'
export const POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'UT']

export type Hand = 'R' | 'L' | 'S'

export interface OrgSettings {
  name: string
  mascot: string // emoji
  primaryColor: string
  accentColor: string
  seasonYear: number
  /** Baseball age = player's age on this month/day of the season year (USSSA default: Apr 30). */
  ageCutoffMonth: number // 1-12
  ageCutoffDay: number
  defaultFee: number
  contactEmail: string
  city: string
  /** Sidebar / scoreboard background. Derived from the primary color when branding from a website. */
  darkColor?: string
  website?: string
  /** data: URL of the club logo (kept small so it fits in local storage) */
  logo?: string
  /** data: URL of a wide hero image, e.g. the club website's share banner */
  banner?: string
}

export interface Team {
  id: ID
  name: string
  ageGroup: number // 8 => 8U
  headCoach: string
  coachEmail: string
  color: string
  rosterLimit: number
  fee: number
  practiceLocation: string
}

export interface Family {
  id: ID
  parentName: string
  email: string
  phone: string
  secondaryParent?: string
  secondaryEmail?: string
  address?: string
  notes?: string
  createdAt: string
}

export interface Player {
  id: ID
  familyId: ID
  firstName: string
  lastName: string
  birthDate: string // YYYY-MM-DD
  teamId: ID | null
  jersey?: string
  positions: Position[]
  bats: Hand
  throws: Hand
  status: 'active' | 'inactive' | 'alumni'
  jerseySize?: string
  pantsSize?: string
  hatSize?: string
  medicalNotes?: string
}

export type LeadStage = 'new' | 'contacted' | 'tryout' | 'offered' | 'committed' | 'lost'
export const LEAD_STAGES: { id: LeadStage; label: string; emoji: string; hint: string }[] = [
  { id: 'new', label: 'New Interest', emoji: '📥', hint: 'Just signed up' },
  { id: 'contacted', label: 'Contacted', emoji: '📞', hint: 'We reached out' },
  { id: 'tryout', label: 'Tryout Set', emoji: '🧢', hint: 'Coming to try out' },
  { id: 'offered', label: 'Roster Offer', emoji: '🤝', hint: 'Spot offered' },
  { id: 'committed', label: 'Committed', emoji: '🎉', hint: 'Joined the club' },
  { id: 'lost', label: 'Not This Year', emoji: '🌙', hint: 'Passed for now' },
]

export type LeadSource = 'Website' | 'Referral' | 'Social Media' | 'Tournament' | 'Flyer' | 'Other'
export const LEAD_SOURCES: LeadSource[] = ['Website', 'Referral', 'Social Media', 'Tournament', 'Flyer', 'Other']

export interface Lead {
  id: ID
  parentName: string
  email: string
  phone: string
  playerFirst: string
  playerLast: string
  birthDate: string
  positions: Position[]
  experience: string
  source: LeadSource
  stage: LeadStage
  tryoutEventId?: ID
  /** 1-5 coach evaluation from tryouts */
  rating?: number
  notes?: string
  createdAt: string
  updatedAt: string
  convertedPlayerId?: ID
}

export type EventType = 'practice' | 'game' | 'tournament' | 'tryout' | 'fundraiser' | 'meeting'
export const EVENT_TYPES: { id: EventType; label: string; emoji: string }[] = [
  { id: 'practice', label: 'Practice', emoji: '🏏' },
  { id: 'game', label: 'Game', emoji: '⚾' },
  { id: 'tournament', label: 'Tournament', emoji: '🏆' },
  { id: 'tryout', label: 'Tryout', emoji: '🧢' },
  { id: 'fundraiser', label: 'Fundraiser', emoji: '🌭' },
  { id: 'meeting', label: 'Parent Meeting', emoji: '📋' },
]

export type RSVP = 'yes' | 'no' | 'maybe'

export interface ClubEvent {
  id: ID
  type: EventType
  title: string
  teamIds: ID[] // empty = whole club
  start: string // ISO
  end: string // ISO
  location: string
  address?: string
  opponent?: string
  hotel?: string
  notes?: string
  rsvps: Record<ID, RSVP> // playerId -> rsvp
}

export type PaymentMethod = 'Card' | 'Venmo' | 'Cash' | 'Check' | 'Zelle'
export const PAYMENT_METHODS: PaymentMethod[] = ['Card', 'Venmo', 'Zelle', 'Check', 'Cash']

export interface Payment {
  id: ID
  amount: number
  date: string
  method: PaymentMethod
  note?: string
}

export type PaymentPlan = 'full' | '3-pay' | 'monthly'
export const PAYMENT_PLANS: { id: PaymentPlan; label: string; installments: number }[] = [
  { id: 'full', label: 'Paid in full', installments: 1 },
  { id: '3-pay', label: '3 payments', installments: 3 },
  { id: 'monthly', label: '6 monthly', installments: 6 },
]

export interface Registration {
  id: ID
  playerId: ID
  teamId: ID | null
  season: number
  fee: number
  discount: number
  fundraisingCredit: number
  plan: PaymentPlan
  firstDueDate: string
  payments: Payment[]
  createdAt: string
}

export type Audience = 'all' | 'unpaid' | 'leads' | `team:${string}`

export interface Template {
  id: ID
  name: string
  emoji: string
  subject: string
  body: string
}

export interface Message {
  id: ID
  audience: Audience
  audienceLabel: string
  subject: string
  body: string
  recipients: string[]
  sentAt: string
  automated: boolean
}

export interface Task {
  id: ID
  title: string
  due: string
  done: boolean
  assignee: string
  createdAt: string
}

export type AutomationId = 'welcomeLead' | 'tryoutInvite' | 'welcomeFamily' | 'paymentReceipt' | 'commitTask'

export interface Automation {
  id: AutomationId
  name: string
  description: string
  enabled: boolean
  runs: number
}

export interface Shoutout {
  id: ID
  playerId: ID
  text: string
  createdAt: string
}

export interface ActivityItem {
  id: ID
  at: string
  emoji: string
  text: string
}

export interface ClubData {
  version: 1
  settings: OrgSettings
  teams: Team[]
  families: Family[]
  players: Player[]
  leads: Lead[]
  events: ClubEvent[]
  registrations: Registration[]
  templates: Template[]
  messages: Message[]
  tasks: Task[]
  automations: Automation[]
  shoutouts: Shoutout[]
  activity: ActivityItem[]
}

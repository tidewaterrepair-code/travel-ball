# ⚾ Dugout HQ: club operations for travel baseball

**Run your club. All in one place.** Dugout HQ gives a travel baseball organization one friendly
system for tryout leads, families, rosters, schedules, dues, and parent communication, so
coaches can spend their time coaching.

It ships with a fully loaded demo club ("Riverside Thunder Baseball": 5 teams, 57 players, live
leads, tournaments, and payment plans), so you can show it to a prospective club in under a minute.

![Scoreboard](docs/screenshots/scoreboard.png)

| Tryouts & Leads | Teams & Rosters | Parent signup |
|---|---|---|
| ![](docs/screenshots/leads.png) | ![](docs/screenshots/teams.png) | ![](docs/screenshots/signup.png) |

## What's inside

| Area | What it does |
|---|---|
| 🏟️ **Scoreboard** | Scoreboard-style KPIs, a countdown to the next tournament, signup trend, team roster fill, staff to-dos, player shoutouts, and an activity feed |
| 🧢 **Tryouts & Leads** | Drag-and-drop pipeline (New → Contacted → Tryout Set → Roster Offer → Committed), auto age group plus best-fit team, star ratings, tryout session assignment, one-click **Commit** |
| 🔗 **Public signup page** (`#/join`) | Branded, mobile-first tryout form for parents. Shows their age group live as they type the birthday. New signups land on the Leads board automatically |
| 👨‍👩‍👦 **Families & Players** | One database for every contact, position, B/T, uniform size, and medical note. Siblings grouped by family. CSV export |
| ⚾ **Teams & Rosters** | Roster cards with jersey numbers, an **"On the field"** diamond view, position-depth warnings (e.g. not enough arms), auto-place unassigned players, printable roster |
| 📅 **Schedule** | Practices (repeat weekly), games, tournaments with hotel blocks, tryouts, fundraisers, and meetings. Per-player RSVPs. Export to Google, Apple, or Outlook (`.ics`) |
| 💵 **Dues & Payments** | Season fees, discounts, fundraising credits, payment plans (full / 3-pay / monthly), installment schedules, **past-due detection**, one-click friendly reminders |
| 📣 **Messages** | Templates with merge fields (`{{parentFirst}}`, `{{playerFirst}}`, `{{balance}}`, `{{nextDue}}`…), audience targeting (team, everyone, unpaid, open leads), live per-family preview |
| ⚡ **Automations** | Thank-you on signup, tryout invite, commit → family + registration + welcome email + uniform task, payment receipts. Each can be toggled on or off |
| 📊 **Reports** | Revenue by team (collected vs owed), monthly collections, recruiting funnel, lead-source conversion. CSV export |
| 🔄 **Season rollover** | Previews and then moves every player up to their new age group, creates new registrations, and graduates players who aged out |
| ⚙️ **Settings** | Club name, mascot, colors (the whole app re-themes), age-cutoff rule (USSSA Apr 30 by default), templates, JSON backup and restore, start a fresh club |

The fun parts: confetti when a player commits or a family pays in full, scoreboard digits,
baseball-flavored toasts ("Safe at home! 🏠"), shoutouts, and a club-colored theme everywhere.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # business-logic tests (age groups, payments, automations, rollover)
npm run build      # static site in dist/
```

The build is a static site that works on any host (GitHub Pages, Netlify, Vercel, S3).
`.github/workflows/deploy.yml` publishes the demo to GitHub Pages on every push to `main`.
To use it, turn on **Settings → Pages → Source: GitHub Actions** in the repo.

## How it's built

- React 19 + TypeScript + Vite + Tailwind CSS v4, with Zustand for state
- `src/lib/types.ts`: the data model (teams, families, players, leads, events, registrations, messages…)
- `src/lib/ops.ts`: pure business operations and automations, unit-tested in `src/lib/core.test.ts`
- `src/lib/utils.ts`: baseball-age math, installment schedules, past-due logic, template merging
- `src/lib/seed.ts`: the demo club (dates are relative to today, so it always looks live)
- `src/pages/*`: one file per screen

## Current limits (and the path to production)

This version is **local-first**: each browser keeps its own copy of the data (localStorage), and
**emails are personalized and logged, not delivered**. That's ideal for demos and pilots. Before
charging a club for production use, add:

1. **Hosted database + logins.** Move `ClubData` to Supabase or Postgres (the shapes in
   `types.ts` map 1:1 to tables) and add staff accounts and roles (admin, coach, treasurer).
2. **Email/SMS delivery.** Send the messages `ops.ts` already produces through Resend, Postmark,
   SendGrid, or Twilio.
3. **Online payments.** Stripe Checkout or Payment Links for each installment, with a webhook
   that calls `recordPayment`.
4. **Parent portal.** A read-only team page for schedules, RSVPs, and balances.
5. **Data import.** A CSV importer for clubs moving off spreadsheets or other platforms.

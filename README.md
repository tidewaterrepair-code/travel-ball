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

## 🎨 Customize it for any club in 30 seconds

Before a pitch meeting, click **🎨 Customize for a club** (dashboard, sidebar, or Settings) and paste
the club's website. Dugout HQ reads the site and dresses the whole app in that club's brand:

- **Name** from the site (`og:site_name`, structured data, or a cleaned-up page title)
- **Logo** from the header image, structured data, or icons (picked by score)
- **Colors** from the logo's pixels, snapped to the exact hex codes the site declares (theme-color, CSS),
  then adjusted so text stays readable (WCAG 4.5:1)
- **Banner photo** (the site's share image) used as header art on the dashboard and signup page
- **Mascot** guessed from the name (Sharks 🦈, Hurricanes 🌪️, Thunder ⚡ …) and the contact email
- **Team names**: demo teams become "*Tidewater Sharks 9U, 10U …*" across rosters, schedule, and messages

You can adjust everything in a live preview before applying. No logo? Every club gets a generated
shield crest in its colors with its initials.

**Facebook or Instagram only?** Those sites block lookups. Switch to **From a logo or screenshot**
and drop, choose, or paste (Ctrl/⌘+V) a screenshot of their logo or banner. This runs fully in the browser.

**Pitch links:** after a website lookup, **🔗 Copy pitch link** gives you
`https://your-app/#/?brand=their-site.com`. Whoever opens it sees the demo already in their colors.

![Branded for a club](docs/screenshots/branded-dashboard.png)

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
npm run build      # app in dist/ + server in dist-server/
npm start          # production server on http://localhost:3000
```

## Accounts, clubs and roles

| Address | What it is |
|---|---|
| `/` | The **demo club + pitch tool** (data stays in the visitor's browser) |
| `/admin` | **Your console**: every club on the platform, add new clubs (people listed in `ADMIN_EMAILS`) |
| `/login` | Email sign-in (one-time links, no passwords) |
| `/c/<club>/` | A **real club**, saved on the server and shared by its staff |
| `/c/<club>/#/join` | That club's **public tryout form** (no login; signups land on their Leads board) |

- **Admins** can do everything, including settings, branding, dues and payments, and inviting staff.
- **Coaches** run teams, schedule, leads and messages, but the server refuses changes to settings,
  templates, automations, fees or payments.
- Changes save automatically in the background. If two people save at once, nothing is lost:
  the second save is replayed on top of the first. Other staff see changes within about 15 seconds.
- The database is one SQLite file in the `app_data` volume, backed up daily (14 kept) to
  `/app/data/backups`. Copy one off the server with `bash deploy/backup-offsite.sh you@vps ~/backups`.

## Run it on your VPS

Everything (the app, the website-lookup API, and HTTPS) runs on one server. Any small VPS with
1 GB RAM running Ubuntu or Debian works.

### Option A: Docker (recommended)

1. **Point your domain at the server.** At your DNS provider, add an **A record** for
   `app.yourdomain.com` with your VPS's IP address.
2. **Get the code onto the VPS:**
   ```bash
   ssh you@your-vps
   git clone https://github.com/tidewaterrepair-code/travel-ball.git dugout-hq
   cd dugout-hq
   ```
   (Private repo? Use a GitHub personal access token as the password, or add a deploy key.)
3. **Install and start:**
   ```bash
   sudo bash deploy/install.sh
   ```
   It installs Docker if needed, asks for your domain and email, checks your DNS, opens ports
   80/443 in the firewall, and starts the app. Caddy gets a free HTTPS certificate automatically.
4. Open `https://app.yourdomain.com/admin` and sign in with the email you entered. Until email
   delivery is set up, your sign-in link prints in the logs:
   `docker compose logs app | grep 'Sign in:' | tail -1`
5. **Add your first club** in the admin console. You get the owner's sign-in link to text them.

### Optional: real email (recommended before your first paying club)

Create a free [Resend](https://resend.com) account, verify your domain, and add to `.env`:
```
RESEND_API_KEY=re_...
EMAIL_FROM=Dugout HQ <hello@yourdomain.com>
```
Then `docker compose up -d`. Sign-in links and staff invites are now emailed automatically.

| Task | Command |
|---|---|
| Update to the latest code | `bash deploy/update.sh` |
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |

### Option B: Without Docker (Node + systemd + Caddy)

```bash
# Node 20+ and Caddy installed (https://caddyserver.com/docs/install)
sudo git clone https://github.com/tidewaterrepair-code/travel-ball.git /opt/dugout-hq
cd /opt/dugout-hq && sudo npm ci && sudo npm run build
sudo cp deploy/dugout-hq.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now dugout-hq
sudo cp deploy/Caddyfile.host /etc/caddy/Caddyfile   # edit the domain first
sudo systemctl reload caddy
```

### Notes

- `npm start` runs the production server (`dist-server/server.mjs`, no runtime dependencies) on
  port 3000. It serves the app and `/api/brand`, plus `/healthz` for uptime monitors.
- The website lookup only fetches public http(s) addresses. It blocks localhost, private, and
  cloud-metadata IPs (re-checked on every redirect), caps download sizes, times out after 9 seconds,
  and is rate-limited per visitor (`BRAND_RATE_LIMIT`, default 20 per minute).

## How it's built

- React 19 + TypeScript + Vite + Tailwind CSS v4, with Zustand for state
- `src/lib/types.ts`: the data model (teams, families, players, leads, events, registrations, messages…)
- `src/lib/ops.ts`: pure business operations and automations, unit-tested in `src/lib/core.test.ts`
- `src/lib/utils.ts`: baseball-age math, installment schedules, past-due logic, template merging
- `src/lib/seed.ts`: the demo club (dates are relative to today, so it always looks live)
- `src/lib/brand.ts`: palette extraction, theme picking with contrast fixes, team renaming (`applyBrand`)
- `server/extract.ts` + `server/brandLookup.ts`: website → brand kit (name, logo, banner, colors), with SSRF protection
- `server/index.ts`: the production server for your VPS (static files, API, daily backups)
- `server/api.ts` + `server/db.ts`: sign-in, clubs, roles, conflict-safe saving (SQLite), public tryout signups; tested in `server/api.test.ts`
- `src/lib/sync.ts`: background saving with conflict replay and live updates
- `api/brand.ts`: the lookup handler (also served by `npm run dev` / `npm run preview` via a Vite plugin)
- `src/pages/*`: one file per screen

## Roadmap to revenue

1. ✅ Shared data, staff sign-in and a space per club
2. **Online payments (Stripe Connect):** families pay dues and installments online, with autopay; the platform earns a fee per payment
3. **Real email and text delivery** for automations and announcements
4. **Parent app:** schedule, RSVPs and payments on parents' phones
5. **Import** from spreadsheets and other platforms

# SpaceIT Developer Dashboard

One place for the whole sprint workflow of the SpaceIT Labs dev team: backlog → sprint plan → estimate → board → review → staging → production, with time tracking, a meeting notes taker and analytics on top.

Stack: Next.js 15 (App Router, server actions) · TypeScript · Tailwind · PostgreSQL via Prisma · Recharts.

## Run it

```bash
cp .env.example .env          # set DATABASE_URL at minimum
npm install
npm run db:push               # create tables
npm run db:seed               # demo data: 6 devs, 3 projects, 5 sprints, 46 tickets, meetings
npm run dev                   # http://localhost:3000
npm test                      # unit tests (workflow rules, estimation, notes, analytics)
```

Out of the box (no Google credentials, not production) the login page offers a seeded-user picker. For real use follow **[docs/SETUP.md](docs/SETUP.md)**: Google sign-in restricted to the office domain, per-user Jira and Google connections, webhooks and scheduled sync.

## What's in it

| Page | What it does |
|---|---|
| Overview | Active sprint KPIs, burndown, cards per column, who is working on what right now, upcoming meetings, items needing attention |
| Board | The 10 columns: Backlog, Ready to Dev, In Progress, Initial Review, Review, Deployed to Stg, Failed in Staging, Documented, Deployed to Production, Done. Drag or click to move; **backward moves are blocked** (only Deployed to Stg → Failed in Staging → In Progress loops back) |
| Sprints | Sprint planner: drag-to-prioritise backlog, drop into a sprint, capacity vs estimates per developer, auto-fill by priority, start/close sprint (mirrors to Jira) |
| Time & Progress | Start/end day clock, per-card timers (worklogs pushed to Jira), implementation progress %, 14-day hours heatmap |
| Estimation | Planning poker in hours, suggestions learned from finished tickets (type + points → median actual), estimate-accuracy KPIs, apply to ticket + Jira |
| Meetings | The weekly Meet cadence, join links, automated notes taker (paste a transcript or live-capture in the browser) → summary, decisions, action items → create tickets from actions |
| Analytics | Velocity, per-developer points and hours, cycle time, column dwell (bottlenecks), staging failure rate, estimate accuracy |
| Tickets | Create single tickets or bulk quick-capture (`[bug] Title !high #label (3)`), history-based estimate assistant, push to Jira backlog |
| Team | Developer cards and detail pages (day start averages, hours per day, cycle time, accuracy) |

### Process gates enforced on the board
- Ready to Dev needs a sprint and an estimate; In Progress needs an assignee.
- Initial Review needs a linked PR.
- **Review needs a passing initial Claude review** (every critical item of the PR review template cleared). The review panel runs the template, scans the PR diff when `GITHUB_TOKEN` is set (migrations, seeders, secrets, destructive SQL, debug leftovers, missing tests) and lets you tick the rest.
- Moving out of In Progress stops running timers.

### Meeting cadence (team timezone, default `Asia/Colombo`)
Standup Mon–Fri 08:45–09:00 · Grooming Mon–Fri 09:00–09:15 · Estimation Mon 09:15–09:45 · Sprint plan Mon 11:30–12:30 · Weekly summary Wed 17:00–17:30 · Demo Thu 11:30–12:00. Defined in `src/lib/schedule.ts`.

## Integrations

- **Jira Cloud** (`src/lib/integrations/jira.ts`): per-user OAuth 2.0 (3LO) with an optional service account for cron. Issue search/sync, create issues in the backlog, set estimates, transition by target status name, worklogs, sprint create/start/close, move issues to a sprint. Webhook: `POST /api/webhooks/jira` mirrors forward-only status changes.
- **GitHub** (`github.ts`): org repos, PR sync to tickets by key in title/branch, diff fetch for review scan. Webhook: `POST /api/webhooks/github` (`pull_request` events, optional HMAC secret).
- **Google Calendar / Meet** (`google.ts`, `meet.ts`): links existing calendar events or creates them with Meet links for the cadence, and imports real Meet transcripts (Meet REST API) into the notes taker, on demand or via `/api/cron/transcripts`.
- **Claude** (optional `ANTHROPIC_API_KEY`): LLM meeting summaries; a heuristic parser is used otherwise.

If an integration call fails, the local change still succeeds and the error is surfaced in the UI.

## Security model
- Sign-in with Google (OIDC, PKCE, state cookie), only `AUTH_ALLOWED_DOMAIN` accounts with verified email; DB-backed sessions (hashed token, httpOnly cookie, 14 days); deactivating a user signs them out everywhere.
- Roles: developer, lead, admin (see the table in docs/SETUP.md). Every server action re-checks the role; inputs are validated with zod.
- Jira and Google tokens are per user, AES-256-GCM encrypted with `AUTH_SECRET`, refreshed automatically and dropped if revoked. Actions in Jira/Google are done as the signed-in person.
- Webhooks and cron endpoints require their secrets and refuse to run in production without them.

## Notes
- Capacity assumes `Developer.capacityHrs` productive hours per week and a 15% buffer.
- Story point custom field defaults to `customfield_10016` (`JIRA_STORY_POINTS_FIELD`).

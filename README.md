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

Everything works on the seeded demo data. Integrations switch on when their env vars are set (see `.env.example` and the **Integrations** page).

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

- **Jira Cloud** (`src/lib/integrations/jira.ts`): issue search/sync, create issues in the backlog, set estimates, transition by target status name, worklogs, sprint create/start/close, move issues to a sprint. Webhook: `POST /api/webhooks/jira` mirrors forward-only status changes.
- **GitHub** (`github.ts`): org repos, PR sync to tickets by key in title/branch, diff fetch for review scan. Webhook: `POST /api/webhooks/github` (`pull_request` events, optional HMAC secret).
- **Google Calendar / Meet** (`google.ts`): creates events with Meet links for the cadence (one-off recurring events or rolling sync), imports links.
- **Claude** (optional `ANTHROPIC_API_KEY`): LLM meeting summaries; a heuristic parser is used otherwise.

If an integration call fails, the local change still succeeds and the error is surfaced in the UI.

## Notes
- No login: an internal tool where the sidebar "Working as" picker selects the current developer (cookie). Put it behind your SSO/VPN before exposing it.
- Capacity assumes `Developer.capacityHrs` productive hours per week and a 15% buffer.
- Story point custom field defaults to `customfield_10016` (`JIRA_STORY_POINTS_FIELD`).

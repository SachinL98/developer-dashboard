# Going live: login, Jira and Google Meet

Everything below is configuration; no code changes. Until it is done the app runs in demo mode (seeded users, no external calls).

## 1. Deploy basics
1. Postgres + `npm run db:deploy` (applies `prisma/migrations`). Demo data is optional: `npm run db:seed` (**wipes tables, never run it against real data**).
2. Set `APP_URL` (public https URL), `AUTH_SECRET` (`openssl rand -base64 48`), `ADMIN_EMAILS` (you), `CRON_SECRET` (any long random string).
3. `NODE_ENV=production`: demo sign-in is then off, cookies are `Secure`, webhooks refuse to run without their secrets.

## 2. Google (sign-in + Calendar + Meet)
1. Google Cloud Console → new project → **APIs & Services → Library**: enable **Google Calendar API** and **Google Meet REST API**.
2. **OAuth consent screen**: User type **Internal** (needs the Workspace org; avoids Google's app verification). Add scopes: `openid`, `email`, `profile`, `.../auth/calendar.events`, `.../auth/meetings.space.readonly`.
3. **Credentials → Create OAuth client ID → Web application**. Authorised redirect URI: `{APP_URL}/api/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and leave `AUTH_ALLOWED_DOMAIN=spaceitlabs.com`).
5. Each person signs in with Google, then clicks **Connect** on *Integrations → Google Calendar & Meet* once.
6. For the automated notes taker: Meet transcripts exist only if **Transcript** was on in the call and the Workspace plan supports it. The Meet API only returns transcripts to the meeting organiser/host, so let **one lead's account own the recurring events** (Meetings → *Create recurring Meets* while signed in as that lead) and connect Google with that account. The cron job uses a connected lead/admin.

## 3. Jira Cloud (per-user OAuth 2.0, 3LO)
1. https://developer.atlassian.com/console/myapps → **Create → OAuth 2.0 integration**.
2. **Authorization → OAuth 2.0 (3LO)**: callback URL `{APP_URL}/api/auth/atlassian/callback`.
3. **Permissions**: add **Jira API** and **Jira Software** and configure scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, `read:board-scope:jira-software`, `read:sprint:jira-software`, `write:sprint:jira-software` (the app also requests `offline_access`).
4. **Distribution → Sharing**: set to *Sharing* so teammates (not just the owner) can authorise it.
5. Set `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `JIRA_SITE_URL`, `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID` (the number in the board URL `/boards/<id>`).
6. Check the board's statuses are named exactly like the columns (Backlog, Ready to Dev, In Progress, Initial Review, Review, Deployed to Stg, Failed in Staging, Documented, Deployed to Production, Done) and the workflow has transitions between them.
7. Each person clicks **Connect** on *Integrations → Jira Cloud*. Tickets, sprint moves and worklogs they make in the dashboard are then done as them.
8. Realtime: Jira → System → WebHooks → URL `{APP_URL}/api/webhooks/jira?secret={JIRA_WEBHOOK_SECRET}`, events *Issue created / updated / deleted*, *Sprint created / started / closed / updated* and *Board configuration changed*. Every issue field the dashboard shows (status, assignee, sprint, labels, priority, story points, original estimate) is mirrored on each event. If Jira can't reach the app (localhost, VPN), nothing else is needed: open boards poll every 30 s, and the cron sync covers the rest.
9. The board reads the real Jira board: after the first **Sync Jira** (Integrations page) it shows the board's own columns, and detects how it estimates (story points or original estimate, from the board's *Estimation* setting). Jira statuses are matched to the workflow by name, then by Jira's status category. Admins can override any status in *Integrations → Jira board → workflow mapping*.
10. Estimates: *Apply* in Estimation writes the agreed value to the Jira issue in the detected unit; *Push estimates to Jira* writes a whole sprint. Failed writes are shown on the ticket and can be retried.

> The Atlassian scope names were written from the docs and have not been exercised against a live site. If Jira answers 401/403 "scope does not match", add the scope named in the error to the app's Permissions and to `src/lib/auth/scopes.ts`.

## 4. GitHub
`GITHUB_TOKEN` (fine-grained, read pull requests + contents on the org repos), `GITHUB_ORG`, and a `pull_request` webhook to `{APP_URL}/api/webhooks/github` with `GITHUB_WEBHOOK_SECRET`.

## 5. Scheduled sync (every 10 minutes)
```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/sync         # Jira sprints+issues, GitHub PRs, meeting cadence
curl -fsS -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/transcripts  # Meet transcripts → notes for ended meetings
```

## Roles
| | Developer | Lead | Admin |
|---|---|---|---|
| Log time, progress, vote, create tickets, edit own tickets, move own cards up to Review, run Claude review, notes | ✔ | ✔ | ✔ |
| Plan sprints, assign tickets, move any card (staging/prod), apply estimates, reviewer pass, sync, meetings setup | | ✔ | ✔ |
| Manage users and roles | | | ✔ |

New `@spaceitlabs.com` sign-ins start as Developer. The first sign-in on an instance with no admin, and anyone in `ADMIN_EMAILS`, becomes Admin.

## Admin settings (no redeploy needed)

Admins get **Admin → Meetings** and **Admin → Workspace** in the app. They are stored in the database; env vars are only the defaults and a saved value wins.

- **Meetings:** enable/disable each recurring meeting, set days and times, and a fixed Google Meet link per meeting (empty = Google creates one per occurrence when connected). Saving rebuilds the next two weeks; individual upcoming meetings can have their own link.
- **Workspace:** timezone, work hours, sprint length and start weekday (used for the New sprint form), default hours/week for new users, capacity buffer, Jira project key / board id / story-point and sprint fields, GitHub org, and each project's repository.
- **Never in the UI:** tokens, client secrets, `AUTH_SECRET`, webhook secrets. The Workspace page only shows whether each is set.

## Claude PR review (workflow steps 11-12)

When a card with a linked PR moves to **Initial Review**, the app has Claude review that PR and saves the result on the ticket (summary, findings by severity, checklist, pass/fail). The card shows the state; a failing, running or errored review blocks the move to **Review**. Fix, push, and the review re-runs.

1. `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_REVIEW_MODEL`): an Anthropic API key. Without it only a heuristic diff scan runs, labelled as such, not an AI review.
2. `GITHUB_TOKEN`: fine-grained token with read access to pull requests and contents on the org repos, plus write access to pull requests if you turn on PR comments. Without it the checklist is left for a lead to tick manually.
3. GitHub webhook (`pull_request`, to `{APP_URL}/api/webhooks/github`, secret `GITHUB_WEBHOOK_SECRET`): re-runs the review when new commits are pushed to a PR that is in Initial Review.
4. **Admin → PR review**: edit the team checklist (critical / important), add per-project points and guidance, and choose whether reviews run automatically and whether the result is also posted as a PR comment.

Only a lead can override a Claude review's items; a developer re-runs it after pushing fixes. PR content is sent to the Anthropic API, and is treated as untrusted data in the prompt.

## Reports and presentations

**Reports** in the sidebar builds a slide deck from live data for the previous week, previous sprint or previous month (or any earlier one from the period picker). Every deck has headline numbers, delivery chart, what shipped, developer highlights, quality and flow, carry-over, risks and asks, decisions and open actions from that period's meetings, the plan for the next sprint (from the Sprints planner, with capacity fit) and an outlook for the next four weeks (from the prioritised, estimated backlog).

- **Present** opens a full-screen presenter (arrow keys, space, Home/End, `F` for fullscreen, `Esc` to leave; swipe on touch). It follows the user's light or dark theme.
- **PowerPoint** and **PDF** download from `/api/reports/export?kind=week|sprint|month&ref=...&format=pptx|pdf` (signed-in users). Exports always use a light, print-friendly palette.
- **Print view** (`/report-print`) lays one slide per landscape page for the browser's Save as PDF.
- **Commentary:** leads and admins can add a line per slide; it is stored per period in `AppSetting` (`report.notes:<period>`) and shows in the presenter and both exports.
- No new migration or environment variable is needed. Numbers come from `doneAt`, time entries, transitions and meetings already in the database, so with Jira connected they reflect the real board.

## Leave and capacity

- **Leave page:** developers request leave (type, date range, optional half day for a single date). Leads and admins approve or reject with an optional note, and can register leave for someone else (approved straight away). A lead cannot decide their own request; an admin can. Dates are local calendar dates, weekends are never counted.
- **Public holidays:** admins add them under Admin, Holidays. A weekday holiday removes that day for everyone.
- **What updates automatically:** each developer's capacity is their weekly hours spread over five days, minus approved leave and holidays inside the dates. That feeds the sprint planner's capacity bar and per-developer load, Auto-fill, the "at risk" chip on sprint cards (finish forecast, in priority order per assignee, lands after the sprint end), the forecast finish on each ticket, the next-sprint plan and next-month outlook in Reports, and the leave and holiday line in report headlines. Estimates themselves stay as effort hours; what changes is when the work can finish and how much fits.
- **Google Calendar (optional):** when the developer has connected Google, approving leave creates an out-of-office event on their own calendar and cancelling removes it. It is best effort and never blocks an approval; it needs the Calendar scope already used for meetings.
- **Deploy:** run `npm run db:deploy` for migration 0005 (the `Leave` table). Holidays are stored in `AppSetting`.

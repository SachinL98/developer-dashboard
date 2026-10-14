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
8. Webhook for live updates: Jira → System → WebHooks → URL `{APP_URL}/api/webhooks/jira?secret={JIRA_WEBHOOK_SECRET}`, event *Issue updated*.

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

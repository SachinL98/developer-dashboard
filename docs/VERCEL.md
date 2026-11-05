# Host on Vercel with GitHub Actions

Result: every push to `main` is tested, the database is migrated, the app is deployed to Vercel, and a health check confirms it is up. A schedule keeps Jira and meeting transcripts in sync. Pull requests are tested automatically.

You need: a GitHub repository, a Vercel account, a Google Workspace account (for sign-in) and about 30 minutes.

## 1. Create the database (5 min)
1. Go to **neon.tech**, create a project (choose a region near your team) and a database.
2. Copy **two** connection strings from the Connect dialog:
   - **Pooled** (host contains `-pooler`). The running app uses this one. Add `&pgbouncer=true&connection_limit=1` to the end.
   - **Direct** (no `-pooler`). Migrations use this one.

## 2. Create the Vercel project (3 min)
On your computer, in the project folder:
```bash
npx vercel login
npx vercel link
```
Answer the questions and create a new project. This writes `.vercel/project.json`; it holds two ids you need in step 4:
```bash
cat .vercel/project.json
```
Then create a token at **vercel.com/account/tokens** (name it `github-actions`) and copy it.

## 3. Add the app settings to Vercel (5 min)
```bash
cp .env.example .env.vercel
```
Open `.env.vercel` and fill in these values (leave the others empty or delete them for now):

| Name | Value |
|---|---|
| `DATABASE_URL` | the **pooled** string from step 1 |
| `APP_URL` | `https://<your-project>.vercel.app` (or your own domain) |
| `AUTH_SECRET` | run `openssl rand -base64 48` |
| `ADMIN_EMAILS` | your email, so you become the admin |
| `AUTH_ALLOWED_DOMAIN` | `spaceitlabs.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 5 below (you can add them after, see step 5) |
| `CRON_SECRET` | run `openssl rand -hex 32` and keep a copy |
| `TEAM_TIMEZONE` | `Asia/Colombo` |

Do **not** set `DEMO_MODE`. The app refuses to start in production without Google sign-in, so complete step 5 before the first deploy.

Upload them to Vercel (Production):
```bash
bash scripts/vercel-env.sh
```

## 4. Add the secrets to GitHub (3 min)
In GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**. Or run these with the GitHub CLI (`gh`), pasting each value when asked:
```bash
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID        # "orgId" from .vercel/project.json
gh secret set VERCEL_PROJECT_ID    # "projectId" from .vercel/project.json
gh secret set DATABASE_URL_DIRECT  # the DIRECT string from step 1
gh secret set APP_URL              # same as APP_URL above
gh secret set CRON_SECRET          # same as CRON_SECRET above
```
Also create an environment named **production** (Settings → Environments). Optionally add required reviewers there to approve each production deploy.

## 5. Set up Google sign-in (5 min)
1. Open **console.cloud.google.com → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. Under Authorised redirect URIs add: `https://<your-domain>/api/auth/google/callback`
3. Copy the Client ID and Client secret into `.env.vercel`, then run `bash scripts/vercel-env.sh` again.
4. In the OAuth consent screen choose **Internal** so only your Workspace can sign in.

## 6. First deploy (5 min)
Merge your work into `main` (or open **Actions → Deploy to Vercel → Run workflow**). The workflow:
1. type-checks and runs the tests,
2. applies database migrations (`prisma migrate deploy`),
3. builds and deploys to Vercel,
4. checks `/api/health`.

When it is green, open your `APP_URL` and sign in with a Google account listed in `ADMIN_EMAILS`.

## 7. Finish inside the app (10 min)
Open **Settings → Setup guide**. It walks through Jira, GitHub and the webhooks with copy buttons. The first sign-in creates your admin account; add colleagues in **Admin → Users**.

## What runs automatically
| When | What |
|---|---|
| Pull request | `CI`: typecheck, tests, production build, dependency audit |
| Push to `main` | `Deploy to Vercel`: tests, migrations, deploy, health check |
| Every 10 minutes | `Scheduled sync`: Jira, GitHub, meetings and transcripts |

Vercel's own Git deployments are switched off in `vercel.json` so the workflow is the only thing that deploys.

Optional previews: set the repository variable `ENABLE_PREVIEWS=true`, and give the **Preview** environment its own Vercel variables and its own database first. Without that, previews cannot start.

## Everyday use
- Change code on a branch, open a pull request, wait for `CI`, merge to `main`.
- Schema change: add a migration (`npx prisma migrate dev --name what_changed`), commit the folder in `prisma/migrations`, and it is applied on the next deploy.
- Roll back: in the Vercel dashboard open **Deployments**, pick the previous one and choose **Promote to Production**. Database migrations are not undone, so write migrations that stay compatible with the previous version.

## Good to know
- **Time limits.** Vercel functions stop after 60 seconds on the free plan. AI summaries, report exports and Jira syncs normally finish within that.
- **Scheduled runs** from GitHub can start a few minutes late. If you are on a Vercel Pro plan you can use Vercel Cron instead.
- **Secrets stay secret.** Values live only in Vercel and GitHub secrets, never in the repository. Changing `AUTH_SECRET` later disconnects every stored Jira, Google and Claude key.
- **Region.** In Vercel project settings, set the function region close to your database.

## If something fails
| Symptom | Fix |
|---|---|
| Deploy fails at "Apply database migrations" | Check `DATABASE_URL_DIRECT` is the direct (non-pooler) string and the database is reachable. |
| Site shows an error right after deploy | Open the Vercel function logs. The app refuses to start without `AUTH_SECRET` (32+ characters), an `https://` `APP_URL` and Google sign-in. |
| "redirect_uri_mismatch" on sign-in | The redirect URI in Google must be exactly `<APP_URL>/api/auth/google/callback`. |
| Health check fails | Check `DATABASE_URL` (pooled string with `pgbouncer=true`) and that the database allows connections from Vercel. |
| Scheduled sync shows 401 or 503 | `CRON_SECRET` differs between GitHub and Vercel, or is missing in Vercel. |
| Report PDF or slides fail | Look for a missing-file error in the function logs; redeploy and try again. |

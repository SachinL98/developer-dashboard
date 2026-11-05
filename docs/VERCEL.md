# Host on Vercel with GitHub Actions

Result: every push to `main` is tested, the database is migrated, the app is deployed to Vercel, and a health check confirms it is up. A schedule keeps Jira and meeting transcripts in sync. Pull requests are tested automatically.

You need: a GitHub repository, a Vercel account, and about 30 minutes.

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
| `CRON_SECRET` | run `openssl rand -hex 32` and keep a copy |
| `TEAM_TIMEZONE` | `Asia/Colombo` |

Sign-in is email and password, so no Google setup is needed to get started. Google is only used later, optionally, for Calendar and Meet links.

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

## 5. Create your first admin (2 min)
The database starts empty and the first admin must exist before anyone can be approved, so create it from your computer, against the **production** database:
```bash
neon env pull --file .env.neon --branch production --services postgres
set -a; . ./.env.neon; set +a
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run user:create -- --email you@yourcompany.com --name "Your Name" --access ADMIN
```
Run it after the first deploy has applied the migrations (step 6). A one-time password is saved to `.credentials-<email>.txt` (never printed). Sign in with it, choose your own password, then delete the file. Everyone else can use **Create an account** on the login page; you approve each request under **Admin → Users**.

## 6. First deploy (5 min)
Merge your work into `main` (or open **Actions → Deploy to Vercel → Run workflow**). The workflow:
1. type-checks and runs the tests,
2. applies database migrations (`prisma migrate deploy`),
3. builds and deploys to Vercel,
4. checks `/api/health`.

When it is green, run step 5 if you have not yet, then open your `APP_URL` and sign in with the email and one-time password.

## 7. Finish inside the app (10 min)
Open **Settings → Setup guide**. It walks through Jira, GitHub and the webhooks with copy buttons. Colleagues click **Create an account** on the login page and you approve them in **Admin → Users**. You can also add people yourself there; each gets a one-time password.

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
| Site shows an error right after deploy | Open the Vercel function logs. The app refuses to start without `AUTH_SECRET` (32+ characters), and an `https://` `APP_URL`. |
| Cannot sign in | Check the account exists (Admin → Users). Five wrong attempts lock an account for 15 minutes; an admin can reset the password. |
| Health check fails | Check `DATABASE_URL` (pooled string with `pgbouncer=true`) and that the database allows connections from Vercel. |
| Scheduled sync shows 401 or 503 | `CRON_SECRET` differs between GitHub and Vercel, or is missing in Vercel. |
| Report PDF or slides fail | Look for a missing-file error in the function logs; redeploy and try again. |

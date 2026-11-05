#!/usr/bin/env bash
# Sets the six GitHub Actions secrets the deploy workflow needs, reading values from local files.
# Run once, from the project folder:  bash scripts/set-github-secrets.sh
set -euo pipefail
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Sign in first: gh auth login"; exit 1; }
for f in .env.neon .env.vercel .vercel/project.json; do [ -f "$f" ] || { echo "Missing $f"; exit 1; }; done

get() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
set_secret() { printf '%s' "$2" | gh secret set "$1" >/dev/null && echo "set $1"; }

set_secret VERCEL_ORG_ID "$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['orgId'])")"
set_secret VERCEL_PROJECT_ID "$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['projectId'])")"
set_secret DATABASE_URL_DIRECT "$(get .env.neon DATABASE_URL_UNPOOLED)"
set_secret APP_URL "$(get .env.vercel APP_URL)"
set_secret CRON_SECRET "$(get .env.vercel CRON_SECRET)"

# The Vercel token cannot be read back from anywhere: create one at https://vercel.com/account/tokens
if [ -z "${VERCEL_TOKEN:-}" ]; then read -r -s -p "Paste your Vercel token (hidden), then press Enter: " VERCEL_TOKEN; echo; fi
[ -n "$VERCEL_TOKEN" ] || { echo "No token given, skipped VERCEL_TOKEN"; exit 1; }
set_secret VERCEL_TOKEN "$VERCEL_TOKEN"
echo "Done. Check the names with: gh secret list"

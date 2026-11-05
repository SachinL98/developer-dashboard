#!/usr/bin/env bash
# Pushes the variables in .env.vercel to the Vercel project (Production). Usage: bash scripts/vercel-env.sh
set -euo pipefail
[ -f .vercel/project.json ] || { echo "This folder is not linked to a Vercel project yet. Run these first:"; echo "  npx vercel login"; echo "  npx vercel link"; exit 1; }
npx vercel whoami >/dev/null 2>&1 || { echo "You are not signed in to Vercel. Run: npx vercel login"; exit 1; }
exec node "$(dirname "$0")/vercel-env.mjs" "$@"

#!/usr/bin/env bash
# Pushes the variables in .env.vercel to the Vercel project (Production), one per line: NAME=value
# Usage: cp .env.example .env.vercel && edit it && npx vercel link && bash scripts/vercel-env.sh
set -euo pipefail
FILE="${1:-.env.vercel}"
[ -f "$FILE" ] || { echo "Missing $FILE (copy .env.example to $FILE and fill it in)"; exit 1; }
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|\#*) continue ;; esac
  name="${line%%=*}"; value="${line#*=}"
  value="${value%%  #*}"            # drop trailing "  # comment"
  value="${value%\"}"; value="${value#\"}"
  [ -z "$value" ] && continue       # skip empty optional settings
  printf '%s' "$value" | npx vercel env add "$name" production --force >/dev/null
  echo "set $name"
done < "$FILE"
echo "Done. Redeploy for the new values to apply."

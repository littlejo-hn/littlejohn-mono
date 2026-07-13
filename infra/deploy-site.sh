#!/usr/bin/env bash
# Deploy the LittleJohn teaser (site/) to Cloudflare Pages.
# Reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from ../.env (never echoed).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "no .env — copy .env.example to .env and fill in the Cloudflare token"; exit 1; fi
set -a; . ./.env; set +a

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN in .env}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID in .env}"

PROJECT="${1:-littlejohn}"
echo "deploying site/dist to Cloudflare Pages project '$PROJECT'..."
npx --yes wrangler pages deploy site/dist --project-name "$PROJECT" --branch main --commit-dirty=true

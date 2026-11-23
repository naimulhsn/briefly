#!/usr/bin/env bash
# Prepares a production build check and prints the one signup step needed.
# This script does not create a Render account or deploy by itself.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Checking the app can start…"
node --check server.js
echo
echo "Briefly cannot be published from this machine without a host account."
echo
echo "Easiest free host: Render (https://render.com/register) — one signup, no credit card."
echo
echo "After you have an account:"
echo "  1. Push this folder to a GitHub repository (or use Render's Docker deploy)."
echo "  2. New + Blueprint, and point it at deploy/render.yaml,"
echo "     or New Web Service → Docker, root directory news-app."
echo "  3. Set GEMINI_API_KEY to the same Gemini key, and note the generated"
echo "     SESSION_SECRET and INGEST_SECRET."
echo "  4. After the first deploy, open https://YOUR-SERVICE.onrender.com"
echo "     and trigger a briefing:  curl -X POST https://YOUR-SERVICE.onrender.com/api/ingest/run -H 'X-Ingest-Secret: …'"
echo
echo "Free-plan caveats (as of 2026): the service sleeps after 15 idle minutes;"
echo "free cron and persistent disks are paid. SQLite on the container will reset"
echo "when the instance is replaced. Use deploy/github-ingest.yml for the 6 AM /"
echo "6 PM job, and later a free Turso/libSQL database if you want the archive"
echo "to survive restarts."

# After the code is in a public Git repository, a free web service can be
# created from that URL (Render supports public Git URLs without connecting
# GitHub). The MCP create_web_service tool accepts a git repo URL, not a
# prebuilt image. Then set:
#   GEMINI_API_KEY, COOKIE_SECURE=true,
#   SESSION_SECRET and INGEST_SECRET from data/secrets/,
#   and later TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
# Use deploy/github-ingest.yml for the 6:00 / 18:00 Asia/Dhaka briefing,
# because Render's free plan does not include cron jobs.

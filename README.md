# Briefly

A multi-user web app that gathers Bangladesh news from national papers, Gazipur and Tongi outlets, fact-checkers and a short world desk, clusters the same event into one card, and writes a neutral English summary twice a day.

Default geographic priority: **Pagar / Tongi area → Gazipur city → Bangladesh → world**. Users can change their home area after signing up.

Summaries and labels are always in English, even when the source article is in Bangla. Criminal and legal tags are marked *alleged or reported until confirmed*. The app never declares guilt.

## Run locally

```bash
cd news-app
cp .env.example .env
# set SESSION_SECRET, and optionally GEMINI_API_KEY / GROQ_API_KEY / INGEST_SECRET
npm install
npm start          # http://localhost:3000
npm run ingest     # fetch feeds, cluster, summarise
```

The scheduler inside the server fires at **06:00 and 18:00 Asia/Dhaka**. You can also `POST /api/ingest/run` (send `X-Ingest-Secret` when `INGEST_SECRET` is set).

Without an AI key the pipeline still runs, using keyword heuristics. With `GEMINI_API_KEY` it uses Gemini (`gemini-2.5-flash-lite` by default) and falls back to Groq if `GROQ_API_KEY` is set and Gemini fails. Clusters are built first with title-similarity heuristics so only a capped batch of stories is sent to the model (see `MAX_AI_CLUSTERS` and `AI_BATCH_SIZE`).

## Stack

- Node.js + Express, libSQL (`@libsql/client`): a local SQLite file by default, or Turso when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
- Sessions are stored in the same database
- RSS first (`rss-parser`); Google News site-search feeds where a publisher blocks or lacks RSS
- Frontend: static HTML/CSS/JS in `public/` (no build step, no `dist/` folder)
- Code lives in `src/`, `public/`, `scripts/`, and `server.js`

## Hosting

This app needs a server, a database and a clock. A static host cannot run it.

The single easiest free option to get a public URL is **[Render](https://render.com/register)** (one signup, no credit card for a free web service):

1. Create a Render account and a Git repository that contains this folder.
2. Deploy with the Blueprint at `deploy/render.yaml`, or as a Docker web service from the `Dockerfile`.
3. Set `GEMINI_API_KEY`, and keep the generated `SESSION_SECRET` and `INGEST_SECRET`. Set `COOKIE_SECURE=true`.

`scripts/deploy-render.sh` prints the same steps and checks that the server parses.

**Free-plan limits (as of late 2026):** the web service sleeps after 15 idle minutes; cron jobs and persistent disks are paid. The SQLite file on the container is lost if the instance is replaced. After the site is live, copy `deploy/github-ingest.yml` to `.github/workflows/ingest.yml` and add `APP_URL` and `INGEST_SECRET` as repository secrets so GitHub Actions can trigger the 6 AM / 6 PM (Dhaka) job for free. A later free Turso or Neon database will keep the archive across restarts.

Cloudflare Workers is also free and has cron + D1, but the free CPU budget (10 ms per invocation) is too small for this ingest pipeline, so it was not used.

## API sketch

- `POST /api/auth/signup` `POST /api/auth/login` `POST /api/auth/logout` `GET /api/auth/me`
- `GET /api/stories` (filters: `q`, `location`, `category`, `legal`, `party`, `source`, `from`, `to`, `fact_checked`, `sort`, `limit`, `offset`)
- `GET /api/stories/:id`
- `GET|PUT /api/prefs`  `GET|POST|DELETE /api/bookmarks/:id`
- `GET /api/stats`  `GET /api/stats/meta`
- `POST /api/ingest/run`  `GET /api/ingest/status`  `GET /api/health`

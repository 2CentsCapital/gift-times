# The GIFT Times

An automated daily newspaper on **GIFT IFSC**, sourced from IFSCA public disclosures.

- **Database** — Supabase (Postgres): entities, contact persons, publications, change log, subscribers.
- **Ingestion** — `scripts/ingest.mjs`: full backfill on first run, daily diff after. Records every new/removed entity, status change and new publication into `changes`.
- **Website** — Next.js (App Router) on Vercel: front page, desks (Brokers, FMEs, Insurance, Fintech, Banking, Circulars, Regulations, News, Consultations), entity pages, and **universal search** (by entity, person or document).
- **Newsletter** — `scripts/send-newsletter.mjs`: a sectioned 6am digest via Resend, linking back to the site.
- **Cron** — GitHub Actions (`.github/workflows/daily.yml`): ingest → newsletter, in order, every morning.

## Data source

The site's tables and IFSCA's DataTables JSON APIs are wired in `scripts/lib/ifsca.mjs`
(directory + per-entity detail, legal categories, press releases, consultation papers).
IFSCA publishes one official contact person per entity — that is the "authorised individual"
data captured here.

## Setup

1. **Supabase** — create a project, run `db/schema.sql` in the SQL editor.
2. **Env** — copy `.env.example` → `.env` and fill in (or set on Vercel + GitHub secrets).
3. **Backfill** — `npm install && npm run ingest` (first run fetches every entity's detail).
4. **Deploy** — `vercel` (env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`).
5. **Cron** — add repo secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `FROM_EMAIL`, `OWNER_EMAIL`, `SITE_URL`); the workflow runs daily at 05:50 IST.

## Scripts

| Command | What it does |
|---|---|
| `npm run ingest` | Pull IFSCA → Supabase, log changes |
| `npm run newsletter` | Send the daily digest (add `-- --force` to resend) |
| `npm run dev` | Run the site locally |

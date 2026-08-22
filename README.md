# GIFT City Times

**Live at [giftcitytimes.com](https://giftcitytimes.com)** — an automated daily newspaper and registry for **GIFT IFSC**, sourced from IFSCA public disclosures.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) · Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

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

## Time-series history

The `entities` table is current-state only. To preserve how GIFT City changes over
time — who registered when, who surrendered, address/validity/contact changes — every
ingest also records each entity's state into an append-only `entity_versions` table
(SCD Type-2, `db/history.sql`, engine in `scripts/lib/history.mjs`). A new version is
written only when a tracked field actually changes, so it stays compact.

This makes the register reconstructable **as of any date**:

```sql
-- the GIFT IFSC register exactly as it stood on a given day
select * from entities_asof('2026-01-01'::timestamptz);
```

Because IFSCA only ever publishes the *current* register, this history cannot be
back-filled after the fact — it only accrues from the day capture begins.

## Setup

1. **Supabase** — create a project, run `db/schema.sql` then `db/history.sql` in the SQL editor.
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

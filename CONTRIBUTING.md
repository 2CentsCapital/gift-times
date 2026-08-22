# Contributing to GIFT City Times

Thanks for your interest! GIFT City Times is an automated, open newspaper and registry for
[GIFT IFSC](https://giftcitytimes.com), built from IFSCA's public disclosures. Contributions of
all sizes are welcome — bug fixes, new IFSCA data sources, desks, UI polish, tests, and docs.

## Ways to contribute

- **Report a bug or data issue** — open an [issue](https://github.com/CrazyBisht/gift-times/issues).
  If a listing looks wrong, include the entity name and a link to the IFSCA source page.
- **Suggest a feature or a new desk** — open an issue describing the data and where it lives on ifsca.gov.in.
- **Send a pull request** — see setup below.

## Local setup

You'll need Node 18+ and a free [Supabase](https://supabase.com) project (the app is read-only
against IFSCA's public JSON APIs, so no scraping credentials are needed).

```bash
git clone https://github.com/CrazyBisht/gift-times.git
cd gift-times
npm install
cp .env.example .env        # fill in your own Supabase project + (optional) Resend key
```

1. In Supabase, run `db/schema.sql` in the SQL editor to create the tables.
2. `npm run ingest` — backfills entities/publications from IFSCA and logs changes.
3. `npm run dev` — runs the site at http://localhost:3000.

The daily newsletter (`npm run newsletter`) and the Claude MCP connector (`db/connector.sql`,
`app/api/mcp`, `app/api/oauth/*`) are optional and gated behind their own env vars — you don't
need them to work on the core site.

## Before you open a PR

- **Run the tests:** `npm run test` (Vitest) — add or update tests for logic changes.
- **Build it:** `npm run build` must pass (this also type-checks).
- **Lint:** `npm run lint`.
- Keep PRs focused; describe the change and link any related issue.
- **Never commit secrets.** `.env` is gitignored — only ever edit `.env.example` with placeholders.

## Data & attribution

Data is sourced from the International Financial Services Centres Authority (IFSCA) public
directory and disclosures. This project is not affiliated with IFSCA. Please keep new data
sources limited to official, public IFSCA endpoints.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

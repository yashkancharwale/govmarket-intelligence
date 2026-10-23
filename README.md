# GovMarket Intelligence India

A Phase 1 evidence-first research workspace for exploring government/company event records and documented links. It is a research application, not a trading terminal or source of buy/sell advice.

## Current delivery and data status

This project runs on the **managed equivalent stack approved for this build**: React + TypeScript + Vite, Express + tRPC, Drizzle ORM, and the project-managed MySQL-compatible database. The initial preference for Next.js/Python/FastAPI/PostgreSQL was mapped to the single managed stack rather than creating a second backend or database.

The working Phase 1 UI, API, schema, migrations, and database-backed demo are present. The seeded dataset contains **10 fictional official-style profiles, 4 fictional organizations, and 6 fictional events**. They are visibly synthetic and are not claims about real Indian officials, companies, events, identifiers, grants, contracts, or prices. This is a small demo fixture—not coverage of the requested approximately 100 real listed companies. **No real government, corporate, social-media, exchange, MCA, or market-data provider is connected.** Real-price observations are not shown, and all source/CSV material stays unverified until human/source validation.

## Application routes

- `/` — overview and data-derived activity summary
- `/events` and `/events/:eventId` — searchable/filterable event list and evidence detail
- `/ministers` and `/ministers/:ministerId` — fictional demo profiles and linked records
- `/companies` and `/companies/:companyId` — organization/security information, with missing identifiers shown as unavailable
- `/relationships` — typed evidence-backed graph of the current demo edges
- `/market` — coverage disclosure and reproducible event-study methodology; real market coverage is unavailable until a permitted feed is configured
- `/system` — source/job health, admin-only CSV import, and PIB RSS configuration/run/export controls
- `/saved` — signed-in user's own watchlists and saved searches

The page route manifest is `client/public/manus-routes.json`. The Express server exposes `/api/health` and the typed tRPC API at `/api/trpc`. See [API examples](docs/api.md).

## Local development

Use Node.js compatible with the lockfile and pnpm, then install from the repository root and configure the managed environment values shown as placeholders in `.env.example`:

The standard migration/seed commands below write to the project database. Preview/development and published instances may share that database. Run them only after confirming that the active `DATABASE_URL` points to the intended development/test database; no migration, seed, or database write was performed to add PIB support.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed:synthetic
pnpm dev
```

`pnpm dev` honors `PORT` (default 3000). If the managed database already contains the fixture namespace, the seed command inserts only missing rows; it does not reset, delete, or overwrite existing data. Development and published instances share the managed database. Do not use destructive database tests or drop/reset commands.

Useful checks:

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm db:migrate` applies checked-in Drizzle SQL. For an intentional schema change, update `drizzle/schema.ts`, generate a migration with `pnpm exec drizzle-kit generate --name=<change>`, review the SQL, then apply it. The narrowly scoped `pnpm db:recover:partial-0002` command is only for recovering the recorded, partially-applied 0002 migration in the development project; it is not a normal setup command.

## Authentication and roles

The app uses the existing Manus OAuth/session integration; it does not create a fake logged-in user or bypass validation. Research pages can display the demo records without a login. Watchlists and saved searches require a signed-in user, and database ownership checks are server-side. CSV imports and PIB source configuration/runs/exports require the `admin` role and are audited. PIB write APIs also fail closed unless server-only `GOVMARKET_PIB_WRITE_TARGET=development` is set; this flag must be set only after confirming the active `DATABASE_URL` points to the intended development/test database. User accounts default to `user`; a project operator must grant an admin role through an authorized managed-database/admin process. There is no self-service role escalation.

The session cookie is HTTP-only and uses `SameSite=None; Secure` for the platform's public HTTPS Preview iframe. Do not replace this with `Lax`, `Strict`, or a `NODE_ENV`/upstream-request-based decision.

## CSV import

Only an authorized admin can import a `.csv` file from `/system`. Limits are **1 MB and 1,000 data rows**. Required headers: `title`, `occurredAt` (ISO date or timestamp). Optional headers: `externalId`, `eventType`, `category`, `summary`, `location`, `company`, `minister`, `sourceType`, `sourceName`, `sourceUrl`. Supported user-declared types: `fixture`, `government`, `corporate`, `social`, `market`.

A source-native `externalId` is preferred for record matching; otherwise the normalized URL is used, with content hash as the fallback. Changed content is stored as an additional source document attached to the same event rather than silently overwriting the existing event fields. Reimporting identical content is skipped. User-provided source names, types, and URLs are stored as **synthetic/unverified metadata**; the app does not fetch URLs or assert their validity. The parser validates fields and reports row-level errors. Even a source labelled `government` or `market` by an uploader remains synthetic until separately validated.

Example header (the row below is intentionally only illustrative):

```csv
externalId,eventType,title,occurredAt,category,summary,location,company,minister,sourceType,sourceName,sourceUrl
DEMO-001,project,"Synthetic project announcement",2026-01-15,investment,"Fictional test fixture",,Demo Gridworks,Demo Official,fixture,"Synthetic fixture",
```

Never import private personal data, unsupported relationships, private travel/location information, fabricated identifiers, or unsourced prices.

## PIB RSS ingestion and export

The app includes a server-side adapter for the single Press Releases RSS URL listed by PIB’s [official RSS directory](https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1): `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1`. The directory and feed were reachable during a live check on 2026-10-23, but the feed returned a valid RSS channel with **zero items**. No PIB records were collected, so the adapter is not yet operationally validated. The robots path returned HTML instead of usable directives; recheck current conditions and do not infer permission from that response. PIB’s [terms and copyright policy](https://archive.pib.gov.in/newsite/terms.aspx) requires accurate, non-misleading reproduction and prominent source attribution for PIB material, while third-party content remains subject to its own rights.

To operate it, first confirm the active `DATABASE_URL` points to the intended development/test database; the project-managed database can be shared with the published app. Only then set the server-only `GOVMARKET_PIB_WRITE_TARGET=development` flag in that development runtime. Without the flag, the backend rejects PIB writes even if an admin calls tRPC directly. An authenticated `admin` then opens `/system`, checks the database-target confirmation and, before fetching, confirms current PIB access/robots conditions; then selects **Configure / enable**. Configuration does not fetch anything. **Run now** performs a manual bounded fetch (no scheduler); job health stores row, duplicate, error, retry, quota and timestamp details. Only the fixed official feed is accessed. Timeout, XML/body limits, allowed-domain redirect checks, bounded retries and item validation are enforced. An empty channel or failed/partially failed processing creates a `failed` job; the application does not report a successful import or collect events from an empty feed. Fetched records are `synthetic=false` only to distinguish source origin and remain `verificationStatus=unverified`. The system does not infer a company, official or relationship from a mention. For PIB candidate records, the timestamp is the RSS publication time—not a verified date for the underlying action.

An admin can select **Export CSV** after the PIB source record is configured. The export includes only PIB-linked real-source documents, with columns `externalId,eventType,title,occurredAt,category,summary,location,company,minister,sourceType,sourceName,sourceUrl`. Missing PIB GUIDs stay blank; unsupported fields stay blank. CSV cells correctly escape quotes, commas and newlines; cells beginning with spreadsheet formula markers are apostrophe-prefixed so they open as text. The browser receives a download, and a server copy is saved in git-ignored `data/export/pib-press-releases-<timestamp>.csv`. The server-side copy can be ephemeral in a published container; keep the browser download for durable storage. No credentials or private user data are exported. See [data-source operations and limitations](docs/data-sources.md) and the [admin API guide](docs/api.md).

The empty feed was an access check, not a successful data run. No database rows were written while implementing or checking the adapter. Do not set the development flag or configure, run, or export against a shared/production database. Before any write, verify `DATABASE_URL` in the intended development runtime; preview/development and published app may share the same database. Do not use destructive reset/drop/overwrite actions.

## Architecture and source boundaries

- `client/src/`: route shell, responsive research pages, evidence/source components, and typed tRPC data views.
- `server/intelligence.ts`: validated tRPC procedures, server-side authorization, search/filter logic, importer, PIB admin actions, health reporting, and market-study reads.
- `server/pibRss.ts`: fixed official PIB RSS adapter, bounded parsing/retries, source-document revisions, and CSV serialization/export.
- `shared/intelligence.ts`: shared input contracts, name/URL normalization, conservative classification, bounded CSV parsing, and pure trading-session event-study calculation.
- `drizzle/schema.ts`, `drizzle/*.sql`, `drizzle/meta/`: normalized persistence models and ordered migrations.
- `server/seed.ts`: namespaced, synthetic, idempotent fixtures; never executed automatically on server startup.
- `docs/architecture.mmd` and `docs/architecture.png`: application/data-flow diagram source and render.
- `docs/data-sources.md`: provider/adapter and lawful ingestion requirements.
- `TODO.md`: outcome checklist and remaining work.

The only implemented real-source adapter is PIB press-release RSS; it has not yet produced a non-empty, operationally validated run. Other future sources include PMIndia, ministry/scheme portals, data.gov.in, Startup India, supported official social APIs, exchange/company disclosures, permitted MCA data, and appropriately licensed market feeds. Their presence in the design is not proof of access. Respect source terms, robots policies, rate limits, authentication, copyright, licenses, and applicable law; do not bypass restrictions. No semantic/vector service, LLM extraction, live social monitoring, or paid market provider is wired.

## Current limitations and next phase

The current demo is not the target real-data coverage. The PIB RSS adapter is implemented but unconfigured and not operationally validated because the last live response contained no items; source-health values do not imply scheduled ingestion. CSV imports remain synthetic/unverified and there is no independent evidence-review workflow. The schema has distinct verification stages, typed event/entity evidence edges, aliases, official/company records, security identifiers, market observations, jobs, audit records, and user-owned saved research, but company coverage is only four synthetic organizations and has no genuine NSE/BSE mapping. The market page does not render synthetic prices as real quotes; no permitted provider or benchmark feed is connected. Event-study utilities are descriptive only and do not establish causation or generate personalized trading advice.

The next step is a non-empty PIB feed run in the explicitly intended database environment, followed by human review of source-document/event candidates. The feed item is source material, not an independently verified fact; a company name mention does not establish a government relationship. Subsequent work can map real company/security identifiers, connect one licensed market provider, add supported social APIs, and harden production operations. Remaining work is tracked in `TODO.md`.

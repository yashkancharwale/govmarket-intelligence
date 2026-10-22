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
- `/system` — source/job health and an administrator-only CSV import form
- `/saved` — signed-in user's own watchlists and saved searches

The page route manifest is `client/public/manus-routes.json`. The Express server exposes `/api/health` and the typed tRPC API at `/api/trpc`. See [API examples](docs/api.md).

## Local development

Use Node.js compatible with the lockfile and pnpm, then install from the repository root and configure the managed environment values shown as placeholders in `.env.example`:

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

The app uses the existing Manus OAuth/session integration; it does not create a fake logged-in user or bypass validation. Research pages can display the demo records without a login. Watchlists and saved searches require a signed-in user, and database ownership checks are server-side. CSV imports require the `admin` role and are audited. User accounts default to `user`; a project operator must grant an admin role through an authorized managed-database/admin process. There is no self-service role escalation.

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

## Architecture and source boundaries

- `client/src/`: route shell, responsive research pages, evidence/source components, and typed tRPC data views.
- `server/intelligence.ts`: validated tRPC procedures, server-side authorization, search/filter logic, importer, health reporting, and market-study reads.
- `shared/intelligence.ts`: shared input contracts, name/URL normalization, conservative classification, bounded CSV parsing, and pure trading-session event-study calculation.
- `drizzle/schema.ts`, `drizzle/*.sql`, `drizzle/meta/`: normalized persistence models and ordered migrations.
- `server/seed.ts`: namespaced, synthetic, idempotent fixtures; never executed automatically on server startup.
- `docs/architecture.mmd` and `docs/architecture.png`: application/data-flow diagram source and render.
- `docs/data-sources.md`: provider/adapter and lawful ingestion requirements.
- `TODO.md`: outcome checklist and remaining work.

Potential future sources include PIB, PMIndia, ministry/scheme portals, data.gov.in, Startup India, supported official social APIs, exchange/company disclosures, permitted MCA data, and appropriately licensed market feeds. Their presence in the design is not proof of access. Respect source terms, robots policies, rate limits, authentication, copyright, licenses, and applicable law; do not bypass restrictions. No semantic/vector service, LLM extraction, live social monitoring, or paid market provider is currently wired.

## Current limitations and next phase

The current demo is not the target real-data coverage. No real source adapter is operational; source-health values do not imply scheduled ingestion. CSV imports remain synthetic/unverified and there is no independent evidence-review workflow. The schema has distinct verification stages, typed event/entity evidence edges, aliases, official/company records, security identifiers, market observations, jobs, audit records, and user-owned saved research, but company coverage is only four synthetic organizations and has no genuine NSE/BSE mapping. The market page does not render synthetic prices as real quotes; no permitted provider or benchmark feed is connected. Event-study utilities are descriptive only and do not establish causation or generate personalized trading advice.

Phase 2 should connect one permitted official government source and test incremental ingestion, provenance, duplicate handling, retries, and evidence before claiming operation. Subsequent work can map real company/security identifiers, connect one licensed market provider, add supported social APIs, and harden production operations. These phases are tracked as open in `TODO.md`.

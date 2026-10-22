# GovMarket Intelligence India — Implementation Plan

## Scope and implementation decisions

Deliver Phase 1 as a functional research application rather than a static dashboard. Preserve the source brief's evidence-first, non-trading purpose; make every demonstration record unmistakably synthetic and keep live government, social, corporate and market ingestion disabled until a permitted source and working access are actually configured.

The original configurable coverage targets are approximately 10 Union minister profiles, approximately 100 listed companies, a small event-category set and historical event records; these are targets, not a claim of acquired data. The current demo intentionally seeds only 10 fictional official-style profiles, 4 fictional organizations and 6 fictional events, and therefore does not satisfy real-company coverage. Do not fill the gap with invented real-world identities or exchange identifiers.

The project is running on the managed WebDev starter, which supports React 19 + TypeScript + Vite, Express + tRPC, Drizzle and a project-managed MySQL-compatible database. The user explicitly approved this as the documented equivalent stack. The requested Next.js/Python/FastAPI/PostgreSQL preference therefore maps to this single managed TypeScript service; do not introduce a second database or a separate Python microservice in Phase 1. The platform's persisted DB is shared by development and publication, so schema changes will be additive, seeds idempotent, and test code will not clear or overwrite shared records. Keep provider adapters and data logic decoupled so a future licensed source or market provider can be added without reworking UI code.

Use the existing Manus OAuth/session implementation for real login, the existing `users` table for account identity/role, server-side `protectedProcedure` and `adminProcedure` for authorization, and project-managed database persistence for application records. No simulated logged-in user or bypass. Public research pages may display accessible records; saved searches/watchlists and administrative ingestion remain authenticated and server-authorized. Admin operations are not exposed to ordinary users.

Implement the Phase 1 entity model in Drizzle: configured sources; source documents; public-official profiles; companies and aliases; listed-security identifiers; events; typed organization/person/event relationships; event-source evidence; market observations with an explicit synthetic/real provenance flag; processing/import jobs; user watchlists and saved searches; and administrative audit records. Use FKs, unique constraints and indexes for document identities/hashes, normalized aliases, event-source pairs, identifiers and ownership. Preserve event, entity and evidence verification status separately. Use migrations checked into `drizzle/`; seed synthetic samples through a repeatable, non-destructive command that inserts only absent fixture identifiers and never resets a populated table.

Provide tRPC APIs for overview/database-derived counts and aggregates; paginated/searchable/filterable events and details; minister and company lists/details; sectors and filter metadata; source/ingestion health; market coverage and reproducible event-study calculations; relationship subgraph; user watchlists/saved searches; and admin-only CSV import/source-job actions. Validate inputs with Zod, bound pagination and CSV size, return appropriate errors, use parameterized Drizzle operations, and audit administrative writes. Add a typed source-adapter contract plus a test-only mock and CSV-import parser; clearly report unconfigured live adapters rather than implying collection is operating.

The UI will use the existing Wouter router, tRPC client, React Query, Recharts and Lucide icons. Routes: overview, events explorer, event detail, ministers list/profile, companies list/profile, relationships, market analysis, system health/source administration, and authenticated saved research; navigation, global search, filters, empty/loading/error states and detail panels all operate against APIs/database records. Keep the data surface clearly marked `SYNTHETIC DEMO DATA` until verified source records exist. Show missing evidence/identifiers/market-data as unavailable rather than inventing them. Search begins with indexed/normalized text, aliases and filters; no vector database or semantic search is required.

Market calculations are pure, reproducible utilities using exchange-session-indexed observations and benchmark series when supplied. Tests use fixtures explicitly marked synthetic. The UI must never describe a demo price as a real quote, signal or causal effect; with no licensed market source configured, it reports that no real market data is connected and any illustration is synthetic. Implement event-day and 1/3/7/30 trading-session windows with missing-session handling and comparative benchmark returns; disclose timestamp/calendar assumptions, coverage and limitations.

## Project structure

- `client/src/App.tsx`: route registration and global providers.
- `client/src/components/`: application shell, navigation, reusable badges, tables, filters, source/evidence cards, loading/empty/error states.
- `client/src/pages/`: overview, events, event detail, ministers, companies, relationships, market, system/source-health and saved-research screens.
- `client/src/lib/`: tRPC client and presentation helpers.
- `shared/`: shared schemas, domain types, filter/input contracts and provenance labels.
- `drizzle/schema.ts`, `drizzle/*.sql`, `drizzle/meta/`: normalized MySQL-compatible schema and additive migration history, including explicit typed relationships.
- `server/routers.ts` and `server/intelligence.ts`: validated API procedures, domain queries, database-backed summaries, event studies, CSV import, and admin checks.
- `shared/intelligence.ts`: shared Zod contracts, normalization, conservative classification, CSV parsing, and pure market-study utilities.
- `server/seed.ts`: clearly synthetic, namespaced, idempotent fixtures, invoked explicitly rather than at startup.
- `server/_core/`: retain platform bootstrap, OAuth, session and health route; extend only where needed.
- `server/**/*.test.ts`: pure logic, API/input, authorization and persistence-adapter tests using synthetic fixtures; never delete shared DB records in tests.
- `client/public/manus-routes.json`: route manifest synchronized with the page routes before the first dev-server start.
- `plan.md`, `TODO.md`, `README.md`, `.env.example`, `docs/`: technical decisions, acceptance status, setup, API examples, data-source configuration, deployment and architecture.

## Design direction

**Low-probability alternatives considered:** institutional archive/dossier (0.04); civic neo-brutalist field guide (0.07); restrained financial-research terminal (0.03, selected). These are distinct directions; the selected terminal aesthetic supports dense comparative research without implying trade signals.

**Design movement:** contemporary financial-research terminal, with editorial data journalism restraint rather than a trading floor or consumer fintech app.

**Core principles:** provenance is always visible; dense information stays scannable; uncertainty and missing coverage are explicit; interactions prioritize investigation over prediction.

**Color philosophy:** charcoal/navy foundations communicate focus and continuity; warm off-white text avoids glare; restrained signal teal identifies verified/active records; muted amber signals review or uncertainty; red is reserved for errors, not market direction. Keep status distinguishable without color alone.

**Layout paradigm:** persistent slim left rail and compact top command bar, with broad asymmetric working canvas: a primary data column and a narrower evidence/context rail. Tables and timelines span the canvas; detail pages use a record header, main narrative/timeline, then a sticky source/evidence panel. Collapse the rail into a drawer on smaller screens.

**Signature elements:** source-provenance chips with verification stage; fine timeline rules and event markers; a distinctive teal “evidence trace” bracket connecting a record to supporting material. Keep these restrained and reusable.

**Interaction philosophy:** search and filters are persistent and shareable; changing a filter updates the actual query; detail links preserve context; keyboard focus and accessible labels are first-class. Avoid speculative auto-refresh and avoid trade-like flashing price colors.

**Animation:** short 120–180 ms opacity/position transitions for navigation and panels; subtle chart draw-in only after data resolves; respect `prefers-reduced-motion`; no perpetual pulses, animated market tickers or movement that implies live data.

**Typography:** use a legible sans family for UI/body with compact tabular numerals for counts/returns; establish a clear hierarchy (compact uppercase metadata, medium-weight record titles, restrained oversized summary figures). Keep fallback system fonts if external fonts are unavailable.

**Brand essence:** a source-traceable public-sector/company research desk for analysts who need documented connections, not trading tips; precise, skeptical, useful. Voice: concise and evidence-led. Example microcopy: “Evidence first. Interpretation second.” and “No verified market series is connected.”

**Wordmark/logo:** custom text wordmark paired with a small “document + linked nodes” monogram; do not imitate government seals or stock-exchange marks. **Signature brand color:** deep evidence teal, used sparingly for navigation selection and verified source paths.

## Delivery and scope boundaries

README will explain local managed setup, migrations/seeding, sample API calls, OAuth, source and CSV configuration, deployment path and constraints of the shared MySQL database. `.env.example` contains placeholders only. Architecture diagram shows browser → Express/tRPC → domain services → managed MySQL, with source/CSV adapter boundary and future provider integration points. Report the checks actually run and their real results. Phase 2–6 features remain open unless implemented and acceptance-tested; no claims of live ingestion, licensed prices, data completeness, accuracy, backup or production hardening without evidence.

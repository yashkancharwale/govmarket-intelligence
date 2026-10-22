# GovMarket Intelligence India — Outcome Checklist

The checklist tracks evidence-backed outcomes, not implementation subtasks. “Open” means not yet delivered. Synthetic examples must remain visibly synthetic; real-source integrations are not considered operational until tested against the permitted provider.

## 1. Research workspace, navigation, dashboard, and search — Partial

- [ ] The application launches using documented steps and provides a responsive desktop-first interface that also works on tablet and mobile.
- [ ] The visual system is a professional research-terminal aesthetic with dark navy/charcoal surfaces, restrained accents, accessible contrast, readable typography, high information density without clutter, charts/tables/filters/source references, and explicit loading/error states.
- [ ] The overview shows event count, verified-event count, represented companies, listed companies linked to events, recent government/corporate announcements, event trends by sector/category, recently mentioned companies, significant-development timeline, ingestion status and last successful source update. All counts/aggregates come from stored records, not decorative hardcoded statistics.
- [ ] Search and filters operate on persisted records and aliases. Support date range; minister/ministry; officially documented state/city; category; company; sector/industry; source type; verification status; listed/unlisted. Support textual queries such as semiconductor projects in Gujarat, government contracts associated with listed companies, events involving a named company, renewable-energy activity, companies mentioned in official ministry announcements, and events for a company over the previous 90 days.
- [ ] Events results show date, title, organizations, type, source, evidence status and linked companies. Event detail provides source/evidence context and says plainly when a demo record has no real source.
- [ ] Navigation provides overview, events, event details, minister profiles, company intelligence, relationship exploration, market analysis and source/system-health views, with useful empty/loading/error/retry states.
- [ ] Overview statistics and page content remain functional with demo data only; no paid API key is required for the demonstration application.

## 2. Ministers, organizations, companies, securities, and relationships — Partial

- [ ] Minister profiles show name, public/official position, ministry, official source links when verified, publicly documented historical events, official posts linked to those events, and associated documented companies/sectors.
- [ ] Company intelligence shows canonical name, CIN only if available and verified, NSE symbol/BSE code/ISIN only if applicable and verified, sector/industry, government events, corporate announcements, related startups/subsidiaries/companies where documented, market data only with a valid source, source links and verification status for material claims.
- [ ] Founder, promoter, director, executive, and shareholder are separate relationship types; the system never conflates them.
- [ ] Initial configurable coverage targets are approximately 10 Union minister profiles and approximately 100 listed companies, plus a small event-category set and historical events. These are targets, not claims of acquired data. The current fixture demonstrates 10 fictional official-style profiles, 4 fictional organizations, and 6 fictional events; the real listed-company target remains unmet.
- [ ] Relationship exploration supports Minister→Event→Organization→Founder/Promoter→Related Company→Listed Security, Government Department→Scheme, Government Agency→Contract, Organization→Subsidiary, Company→Corporate Disclosure, and Event→Supporting Source. Every edge has a type and its own supporting evidence/provenance.
- [ ] A minister’s attendance at a public event is not represented as a personal/financial relationship or proof of company benefit. No unsupported inference or relationship is displayed as fact.
- [ ] No page exposes live personal-location tracking, private travel details, residential information or inferred real-time whereabouts.
- [ ] If identifiers or documented relationships are unavailable, the company page says unavailable rather than inventing information.

## 3. Evidence, sources, provenance, and verification — Partial

- [ ] Every material event/entity relationship stores its own evidence/provenance; source-document evidence is not treated as proof of every extracted edge.
- [ ] Verification statuses remain distinct: Unverified, Machine-matched, Source-verified, Independently corroborated and Rejected. Numeric confidence is not described as calibrated unless measured on labelled validation data.
- [ ] Demonstration events, companies, people, relationships, security identifiers and market observations are visibly and consistently labelled synthetic. Synthetic records are never shown as real-world facts.
- [ ] A synthetic event without an external source says that it is a synthetic fixture and has no real-world source. A verified/real event must link to an accessible supporting source.
- [ ] Source health/admin view reports configured/unconfigured sources, last successful ingestion, latest retrieved record, new records, duplicate skips, failures, retries, quota/rate-limit failures where available, and records awaiting verification.
- [ ] Source strategy supports official/permitted sources such as PIB, PMIndia, official ministry/department/scheme portals, data.gov.in, Startup India, supported official public social accounts, NSE/BSE filings, company IR/MCA sources when available, and appropriately licensed market-data providers—but no integration is called live/operational until access is configured and tested.
- [ ] The application respects applicable robots.txt, platform terms, API quotas/authentication/rate limits, copyright, database licenses and Indian law. It does not circumvent logins, CAPTCHA, paywalls or source restrictions; does not invent endpoints, credentials, accounts, identifiers, prices or records.
- [ ] Unavailable sources are shown unavailable/not configured with the missing dependency explained; the rest of the app remains usable. Mock adapters are isolated to tests/demo use.

## 4. Data schema, migration safety, ingestion, CSV, and processing — Partial

- [ ] The normalized persistent schema covers users; roles/permissions; sources/accounts; documents/social posts; ministers/public officials; events; organizations/companies/aliases; people; typed organization-person relationships; government actions/schemes; listed securities/identifiers; historical market observations; event-source links; entity-resolution candidates; processing jobs; audit logs; user watchlists and saved searches.
- [ ] Models include foreign keys, indexes, uniqueness, timestamps and explicit typed/provenance-backed relationships. PostgreSQL relationship tables are used in this MVP’s managed MySQL-compatible equivalent; pgvector, Neo4j and a separate vector database are not required unless justified by implemented usage/performance.
- [ ] Database migrations are committed, deterministic, repeatable and additive where possible. The development and published application share the project database: do not wipe/reset tables or overwrite user edits; preserve completed seed history and only run unfinished preparation.
- [ ] Provide a configurable source-adapter interface, mock adapter for tests, and a validated CSV import facility for new records. CSV parsing validates required columns/types, reports row-level errors, is bounded in size, deduplicates idempotently, preserves provenance, and is access-controlled/audited.
- [ ] Incremental pipeline is source ingestion→deduplication→normalization→cheap relevance filtering→classification→known-entity lookup→entity resolution→structured extraction only when needed→evidence validation→database storage→analytics update.
- [ ] Dedup uses source-native IDs where available, normalized URLs and content hashes; material content revisions are stored separately.
- [ ] Relevance filtering begins with inexpensive rules/dictionaries and optional lightweight classification before expensive NLP.
- [ ] Entity matching prefers exact identifiers, normalized names, known aliases, fuzzy matching, optional embedding candidate retrieval, then NER/structured extraction/LLM for unresolved cases. Do not run transformer NER/LLM on every item. Cache reusable outcomes, version model/process outputs, record attempts and retry jobs safely.
- [ ] Structured extraction captures event/publication dates, official, organization/company, officially documented location, category, action/support, explicitly sourced project amount, supported founder/director/identifier, source URL/publication time, method, confidence and verification status. Validate against master records. Model-generated output alone is not proof.
- [ ] There is a labelled synthetic evaluation fixture. Classification/extraction precision, recall and F1, and entity-match precision, are reported only when actually measured.

## 5. Market analysis and claim boundaries — Partial

- [ ] The market-analysis view provides price/return/volume, sector benchmark, NIFTY/SENSEX benchmark, event-relative charts, event-day/1/3/7/30 trading-session windows, and comparable-event analysis only when supported by available valid data.
- [ ] Calculations use event timestamp, exchange calendar/trading-day conventions, valid prices and volume, selected event windows, appropriate benchmark, missing-session handling and corporate-action adjustments where coverage supports them.
- [ ] Coverage, data source/licensing, delay, missing sessions, methodology, sample size and limitations are visible. Demo/test prices are explicitly synthetic and never presented as genuine market data.
- [ ] Historical comparable-event summaries show median/distribution and positive/negative abnormal-return proportions only when sample size supports them.
- [ ] Analysis prevents look-ahead bias by limiting historical-date calculations to information available by that date.
- [ ] The product is descriptive/reproducible, does not claim a ministerial appearance, inauguration, photograph or social post caused a price move or created financial benefit, and does not generate personalized trading recommendations.
- [ ] If no licensed market-data provider is configured, the application says that real prices are unavailable and does not fabricate real quotes or claim market coverage.

## 6. API, authentication, authorization, privacy, and security — Partial

- [ ] APIs expose the application’s searchable/filterable records and detail data with server-side validation, parameterized DB operations, bounded input/pagination and meaningful error handling. API request/response examples are documented.
- [ ] Authentication uses the supported Manus OAuth/session flow, with real logged-out state until identity/session validation succeeds; no fake Preview user, development bypass, or deferred real login.
- [ ] Session validation follows the platform contract: application cookie name `webdev_app_session`, validated project JWT/session, correct app identity, secure HTTP-only cookie eligible for public HTTPS Preview (`SameSite=None; Secure`) and separate plain-HTTP local behavior if needed. Do not infer HTTPS from `req.secure` or `NODE_ENV`.
- [ ] Authorization is checked server-side. Ordinary users cannot access ingestion, source/data administration, or administrative audit endpoints. Admin role is separate from ordinary user; protect user-owned watchlists/saved searches and document tenant isolation for the project-scoped shared DB.
- [ ] API secrets are never exposed in frontend code/logs/committed files; `.env.example` contains placeholders only. No unconfigured paid integration is added.
- [ ] Administrative operations are audited. Apply rate limits where appropriate and input validation to every server boundary.
- [ ] No private personal whereabouts or residential/travel information is collected or exposed.

## 7. Watchlists, saved searches, health, and admin operations — Partial

- [ ] Authenticated users can maintain user-specific watchlists and saved searches; ownership is enforced server-side.
- [ ] Admin/source-health screen reports source configurations, last successful update, latest record, record counts, duplicates, failures, retries, quotas/rate limits where available, and review backlog.
- [ ] Ingestion and data-management actions are administrator-only, validated and audited. Failure handling does not mark an unavailable integration successful.

## 8. Testing, setup, architecture, and documentation — Partial

- [ ] Backend and frontend/API tests cover duplicate documents, entity normalization/aliases, NSE/BSE identifier matching rules, event classification, confidence-status rules, ambiguous/unknown company names, source failures/rate limits, freshness/missing trading sessions, event-relative returns, duplicate event-source links, user authorization, filters, API validation and migrations.
- [ ] Automated fixtures are synthetic and labelled. Tests do not delete production/shared DB data or write destructive test records into it. Report exact test commands/results; do not claim unmeasured performance/accuracy.
- [ ] README includes local setup, DB/migration/seed instructions, API examples, source configuration, CSV procedure, auth/role model, deployment path, limitations, which records are synthetic, which functions are real, unconfigured external dependencies, implemented features and incomplete features.
- [ ] Provide repository-style source code, schema/migrations, endpoints, placeholder-only `.env.example`, test suite, architecture diagram, source configuration guide and deployment instructions.
- [ ] The server exposes `/api/health`; page route manifest at `/manus-routes.json` matches current UI routes and is served as JSON, not SPA fallback.
- [ ] Performance/quality claims are tied to measured results. No later phase is described as complete until its acceptance tests pass.

## 9. Phase 2 — Real government ingestion — Open, not part of Phase 1 completion

- [ ] Implement one official government source adapter first; add scheduled incremental ingestion, source IDs/content hashes, failure logs, retries, duplicate handling, event extraction, company matching and evidence URLs.
- [ ] Do not claim ingestion is operational until tested against the actual permitted source and credentials/quotas are confirmed.

## 10. Phase 3–6 — Corporate/market integrations, advanced intelligence, production hardening — Open, not part of Phase 1 completion

- [ ] Phase 3 maps company/security identifiers and connects one permitted market-data provider; validate price history and event studies against known test cases.
- [ ] Phase 4 adds an approved X API connector only when credentials/access are available and an Instagram adapter only for supported/permitted account data.
- [ ] Phase 5 may add graph visualization, semantic search, sector trends, comparable-event analysis, more sources, watchlist alerts, and other advanced intelligence only when justified and acceptance-tested.
- [ ] Phase 6 production hardening may include deployment, monitoring, backups, rate limiting, background workers, operations dashboards, recovery, security review, load testing and CI/CD. Do not claim these unless completed and validated.

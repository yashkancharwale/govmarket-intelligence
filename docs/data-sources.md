# Data-source and import configuration

## Current status

The application currently has **no live government, corporate, social-media, exchange, MCA, or licensed market-data connector**. The database contains only namespaced, fictional Phase 1 fixtures. The seeded set is 10 fictional official-style profiles, 4 fictional organizations, and 6 fictional events—not a representative set of real ministries or the target of approximately 100 real listed companies. Empty provider coverage is reported as unavailable, not as a successful ingestion.

## Source adapter boundary

A production adapter should declare a stable source key, type, name, permitted access mode/coverage, authentication and quota requirements. Each run should record start/end timestamps, provider-native ID or cursor, retrieved/new/duplicate/failed counts, retry attempts and provider-reported quota/rate-limit state. Map provider IDs, normalized URLs and content hashes to retained document versions. Do not mark a run successful until fetch, parse, provenance validation and persistence finish.

`shared/intelligence.ts` exports the typed `SourceAdapter`/`SourceDocument` cursor contract. A mock adapter is defined only inside the unit tests and is explicitly marked unconfigured; it does not fetch or seed production data. The current source framework stores source accounts, source records and job health, and the CSV import produces unverified source/job records. It does **not** yet include an operational government fetch adapter or scheduler. Implement one permitted government adapter first only after checking current source terms, robots policy, supported interface, rate limits, update format, authentication and redistribution rights. Configure credentials only through protected project secrets. Test a real source run before showing it as configured/operational. Never circumvent logins, CAPTCHA, paywalls or other access restrictions.

Potential future sources specified for the product include PIB, PMIndia, official Union ministry/department/scheme portals, data.gov.in, Startup India; supported official public social APIs; NSE/BSE filings, company investor-relations pages and available MCA master data; and an appropriately licensed market-data provider. Listing a source here does not mean the app has access, permission, credentials or redistribution rights.

## CSV import

The `/system` page provides a **server-side admin-only**, audited CSV import. The file must be no larger than 1 MB and contain no more than 1,000 data rows. `title` and ISO `occurredAt` are required. Optional columns are `externalId`, `eventType`, `category`, `summary`, `location`, `company`, `minister`, `sourceType`, `sourceName`, and `sourceUrl`; source types are limited to `fixture`, `government`, `corporate`, `social`, or `market`.

The importer prefers a supplied source-native `externalId`, then a normalized URL, then content hash for identity. Each normalized source name/type/origin maps to a separate user-declared source record. Content is hashed independently of filename. An exact reimport is skipped; changed content is stored as a new document linked to the prior event, with a note that event fields are not auto-overwritten pending review. CSV metadata and URLs remain synthetic/unverified; URLs are not fetched, and a supplied label such as `government` is not evidence that the source is official. Organization and official mentions only create explicitly unverified mention edges when exact canonical/alias matching succeeds; unmatched mentions are retained as unverified entity-resolution candidates. A mention never proves a contract, benefit, or personal relationship.

The CSV flow records per-source job row/duplicate/error totals and an audit record. Row errors are bounded and do not expose database exception text. No operator should convert an imported row into a verified fact without reviewing its supporting source and the specific relationship evidence.

## Provenance and verification

Verification stages are separate values: `unverified`, `machine_matched`, `source_verified`, `independently_corroborated`, and `rejected`. A source document alone does not prove every company/official relationship; event-to-company and event-to-official edges carry their own evidence, status, source/document link and synthetic flag. Keep event verification distinct from edge verification and avoid treating confidence values as measured accuracy.

Synthetic demo events intentionally have no claim to an external real-world source. Evidence panels identify them as fictional fixtures; no fake URL, actual official name, real issuer identity, market quote, CIN, ISIN, NSE symbol or BSE code is supplied as fact.

## Lawful access and restrictions

Respect applicable robots.txt, terms of service, API quotas/authentication/rate limits, copyright, database licenses and Indian law. Do not scrape behind authentication or a paywall, circumvent CAPTCHA or invent endpoints/credentials. Keep raw material only where provider terms permit. Store secrets outside source control and server-render secrets only; never expose them to the browser.

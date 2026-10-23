# API reference (Phase 1)

The server uses Express, tRPC, Zod validation, and the typed client at `client/src/lib/trpc.ts`. The tRPC endpoint is `/api/trpc`. Client code should use the generated `trpc` hooks/typed procedures rather than constructing unvalidated SQL or depending on an undocumented REST API.

## Health

`GET /api/health` is an unauthenticated process-health endpoint used by the managed host:

```json
{"status":"ok"}
```

It indicates that the HTTP server responds; it does not prove database readiness, source connectivity, ingestion freshness, or valid market-data coverage. `/manus-routes.json` is a static page-route manifest, not an API route.

## Query examples

React client example for page 1 of the event explorer:

```tsx
const result = trpc.intelligence.events.search.useQuery({
  page: 1,
  pageSize: 20,
  sourceType: "government",
  verificationStatus: "unverified",
  from: new Date("2026-01-01T00:00:00Z"),
  to: new Date("2026-12-31T23:59:59Z"),
});
```

The search input accepts `query` (up to 200 characters), `page` (minimum 1), `pageSize` (1–50), `category`, `ministerId`, `companyId`, `sector`, `sourceType`, officially documented `location`, `verificationStatus` (`unverified`, `machine_matched`, `source_verified`, `independently_corroborated`, `rejected`), `listed`, `from`, and `to`. Aliases are included in name search. Search results are paginated after the persisted records and linked company/official names are filtered.

Representative result shape (illustrative only; IDs and records are not real data):

```ts
{
  items: [{
    id: 1,
    title: "Synthetic project example",
    eventDate: new Date("2026-01-15T00:00:00.000Z"),
    category: "investment",
    summary: "Fictional demo fixture",
    location: null,
    sourceType: "fixture",
    sourceTypes: ["fixture"],
    verificationStatus: "unverified",
    isSynthetic: true,
    companies: [],
    officials: [],
    minister: null,
    sourceCount: 1
  }],
  total: 1,
  page: 1,
  pageSize: 20
}
```

Other public read procedures include `intelligence.overview`, event detail/list procedures, minister and company lists/details, `intelligence.relationships.subgraph`, `intelligence.market.coverage`, `intelligence.market.eventStudy`, and `intelligence.system.health`. Their outputs come from the configured database. When the database is unavailable, results say so or return empty values; synthetic data is never substituted silently for real sources. The health result exposes only aggregate source/job data and enriches PIB jobs with audited imported/revision counts keyed by job ID, without returning audit user IDs. Market study queries require an event and security linked through a documented company edge and use only non-synthetic market observations.

## Authentication and write procedures

- `auth.me` reports the validated current Manus session; `auth.logout` clears the application session.
- Saved watchlists and saved searches are protected by server-side authentication, and each lookup/mutation is scoped to the signed-in `userId`.
- `intelligence.system.importCsv` is admin-only. It accepts `csv` or `csvText` (maximum 1 MB), optional `filename` (maximum 255 characters), and validated CSV text; parser limit is 1,000 data rows. It returns counts for new events, preserved document revisions, idempotent duplicate skips, row errors, and the `synthetic: true` / `verificationStatus: "unverified"` disclosure.
- Import actions create job records and audit entries. Ordinary users cannot elevate their own role or invoke the import procedure.
- `intelligence.system.configurePibRss` is admin-only and accepts `{ enabled: boolean, confirmDatabaseTarget: true }`. It creates/enables or disables only the fixed PIB source record; it does not fetch the feed. It returns `configured`, `enabled`, `sourceName`, and the fixed `feedUrl`.
- `intelligence.system.runPibRss` is admin-only and accepts `{ limit?: 1..500, confirmDatabaseTarget: true, confirmFeedAccess: true }` (limit defaults to 500). It requires the PIB source to exist, be enabled, non-synthetic and match the hard-coded official adapter/feed URL. The result includes `jobId`, `status`, `rowCount`, `imported`, `revisions`, `duplicateCount`, `errorCount`, `retryCount`, `quotaLimited`, `truncated`, bounded item errors, `verificationStatus: "unverified"`, and the feed URL. A failed request, invalid item, empty channel, or persistence error produces a failed job; it does not report successful ingestion.
- `intelligence.system.exportPibRssCsv` is admin-only and accepts `{ confirmDatabaseTarget: true }`. It returns `{ filename, exportPath, recordCount, csv }`, downloads only non-synthetic PIB-linked source document revisions, and writes a local copy beneath git-ignored `data/export/`. CSV columns are `externalId,eventType,title,occurredAt,category,summary,location,company,minister,sourceType,sourceName,sourceUrl`; missing IDs and unsupported/inferred fields are blank. Cells are quoted/escaped and spreadsheet-formula prefixes are neutralized. The action is audited and does not include secrets or private-user data.

The `/system` controls require an explicit administrator acknowledgement that the active `DATABASE_URL` is the intended development/test database and that current feed access is permitted. The server additionally requires `GOVMARKET_PIB_WRITE_TARGET=development` and rejects writes by default; configure that non-secret flag only after confirming the database target. Configuration, run, and export actions write audit/job/source records; the managed preview/development and published app can share a database, so leave the flag unset for a shared/production target. No migration or seed command is needed for PIB support. The current checked feed URL returned HTTP 200 but an empty RSS channel on 2026-10-23; this was only an access check and no live PIB records were collected. See [`docs/data-sources.md`](data-sources.md) for terms, robots status, provenance and limitations.

See `shared/intelligence.ts` for exact shared schemas and `server/intelligence.ts` for current procedure implementations. Public provider credentials, real source records, and licensed price series are not included.

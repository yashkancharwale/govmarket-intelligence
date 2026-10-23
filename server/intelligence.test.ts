import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { calculateEventStudy, classifyEvent, eventSearchInputSchema, normalizeName, normalizeUrl, parseCsv } from "../shared/intelligence";
import type { SourceAdapter } from "../shared/intelligence";
import { parsePibJobAuditMetrics } from "./intelligence";
import type { TrpcContext } from "./_core/context";

const context = (role: "user" | "admin"): TrpcContext => ({
  user: { id: 1, openId: `test-${role}`, name: "Test", email: null, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("intelligence pure contracts", () => {
  it("normalizes duplicate names and URLs deterministically", () => {
    expect(normalizeName("  Asterion—Gridworks, PVT. LTD. ")).toBe("asterion gridworks pvt ltd");
    expect(normalizeUrl("HTTPS://Example.test/a#frag?utm_source=fixture")).toBe("https://example.test/a");
  });
  it("classifies an unknown event conservatively and honors explicit category", () => {
    expect(classifyEvent({ title: "Tender consultation", summary: "synthetic" })).toMatchObject({ category: "procurement" });
    expect(classifyEvent({ title: "Unclear note", category: "Policy" }).category).toBe("policy");
  });
  it("validates CSV headers, row types, and malformed rows", () => {
    const result = parseCsv("title,occurredAt,eventType\nA fixture,2026-01-01T00:00:00Z,policy\nMissing date,,policy");
    expect(result.rows).toHaveLength(2);
    expect(result.errors.some(error => error.field === "occurredAt")).toBe(true);
    expect(parseCsv("badHeader\nvalue").errors[0]?.message).toContain("Unsupported headers");
  });
  it("accepts a provider record ID and enforces the CSV row cap", () => {
    const imported = parseCsv("externalId,title,occurredAt\nprovider-42,A fixture,2026-01-01");
    expect(imported.rows[0]?.externalId).toBe("provider-42");
    const tooManyRows = ["title,occurredAt", ...Array.from({ length: 1_001 }, (_, index) => `Fixture ${index},2026-01-01`)].join("\n");
    expect(parseCsv(tooManyRows).errors[0]?.message).toContain("1000 data-row limit");
  });
  it("bounds event-search pagination and rejects unsupported verification values", () => {
    expect(eventSearchInputSchema.safeParse({ page: 1, pageSize: 50, listed: true }).success).toBe(true);
    expect(eventSearchInputSchema.safeParse({ page: 1, pageSize: 51 }).success).toBe(false);
    expect(eventSearchInputSchema.safeParse({ page: 1, pageSize: 20, verificationStatus: "verified" }).success).toBe(false);
  });
  it("returns null changes for missing sessions rather than inventing a series", () => {
    const result = calculateEventStudy(new Date("2026-01-02T00:00:00Z"), [{ observedAt: new Date("2026-01-02T00:00:00Z"), close: 100 }]);
    expect(result.available).toBe(false);
    expect(result.windows.some(window => window.change === null)).toBe(true);
  });
  it("uses observed trading sessions across a weekend instead of calendar-day gaps", () => {
    const result = calculateEventStudy(new Date("2026-01-03T00:00:00Z"), [
      { observedAt: new Date("2026-01-02T00:00:00Z"), close: 90 },
      { observedAt: new Date("2026-01-05T00:00:00Z"), close: 100 },
      { observedAt: new Date("2026-01-06T00:00:00Z"), close: 110 },
      { observedAt: new Date("2026-01-07T00:00:00Z"), close: 120 },
    ], [-1, 0, 1, 2]);
    expect(result.eventSession?.toISOString().slice(0, 10)).toBe("2026-01-05");
    const expected = [-0.1, 0, 0.1, 0.2];
    result.windows.forEach((window, index) => expect(window.change).toBeCloseTo(expected[index], 10));
  });
  it("keeps the mock source adapter isolated to tests and unconfigured", async () => {
    const mockAdapter: SourceAdapter = {
      key: "test-only-fixture",
      configured: false,
      async fetch({ limit } = {}) {
        const documents = [{ externalId: "fixture-1", title: "Synthetic test fixture", url: null, publishedAt: new Date("2026-01-01T00:00:00Z") }];
        return { documents: documents.slice(0, limit ?? documents.length), nextCursor: null };
      },
    };
    const result = await mockAdapter.fetch({ limit: 1 });
    expect(mockAdapter.configured).toBe(false);
    expect(result.documents[0]?.title).toBe("Synthetic test fixture");
    expect(result.nextCursor).toBeNull();
  });
  it("rejects CSV import for a non-admin without touching the database", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.intelligence.system.importCsv({ csv: "title,occurredAt\nfixture,2026-01-01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects PIB configuration, ingestion, and export for a non-admin before database access", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.intelligence.system.configurePibRss({ enabled: true, confirmDatabaseTarget: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.intelligence.system.runPibRss({ confirmDatabaseTarget: true, confirmFeedAccess: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.intelligence.system.exportPibRssCsv({ confirmDatabaseTarget: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("maps only stored PIB audit totals back to source-job history", () => {
    expect(parsePibJobAuditMetrics(JSON.stringify({ sourceKey: "pib:press-releases:en:india", jobId: 9, imported: 3, revisions: 2 })))
      .toEqual({ jobId: 9, importedCount: 3, revisionCount: 2 });
    expect(parsePibJobAuditMetrics(JSON.stringify({ sourceKey: "another-source", jobId: 9, imported: 3, revisions: 2 }))).toBeNull();
    expect(parsePibJobAuditMetrics("not-json")).toBeNull();
  });
  it("blocks an admin from all PIB writes unless the development-target flag is set", async () => {
    const original = process.env.GOVMARKET_PIB_WRITE_TARGET;
    delete process.env.GOVMARKET_PIB_WRITE_TARGET;
    try {
      const caller = appRouter.createCaller(context("admin"));
      await expect(caller.intelligence.system.configurePibRss({ enabled: true, confirmDatabaseTarget: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(caller.intelligence.system.runPibRss({ confirmDatabaseTarget: true, confirmFeedAccess: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(caller.intelligence.system.exportPibRssCsv({ confirmDatabaseTarget: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    } finally {
      if (original === undefined) delete process.env.GOVMARKET_PIB_WRITE_TARGET;
      else process.env.GOVMARKET_PIB_WRITE_TARGET = original;
    }
  });
});

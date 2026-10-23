import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { auditLogs, documents, eventSources, events, sources, sourceJobs } from "../drizzle/schema";
import { normalizeUrl, sha256 } from "../shared/intelligence";
import type { SourceAdapter, SourceDocument, SourceFetchResult } from "../shared/intelligence";

export const PIB_RSS_DIRECTORY_URL = "https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1";
export const PIB_RSS_FEED_URL = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1";
export const PIB_SOURCE_KEY = "pib:press-releases:en:india";
export const PIB_ADAPTER_KEY = "pib-rss-press-releases";
export const PIB_SOURCE_NAME = "Press Information Bureau";

const MAX_FEED_BYTES = 2_000_000;
const MAX_ITEMS_PER_RUN = 500;
const MAX_ITEM_TEXT_LENGTH = 50_000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EXPORT_ROWS = 5_000;
const MAX_EXPORT_BYTES = 20_000_000;
const PIB_HOST = "pib.gov.in";

export type PibItemError = { itemIndex: number; message: string };
export type PibRssDocument = SourceDocument & {
  identityKey: string;
  contentHash: string;
  itemIndex: number;
  originalPublishedAt: string;
};
export type PibRssFetchResult = SourceFetchResult & {
  documents: PibRssDocument[];
  itemErrors: PibItemError[];
  fetchedCount: number;
  retryCount: number;
  quotaLimited: boolean;
  truncated: boolean;
};
export interface PibRssAdapter extends SourceAdapter {
  fetch(input?: { cursor?: string; since?: Date; limit?: number }): Promise<PibRssFetchResult>;
}

type AdapterDependencies = {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
};

class PibHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null = null) {
    super(`PIB RSS request returned HTTP ${status}.`);
    this.name = "PibHttpError";
  }
}

export class PibRssFetchError extends Error {
  constructor(message: string, readonly retryCount: number, readonly quotaLimited: boolean) {
    super(message);
    this.name = "PibRssFetchError";
  }
}

export class PibSourceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PibSourceConfigurationError";
  }
}

function sleep(milliseconds: number) {
  return new Promise<void>(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function isPibHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (host === PIB_HOST || host.endsWith(`.${PIB_HOST}`))
      && (!url.port || url.port === "443")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FEED_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("PIB RSS response exceeded the 2 MB safety limit.");
  }
  if (!response.body) throw new Error("PIB RSS response did not contain a readable body.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FEED_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("PIB RSS response exceeded the 2 MB safety limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("PIB RSS response was not valid UTF-8.");
  }
}

async function getOfficialFeed(fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  let url = PIB_RSS_FEED_URL;
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!isPibHttpsUrl(url)) throw new Error("PIB RSS redirect left the official HTTPS domain; request stopped.");
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: {
        accept: "application/rss+xml, application/xml, text/xml",
        "user-agent": "GovMarketIntelligence/1.0 RSS reader",
      },
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirect === 3) throw new Error("PIB RSS returned an unsupported redirect.");
    url = new URL(location, url).toString();
  }
  throw new Error("PIB RSS exceeded the redirect limit.");
}

function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof PibHttpError && error.retryAfter) {
    const seconds = Number(error.retryAfter);
    const requested = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(error.retryAfter) - Date.now();
    if (Number.isFinite(requested)) return Math.max(0, Math.min(2_000, requested));
  }
  return Math.min(1_000, 250 * 2 ** attempt);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof PibHttpError) return error.status === 408 || error.status === 429 || error.status >= 500;
  if (error instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(error.name)) return true;
  return false;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof PibRssFetchError || error instanceof PibHttpError) return error.message.slice(0, 300);
  if (error instanceof Error) return error.message.slice(0, 300);
  return "PIB RSS request failed for an unknown reason.";
}

async function fetchFeedXml(fetchImpl: typeof fetch, wait: (milliseconds: number) => Promise<void>) {
  let lastError: unknown;
  let quotaLimited = false;
  let retries = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await getOfficialFeed(fetchImpl, controller.signal);
      if (!response.ok) {
        const httpError = new PibHttpError(response.status, response.headers.get("retry-after"));
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) quotaLimited = true;
        throw httpError;
      }
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!/(?:application\/rss\+xml|application\/xml|text\/xml)(?:\s*;|$)/i.test(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("PIB RSS response did not declare an XML content type.");
      }
      const xml = await readBoundedBody(response);
      clearTimeout(timeout);
      return { xml, retryCount: attempt, quotaLimited };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) break;
      retries++;
      await wait(retryDelay(error, attempt));
    }
  }
  throw new PibRssFetchError(safeErrorMessage(lastError), retries, quotaLimited);
}

function readXmlText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readXmlText).filter(Boolean).join(" ").trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["#text", "#cdata", "__cdata", "#cdata-section"]) {
      if (record[key] !== undefined) return readXmlText(record[key]);
    }
  }
  return "";
}

function parsePublishedAt(value: string): Date {
  const raw = value.trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2}|\bGMT|\bUTC|\bIST)$/i.test(raw);
  if (!raw || !hasExplicitZone) throw new Error("Publication time is missing or has no explicit timezone.");
  // In this PIB-specific feed, IST is India Standard Time (UTC+05:30); preserve the raw text too.
  const normalized = /\bIST$/i.test(raw) ? raw.replace(/\bIST$/i, "+05:30") : raw;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error("Publication time could not be parsed safely.");
  return new Date(timestamp);
}

function parsePibUrl(value: string): string {
  const normalized = normalizeUrl(value);
  if (!normalized || !isPibHttpsUrl(normalized)) throw new Error("Item URL is not an HTTPS PIB-domain URL.");
  if (normalized.length > 2_048) throw new Error("Item URL exceeds the 2,048-character storage limit.");
  return normalized;
}

function parseItem(raw: unknown, itemIndex: number, retrievedAt: Date): PibRssDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("RSS item is not a structured item.");
  const item = raw as Record<string, unknown>;
  const title = readXmlText(item.title);
  if (!title) throw new Error("Item title is missing.");
  if (title.length > 512) throw new Error("Item title exceeds the stored 512-character limit.");

  const url = parsePibUrl(readXmlText(item.link));
  const originalPublishedAt = readXmlText(item.pubDate) || readXmlText(item["dc:date"]);
  const publishedAt = parsePublishedAt(originalPublishedAt);
  const summary = readXmlText(item.description) || readXmlText(item["content:encoded"]);
  if (summary.length > MAX_ITEM_TEXT_LENGTH) throw new Error("Item summary exceeds the 50,000-character safety limit.");

  const suppliedGuid = readXmlText(item.guid);
  const externalId = suppliedGuid && suppliedGuid.length <= 255 ? suppliedGuid : null;
  const contentHashInput = JSON.stringify({
    externalId,
    url,
    title,
    publishedAt: publishedAt.toISOString(),
    summary,
  });
  return {
    externalId,
    url,
    title,
    text: summary || null,
    publishedAt,
    retrievedAt,
    identityKey: externalId ? `guid:${externalId}` : `url:${url}`,
    contentHash: createHash("sha256").update(contentHashInput, "utf8").digest("hex"),
    itemIndex,
    originalPublishedAt,
  };
}

export function parsePibRssXml(xml: string, retrievedAt = new Date(), limit = MAX_ITEMS_PER_RUN) {
  if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) throw new Error("PIB RSS response exceeded the 2 MB safety limit.");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("PIB RSS document types and entity declarations are not accepted.");
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error("PIB RSS XML is malformed.");

  let parsed: Record<string, any>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      trimValues: true,
      processEntities: true,
      cdataPropName: "#cdata",
    });
    parsed = parser.parse(xml) as Record<string, any>;
  } catch {
    throw new Error("PIB RSS XML could not be parsed.");
  }

  const channel = parsed?.rss?.channel;
  if (!channel || typeof channel !== "object") throw new Error("PIB response is not an RSS 2.0 channel.");
  const rawValue = channel.item;
  const rawItems: unknown[] = rawValue === undefined ? [] : Array.isArray(rawValue) ? rawValue : [rawValue];
  const itemErrors: PibItemError[] = [];
  const items: PibRssDocument[] = [];
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(MAX_ITEMS_PER_RUN, Math.trunc(limit))) : MAX_ITEMS_PER_RUN;

  if (!rawItems.length) itemErrors.push({ itemIndex: 0, message: "RSS channel returned no feed items; ingestion was not marked successful." });
  if (rawItems.length > boundedLimit) {
    itemErrors.push({ itemIndex: boundedLimit + 1, message: `Feed has more than the ${boundedLimit}-item per-run limit; remaining items were not processed.` });
  }

  rawItems.slice(0, boundedLimit).forEach((rawItem, index) => {
    try {
      items.push(parseItem(rawItem, index + 1, retrievedAt));
    } catch (error) {
      itemErrors.push({ itemIndex: index + 1, message: error instanceof Error ? error.message.slice(0, 250) : "RSS item was malformed." });
    }
  });

  return { items, itemErrors, fetchedCount: rawItems.length, truncated: rawItems.length > boundedLimit };
}

export function createPibRssAdapter(configured: boolean, dependencies: AdapterDependencies = {}): PibRssAdapter {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const wait = dependencies.sleep ?? sleep;
  const now = dependencies.now ?? (() => new Date());
  return {
    key: PIB_ADAPTER_KEY,
    configured,
    async fetch(input = {}) {
      if (!configured) throw new Error("PIB RSS adapter is not enabled by an administrator.");
      const inputLimit = input.limit ?? MAX_ITEMS_PER_RUN;
      const limit = Number.isFinite(inputLimit) ? Math.max(1, Math.min(MAX_ITEMS_PER_RUN, Math.trunc(inputLimit))) : MAX_ITEMS_PER_RUN;
      const response = await fetchFeedXml(fetchImpl, wait);
      const parsed = parsePibRssXml(response.xml, now(), limit);
      return {
        documents: parsed.items,
        nextCursor: null,
        itemErrors: parsed.itemErrors,
        fetchedCount: parsed.fetchedCount,
        retryCount: response.retryCount,
        quotaLimited: response.quotaLimited,
        truncated: parsed.truncated,
      };
    },
  };
}

export async function configurePibSource(db: any, enabled: boolean) {
  let source = (await db.select().from(sources).where(eq(sources.sourceKey, PIB_SOURCE_KEY)).limit(1))[0];
  if (!source) {
    if (!enabled) return null;
    const insertedId = (await db.insert(sources).values({
      sourceKey: PIB_SOURCE_KEY,
      name: PIB_SOURCE_NAME,
      sourceType: "government",
      baseUrl: PIB_RSS_FEED_URL,
      adapterKey: PIB_ADAPTER_KEY,
      isSynthetic: false,
      isEnabled: true,
      notes: `Official PIB press-release RSS source. Directory: ${PIB_RSS_DIRECTORY_URL}. Feed items remain unverified; no entity relationships are inferred.`,
    }).$returningId())[0]?.id;
    source = (await db.select().from(sources).where(eq(sources.id, Number(insertedId))).limit(1))[0];
    if (!source) throw new PibSourceConfigurationError("PIB source configuration could not be saved.");
    return source;
  }

  if (source.isSynthetic || source.sourceType !== "government" || source.baseUrl !== PIB_RSS_FEED_URL || source.adapterKey !== PIB_ADAPTER_KEY) {
    throw new PibSourceConfigurationError("An existing record uses the PIB source key with different settings; it was not overwritten.");
  }
  await db.update(sources).set({ isEnabled: enabled }).where(eq(sources.id, source.id));
  return (await db.select().from(sources).where(eq(sources.id, source.id)).limit(1))[0] ?? source;
}

export function parsePibSnapshot(provenanceNote: string | null | undefined): Record<string, unknown> | null {
  if (!provenanceNote) return null;
  try {
    const value = JSON.parse(provenanceNote) as Record<string, unknown>;
    return value.kind === "pib-rss-item-snapshot" ? value : null;
  } catch {
    return null;
  }
}

async function persistPibItem(db: any, sourceId: number, item: PibRssDocument): Promise<"inserted" | "revision" | "duplicate"> {
  const eventKey = `pib-${await sha256(`${sourceId}|${item.identityKey}`)}`;
  return db.transaction(async (tx: any) => {
    const existingEvents = await tx.select().from(events).where(eq(events.eventKey, eventKey)).limit(1);
    const existingDocuments = await tx.select().from(documents)
      .where(and(eq(documents.sourceId, sourceId), eq(documents.contentHash, item.contentHash))).limit(1);
    const createdEvent = !existingEvents.length;
    const createdDocument = !existingDocuments.length;
    const event = existingEvents[0] ?? (await tx.insert(events).values({
      eventKey,
      eventType: "pib_press_release",
      title: item.title,
      summary: item.text ?? null,
      occurredAt: item.publishedAt ?? item.retrievedAt ?? new Date(),
      category: null,
      location: null,
      verificationStatus: "unverified",
      isSynthetic: false,
    }).$returningId().then((rows: any[]) => tx.select().from(events).where(eq(events.id, Number(rows[0]?.id))).limit(1).then((found: any[]) => found[0])));
    const document = existingDocuments[0] ?? (await tx.insert(documents).values({
      sourceId,
      normalizedUrl: item.url ?? null,
      urlHash: item.url ? await sha256(item.url) : null,
      externalId: item.externalId ?? null,
      contentHash: item.contentHash,
      title: item.title,
      publishedAt: item.publishedAt ?? null,
      retrievedAt: item.retrievedAt ?? new Date(),
      isSynthetic: false,
    }).$returningId().then((rows: any[]) => tx.select().from(documents).where(eq(documents.id, Number(rows[0]?.id))).limit(1).then((found: any[]) => found[0])));

    if (!event || !document) throw new Error("PIB event/document record was not available after insert.");
    const link = await tx.select({ id: eventSources.id }).from(eventSources).where(and(
      eq(eventSources.eventId, event.id),
      eq(eventSources.sourceId, sourceId),
      eq(eventSources.documentId, document.id),
    )).limit(1);
    if (!link.length) {
      const snapshot = {
        kind: "pib-rss-item-snapshot",
        sourceName: PIB_SOURCE_NAME,
        sourceUrl: item.url ?? null,
        externalId: item.externalId ?? null,
        title: item.title,
        summary: item.text ?? null,
        originalPublishedAt: item.originalPublishedAt,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        retrievedAt: item.retrievedAt?.toISOString() ?? new Date().toISOString(),
        verificationStatus: "unverified",
        isSynthetic: false,
      };
      await tx.insert(eventSources).values({
        eventId: event.id,
        sourceId,
        documentId: document.id,
        provenanceNote: JSON.stringify(snapshot),
      });
    }
    if (!createdEvent && !createdDocument) return "duplicate";
    return createdEvent ? "inserted" : "revision";
  });
}

function safeAuditDetails(metrics: Record<string, unknown>) {
  return JSON.stringify({ sourceKey: PIB_SOURCE_KEY, feedUrl: PIB_RSS_FEED_URL, ...metrics });
}

export async function runPibRssIngestion(db: any, source: any, userId: number, limit = MAX_ITEMS_PER_RUN) {
  const startedAt = new Date();
  const jobInsert = (await db.insert(sourceJobs).values({
    sourceId: source.id,
    jobType: "pib_rss_ingest",
    status: "running",
    startedAt,
    rowCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    retryCount: 0,
    quotaLimited: false,
  }).$returningId())[0];
  const jobId = Number(jobInsert?.id);
  if (!Number.isFinite(jobId) || jobId <= 0) throw new Error("PIB ingestion job could not be created.");

  const metrics = { rowCount: 0, imported: 0, revisions: 0, duplicateCount: 0, errorCount: 0, retryCount: 0, quotaLimited: false, truncated: false };
  const errors: PibItemError[] = [];
  try {
    const adapter = createPibRssAdapter(true);
    const result = await adapter.fetch({ limit });
    metrics.rowCount = result.fetchedCount;
    metrics.retryCount = result.retryCount;
    metrics.quotaLimited = result.quotaLimited;
    metrics.truncated = result.truncated;
    errors.push(...result.itemErrors);

    for (const item of result.documents) {
      try {
        const outcome = await persistPibItem(db, source.id, item);
        if (outcome === "inserted") metrics.imported++;
        else if (outcome === "revision") metrics.revisions++;
        else metrics.duplicateCount++;
      } catch {
        errors.push({ itemIndex: item.itemIndex, message: "Item could not be persisted; no database error details were exposed." });
      }
    }

    metrics.errorCount = errors.length;
    const status = metrics.errorCount ? "failed" : "succeeded";
    const finishedAt = new Date();
    await db.update(sourceJobs).set({
      status,
      finishedAt,
      rowCount: metrics.rowCount,
      duplicateCount: metrics.duplicateCount,
      errorCount: metrics.errorCount,
      retryCount: metrics.retryCount,
      quotaLimited: metrics.quotaLimited,
      errorSummary: errors.length ? JSON.stringify(errors.slice(0, 50)) : null,
    }).where(eq(sourceJobs.id, jobId));
    await db.insert(auditLogs).values({
      userId,
      action: "intelligence.runPibRss",
      entityType: "source",
      entityId: source.id,
      details: safeAuditDetails({ jobId, status, ...metrics, finishedAt: finishedAt.toISOString() }),
    });
    return { jobId, status, ...metrics, errors: errors.slice(0, 100), verificationStatus: "unverified" as const };
  } catch (error) {
    const finishedAt = new Date();
    const message = safeErrorMessage(error);
    const fetchError = error instanceof PibRssFetchError ? error : null;
    metrics.retryCount = fetchError?.retryCount ?? metrics.retryCount;
    metrics.quotaLimited = fetchError?.quotaLimited ?? metrics.quotaLimited;
    metrics.errorCount = Math.max(1, errors.length);
    errors.push({ itemIndex: 0, message });
    await db.update(sourceJobs).set({
      status: "failed",
      finishedAt,
      rowCount: metrics.rowCount,
      duplicateCount: metrics.duplicateCount,
      errorCount: metrics.errorCount,
      retryCount: metrics.retryCount,
      quotaLimited: metrics.quotaLimited,
      errorSummary: JSON.stringify(errors.slice(0, 50)),
    }).where(eq(sourceJobs.id, jobId));
    await db.insert(auditLogs).values({
      userId,
      action: "intelligence.runPibRss",
      entityType: "source",
      entityId: source.id,
      details: safeAuditDetails({ jobId, status: "failed", ...metrics, finishedAt: finishedAt.toISOString() }),
    });
    return { jobId, status: "failed" as const, ...metrics, errors: errors.slice(0, 100), errorMessage: message, verificationStatus: "unverified" as const };
  }
}

const CSV_COLUMNS = [
  "externalId", "eventType", "title", "occurredAt", "category", "summary",
  "location", "company", "minister", "sourceType", "sourceName", "sourceUrl",
] as const;

type PibCsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

export function serializePibCsv(rows: PibCsvRow[]): string {
  const escape = (value: string) => {
    const text = String(value ?? "");
    const spreadsheetSafe = /^[\s\u0000-\u001f\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
  };
  return [CSV_COLUMNS.map(escape).join(","), ...rows.map(row => CSV_COLUMNS.map(column => escape(row[column] ?? "")).join(","))].join("\r\n") + "\r\n";
}

export async function exportPibRssCsv(db: any, sourceId: number) {
  const fetchedRows = await db.select({ event: events, document: documents, link: eventSources })
    .from(eventSources)
    .innerJoin(events, eq(eventSources.eventId, events.id))
    .innerJoin(documents, eq(eventSources.documentId, documents.id))
    .where(and(eq(eventSources.sourceId, sourceId), eq(events.isSynthetic, false), eq(documents.isSynthetic, false)))
    .orderBy(desc(documents.publishedAt))
    .limit(MAX_EXPORT_ROWS + 1);
  if (fetchedRows.length > MAX_EXPORT_ROWS) throw new Error(`PIB CSV export is limited to ${MAX_EXPORT_ROWS} source-document revisions per file.`);

  const rows: PibCsvRow[] = fetchedRows.map(({ event, document, link }: any) => {
    const snapshot = parsePibSnapshot(link.provenanceNote);
    const publishedAt = document.publishedAt ?? event.occurredAt;
    return {
      externalId: document.externalId ?? "",
      eventType: event.eventType || "pib_press_release",
      title: document.title || event.title,
      occurredAt: publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt ? new Date(publishedAt).toISOString() : "",
      category: event.category ?? "",
      summary: typeof snapshot?.summary === "string" ? snapshot.summary : event.summary ?? "",
      location: "",
      company: "",
      minister: "",
      sourceType: "government",
      sourceName: PIB_SOURCE_NAME,
      sourceUrl: document.normalizedUrl ?? "",
    };
  });
  const csv = serializePibCsv(rows);
  if (Buffer.byteLength(csv, "utf8") > MAX_EXPORT_BYTES) throw new Error("PIB CSV export exceeded the 20 MB safety limit; no file was written.");

  const exportDirectory = resolve(process.cwd(), "data/export");
  await mkdir(exportDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const filename = `pib-press-releases-${timestamp}.csv`;
  const filePath = resolve(exportDirectory, filename);
  await writeFile(filePath, csv, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { filename, exportPath: `data/export/${filename}`, recordCount: rows.length, csv };
}

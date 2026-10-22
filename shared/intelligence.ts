import { z } from "zod";

export const verificationStatusSchema = z.enum([
  "unverified",
  "machine_matched",
  "source_verified",
  "independently_corroborated",
  "rejected",
]);

export const eventSearchInputSchema = z.object({
  query: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  category: z.string().trim().max(96).optional(),
  ministerId: z.number().int().positive().optional(),
  companyId: z.number().int().positive().optional(),
  sector: z.string().trim().max(128).optional(),
  sourceType: z.string().trim().max(64).optional(),
  location: z.string().trim().max(255).optional(),
  verificationStatus: verificationStatusSchema.optional(),
  listed: z.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type EventSearchInput = z.infer<typeof eventSearchInputSchema>;

export type CompanySummary = {
  id: number;
  name: string;
  sector: string | null;
  industry?: string | null;
  listed: boolean;
  isSynthetic: boolean;
  nseSymbol?: string | null;
  bseCode?: string | null;
  isin?: string | null;
};
export type MinisterSummary = {
  id: number;
  name: string;
  position?: string | null;
  ministry?: string | null;
  isSynthetic: boolean;
};
export type EventSummary = {
  id: number;
  title: string;
  eventDate: Date;
  category: string | null;
  summary: string | null;
  location: string | null;
  verificationStatus: string;
  isSynthetic: boolean;
  companies: CompanySummary[];
  minister: MinisterSummary | null;
  sourceCount: number;
};
export type EvidenceRecord = {
  sourceId: number;
  sourceName: string;
  sourceType: string;
  documentId: number | null;
  url: string | null;
  provenance: string | null;
  isSynthetic: boolean;
};

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    [...url.searchParams.keys()]
      .filter(key => /^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase()))
      .forEach(key => url.searchParams.delete(key));
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function classifyEvent(input: { title: string; summary?: string | null; category?: string | null }): { category: string; confidence: number } {
  if (input.category?.trim()) return { category: input.category.trim().toLowerCase(), confidence: 1 };
  const text = `${input.title} ${input.summary ?? ""}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["procurement", /tender|procurement|contract/],
    ["policy", /policy|regulation|scheme|guideline/],
    ["appointment", /appoint|minister|portfolio/],
    ["investment", /invest|funding|capital|project/],
    ["partnership", /memorandum|\bmou\b|partnership|collaboration/],
  ];
  const found = rules.find(([, pattern]) => pattern.test(text));
  return { category: found?.[0] ?? "other", confidence: found ? 0.75 : 0.35 };
}

export type CsvRow = Record<string, string>;
export type CsvError = { row: number; field?: string; message: string };
export type CsvParseResult = { headers: string[]; rows: CsvRow[]; errors: CsvError[] };
const csvHeaders = [
  "externalId", "eventType", "title", "occurredAt", "category", "summary", "location",
  "company", "minister", "sourceType", "sourceName", "sourceUrl",
] as const;
const supportedCsvSourceTypes = new Set(["fixture", "government", "corporate", "social", "market"]);

/** Parses bounded comma-separated input, including quoted delimiters/newlines and escaped quotes. */
export function parseCsv(csv: string, maxBytes = 1_000_000, maxRows = 1_000): CsvParseResult {
  const errors: CsvError[] = [];
  if (new TextEncoder().encode(csv).byteLength > maxBytes) {
    return { headers: [], rows: [], errors: [{ row: 0, message: `CSV exceeds ${maxBytes} byte limit` }] };
  }

  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index++;
      row.push(cell.trim());
      if (row.some(Boolean)) records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) errors.push({ row: records.length + 1, message: "Unclosed quoted field" });
  else if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) records.push(row);
  }
  if (!records.length) return { headers: [], rows: [], errors: [...errors, { row: 1, message: "CSV is empty" }] };
  if (records.length - 1 > maxRows) {
    return { headers: [], rows: [], errors: [{ row: 0, message: `CSV exceeds ${maxRows} data-row limit` }] };
  }

  const headers = records[0].map(value => value.trim());
  const unknownHeaders = headers.filter(header => !(csvHeaders as readonly string[]).includes(header));
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
    errors.push({ row: 1, message: "Headers must be non-empty and unique" });
  }
  if (unknownHeaders.length) errors.push({ row: 1, message: `Unsupported headers: ${unknownHeaders.join(", ")}` });

  const rows: CsvRow[] = [];
  records.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      errors.push({ row: rowNumber, message: `Expected ${headers.length} columns, got ${values.length}` });
      return;
    }
    const item = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])) as CsvRow;
    if (item.externalId && item.externalId.length > 255) errors.push({ row: rowNumber, field: "externalId", message: "externalId exceeds 255 characters" });
    if (!item.title) errors.push({ row: rowNumber, field: "title", message: "title is required" });
    if (item.title && item.title.length > 512) errors.push({ row: rowNumber, field: "title", message: "title exceeds 512 characters" });
    const date = new Date(item.occurredAt);
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(item.occurredAt) || Number.isNaN(date.getTime())) {
      errors.push({ row: rowNumber, field: "occurredAt", message: "occurredAt must be an ISO date or timestamp" });
    }
    if (item.sourceType && !supportedCsvSourceTypes.has(item.sourceType)) {
      errors.push({ row: rowNumber, field: "sourceType", message: "sourceType must be fixture, government, corporate, social, or market" });
    }
    if (item.sourceUrl && !normalizeUrl(item.sourceUrl)) {
      errors.push({ row: rowNumber, field: "sourceUrl", message: "sourceUrl must be an http(s) URL without embedded credentials" });
    }
    if (item.sourceName && item.sourceName.length > 255) {
      errors.push({ row: rowNumber, field: "sourceName", message: "sourceName exceeds 255 characters" });
    }
    rows.push(item);
  });
  return { headers, rows, errors };
}

export type MarketPoint = { observedAt: Date; close: number; isSynthetic?: boolean };
/** Offsets are exchange-session indices; the event session is the first observed session on or after the event date. */
export function calculateEventStudy(
  eventDate: Date,
  observations: MarketPoint[],
  windows = [-1, 0, 1, 3, 7, 30],
): { available: boolean; synthetic: boolean; eventSession: Date | null; windows: Array<{ offset: number; change: number | null }> } {
  const sorted = [...observations]
    .filter(point => Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const eventDay = eventDate.toISOString().slice(0, 10);
  const eventIndex = sorted.findIndex(point => point.observedAt.toISOString().slice(0, 10) >= eventDay);
  const base = eventIndex >= 0 ? sorted[eventIndex]?.close : undefined;
  const result = windows.map(offset => {
    const close = eventIndex >= 0 ? sorted[eventIndex + offset]?.close : undefined;
    return { offset, change: base !== undefined && close !== undefined ? close / base - 1 : null };
  });
  return {
    available: base !== undefined && result.every(point => point.change !== null),
    synthetic: observations.length === 0 || observations.some(point => point.isSynthetic ?? true),
    eventSession: eventIndex >= 0 ? sorted[eventIndex].observedAt : null,
    windows: result,
  };
}

export type SourceDocument = {
  externalId?: string | null;
  url?: string | null;
  title: string;
  text?: string | null;
  publishedAt?: Date | null;
  retrievedAt?: Date;
};
export interface SourceAdapter {
  readonly key: string;
  readonly configured: boolean;
  fetch(input?: { cursor?: string; since?: Date; limit?: number }): Promise<{ documents: SourceDocument[]; nextCursor?: string | null }>;
}

export type IntelligenceOverview = {
  stats: { events: number; verifiedEvents: number; companies: number; listedCompanies: number };
  recentEvents: EventSummary[];
  sectors: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  recentlyMentionedCompanies: CompanySummary[];
  timeline: EventSummary[];
  sourceHealth: { configuredSources: number; lastSuccessfulAt: Date | null; awaitingVerification: number; failures: number };
};

export type VerificationStatus = "unverified" | "machine_matched" | "source_verified" | "independently_corroborated" | "rejected" | string;

export interface CompanySummary {
  id: number | string;
  name: string;
  sector?: string | null;
  industry?: string | null;
  listed?: boolean;
  isSynthetic?: boolean;
  nseSymbol?: string | null;
  bseCode?: string | null;
  isin?: string | null;
  relationshipLabel?: string | null;
}

export interface MinisterSummary {
  id: number | string;
  name: string;
  position?: string | null;
  ministry?: string | null;
  isSynthetic?: boolean;
}

export interface EventSummary {
  id: number | string;
  title: string;
  eventType?: string | null;
  eventDate?: string | Date | null;
  publicationDate?: string | Date | null;
  category?: string | null;
  summary?: string | null;
  location?: string | null;
  verificationStatus?: VerificationStatus;
  isSynthetic?: boolean;
  companies?: CompanySummary[];
  minister?: MinisterSummary | null;
  sourceCount?: number;
  sector?: string | null;
  sourceType?: string | null;
}

export interface OverviewData {
  stats: { events: number; verifiedEvents: number; companies: number; listedCompanies: number };
  recentEvents: EventSummary[];
  sectors: { name: string; count: number }[];
  categories: { name: string; count: number }[];
  recentlyMentionedCompanies: CompanySummary[];
  timeline: EventSummary[];
  sourceHealth: { configuredSources: number; lastSuccessfulAt?: string | null; awaitingVerification: number; failures: number };
}

export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

export function asDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateLabel(value?: string | Date | null, options?: Intl.DateTimeFormatOptions) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date) : "Date unavailable";
}

export function statusLabel(value?: VerificationStatus) {
  const labels: Record<string, string> = {
    unverified: "Unverified",
    machine_matched: "Machine-matched",
    source_verified: "Source-verified",
    independently_corroborated: "Corroborated",
    rejected: "Rejected",
  };
  return labels[value ?? "unverified"] ?? "Unverified";
}

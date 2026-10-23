import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowUpRight, CalendarDays, ChevronRight, CircleAlert, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { dateLabel, statusLabel, type EventSummary } from "@/lib/domain";

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}

export function MetricCard({ label, value, note, icon: Icon, accent = false }: { label: string; value: number | string; note: string; icon: React.ComponentType<{ size?: number }>; accent?: boolean }) {
  return <div className={`metric-card ${accent ? "metric-accent" : ""}`}><div className="metric-top"><span>{label}</span><Icon size={16} /></div><strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong><small>{note}</small></div>;
}

export function VerificationPill({ status, synthetic = false }: { status?: string; synthetic?: boolean }) {
  const key = status ?? "unverified";
  return <span className={`verification-pill status-${key}`}><i />{synthetic ? "Synthetic demo" : statusLabel(key)}</span>;
}

export function SyntheticFlag({ children = "SYNTHETIC" }: { children?: ReactNode }) {
  return <span className="synthetic-flag"><i />{children}</span>;
}

export function LoadingState({ label = "Loading research records" }: { label?: string }) {
  return <div className="state-card"><span className="loading-ring" /><div><strong>{label}</strong><p>Retrieving the latest available records.</p></div></div>;
}

export function ErrorState({ title = "Records could not be loaded", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return <div className="state-card state-error"><CircleAlert size={18} /><div><strong>{title}</strong><p>{message || "Check the connection and try again."}</p>{onRetry && <button className="subtle-button" onClick={onRetry}>Retry</button>}</div></div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><div className="empty-icon"><FileText size={18} /></div><strong>{title}</strong><p>{message}</p></div>;
}

export function EventRow({ event, compact = false }: { event: EventSummary; compact?: boolean }) {
  const isPibPressRelease = event.eventType === "pib_press_release";
  return <Link href={`/events/${event.id}`} className={`event-row ${compact ? "event-row-compact" : ""}`}>
    <div className="event-date"><CalendarDays size={13} /><span title={isPibPressRelease ? "RSS publication timestamp, not a verified underlying event date" : "Event date"}>{isPibPressRelease ? "Pub " : ""}{dateLabel(event.eventDate, { day: "2-digit", month: "short" })}</span></div>
    <div className="event-main"><div className="event-row-title">{event.title}</div><div className="event-row-meta"><span>{event.category || "Uncategorized"}</span>{event.location && <><b>·</b><span>{event.location}</span></>}{event.minister?.name && <><b>·</b><span>{event.minister.name}</span></>}</div></div>
    <div className="event-row-right"><VerificationPill status={event.verificationStatus} synthetic={event.isSynthetic} />{!compact && <span className="event-sources"><ShieldCheck size={12} />{event.isSynthetic ? "Fixture" : `${event.sourceCount ?? 0} sources`}</span>}<ChevronRight size={15} className="row-chevron" /></div>
  </Link>;
}

export function CompanyChip({ name, href }: { name: string; href?: string }) {
  return href ? <Link href={href} className="company-chip">{name}<ArrowUpRight size={11} /></Link> : <span className="company-chip">{name}</span>;
}

function getPibSnapshot(provenance?: string | null): Record<string, unknown> | null {
  if (!provenance) return null;
  try {
    const value = JSON.parse(provenance) as Record<string, unknown>;
    return value.kind === "pib-rss-item-snapshot" ? value : null;
  } catch {
    return null;
  }
}

export function SourceEvidence({ title, sourceType, url, provenance, isSynthetic, status }: { title: string; sourceType?: string | null; url?: string | null; provenance?: string | null; isSynthetic?: boolean; status?: string }) {
  const snapshot = getPibSnapshot(provenance);
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : null;
  const statusText = isSynthetic
    ? safeUrl ? "Synthetic import · URL supplied by user, not verified" : "Synthetic fixture · no external source asserted"
    : `${sourceType || "Source"} · ${statusLabel(status)}`;
  const summary = typeof snapshot?.summary === "string" ? snapshot.summary : "";
  const publishedAt = typeof snapshot?.originalPublishedAt === "string" ? snapshot.originalPublishedAt : "";
  const retrievedAt = typeof snapshot?.retrievedAt === "string" ? snapshot.retrievedAt : "";
  return <div className="evidence-card"><div className="evidence-icon"><FileText size={15} /></div><div className="evidence-copy"><strong>{title}</strong><span>{statusText}</span>{snapshot ? <>
    {publishedAt && <span className="evidence-metadata">RSS publication time (as supplied): {publishedAt}</span>}
    {retrievedAt && <span className="evidence-metadata">Retrieved: {retrievedAt}</span>}
    {summary && <details className="evidence-detail-text"><summary>Feed summary/content ({summary.length.toLocaleString("en-IN")} characters)</summary><p>{summary}</p></details>}
    <span className="evidence-metadata">Fetched source material · not independently verified · no relationship inferred</span>
  </> : provenance && <span>{provenance}</span>}</div>{safeUrl ? <a className="evidence-link" href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label="Open source evidence"><ExternalLink size={14} /></a> : <span className="evidence-unavailable">No link</span>}</div>;
}

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="section-link">{children}<ArrowUpRight size={13} /></Link>;
}

import { ArrowLeft, CalendarDays, MapPin, ShieldCheck, Tag } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { dateLabel } from "@/lib/domain";
import { ErrorState, LoadingState, PageHeading, Panel, SourceEvidence, SyntheticFlag, VerificationPill } from "@/components/ResearchUI";

type LinkedCompany = {
  id: number | string;
  name: string;
  sector?: string | null;
  role?: string;
  evidence?: string;
  verificationStatus?: string;
  isSynthetic?: boolean;
};
type LinkedOfficial = {
  id: number | string;
  name: string;
  ministry?: string | null;
  position?: string | null;
  role?: string;
  evidence?: string;
  verificationStatus?: string;
  isSynthetic?: boolean;
};
interface EventDetailData {
  event: {
    id: number | string;
    title: string;
    eventDate?: string | Date | null;
    category?: string | null;
    summary?: string | null;
    location?: string | null;
    verificationStatus?: string;
    isSynthetic?: boolean;
    sourceType?: string | null;
  };
  companies?: LinkedCompany[];
  officials?: LinkedOfficial[];
  sources?: {
    sourceId: number | string;
    sourceName: string;
    sourceType?: string | null;
    documentId?: number | string | null;
    url?: string | null;
    provenance?: string | null;
    isSynthetic?: boolean;
  }[];
}

export default function EventDetail() {
  const [, params] = useRoute("/events/:eventId");
  const id = Number(params?.eventId);
  const query = trpc.intelligence.events.byId.useQuery({ id }, { enabled: Number.isFinite(id) });
  const data = query.data as unknown as EventDetailData | undefined;

  if (query.isLoading) return <LoadingState />;
  if (query.error || !data?.event) {
    return <div className="page-stack"><Link href="/events" className="back-link"><ArrowLeft size={14} />Back to events</Link><ErrorState title="Event detail unavailable" message={query.error?.message || "This record may not exist."} onRetry={() => query.refetch()} /></div>;
  }

  const event = data.event;
  const linkedCompanies = data.companies ?? [];
  const linkedOfficials = data.officials ?? [];
  const edgeEvidence = [
    ...linkedCompanies.map(company => ({
      id: `company-${company.id}`,
      subject: event.title,
      type: company.role || "mentions organization",
      object: company.name,
      evidence: company.evidence,
      status: company.verificationStatus,
      synthetic: company.isSynthetic,
    })),
    ...linkedOfficials.map(official => ({
      id: `official-${official.id}`,
      subject: event.title,
      type: official.role || "mentions public official",
      object: official.name,
      evidence: official.evidence,
      status: official.verificationStatus,
      synthetic: official.isSynthetic,
    })),
  ];

  return <div className="page-stack">
    <Link href="/events" className="back-link"><ArrowLeft size={14} />Events explorer</Link>
    <PageHeading eyebrow={`EVENT RECORD / ${String(event.id).padStart(5, "0")}`} title={event.title} description={event.summary || "No event summary is available for this record."} actions={<VerificationPill status={event.verificationStatus} synthetic={event.isSynthetic} />} />
    {event.isSynthetic && <div className="notice notice-amber"><SyntheticFlag /><span>This is a fictional demonstration event. It does not assert that a real-world event occurred.</span></div>}
    <div className="detail-grid">
      <div className="detail-main">
        <Panel title="Record overview" eyebrow="DOCUMENTED FIELDS">
          <div className="fact-grid">
            <div><span><CalendarDays size={13} />Event date</span><strong>{dateLabel(event.eventDate)}</strong></div>
            <div><span><CalendarDays size={13} />Publication date</span><strong>Not available</strong></div>
            <div><span><Tag size={13} />Category</span><strong>{event.category || "Unavailable"}</strong></div>
            <div><span><MapPin size={13} />Location</span><strong>{event.location || "Not documented"}</strong></div>
            <div><span><ShieldCheck size={13} />Evidence status</span><strong>{event.isSynthetic ? "Synthetic fixture" : event.verificationStatus || "Unverified"}</strong></div>
            <div><span>Source type</span><strong>{event.sourceType || "Not configured"}</strong></div>
          </div>
        </Panel>
        <Panel title="Organizations & officials" eyebrow="LINKED ENTITIES">
          {(linkedCompanies.length || linkedOfficials.length) ? <>
            <div className="linked-entity-wrap">
              {linkedOfficials.map(official => <Link key={`minister-${official.id}`} className="linked-entity-card" href={`/ministers/${official.id}`}>
                <span className="entity-type">{official.role || "PUBLIC OFFICIAL MENTION"}</span>
                <strong>{official.name}</strong>
                <small>{official.ministry || official.position || "Position unavailable"}</small>
                {official.isSynthetic && <SyntheticFlag>FIXTURE EDGE</SyntheticFlag>}
              </Link>)}
              {linkedCompanies.map(company => <Link key={`company-${company.id}`} className="linked-entity-card" href={`/companies/${company.id}`}>
                <span className="entity-type">{company.role || "ORGANIZATION MENTION"}</span>
                <strong>{company.name}</strong>
                <small>{company.sector || "Sector unavailable"}</small>
                {company.isSynthetic && <SyntheticFlag>FIXTURE EDGE</SyntheticFlag>}
              </Link>)}
            </div>
            <div className="guardrail-note"><ShieldCheck size={14} />A public event mention or appearance is not evidence of a personal/financial relationship or company benefit.</div>
          </> : <div className="inline-unavailable">No supported entity links are stored for this event.</div>}
        </Panel>
        <Panel title="Event-to-entity evidence" eyebrow="EDGE-SPECIFIC PROVENANCE">
          {edgeEvidence.length ? <div className="relationship-evidence-list">{edgeEvidence.map(edge => <div className="relationship-evidence" key={edge.id}>
            <div><strong>{edge.subject} <span>→ {edge.type} →</span> {edge.object}</strong><p>{edge.evidence || "No edge-specific evidence text stored."}</p></div>
            <VerificationPill status={edge.status} synthetic={edge.synthetic || event.isSynthetic} />
          </div>)}</div> : <div className="inline-unavailable">No event-to-entity edges are stored.</div>}
        </Panel>
      </div>
      <aside className="detail-rail">
        <Panel title="Supporting sources" eyebrow="EVIDENCE REGISTER">
          {data.sources?.length ? <div className="evidence-list">{data.sources.map(source => <SourceEvidence key={`${source.sourceId}-${source.documentId ?? "none"}`} title={source.sourceName} sourceType={source.sourceType} url={source.url} provenance={source.provenance} isSynthetic={source.isSynthetic || event.isSynthetic} />)}</div> : <SourceEvidence title="No source record attached" sourceType="Unavailable" isSynthetic={event.isSynthetic ?? true} />}
        </Panel>
        <div className="rail-note"><strong>Evidence principle</strong><p>Each extracted relationship should be supported independently. A model-generated match is not proof.</p></div>
        <Panel title="Market context" eyebrow="NO CAUSAL INFERENCE"><div className="market-caution"><span className="caution-icon">!</span><p>Temporal proximity alone does not establish that an event caused a price movement or benefited a company.</p><Link href="/market">Review methodology →</Link></div></Panel>
      </aside>
    </div>
  </div>;
}

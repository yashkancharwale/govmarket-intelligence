import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, EventRow, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

interface MinisterProfileData { minister: { id: number | string; name: string; position?: string | null; ministry?: string | null; isSynthetic?: boolean }; events: any[]; companies: any[]; sources?: any[]; posts?: any[] }
export default function MinisterDetail() {
  const [, params] = useRoute("/ministers/:ministerId");
  const id = Number(params?.ministerId);
  const query = trpc.intelligence.ministers.byId.useQuery({ id }, { enabled: Number.isFinite(id) });
  const data = query.data as unknown as MinisterProfileData | undefined;
  if (query.isLoading) return <LoadingState />;
  if (query.error || !data?.minister) return <div className="page-stack"><Link href="/ministers" className="back-link"><ArrowLeft size={14} />Ministers</Link><ErrorState title="Profile unavailable" message={query.error?.message} onRetry={() => query.refetch()} /></div>;
  const person = data.minister;
  return <div className="page-stack"><Link href="/ministers" className="back-link"><ArrowLeft size={14} />Ministers</Link>
    <div className="official-hero"><span className="official-seal"><Landmark size={26} /></span><div><div className="eyebrow">PUBLIC OFFICIAL PROFILE</div><h1>{person.name}</h1><p>{person.position || "Position unavailable"} · {person.ministry || "Ministry unavailable"}</p></div><span className="profile-status">{person.isSynthetic ? <SyntheticFlag>FICTIONAL DEMO</SyntheticFlag> : <span><ShieldCheck size={13} />Public record</span>}</span></div>
    {person.isSynthetic && <div className="notice notice-amber">This is a fictional demonstration profile, not a real minister or public official.</div>}
    <section className="overview-grid"><Panel title="Documented activity" eyebrow="EVENT RECORDS">{data.events?.length ? <div className="event-list">{data.events.map(event => <EventRow event={event} key={event.id} />)}</div> : <EmptyState title="No linked events" message="No event records are linked to this profile." />}</Panel><Panel title="Associated companies & sectors" eyebrow="SUPPORTED LINKS">{data.companies?.length ? <div className="linked-entity-list">{data.companies.map((company, index) => <Link className="mini-entity-row" key={company.id ?? index} href={`/companies/${company.id}`}><span className="entity-index">0{index + 1}</span><span className="entity-name"><strong>{company.name}</strong><small>{company.relationshipType || "Documented event association"}</small></span><span className="entity-tag">{company.isSynthetic ? "SYNTHETIC" : company.sector || "COMPANY"}</span></Link>)}</div> : <EmptyState title="No supported company links" message="Attendance or appearance alone does not establish personal or financial relationships." />}</Panel></section>
    <div className="guardrail-note"><ShieldCheck size={14} />Only public, source-backed activity belongs here. This page does not track personal location, travel, residence or inferred whereabouts.</div>
  </div>;
}

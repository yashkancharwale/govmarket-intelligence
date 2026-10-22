import { Activity, ArrowDownRight, ArrowRight, Building2, CheckCircle2, Clock3, FileSearch, Landmark, Layers3, Radio, ShieldCheck, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import type { OverviewData } from "@/lib/domain";
import { dateLabel } from "@/lib/domain";
import { EmptyState, ErrorState, EventRow, LoadingState, MetricCard, PageHeading, Panel, SectionLink, SyntheticFlag } from "@/components/ResearchUI";

const colors = ["#63d7c2", "#87b2ff", "#e5bb76", "#b8a2f4", "#d9878c", "#8ac58e"];

export default function Overview() {
  const query = trpc.intelligence.overview.useQuery();
  const data = query.data as unknown as OverviewData | undefined;
  const stats = data?.stats;
  const chartData = (data?.timeline ?? []).slice().reverse().map((event, index) => ({ day: dateLabel(event.eventDate, { day: "2-digit", month: "short" }), records: index + 1 }));
  return <div className="page-stack">
    <PageHeading eyebrow="INTELLIGENCE DESK / OVERVIEW" title="Public activity. Documented connections." description="A source-traceable view of government and corporate developments across India." actions={<Link className="button-primary" href="/events"><FileSearch size={15} />Explore events<ArrowRight size={14} /></Link>} />
    <div className="overview-kicker"><SyntheticFlag>DEMO ENVIRONMENT</SyntheticFlag><span>All sample entities and events are fictional.</span><span className="kicker-divider" /><span><Clock3 size={13} />As of {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
    {query.isLoading ? <LoadingState label="Loading overview metrics" /> : query.error ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : <>
      <section className="metrics-grid" aria-label="Database overview metrics">
        <MetricCard label="Events collected" value={stats?.events ?? 0} note="Records in this workspace" icon={FileSearch} accent />
        <MetricCard label="Source-verified" value={stats?.verifiedEvents ?? 0} note="Evidence status from database" icon={ShieldCheck} />
        <MetricCard label="Companies represented" value={stats?.companies ?? 0} note="Canonical company records" icon={Building2} />
        <MetricCard label="Listed-linked entities" value={stats?.listedCompanies ?? 0} note="Identifiers require verification" icon={TrendingUp} />
      </section>
      <section className="overview-grid">
        <Panel title="Activity timeline" eyebrow="RECENT RECORDS" action={<SectionLink href="/events">Open explorer</SectionLink>} className="timeline-panel">
          {chartData.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}><defs><linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63d7c2" stopOpacity={0.3} /><stop offset="100%" stopColor="#63d7c2" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#243238" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="day" tick={{ fill: "#71848b", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#71848b", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#101a1e", border: "1px solid #2a3a3e", borderRadius: 8, color: "#dce8e8", fontSize: 12 }} /><Area type="monotone" dataKey="records" stroke="#63d7c2" strokeWidth={2} fill="url(#timelineGradient)" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No timeline records" message="Records will appear here when they are available in the database." />}
          <div className="timeline-caption"><span><i className="legend-dot teal" />Events in the selected workspace</span><span>{(data?.timeline ?? []).length} records</span></div>
        </Panel>
        <Panel title="Source coverage" eyebrow="INGESTION STATUS" action={<Link className="icon-inline" href="/system"><ArrowRight size={15} /></Link>} className="source-panel">
          <div className="source-coverage-head"><div className="coverage-icon"><Radio size={17} /></div><div><strong>{data?.sourceHealth?.configuredSources ?? 0} sources configured</strong><span>No live collection is claimed</span></div></div>
          <div className="source-row"><span><i className="source-indicator off" />Government feeds</span><b>Not configured</b></div>
          <div className="source-row"><span><i className="source-indicator off" />Corporate disclosures</span><b>Not configured</b></div>
          <div className="source-row"><span><i className="source-indicator off" />Licensed market data</span><b>Not configured</b></div>
          <div className="source-foot"><span>Awaiting review</span><strong>{data?.sourceHealth?.awaitingVerification ?? 0}</strong><span className="source-foot-sep" /><span>Import failures</span><strong>{data?.sourceHealth?.failures ?? 0}</strong></div>
        </Panel>
      </section>
      <section className="overview-grid overview-grid-bottom">
        <Panel title="Recent developments" eyebrow="EVENT FEED" action={<SectionLink href="/events">View all</SectionLink>}>
          {data?.recentEvents?.length ? <div className="event-list">{data.recentEvents.slice(0, 6).map(event => <EventRow key={event.id} event={event} />)}</div> : <EmptyState title="No events yet" message="Use the CSV import workflow or add a permitted source after configuration." />}
        </Panel>
        <Panel title="Sector distribution" eyebrow="DATABASE RECORDS" action={<Layers3 size={15} className="muted-icon" />}>
          {data?.sectors?.length ? <div className="sector-bars">{data.sectors.slice(0, 6).map((sector, index) => { const max = Math.max(...data.sectors.map(s => s.count), 1); return <div className="sector-bar-row" key={sector.name}><div className="sector-meta"><span>{sector.name}</span><b>{sector.count}</b></div><div className="sector-track"><i style={{ width: `${Math.max(7, sector.count / max * 100)}%`, background: colors[index % colors.length] }} /></div></div>; })}</div> : <EmptyState title="No sector data" message="Sector trends will appear after records are loaded." />}
          <div className="insight-note"><ArrowDownRight size={14} /><span>Counts describe recorded activity; they do not imply market impact.</span></div>
        </Panel>
      </section>
      <section className="overview-grid overview-grid-bottom">
        <Panel title="Recently mentioned companies" eyebrow="ENTITY MATCHES" action={<SectionLink href="/companies">Company directory</SectionLink>}>
          {data?.recentlyMentionedCompanies?.length ? <div className="mini-entity-list">{data.recentlyMentionedCompanies.slice(0, 5).map((company, index) => <Link className="mini-entity-row" key={company.id} href={`/companies/${company.id}`}><span className="entity-index">0{index + 1}</span><span className="entity-name"><strong>{company.name}</strong><small>{company.sector || company.industry || "Sector unavailable"}</small></span><span className="entity-tag">{company.isSynthetic ? "SYNTHETIC" : company.listed ? "LISTED" : "UNLISTED"}</span><ArrowRight size={14} /></Link>)}</div> : <EmptyState title="No linked companies" message="Company matches are shown only when a relationship is stored." />}
        </Panel>
        <Panel title="Research guardrails" eyebrow="INTERPRET WITH CARE">
          <div className="guardrail-list"><div><ShieldCheck size={15} /><span><strong>Provenance</strong><small>Every relationship should retain its supporting evidence.</small></span></div><div><Activity size={15} /><span><strong>No causal claims</strong><small>Historical price moves are not proof of event impact.</small></span></div><div><Landmark size={15} /><span><strong>Public records only</strong><small>No private whereabouts or unsupported personal links.</small></span></div></div>
        </Panel>
      </section>
    </>}
  </div>;
}

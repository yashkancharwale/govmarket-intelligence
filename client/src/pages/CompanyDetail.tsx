import { useState } from "react";
import { ArrowLeft, BookmarkPlus, Building2, Fingerprint, ShieldCheck, TrendingUp } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { EmptyState, ErrorState, EventRow, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

interface CompanyDetailData {
  company: { id: number | string; name: string; sector?: string | null; industry?: string | null; cin?: string | null; listed?: boolean; isSynthetic?: boolean; description?: string | null };
  events: any[];
  relationships: Array<{ id: number; fromName?: string; toName?: string; relationshipType: string; evidence: string; verificationStatus: string; isSynthetic: boolean }>;
  people: Array<{ id: number; roleType: string; personName: string; evidence: string; verificationStatus: string; isSynthetic: boolean }>;
  securities: Array<{ securityName: string; nseSymbol?: string | null; bseCode?: string | null; isin?: string | null; exchange?: string | null; ticker?: string | null; isSynthetic: boolean }>;
  aliases: string[];
}

export default function CompanyDetail() {
  const [, params] = useRoute("/companies/:companyId");
  const id = Number(params?.companyId);
  const query = trpc.intelligence.companies.byId.useQuery({ id }, { enabled: Number.isFinite(id) });
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const [notice, setNotice] = useState("");
  const data = query.data as unknown as CompanyDetailData | undefined;
  const addToWatchlist = trpc.intelligence.account.watchlists.addCompany.useMutation({
    onSuccess: result => setNotice(result.alreadySaved ? "Already in your watchlist." : "Added to your watchlist."),
    onError: error => setNotice(error.message),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.error || !data?.company) return <div className="page-stack"><Link href="/companies" className="back-link"><ArrowLeft size={14} />Companies</Link><ErrorState title="Company record unavailable" message={query.error?.message} onRetry={() => query.refetch()} /></div>;

  const company = data.company;
  const nseSecurity = data.securities.find(security => security.nseSymbol || (security.exchange === "NSE" && security.ticker));
  const bseSecurity = data.securities.find(security => security.bseCode || (security.exchange === "BSE" && security.ticker));
  const isinSecurity = data.securities.find(security => security.isin);

  return <div className="page-stack">
    <Link href="/companies" className="back-link"><ArrowLeft size={14} />Company directory</Link>
    <div className="company-hero">
      <span className="company-hero-icon"><Building2 size={24} /></span>
      <div><div className="eyebrow">COMPANY INTELLIGENCE</div><h1>{company.name}</h1><p>{company.sector || "Sector unavailable"}{company.industry ? ` · ${company.industry}` : ""}</p></div>
      <div className="company-hero-tags">
        {company.isSynthetic && <SyntheticFlag>FICTIONAL DEMO</SyntheticFlag>}
        <span className="table-tag">{company.isSynthetic ? "No real issuer" : company.listed ? "Listed" : "Listing unavailable"}</span>
        {auth.data ? <button className="button-outline" disabled={addToWatchlist.isPending} onClick={() => addToWatchlist.mutate({ organizationId: Number(company.id) })}><BookmarkPlus size={14} />{addToWatchlist.isPending ? "Saving…" : "Add to watchlist"}</button> : <button className="button-outline" onClick={() => startLogin()}><BookmarkPlus size={14} />Sign in to watchlist</button>}
        {notice && <span className="toolbar-note" role="status">{notice}</span>}
      </div>
    </div>
    {company.isSynthetic && <div className="notice notice-amber">This company is a fictional fixture. No real-world corporate identity, identifier, relationship or disclosure is asserted.</div>}
    <section className="overview-grid">
      <Panel title="Identifiers & classification" eyebrow="MASTER DATA">
        <div className="fact-grid">
          <div><span><Fingerprint size={13} />CIN</span><strong>{company.isSynthetic ? "Synthetic — not a CIN" : company.cin || "Not verified"}</strong></div>
          <div><span>NSE symbol</span><strong>{company.isSynthetic ? "Synthetic only" : nseSecurity?.nseSymbol || nseSecurity?.ticker || "Unavailable"}</strong></div>
          <div><span>BSE code</span><strong>{company.isSynthetic ? "Synthetic only" : bseSecurity?.bseCode || bseSecurity?.ticker || "Unavailable"}</strong></div>
          <div><span>ISIN</span><strong>{company.isSynthetic ? "Synthetic only" : isinSecurity?.isin || "Unavailable"}</strong></div>
        </div>
        <div className="identifier-note"><ShieldCheck size={14} />No security identifier is inferred. Verification source is required before display.</div>
        {data.aliases.length > 0 && <div className="identifier-note">Known aliases: {data.aliases.join(", ")}</div>}
      </Panel>
      <Panel title="Historical market coverage" eyebrow="LICENSED DATA ONLY"><div className="market-caution"><span className="caution-icon"><TrendingUp size={13} /></span><p>No permitted market-data provider is configured for this workspace. Historical prices and returns are unavailable.</p></div><Link href="/market" className="section-link">Market methodology<TrendingUp size={13} /></Link></Panel>
    </section>
    <section className="overview-grid">
      <Panel title="Government-related events" eyebrow="DOCUMENTED ACTIVITY">{data.events.length ? <div className="event-list">{data.events.map(event => <EventRow event={event} key={event.id} />)}</div> : <EmptyState title="No event links" message="No documented events are currently connected to this company." />}</Panel>
      <Panel title="Founder, promoter, and other roles" eyebrow="PERSON ↔ ORGANIZATION">{data.people.length ? <div className="role-list">{data.people.map(relation => <div className="role-row" key={relation.id}><span className="role-type">{relation.roleType}</span><div><strong>{relation.personName}</strong><small>{relation.evidence}</small></div><span className="role-status">{relation.isSynthetic ? "SYNTHETIC" : relation.verificationStatus}</span></div>)}</div> : <EmptyState title="No sourced people links" message="Founder, promoter, director, executive, and shareholder roles remain distinct and unavailable until independently sourced." />}</Panel>
    </section>
    <Panel title="Other organization relationships" eyebrow="TYPED, EVIDENCE-BACKED EDGES">{data.relationships.length ? <div className="role-list">{data.relationships.map(relation => <div className="role-row" key={relation.id}><span className="role-type">{relation.relationshipType}</span><div><strong>{relation.fromName || "Entity unavailable"} → {relation.toName || "Entity unavailable"}</strong><small>{relation.evidence}</small></div><span className="role-status">{relation.isSynthetic ? "SYNTHETIC" : relation.verificationStatus}</span></div>)}</div> : <EmptyState title="No supported company links" message="Subsidiary, startup, corporate-disclosure, and other links appear only when a typed edge has its own evidence." />}</Panel>
  </div>;
}

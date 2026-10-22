import { Building2, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import type { CompanySummary, PageResult } from "@/lib/domain";
import { EmptyState, ErrorState, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

export default function Companies() {
  const [query, setQuery] = useState("");
  const result = trpc.intelligence.companies.list.useQuery({ query: query || undefined, page: 1, pageSize: 50 });
  const data = result.data as unknown as PageResult<CompanySummary> | CompanySummary[] | undefined;
  const items = Array.isArray(data) ? data : data?.items ?? [];
  return <div className="page-stack"><PageHeading eyebrow="RESEARCH / ORGANIZATIONS" title="Company intelligence" description="Canonical organizations, documented event links, and securities only where verified." actions={<SyntheticFlag>DEMO ENTITIES</SyntheticFlag>} />
    <Panel title="Company directory" eyebrow="DATABASE RECORDS" action={<span className="result-count"><Building2 size={13} />{items.length} organizations</span>}>
      <div className="directory-toolbar"><div className="search-field compact-search"><Search size={15} /><input placeholder="Search company, alias, or sector" value={query} onChange={e => setQuery(e.target.value)} /></div><span className="toolbar-note">Identifiers are not inferred from company names.</span></div>
      {result.isLoading ? <LoadingState /> : result.error ? <ErrorState message={result.error.message} onRetry={() => result.refetch()} /> : items.length ? <div className="company-table-wrap"><table className="data-table"><thead><tr><th>Organization</th><th>Sector</th><th>Listing</th><th>NSE / BSE</th><th>Evidence</th><th /></tr></thead><tbody>{items.map(company => <tr key={company.id}><td><Link href={`/companies/${company.id}`} className="company-name-cell"><span className="company-monogram">{company.name.slice(0,1)}</span><span><strong>{company.name}</strong><small>{company.industry || "Industry unavailable"}</small></span></Link></td><td>{company.sector || "Not classified"}</td><td>{company.isSynthetic ? <span className="table-tag tag-amber">Synthetic</span> : company.listed ? <span className="table-tag tag-teal">Listed</span> : <span className="table-tag">Unlisted / unknown</span>}</td><td className="mono-cell">{company.isSynthetic ? "DEMO ONLY" : [company.nseSymbol, company.bseCode].filter(Boolean).join(" · ") || "Unavailable"}</td><td><span className="muted-cell">{company.isSynthetic ? "Fixture record" : "Review record"}</span></td><td><Link className="table-open" href={`/companies/${company.id}`}>View ↗</Link></td></tr>)}</tbody></table></div> : <EmptyState title="No company records" message="Company records appear only when loaded into the database." />}
    </Panel>
    <div className="notice notice-neutral">Founder, promoter, director, executive and shareholder are distinct relationship types. Missing or unverified details remain marked unavailable.</div>
  </div>;
}

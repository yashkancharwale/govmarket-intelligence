import { BookmarkCheck, BookmarkMinus, FileSearch, LockKeyhole, Search, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { EmptyState, ErrorState, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

type SavedFilterSet = Record<string, unknown>;
function parseFilters(value: string): SavedFilterSet {
  try { return JSON.parse(value) as SavedFilterSet; } catch { return {}; }
}
function replayHref(raw: string) {
  const filters = parseFilters(raw);
  const params = new URLSearchParams();
  const mapping: Record<string, string> = { query: "q", category: "category", verificationStatus: "verificationStatus", listed: "listed", sector: "sector", location: "location", ministerId: "ministerId", companyId: "companyId", sourceType: "sourceType", from: "from", to: "to" };
  for (const [key, param] of Object.entries(mapping)) {
    const value = filters[key];
    if (typeof value === "string" && value) params.set(param, value);
    if (typeof value === "boolean") params.set(param, String(value));
  }
  return `/events${params.size ? `?${params.toString()}` : ""}`;
}

export default function SavedResearch() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const watchlists = trpc.intelligence.account.watchlists.list.useQuery(undefined, { enabled: Boolean(auth.data) });
  const searches = trpc.intelligence.account.savedSearches.list.useQuery(undefined, { enabled: Boolean(auth.data) });
  const removeCompany = trpc.intelligence.account.watchlists.removeCompany.useMutation({ onSuccess: () => { void watchlists.refetch(); } });
  const removeSearch = trpc.intelligence.account.savedSearches.remove.useMutation({ onSuccess: () => { void searches.refetch(); } });

  if (auth.isLoading) return <LoadingState label="Checking account session" />;
  if (!auth.data) return <div className="page-stack"><PageHeading eyebrow="WORKSPACE / SAVED RESEARCH" title="Saved research" description="Watchlists and event searches belong to your authenticated account." /><div className="admin-gate"><LockKeyhole size={20} /><div><strong>Sign in to view saved research</strong><p>Anonymous visitors cannot read or change user-owned watchlists or saved searches.</p><button className="button-primary" onClick={() => startLogin()}>Sign in</button></div></div></div>;

  const busy = watchlists.isLoading || searches.isLoading;
  const error = watchlists.error || searches.error;
  return <div className="page-stack">
    <PageHeading eyebrow="WORKSPACE / SAVED RESEARCH" title="Watchlists & saved searches" description="Your account-owned records are isolated from other users." actions={<SyntheticFlag>PRIVATE TO YOUR ACCOUNT</SyntheticFlag>} />
    {busy ? <LoadingState label="Loading your saved research" /> : error ? <ErrorState message={error.message} onRetry={() => { void watchlists.refetch(); void searches.refetch(); }} /> : <>
      <Panel title="Company watchlists" eyebrow="USER-OWNED ENTITIES">
        {watchlists.data?.length ? <div className="saved-research-list">{watchlists.data.map((list: any) => <section className="saved-research-card" key={list.id}>
          <header><div><BookmarkCheck size={16} /><strong>{list.name}</strong></div><span>{list.companies.length} companies</span></header>
          {list.companies.length ? list.companies.map((company: any) => <div className="saved-research-row" key={company.id}><Link href={`/companies/${company.id}`}><span className="company-monogram">{company.name.slice(0, 1)}</span><strong>{company.name}</strong></Link><span className="saved-row-meta">{company.sector || "Sector unavailable"}{company.isSynthetic && <SyntheticFlag>DEMO</SyntheticFlag>}</span><button className="icon-button" title={`Remove ${company.name} from ${list.name}`} aria-label={`Remove ${company.name} from ${list.name}`} disabled={removeCompany.isPending} onClick={() => removeCompany.mutate({ watchlistId: list.id, organizationId: company.id })}><BookmarkMinus size={14} /></button></div>) : <EmptyState title="No companies saved" message="Add a company from its intelligence profile." />}
        </section>)}</div> : <EmptyState title="No watchlists yet" message="Use Add to watchlist on a company profile to start a private list." />}
        <Link href="/companies" className="section-link">Browse company directory →</Link>
      </Panel>
      <Panel title="Saved event searches" eyebrow="REUSABLE FILTERS">
        {searches.data?.length ? <div className="saved-research-list">{searches.data.map((item: any) => <div className="saved-search-card" key={item.id}>
          <div className="saved-search-icon"><FileSearch size={16} /></div><div className="saved-search-copy"><strong>{item.name}</strong><small>{Object.entries(parseFilters(item.queryJson)).filter(([, value]) => value !== undefined && value !== "" && value !== null).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "All events"}</small></div>
          <button className="button-quiet" onClick={() => setLocation(replayHref(item.queryJson))}><Search size={13} />Run search</button><button className="icon-button" title={`Delete saved search ${item.name}`} aria-label={`Delete saved search ${item.name}`} disabled={removeSearch.isPending} onClick={() => removeSearch.mutate({ id: item.id })}><Trash2 size={14} /></button>
        </div>)}</div> : <EmptyState title="No saved searches" message="Save a filter set from the events explorer. Search filters are private to your account." />}
        <Link href="/events" className="section-link">Open events explorer →</Link>
      </Panel>
    </>}
  </div>;
}

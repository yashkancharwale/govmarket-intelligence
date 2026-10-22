import { useMemo, useState, type FormEvent } from "react";
import { Filter, ListFilter, Search, SlidersHorizontal, X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { ErrorState, EventRow, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";
import type { EventSummary, PageResult } from "@/lib/domain";

type EvidenceStatus = "unverified" | "machine_matched" | "source_verified" | "independently_corroborated" | "rejected";

export default function Events() {
  const [, setLocation] = useLocation();
  const initial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [category, setCategory] = useState(initial.get("category") ?? "");
  const [status, setStatus] = useState<EvidenceStatus | "">((initial.get("verificationStatus") as EvidenceStatus | null) ?? "");
  const [listed, setListed] = useState(initial.get("listed") ?? "");
  const [sector, setSector] = useState(initial.get("sector") ?? "");
  const [location, setDocumentedLocation] = useState(initial.get("location") ?? "");
  const [ministerId, setMinisterId] = useState(initial.get("ministerId") ?? "");
  const [companyId, setCompanyId] = useState(initial.get("companyId") ?? "");
  const [sourceType, setSourceType] = useState(initial.get("sourceType") ?? "");
  const [from, setFrom] = useState(initial.get("from") ?? "");
  const [to, setTo] = useState(initial.get("to") ?? "");
  const [page, setPage] = useState(1);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const ministers = trpc.intelligence.ministers.list.useQuery({ page: 1, pageSize: 50 });
  const companies = trpc.intelligence.companies.list.useQuery({ page: 1, pageSize: 50 });
  const saveMutation = trpc.intelligence.account.savedSearches.save.useMutation({
    onSuccess: () => { setSaveNotice("Saved to your account."); setSavedSearchName(""); },
    onError: error => setSaveNotice(error.message),
  });
  const args = {
    query: query.trim() || undefined,
    category: category || undefined,
    verificationStatus: status || undefined,
    listed: listed === "" ? undefined : listed === "true",
    sector: sector.trim() || undefined,
    location: location.trim() || undefined,
    ministerId: ministerId ? Number(ministerId) : undefined,
    companyId: companyId ? Number(companyId) : undefined,
    sourceType: sourceType || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 12,
  };
  const result = trpc.intelligence.events.search.useQuery(args);
  const payload = result.data as unknown as PageResult<EventSummary> | undefined;
  const events = payload?.items ?? [];
  const activeFilters = [category, status, listed, sector, location, ministerId, companyId, sourceType, from, to].filter(Boolean).length;
  const setFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  const buildUrl = () => {
    const params = new URLSearchParams();
    const values: Record<string, string | undefined> = {
      q: query.trim() || undefined, category: category || undefined, verificationStatus: status || undefined,
      listed: listed || undefined, sector: sector.trim() || undefined, location: location.trim() || undefined,
      ministerId: ministerId || undefined, companyId: companyId || undefined, sourceType: sourceType || undefined,
      from: from || undefined, to: to || undefined,
    };
    Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
    return `/events${params.size ? `?${params.toString()}` : ""}`;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setPage(1); setLocation(buildUrl()); };
  const saveCurrentSearch = () => {
    if (!auth.data) { startLogin(); return; }
    if (!savedSearchName.trim()) { setSaveNotice("Enter a name for this saved search."); return; }
    const { page: _page, pageSize: _pageSize, ...filters } = args;
    saveMutation.mutate({ name: savedSearchName.trim(), filters });
  };
  const reset = () => {
    setQuery(""); setCategory(""); setStatus(""); setListed(""); setSector(""); setDocumentedLocation("");
    setMinisterId(""); setCompanyId(""); setSourceType(""); setFrom(""); setTo(""); setPage(1); setLocation("/events");
  };

  return <div className="page-stack">
    <PageHeading eyebrow="RESEARCH / EVENT EXPLORER" title="Events explorer" description="Search documented developments and inspect the evidence attached to each record." actions={<SyntheticFlag>DEMO DATA</SyntheticFlag>} />
    <Panel title="Find a documented development" eyebrow="SEARCH & FILTERS" className="filter-panel">
      <form onSubmit={submit}>
        <div className="event-search-line"><div className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try a company, official, sector, or event phrase" aria-label="Search events" /><button className="button-primary" type="submit">Search</button></div><span className="filter-count"><SlidersHorizontal size={14} />{activeFilters ? `${activeFilters} filters active` : "Refine results"}</span></div>
        <div className="filter-controls">
          <label><span>Category</span><select value={category} onChange={event => setFilter(setCategory)(event.target.value)}><option value="">All categories</option><option value="policy">Policy / schemes</option><option value="procurement">Contracts / procurement</option><option value="partnership">MoUs / partnerships</option><option value="investment">Projects / investment</option><option value="appointment">Appointments</option><option value="other">Other</option></select></label>
          <label><span>Evidence status</span><select value={status} onChange={event => { setStatus(event.target.value as EvidenceStatus | ""); setPage(1); }}><option value="">All statuses</option><option value="unverified">Unverified</option><option value="machine_matched">Machine-matched</option><option value="source_verified">Source-verified</option><option value="independently_corroborated">Independently corroborated</option><option value="rejected">Rejected</option></select></label>
          <label><span>Listed state</span><select value={listed} onChange={event => setFilter(setListed)(event.target.value)}><option value="">Listed & unlisted</option><option value="true">Listed</option><option value="false">Unlisted</option></select></label>
          <label><span>Sector / industry</span><input value={sector} onChange={event => setFilter(setSector)(event.target.value)} placeholder="Any sector" /></label>
          <label><span>Officially documented location</span><input value={location} onChange={event => setFilter(setDocumentedLocation)(event.target.value)} placeholder="State / city" /></label>
          <label><span>Minister / ministry</span><select value={ministerId} onChange={event => setFilter(setMinisterId)(event.target.value)}><option value="">Any official</option>{ministers.data?.items.map(person => <option key={person.id} value={person.id}>{person.name}{person.ministry ? ` · ${person.ministry}` : ""}</option>)}</select></label>
          <label><span>Company</span><select value={companyId} onChange={event => setFilter(setCompanyId)(event.target.value)}><option value="">Any company</option>{companies.data?.items.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label><span>Source type</span><select value={sourceType} onChange={event => setFilter(setSourceType)(event.target.value)}><option value="">Any source type</option><option value="fixture">Synthetic fixture</option><option value="government">Government</option><option value="corporate">Corporate disclosure</option><option value="social">Official social account</option><option value="market">Market data</option></select></label>
          <label><span>From</span><input type="date" value={from} onChange={event => setFilter(setFrom)(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={to} onChange={event => setFilter(setTo)(event.target.value)} /></label>
          <button className="filter-reset" type="button" onClick={reset}><X size={13} />Clear</button>
        </div>
      </form>
      <div className="saved-search-bar">{auth.data ? <><input aria-label="Saved search name" value={savedSearchName} onChange={event => setSavedSearchName(event.target.value)} placeholder="Name these filters" maxLength={128} /><button className="button-quiet" onClick={saveCurrentSearch} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save search"}</button><a href="/saved" className="section-link">Manage saved research →</a></> : <button className="button-quiet" onClick={() => startLogin()}>Sign in to save this search</button>}{saveNotice && <span role="status">{saveNotice}</span>}</div>
    </Panel>
    <Panel title="Matching events" eyebrow="DATABASE RESULTS" action={<span className="result-count"><ListFilter size={13} />{payload?.total ?? 0} records</span>}>
      {result.isLoading ? <LoadingState /> : result.error ? <ErrorState message={result.error.message} onRetry={() => result.refetch()} /> : events.length ? <div className="event-list event-list-large">{events.map(event => <EventRow event={event} key={event.id} />)}</div> : <div className="empty-state"><div className="empty-icon"><Filter size={18} /></div><strong>No matching events</strong><p>Try adjusting the filters or search terms. The workspace currently contains only its configured demonstration records.</p></div>}
      <div className="pagination-row"><span>Page {payload?.page ?? page} of {Math.max(1, Math.ceil((payload?.total ?? 0) / (payload?.pageSize ?? 12)))}</span><div><button className="subtle-button" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button><button className="subtle-button" disabled={page * (payload?.pageSize ?? 12) >= (payload?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</button></div></div>
    </Panel>
    <div className="footnote-line"><span className="status-dot status-amber" />Initial search uses database values, conservative keyword rules, normalized names, and aliases where present. Semantic retrieval is not enabled.</div>
  </div>;
}

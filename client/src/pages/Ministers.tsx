import { Landmark, Search } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { MinisterSummary, PageResult } from "@/lib/domain";
import { EmptyState, ErrorState, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";
import { Link } from "wouter";

export default function Ministers() {
  const [query, setQuery] = useState("");
  const result = trpc.intelligence.ministers.list.useQuery({ query: query || undefined, page: 1, pageSize: 50 });
  const data = result.data as unknown as PageResult<MinisterSummary> | MinisterSummary[] | undefined;
  const items = Array.isArray(data) ? data : data?.items ?? [];
  return <div className="page-stack"><PageHeading eyebrow="RESEARCH / PUBLIC OFFICIALS" title="Ministers & ministries" description="Public roles and supported links to documented records. No private location data is collected." actions={<SyntheticFlag>DEMO PROFILES</SyntheticFlag>} />
    <Panel title="Official profiles" eyebrow="DATABASE RECORDS" action={<span className="result-count"><Landmark size={13} />{items.length} profiles</span>}>
      <div className="directory-toolbar"><div className="search-field compact-search"><Search size={15} /><input placeholder="Search official or ministry" value={query} onChange={e => setQuery(e.target.value)} /></div><span className="toolbar-note">Profiles are not claims about current office holders.</span></div>
      {result.isLoading ? <LoadingState /> : result.error ? <ErrorState message={result.error.message} onRetry={() => result.refetch()} /> : items.length ? <div className="directory-grid">{items.map((person, index) => <Link className="profile-card" href={`/ministers/${person.id}`} key={person.id}><div className="profile-card-top"><span className="profile-monogram">{person.name.slice(0, 1)}</span><span className="entity-index">{String(index + 1).padStart(2, "0")}</span></div><div className="profile-info"><span className="entity-type">PUBLIC OFFICIAL · {person.isSynthetic ? "SYNTHETIC" : "RECORD"}</span><strong>{person.name}</strong><small>{person.position || "Position unavailable"}</small><span className="ministry-line"><Landmark size={12} />{person.ministry || "Ministry unavailable"}</span></div><div className="profile-card-foot"><span>View documented activity</span><span>↗</span></div></Link>)}</div> : <EmptyState title="No official profiles" message="Profiles appear when supported records are present in the database." />}
    </Panel>
  </div>;
}

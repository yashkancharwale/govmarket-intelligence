import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, ArrowUpRight, Bell, BookmarkCheck, Building2, ChevronDown, Command, FileSearch, GitBranch, Landmark, LayoutDashboard, LogIn, LogOut, Menu, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

const nav = [
  { label: "Overview", href: "/", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "Events explorer", href: "/events", icon: FileSearch, group: "RESEARCH" },
  { label: "Ministers", href: "/ministers", icon: Landmark, group: "RESEARCH" },
  { label: "Companies", href: "/companies", icon: Building2, group: "RESEARCH" },
  { label: "Saved research", href: "/saved", icon: BookmarkCheck, group: "RESEARCH" },
  { label: "Relationships", href: "/relationships", icon: GitBranch, group: "ANALYSIS" },
  { label: "Market analysis", href: "/market", icon: TrendingUp, group: "ANALYSIS" },
  { label: "Sources & health", href: "/system", icon: Activity, group: "SYSTEM" },
];

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => auth.refetch() });
  const groups = useMemo(() => [...new Set(nav.map(item => item.group))], []);
  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) window.location.href = `/events?q=${encodeURIComponent(search.trim())}`;
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand-lockup" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark"><span className="brand-mark-line" /><span className="brand-mark-node" /></span>
          <span className="brand-word"><strong>GOVMARKET</strong><small>INTELLIGENCE INDIA</small></span>
        </Link>
        <div className="workspace-switcher">
          <div className="workspace-avatar">IN</div>
          <div className="workspace-label"><strong>India desk</strong><span>Research workspace</span></div>
          <ChevronDown size={14} />
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {groups.map(group => (
            <section className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {nav.filter(item => item.group === group).map(item => {
                const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={1.8} /><span>{item.label}</span>{item.href === "/events" && <span className="nav-count">01</span>}</Link>;
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-status"><span className="status-dot status-amber" /><div><strong>Demo environment</strong><small>Live feeds not connected</small></div></div>
          <div className="sidebar-footnote">Evidence before inference.<br />For research, not trading.</div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
          <form className="command-search" onSubmit={onSearch} role="search">
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search events, companies, ministries…" aria-label="Search intelligence records" />
            <span className="shortcut"><Command size={11} /> K</span>
          </form>
          <div className="topbar-actions">
            <span className="environment-tag"><span className="status-dot status-amber" />SYNTHETIC DATA</span>
            <button className="icon-button" aria-label="Notifications" title="No alerts configured"><Bell size={16} /><i className="notification-dot" /></button>
            <div className="topbar-divider" />
            {auth.data ? <div className="user-menu"><span className="user-avatar">{(auth.data.name || auth.data.email || "R").slice(0, 1).toUpperCase()}</span><span className="user-name">{auth.data.name || "Researcher"}</span><button className="text-icon-button" title="Sign out" onClick={() => logout.mutate()}><LogOut size={15} /></button></div> : <button className="sign-in-button" onClick={() => startLogin()}><LogIn size={15} /> Sign in</button>}
          </div>
        </header>
        <div className="demo-ribbon"><ShieldCheck size={13} /><span>Demonstration workspace — sample records are synthetic and do not describe real ministers, companies, events, securities or prices.</span><a href="/system">Data notes <ArrowUpRight size={12} /></a></div>
        <div className="page-content">{children}</div>
        <footer className="workspace-footer"><span>GOVMARKET INTELLIGENCE INDIA</span><span>Research workflow · Not investment advice</span><span>Sources: not configured</span></footer>
      </main>
    </div>
  );
}

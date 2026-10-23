import { useState, type ChangeEvent } from "react";
import { Activity, CheckCircle2, CircleAlert, Clock3, Database, Download, FileUp, Play, RefreshCw, Rss, ShieldCheck, UploadCloud } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

type SourceRow = { id: number; sourceKey?: string; name: string; sourceType: string; baseUrl?: string | null; adapterKey?: string | null; isSynthetic: boolean; isEnabled: boolean; configured: boolean; notes?: string | null };
type JobRow = { id: number; sourceId: number; status: string; jobType: string; startedAt?: string | Date | null; finishedAt?: string | Date | null; createdAt?: string | Date | null; rowCount: number; duplicateCount: number; importedCount?: number; revisionCount?: number; errorCount: number; retryCount: number; quotaLimited: boolean; errorSummary?: string | null };
interface HealthData { sources: SourceRow[]; jobs: JobRow[]; awaitingVerification: number; latestRecordAt?: string | Date | null; pibWritesEnabled: boolean }
const PIB_SOURCE_KEY = "pib:press-releases:en:india";
const PIB_FEED_URL = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1";
const PIB_DIRECTORY_URL = "https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1";
const dateText = (value?: string | Date | null) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not available";

export default function SystemHealth() {
  const health = trpc.intelligence.system.health.useQuery();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const data = health.data as unknown as HealthData | undefined;
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharedDatabaseConfirmed, setSharedDatabaseConfirmed] = useState(false);
  const [pibAccessConfirmed, setPibAccessConfirmed] = useState(false);
  const importMutation = trpc.intelligence.system.importCsv.useMutation();
  const configurePibMutation = trpc.intelligence.system.configurePibRss.useMutation();
  const runPibMutation = trpc.intelligence.system.runPibRss.useMutation();
  const exportPibMutation = trpc.intelligence.system.exportPibRssCsv.useMutation();
  const isAdmin = auth.data?.role === "admin";
  const configuredCount = data?.sources.filter(source => source.configured).length ?? 0;
  const failureCount = data?.jobs.filter(job => job.status === "failed").reduce((sum, job) => sum + Math.max(job.errorCount, 1), 0) ?? 0;
  const latestSuccessfulJob = data?.jobs.filter(job => job.status === "succeeded").sort((a, b) => new Date(b.finishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.finishedAt ?? a.createdAt ?? 0).getTime())[0];
  const pibSource = data?.sources.find(source => source.sourceKey === PIB_SOURCE_KEY);
  const pibJobs = data?.jobs.filter(job => job.sourceId === pibSource?.id) ?? [];
  const latestPibSuccess = pibJobs.filter(job => job.status === "succeeded").sort((a, b) => new Date(b.finishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.finishedAt ?? a.createdAt ?? 0).getTime())[0];
  const canAdminWrite = Boolean(isAdmin && sharedDatabaseConfirmed && data?.pibWritesEnabled);
  const canRunPib = Boolean(canAdminWrite && pibAccessConfirmed);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { setNotice("Import rejected: file exceeds the 1 MB limit."); event.target.value = ""; return; }
    if (!isAdmin) { setNotice("Administrator access is required to import records."); event.target.value = ""; return; }
    try {
      setBusy(true);
      setNotice("");
      const csvText = await file.text();
      const response = await importMutation.mutateAsync({ csvText, filename: file.name });
      setNotice(`Synthetic / unverified import: ${response.imported} new events, ${response.revisions} preserved document revisions, ${response.skipped} exact duplicates skipped, ${response.errors.length} row errors.`);
      await health.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "CSV import failed.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const onConfigurePib = async () => {
    if (!isAdmin || !sharedDatabaseConfirmed || !data?.pibWritesEnabled) { setNotice("PIB writes are disabled until the server is explicitly configured for the confirmed development database."); return; }
    try {
      setBusy(true);
      setNotice("");
      const response = await configurePibMutation.mutateAsync({ enabled: !pibSource?.isEnabled, confirmDatabaseTarget: true });
      setNotice(response.enabled
        ? "PIB RSS source enabled. No feed items were fetched by configuration; run it manually after confirming this environment."
        : "PIB RSS source disabled. Existing source documents were preserved.");
      await health.refetch();
    } catch (error) {
      setNotice(`PIB source configuration failed: ${error instanceof Error ? error.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const onRunPib = async () => {
    if (!isAdmin || !sharedDatabaseConfirmed || !pibAccessConfirmed || !data?.pibWritesEnabled) { setNotice("Confirm the intended development database, configure the server write flag, and confirm current PIB feed access/robots conditions before ingestion."); return; }
    try {
      setBusy(true);
      setNotice("");
      const result = await runPibMutation.mutateAsync({ limit: 500, confirmDatabaseTarget: true, confirmFeedAccess: true });
      const detail = result.errors?.slice(0, 3).map(error => `${error.itemIndex}: ${error.message}`).join("; ");
      const state = result.status === "succeeded" ? "succeeded" : "FAILED";
      setNotice(`PIB RSS job ${result.jobId} ${state}: ${result.rowCount} feed items observed; ${result.imported} new, ${result.revisions} revised, ${result.duplicateCount} duplicates, ${result.errorCount} errors, ${result.retryCount} retries${result.quotaLimited ? ", rate limit flagged" : ""}. All imported events remain unverified.${detail ? ` Item notes: ${detail}` : ""}`);
      await health.refetch();
    } catch (error) {
      setNotice(`PIB RSS run failed: ${error instanceof Error ? error.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const onExportPib = async () => {
    if (!isAdmin || !sharedDatabaseConfirmed || !data?.pibWritesEnabled) { setNotice("PIB export is disabled until the server is explicitly configured for the confirmed development database."); return; }
    try {
      setBusy(true);
      setNotice("");
      const output = await exportPibMutation.mutateAsync({ confirmDatabaseTarget: true });
      const blobUrl = URL.createObjectURL(new Blob([output.csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = output.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
      setNotice(`Downloaded ${output.filename} (${output.recordCount} PIB document revisions). Server-side copy: ${output.exportPath}.`);
    } catch (error) {
      setNotice(`PIB CSV export failed: ${error instanceof Error ? error.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return <div className="page-stack">
    <PageHeading eyebrow="SYSTEM / DATA PROVENANCE" title="Sources & system health" description="Source configuration and job history are displayed only when represented in stored records." actions={<button className="button-quiet" onClick={() => health.refetch()}><RefreshCw size={14} />Refresh</button>} />
    <div className="notice notice-neutral"><ShieldCheck size={15} /><span>The official PIB feed returned an empty RSS channel during the access check on 2026-10-23; no records were collected then. Fetched items remain unverified even after a successful job.</span></div>
    {notice && <div className={`import-result ${notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("reject") ? "import-result-error" : ""}`} role="status">{notice}</div>}
    {health.isLoading ? <LoadingState label="Checking sources and ingestion jobs" /> : health.error ? <ErrorState message={health.error.message} onRetry={() => health.refetch()} /> : <>
      <section className="metrics-grid health-metrics">
        <div className="coverage-card"><div className="coverage-label"><Database size={15} />CONFIGURED REAL SOURCES</div><strong>{configuredCount}</strong><small>Configured does not mean successfully tested or verified.</small></div>
        <div className="coverage-card"><div className="coverage-label"><Clock3 size={15} />LATEST SUCCESSFUL JOB</div><strong className="health-date">{latestSuccessfulJob ? dateText(latestSuccessfulJob.finishedAt ?? latestSuccessfulJob.createdAt) : "Not available"}</strong><small>Latest retrieved record: {dateText(data?.latestRecordAt)}.</small></div>
        <div className="coverage-card"><div className="coverage-label"><CircleAlert size={15} />PROCESSING FAILURES</div><strong>{failureCount}</strong><small>Aggregated from recorded failed jobs.</small></div>
        <div className="coverage-card"><div className="coverage-label"><ShieldCheck size={15} />AWAITING VERIFICATION</div><strong>{data?.awaitingVerification ?? 0}</strong><small>Unverified or machine-matched event records.</small></div>
      </section>
      <section className="overview-grid">
        <Panel title="Configured source adapters" eyebrow="SOURCE STATUS">{data?.sources.length ? <div className="source-table">{data.sources.map(source => {
          const jobs = data.jobs.filter(job => job.sourceId === source.id);
          const lastSuccess = jobs.filter(job => job.status === "succeeded").sort((a, b) => new Date(b.finishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.finishedAt ?? a.createdAt ?? 0).getTime())[0];
          const processed = jobs.reduce((sum, job) => sum + job.rowCount, 0);
          const duplicates = jobs.reduce((sum, job) => sum + job.duplicateCount, 0);
          const failures = jobs.filter(job => job.status === "failed").reduce((sum, job) => sum + Math.max(job.errorCount, 1), 0);
          const retries = jobs.reduce((sum, job) => sum + job.retryCount, 0);
          const quotaLimited = jobs.some(job => job.quotaLimited);
          return <div className="source-table-row" key={source.id}>
            <div className="source-name"><span className={`source-icon ${source.configured ? "source-icon-on" : ""}`}>{source.isSynthetic ? <SyntheticFlag /> : <Activity size={15} />}</span><div><strong>{source.name}</strong><small>{source.sourceType} · {source.configured ? "configured" : source.isSynthetic ? "synthetic fixture" : "not configured"}</small></div></div>
            <div className="source-stat"><span>Last successful job</span><b>{lastSuccess ? dateText(lastSuccess.finishedAt ?? lastSuccess.createdAt) : "Never"}</b></div>
            <div className="source-stat"><span>Rows / duplicates</span><b>{processed} / {duplicates}</b></div>
            <div className="source-stat"><span>Failures / retries</span><b>{failures} / {retries}</b></div>
            <div className="source-stat"><span>Quota / rate limit</span><b>{quotaLimited ? "Flagged" : "Not reported"}</b></div>
            {source.notes && <div className="source-quota">{source.notes}</div>}
          </div>;
        })}</div> : <EmptyState title="No source records configured" message="Providers remain unconfigured until an authorized operator configures and tests them." />}</Panel>
        <Panel title="CSV record import" eyebrow="ADMIN DATA MANAGEMENT"><p className="panel-description">Imports are idempotent, auditable and always marked synthetic/unverified. Optional source URLs are stored as user-provided and not fetched or independently verified.</p>{isAdmin ? <label className={`upload-zone ${busy ? "upload-busy" : ""}`}><input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} /><span className="upload-icon"><UploadCloud size={20} /></span><strong>{busy ? "Validating and importing…" : "Choose a CSV file"}</strong><small>Maximum 1 MB · admin-only operation</small><span className="button-outline"><FileUp size={14} />Browse CSV</span></label> : <div className="admin-gate"><ShieldCheck size={18} /><div><strong>Administrator access required</strong><p>Sign in with an authorized admin account to import data. Ordinary users cannot run imports.</p></div></div>}</Panel>
        <Panel title="PIB press releases RSS" eyebrow="OFFICIAL SOURCE · ADMIN CONTROL" className="pib-panel">
          <p className="panel-description">Reads only the Press Releases RSS link listed by PIB. It does not crawl article pages, infer entities, or verify claims. A source-name mention does not establish a company-government relationship.</p>
          <a className="pib-feed-link" href={PIB_DIRECTORY_URL} target="_blank" rel="noopener noreferrer"><Rss size={13} />PIB RSS directory<span>·</span><span>{PIB_FEED_URL}</span></a>
          <div className="pib-state-row"><span>Source state</span><strong className={pibSource?.isEnabled ? "pib-enabled" : ""}>{pibSource?.isEnabled ? "Enabled for manual runs" : pibSource ? "Configured but disabled" : "Not configured"}</strong></div>
          <div className="pib-state-row"><span>Last successful PIB job</span><strong>{latestPibSuccess ? dateText(latestPibSuccess.finishedAt ?? latestPibSuccess.createdAt) : "Never"}</strong></div>
          <div className="notice notice-amber pib-warning"><ShieldCheck size={15} /><span>PIB writes remain fail-closed unless the server has GOVMARKET_PIB_WRITE_TARGET=development. Set it only after confirming DATABASE_URL points to the intended development/test database. Preview and published instances may share a database; the last robots.txt response was not usable, so recheck current source access conditions before fetching.</span></div>
          {isAdmin ? <>
            <label className="pib-confirm"><input type="checkbox" checked={sharedDatabaseConfirmed} onChange={event => setSharedDatabaseConfirmed(event.target.checked)} /><span>I confirm the active DATABASE_URL points to the intended development/test database for this action; I understand Preview and published instances may share it.</span></label>
            <label className="pib-confirm"><input type="checkbox" checked={pibAccessConfirmed} onChange={event => setPibAccessConfirmed(event.target.checked)} /><span>I have reviewed current PIB terms and feed access/robots conditions and am authorized to request this documented RSS endpoint.</span></label>
            <div className="pib-actions">
              <button className="button-outline" onClick={onConfigurePib} disabled={!canAdminWrite || busy}>{busy ? "Working…" : pibSource?.isEnabled ? "Disable source" : "Configure / enable"}</button>
              <button className="button-outline" onClick={onRunPib} disabled={!canRunPib || busy || !pibSource?.isEnabled}><Play size={13} />Run now</button>
              <button className="button-quiet" onClick={onExportPib} disabled={!canAdminWrite || busy || !pibSource || pibSource.isSynthetic}><Download size={13} />Export CSV</button>
            </div>
            {!data?.pibWritesEnabled && <small className="pib-footnote">Actions are disabled until the server-only environment flag <code>GOVMARKET_PIB_WRITE_TARGET=development</code> is set after the database target has been confirmed.</small>}
            <small className="pib-footnote">CSV downloads in your browser and is also written to the server’s git-ignored <code>data/export/</code> directory.</small>
          </> : <div className="admin-gate"><ShieldCheck size={18} /><div><strong>Administrator access required</strong><p>PIB configuration, manual runs, and exports are admin-only; source records remain unchanged for ordinary users.</p></div></div>}
        </Panel>
      </section>
      <Panel title="Recent processing jobs" eyebrow="INGESTION HISTORY">{data?.jobs.length ? <div className="job-list">{data.jobs.map(job => {
        const source = data.sources.find(row => row.id === job.sourceId);
        const successful = job.status === "succeeded";
        const rowSummary = typeof job.importedCount === "number" && typeof job.revisionCount === "number"
          ? `${job.rowCount} fetched · ${job.importedCount} new · ${job.revisionCount} revisions · ${job.duplicateCount} duplicates`
          : `${job.rowCount} rows · ${job.duplicateCount} duplicates`;
        return <div className="job-row" key={job.id}><span className={`job-status ${successful ? "job-complete" : "job-other"}`}>{successful ? <CheckCircle2 size={13} /> : <Activity size={13} />}{job.status}</span><strong>{source?.name || job.jobType}</strong><span>{rowSummary}</span><span>{job.errorCount} errors · {job.retryCount} retries</span><small>{dateText(job.startedAt ?? job.createdAt)}{job.quotaLimited ? " · quota flagged" : ""}</small></div>;
      })}</div> : <EmptyState title="No ingestion jobs" message="No source runs have been recorded. An empty job history does not imply that an adapter is operating." />}</Panel>
      <div className="footnote-line"><span>Quota and retry values are counted only when a job records them.</span><span className="kicker-divider" /><span>Demo fixtures remain separate from real-source ingestion.</span></div>
    </>}
  </div>;
}

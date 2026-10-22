import { useState, type ChangeEvent } from "react";
import { Activity, CheckCircle2, CircleAlert, Clock3, Database, FileUp, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingState, PageHeading, Panel, SyntheticFlag } from "@/components/ResearchUI";

type SourceRow = { id: number; name: string; sourceType: string; isSynthetic: boolean; isEnabled: boolean; configured: boolean; notes?: string | null };
type JobRow = { id: number; sourceId: number; status: string; jobType: string; startedAt?: string | Date | null; finishedAt?: string | Date | null; createdAt?: string | Date | null; rowCount: number; duplicateCount: number; errorCount: number; retryCount: number; quotaLimited: boolean; errorSummary?: string | null };
interface HealthData { sources: SourceRow[]; jobs: JobRow[]; awaitingVerification: number; latestRecordAt?: string | Date | null }
const dateText = (value?: string | Date | null) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not available";

export default function SystemHealth() {
  const health = trpc.intelligence.system.health.useQuery();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const data = health.data as unknown as HealthData | undefined;
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const importMutation = trpc.intelligence.system.importCsv.useMutation();
  const isAdmin = auth.data?.role === "admin";
  const configuredCount = data?.sources.filter(source => source.configured).length ?? 0;
  const failureCount = data?.jobs.filter(job => job.status === "failed").reduce((sum, job) => sum + Math.max(job.errorCount, 1), 0) ?? 0;
  const latestSuccessfulJob = data?.jobs.filter(job => job.status === "succeeded").sort((a, b) => new Date(b.finishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.finishedAt ?? a.createdAt ?? 0).getTime())[0];

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

  return <div className="page-stack">
    <PageHeading eyebrow="SYSTEM / DATA PROVENANCE" title="Sources & system health" description="Source configuration and job history are displayed only when represented in stored records." actions={<button className="button-quiet" onClick={() => health.refetch()}><RefreshCw size={14} />Refresh</button>} />
    <div className="notice notice-neutral"><ShieldCheck size={15} /><span>No live ingestion is claimed until a permitted source is configured, authenticated and tested successfully.</span></div>
    {health.isLoading ? <LoadingState label="Checking sources and ingestion jobs" /> : health.error ? <ErrorState message={health.error.message} onRetry={() => health.refetch()} /> : <>
      <section className="metrics-grid health-metrics">
        <div className="coverage-card"><div className="coverage-label"><Database size={15} />CONFIGURED REAL SOURCES</div><strong>{configuredCount}</strong><small>Fictional fixtures do not count as configured providers.</small></div>
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
        })}</div> : <EmptyState title="No source records configured" message="Government, corporate, social-media, and market-data adapters remain unavailable until configured and tested." />}</Panel>
        <Panel title="CSV record import" eyebrow="ADMIN DATA MANAGEMENT"><p className="panel-description">Imports are idempotent, auditable and always marked synthetic/unverified. Optional source URLs are stored as user-provided and not fetched or independently verified.</p>{isAdmin ? <label className={`upload-zone ${busy ? "upload-busy" : ""}`}><input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} /><span className="upload-icon"><UploadCloud size={20} /></span><strong>{busy ? "Validating and importing…" : "Choose a CSV file"}</strong><small>Maximum 1 MB · admin-only operation</small><span className="button-outline"><FileUp size={14} />Browse CSV</span></label> : <div className="admin-gate"><ShieldCheck size={18} /><div><strong>Administrator access required</strong><p>Sign in with an authorized admin account to import data. Ordinary users cannot run imports.</p></div></div>}{notice && <div className={`import-result ${notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("reject") ? "import-result-error" : ""}`}>{notice}</div>}</Panel>
      </section>
      <Panel title="Recent processing jobs" eyebrow="INGESTION HISTORY">{data?.jobs.length ? <div className="job-list">{data.jobs.map(job => {
        const source = data.sources.find(row => row.id === job.sourceId);
        const successful = job.status === "succeeded";
        return <div className="job-row" key={job.id}><span className={`job-status ${successful ? "job-complete" : "job-other"}`}>{successful ? <CheckCircle2 size={13} /> : <Activity size={13} />}{job.status}</span><strong>{source?.name || job.jobType}</strong><span>{job.rowCount} rows · {job.duplicateCount} duplicates</span><span>{job.errorCount} errors · {job.retryCount} retries</span><small>{dateText(job.startedAt ?? job.createdAt)}{job.quotaLimited ? " · quota flagged" : ""}</small></div>;
      })}</div> : <EmptyState title="No ingestion jobs" message="No source runs have been recorded. An empty job history does not imply that an adapter is operating." />}</Panel>
      <div className="footnote-line"><span>Quota and retry values are counted only when a job records them.</span><span className="kicker-divider" /><span>Demo fixtures remain separate from real-source ingestion.</span></div>
    </>}
  </div>;
}

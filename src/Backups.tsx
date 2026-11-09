import { useEffect, useRef, useState, type ReactNode } from "react"
import { api } from "./api/client"
import { Button, Icon } from "./ui"
import { CompactPager, runList, updateListQuery, useListMemory } from "./ListControls"
import { withPage } from "./listing"
import "./backups.css"

type RunStatus = "requested" | "running" | "success" | "failed"
export type BackupRun = {
  id: string; status: RunStatus; requested_by_name: string | null; requested_at: string
  started_at: string | null; finished_at: string | null; database_bytes: number | string | null
  files_changed: number | null; failure_reason: string | null
}
export type BackupData = {
  runs: BackupRun[]; openRequest: Pick<BackupRun, "id" | "status" | "requested_at" | "started_at" | "requested_by_name"> | null
  lastGood: { finished_at: string; database_bytes: number | string; summary: {
    protectedFiles: number; totalFiles: number; storageUsedBytes: number; storageCapacityBytes: number; oldestRestorableAt: string
  } } | null
  lastTest: { tested_at: string; passed: boolean } | null
  workerConfigured: boolean; serverTime: string
}
const formatDate = (value: string, short = false) => new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", ...(!short ? { year: "numeric" as const } : {}),
  hour: "numeric", minute: "2-digit",
}).format(new Date(value))
function bytes(value: number | string | null) {
  if (value === null) return "—"
  const number = Number(value)
  return number >= 1e9 ? `${(number / 1e9).toFixed(1)} GB` : `${(number / 1e6).toFixed(number < 1e6 ? 2 : 0)} MB`
}
function ago(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000))
  return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} minute${minutes === 1 ? "" : "s"} ago` : `${Math.floor(minutes / 60)} hours ago`
}
function nextBackup(now: number) {
  const local = new Date(now + 8 * 3600000)
  const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 2) - 8 * 3600000
  return new Date(next > now ? next : next + 86400000).toISOString()
}
function BackupIcon({ name, spin = false }: { name: string; spin?: boolean }) {
  if (!["database", "refresh"].includes(name)) return <Icon name={name} />
  return <svg className={spin ? "backup-spin" : undefined} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name === "database" ? "M20 6c0 4-16 4-16 0s16-4 16 0Zm0 0v12c0 4-16 4-16 0V6 M4 12c0 4 16 4 16 0" : "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1"} /></svg>
}
function Status({ children, tone = "success", icon = "check", large = false }: { children: ReactNode; tone?: string; icon?: string; large?: boolean }) {
  return <span className={`backup-badge ${tone}${large ? " large" : ""}`}><BackupIcon name={icon} spin={icon === "refresh"} /><span>{children}</span></span>
}
function Notice({ children, tone = "blue", icon = "alert" }: { children: ReactNode; tone?: string; icon?: string }) {
  return <div className={`backup-notice ${tone}`}><BackupIcon name={icon} /><div>{children}</div></div>
}
function Metric({ label, value, children, icon }: { label: string; value: ReactNode; children: ReactNode; icon: string }) {
  return <article className="backup-metric"><div className="backup-metric-label"><span className="backup-icon-square"><BackupIcon name={icon} /></span>{label}</div><div className="backup-metric-value">{value}</div><div className="backup-metric-sub">{children}</div></article>
}
function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="backup-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><span style={{ width: `${Math.min(100, Math.max(0, value / max * 100))}%` }} /></div>
}
const listConfig = { searchText: (run: BackupRun) => run.id }
export default function Backups({ client = api }: { client?: typeof api }) {
  const [data, setData] = useState<BackupData | null>(null)
  const [error, setError] = useState("")
  const [requestError, setRequestError] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState(Date.now())
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const alive = useRef(false)
  const sendingRef = useRef(false)
  const readController = useRef<AbortController | null>(null)
  const offset = useRef(0)
  useListMemory()
  useEffect(() => {
    alive.current = true
    let stopped = false
    async function refresh() {
      if (sendingRef.current || readController.current) return
      const current = ++generation.current
      const controller = new AbortController()
      readController.current = controller
      try {
        const snapshot = await client<BackupData>("/backups", { signal: controller.signal })
        if (stopped || current !== generation.current) return
        offset.current = Date.parse(snapshot.serverTime) - Date.now()
        setData(snapshot); setError(""); setRequestError(""); setClock(Date.now())
      } catch (failure) {
        if (!stopped && current === generation.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Backup status could not be read.")
      } finally {
        if (readController.current === controller) readController.current = null
        if (!stopped && current === generation.current) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => { setClock(Date.now()); void refresh() }, 30000)
    return () => { stopped = true; alive.current = false; generation.current++; readController.current?.abort(); readController.current = null; window.clearInterval(timer) }
  }, [client, retry])
  async function request() {
    if (sendingRef.current || data?.openRequest || error || !data?.workerConfigured) return
    sendingRef.current = true; setSending(true); setRequestError("")
    generation.current++; readController.current?.abort(); readController.current = null
    try {
      const snapshot = await client<BackupData>("/backups/requests", { method: "POST", json: {} })
      if (!alive.current) return
      offset.current = Date.parse(snapshot.serverTime) - Date.now()
      setData(snapshot); setClock(Date.now()); setError("")
      updateListQuery("admin:backups", query => withPage(query, 1), 10)
    } catch (failure) {
      if (alive.current) {
        setRequestError(failure instanceof Error ? failure.message : "The backup request could not be recorded.")
        // A timeout can occur after the server saved the request. Re-read before permitting another request.
        setError("Check the latest backup status before sending another request.")
      }
    } finally {
      sendingRef.current = false
      if (alive.current) { setSending(false); setLoading(false) }
    }
  }
  const now = clock + offset.current
  const open = data?.openRequest
  const running = open?.status === "running"
  const lastGood = data?.lastGood
  const latest = data?.runs.find(run => run.status === "success" || run.status === "failed")
  const late = !!lastGood && now - Date.parse(lastGood.finished_at) > 24 * 3600000
  const failed = latest?.status === "failed"
  const summary = lastGood?.summary
  const history = summary ? Math.max(0, Math.floor((Date.parse(lastGood!.finished_at) - Date.parse(summary.oldestRestorableAt)) / 86400000)) : 0
  const list = runList("admin:backups", data?.runs ?? [], listConfig, { pageSize: 10, pageSizes: [10] })
  const recentResult = data?.runs[0]
  const finishedRequest = recentResult?.requested_by_name && recentResult.finished_at && now - Date.parse(recentResult.finished_at) < 10 * 60000 && !open ? recentResult : null
  return <section className="admin-backups" aria-labelledby="backups-heading">
    <div className="backup-heading"><div><h2 id="backups-heading">Backups</h2><p>Your nightly safety net for project data and files.</p></div><div className="backup-actions">
      <div aria-live="polite">{error ? <Status tone="neutral" icon="alert" large>Status unavailable</Status> : data ? <Status tone={failed ? "danger" : late ? "warning" : lastGood ? "success" : "neutral"} icon={failed || late ? "alert" : lastGood ? "check" : "clock"} large>{failed ? "Failed. The last backup did not finish." : late ? `Late. No successful backup for ${Math.floor((now - Date.parse(lastGood!.finished_at)) / 3600000)} hours.` : lastGood ? `Healthy. Last backup ${ago(lastGood.finished_at, now).toLowerCase()}.` : "No backups recorded"}</Status> : <Status tone="neutral" icon="clock" large>Reading backup status…</Status>}</div>
      <div className="backup-request"><Button variant={open || sending ? "" : "primary"} disabled={sending || !!open || loading || !!error || !data?.workerConfigured} onClick={() => void request()}><BackupIcon name={running || !open ? "refresh" : "clock"} spin={running} />{sending ? "Sending request…" : running ? "Backup running" : open ? "Request sent" : "Run backup request"}</Button><p>{running ? "Waiting for the backup to finish" : open ? "Waiting for the backup computer" : "Starts within 5 minutes"}</p>
      {open?.status === "requested" && now - Date.parse(open.requested_at) >= 15 * 60000 && <div className="backup-request-warning" role="status"><BackupIcon name="alert" />The backup computer has not picked up this request. It may be off or offline.</div>}</div>
    </div></div>
    <div aria-live="polite">{failed && <Notice tone="danger">{latest.failure_reason || "The backup did not finish"}. {lastGood ? `Last successful backup: ${formatDate(lastGood.finished_at)}.` : "No successful backup has been recorded yet."}</Notice>}
    {!failed && late && <Notice tone="warning">The backup computer may be off or offline. No successful backup has been recorded for {Math.floor((now - Date.parse(lastGood!.finished_at)) / 3600000)} hours.</Notice>}
    {finishedRequest && <Notice tone={finishedRequest.status === "success" ? "success" : "danger"} icon={finishedRequest.status === "success" ? "check" : "alert"}>{finishedRequest.status === "success" ? "Backup finished" : `Backup request failed: ${finishedRequest.failure_reason || "The backup did not finish"}`}</Notice>}
    {requestError && <div role="alert"><Notice tone="danger">{requestError}</Notice></div>}
    {error && <div role="alert"><Notice tone="danger"><p>Backup status could not be read. {error}</p><Button onClick={() => { setLoading(true); setRetry(value => value + 1) }} disabled={loading}>Try again</Button></Notice></div>}</div>
    <Notice icon="shield">Administrator-only. Backups are encrypted and stored on a separate computer. This page shows their status only; it never shows backup contents.</Notice>
    {!loading && data && !data.workerConfigured && <Notice tone="warning">The backup computer connection is not configured yet. Backup requests will be available after setup.</Notice>}
    {loading && !data ? <div aria-busy="true" aria-label="Loading backup status"><div className="backup-metrics">{[0, 1, 2, 3].map(key => <div className="backup-metric" key={key}><div className="backup-skeleton" /><div className="backup-skeleton" /><div className="backup-skeleton short" /></div>)}</div><div className="backup-panel">Loading backup status…<div className="backup-skeleton" /><div className="backup-skeleton" /></div></div> : data && <>
      <div className="backup-metrics">
        <Metric label="Last successful backup" value={lastGood ? formatDate(lastGood.finished_at, true) : "No backup yet"} icon="database">{lastGood ? ago(lastGood.finished_at, now) : "After the first scheduled run"}</Metric>
        <Metric label="Next backup" value={formatDate(nextBackup(now), true)} icon="clock">Every night at 2:00 AM</Metric>
        <Metric label="Restore history" value={`${history} days`} icon="archive">Goal: 100 days<Progress label="Restore history in days" value={Math.min(history, 100)} max={100} /></Metric>
        <Metric label="Last restore test" value={data.lastTest ? <><BackupIcon name={data.lastTest.passed ? "check" : "alert"} /> {data.lastTest.passed ? "Passed" : "Failed"}</> : "Not tested yet"} icon="shield">{data.lastTest ? formatDate(data.lastTest.tested_at, true) : "After the first weekly test"}</Metric>
      </div>
      <section className="backup-panel"><h3>What is protected</h3><div className="backup-protected">
        <div><BackupIcon name="database" /><span>Database</span><span>{lastGood ? bytes(lastGood.database_bytes) : "Awaiting first backup"}</span><Status tone={lastGood ? "success" : "neutral"} icon={lastGood ? "check" : "clock"}>{lastGood ? "Saved" : "Not saved yet"}</Status></div>
        <div><BackupIcon name="folder" /><span>Uploaded files</span><span>{summary ? `${summary.protectedFiles} of ${summary.totalFiles} files protected` : "Awaiting first backup"}</span><Status tone={!summary ? "neutral" : summary.protectedFiles === summary.totalFiles ? "success" : "warning"} icon={!summary ? "clock" : summary.protectedFiles === summary.totalFiles ? "check" : "alert"}>{!summary ? "Pending" : summary.protectedFiles === summary.totalFiles ? "Complete" : "Incomplete"}</Status></div>
        <div><BackupIcon name="archive" /><span>Backup storage used</span><div>{summary ? <>{bytes(summary.storageUsedBytes)} of {bytes(summary.storageCapacityBytes)}<Progress label="Backup storage used in bytes" value={Math.min(summary.storageUsedBytes, summary.storageCapacityBytes)} max={summary.storageCapacityBytes} /></> : "Not reported yet"}</div><Status tone={!summary ? "neutral" : summary.storageUsedBytes / summary.storageCapacityBytes >= .9 ? "warning" : "blue"} icon={!summary ? "clock" : summary.storageUsedBytes / summary.storageCapacityBytes >= .9 ? "alert" : "archive"}>{!summary ? "Pending" : summary.storageUsedBytes / summary.storageCapacityBytes >= .9 ? "Nearly full" : "Space available"}</Status></div>
      </div></section>
      <section className="backup-panel backup-table-panel"><header><h3>Recent backups</h3><p>Last 30 runs · Newest first · Philippine time</p></header>
        {!data.runs.length ? <div className="backup-empty"><span className="backup-icon-square"><BackupIcon name="database" /></span><h4>No backups recorded yet.</h4><p>The first backup will appear after the next scheduled run.</p></div> : <><div className="backup-table-wrap"><table><thead><tr>{["Date and time", "Database size", "Files added or changed", "Duration", "Result"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{list.view.items.map(run => <tr key={run.id}><td data-label="Date and time">{formatDate(run.started_at || run.requested_at)}{run.requested_by_name && <small>Requested by {run.requested_by_name}, {formatDate(run.requested_at)}</small>}</td><td data-label="Database size">{bytes(run.database_bytes)}</td><td data-label="Files added or changed">{run.files_changed === null ? "—" : `${run.files_changed} files`}</td><td data-label="Duration">{run.status === "running" ? "In progress" : run.started_at && run.finished_at ? `${Math.floor((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 60000)} min ${Math.floor((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000) % 60} sec` : "—"}</td><td data-label="Result"><Status tone={run.status === "success" ? "success" : run.status === "failed" ? "danger" : run.status === "running" ? "warning" : "blue"} icon={run.status === "success" ? "check" : run.status === "failed" ? "alert" : run.status === "running" ? "refresh" : "clock"}>{run.status[0].toUpperCase() + run.status.slice(1)}</Status>{run.failure_reason && <small className="backup-failure-reason">{run.failure_reason}</small>}</td></tr>)}</tbody></table></div><div className="backup-pagination"><p>Showing {list.view.from}–{list.view.to} of {list.count} runs</p><CompactPager list={list} /></div></>}
      </section>
    </>}
    <details className="backup-panel backup-how"><summary>How it works</summary><ol>{["Every night at 2:00 AM the backup computer connects to the database.", "It saves an encrypted copy of the data and any new or changed files.", "Backups older than 100 days are removed.", "Once a week, a backup is test-restored to prove it works."].map(step => <li key={step}>{step}</li>)}</ol></details>
  </section>
}


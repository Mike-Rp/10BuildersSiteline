import { useEffect, useId, useMemo, useRef, useState } from "react"
import { api } from "./api/client"
import MonthlyReport from "./MonthlyReport"
import { SkeletonRows } from "./LoadingSkeleton"
import { downloadBlob } from "./panels"
import { Button, Empty, Icon } from "./ui"
import { currentReportMonth, reportDate } from "./monthly-report"
import {
  REPORTS_PURPOSE, SUMMARY_FILTERS, SUMMARY_PRINT_TITLE, UNAVAILABLE, changeText, coverageText, monthName, pendingCount, percentText, periodLabel,
  summaryMetrics, summaryPrintDocument, summaryView, totalText, type MonthlySummary, type SummaryFilters, type SummaryTotal, type SummaryView,
} from "./monthly-summary"
import "./reports.css"
import ReportExportActions, { type ReportExportFormat } from "./ReportExportActions"

function SummaryCard({ label, total, value, note, icon }: { label: string; total?: SummaryTotal; value?: number; note?: string; icon: string }) {
  return <article className="metric-card report-summary-card">
    <div className="metric-top"><h3>{label}</h3><span className="metric-icon"><Icon name={icon} /></span></div>
    <p className="metric-value">{total ? totalText(total) : value}</p>
    <p className="metric-bottom">{total ? coverageText(total) : note}</p>
  </article>
}

// Overall monthly summary across every project the server authorizes for this account.
// Summary reads and exports enforce project and role permissions on the server.
export default function Reports({ embedded = false }: { embedded?: boolean }) {
  const ids = { search: useId(), type: useId(), outstanding: useId(), month: useId() }
  const [month, setMonth] = useState(currentReportMonth)
  const [data, setData] = useState<{ summary: MonthlySummary; snapshot: string }>()
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [refresh, setRefresh] = useState(0)
  const [filters, setFilters] = useState<SummaryFilters>(SUMMARY_FILTERS)
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState("")
  const [detail, setDetail] = useState<{ id: string; month: string }>()
  const revision = useRef(0), printFrame = useRef<HTMLIFrameElement | null>(null)
  const future = month > currentReportMonth(), validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  useEffect(() => () => { revision.current++; printFrame.current?.remove() }, [])
  useEffect(() => {
    let active = true; revision.current++; setData(undefined); setError(""); setExportError("")
    if (!validMonth || future) { setLoading(false); return }
    setLoading(true)
    api<{ summary: MonthlySummary; snapshot: string }>(`/reports/monthly-summary?month=${encodeURIComponent(month)}`)
      .then(result => { if (active) setData(result) }).catch(reason => { if (active) setError((reason as Error).message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month, refresh, validMonth, future])

  const summary = data?.summary
  const view: SummaryView | undefined = useMemo(() => summary && summaryView(summary, filters), [summary, filters])
  const metrics = summaryMetrics(summary?.projection || "client")
  const types = useMemo(() => [...new Set(summary?.rows.map(row => row.type))].sort(), [summary])
  const filtered = filters.search !== "" || filters.type !== "" || filters.outstanding !== "all"
  const setFilter = (key: keyof SummaryFilters, value: string) => setFilters(current => ({ ...current, [key]: value }))

  async function exportSummary(format: ReportExportFormat) {
    if (!data || !view || exporting) return
    const current = revision.current; setExporting(true); setExportError("")
    try {
      const result = await api<{ csv?: string; summary?: MonthlySummary; view?: SummaryView }>("/reports/monthly-summary/export", { method: "POST", json: { snapshot: data.snapshot, format: format === "pdf" ? "print" : format, filters: view.filters } })
      if (current !== revision.current) return
      if (format === "csv") downloadBlob(new Blob([result.csv || ""], { type: "text/csv;charset=utf-8" }), `10BuildLine monthly summary — ${data.summary.period.month}.csv`)
      else if (format === "pdf" && result.summary && result.view) {
        const { createReportPdf } = await import("./report-pdf")
        const blob = await createReportPdf(summaryPrintDocument(result.summary, result.view), true)
        if (current !== revision.current) return
        downloadBlob(blob, `10BuildLine monthly summary — ${data.summary.period.month}.pdf`)
      }
      else if (result.summary && result.view) {
        printFrame.current?.remove()
        const frame = document.createElement("iframe"); frame.className = "monthly-print-frame"; frame.title = "Monthly summary print preview"; frame.setAttribute("aria-hidden", "true"); document.body.append(frame); printFrame.current = frame
        let printed = false
        frame.onload = () => { if (!printed && frame.contentDocument?.title === SUMMARY_PRINT_TITLE) { printed = true; frame.contentWindow?.focus(); frame.contentWindow?.print() } }
        frame.srcdoc = summaryPrintDocument(result.summary, result.view)
      }
    } catch (reason) { setExportError((reason as Error).message) } finally { setExporting(false) }
  }

  return <>
    {!embedded && <div className="page-heading"><div><h1>Reports</h1><p>{REPORTS_PURPOSE}</p></div></div>}
    <section className="report-summary" aria-labelledby="report-summary-title">
      <div className="section-title"><h2 id="report-summary-title"><Icon name="doc" /> Overall Monthly Project Summary</h2><span>{summary ? periodLabel(summary).toUpperCase() : "MONTHLY"}</span></div>
      <div className="report-summary-controls">
        <label htmlFor={ids.month}>Reporting month<input id={ids.month} type="month" min="2000-01" max={currentReportMonth()} value={month} onChange={e => setMonth(e.target.value)} /></label>
        <div className="report-summary-actions">
          <Button icon="clock" onClick={() => setRefresh(n => n + 1)} disabled={loading || !validMonth || future}>Refresh</Button>
          <ReportExportActions disabled={!view || loading} busy={exporting} onExport={format => void exportSummary(format)} />
        </div>
      </div>
      {!validMonth && <p role="alert" className="error">Select a reporting month.</p>}
      {future && <p role="alert" className="error">Future reporting months are unavailable. Select the current month or an earlier one.</p>}
      {exportError && <p role="alert" className="error">{exportError}</p>}
      {loading && <SkeletonRows rows={4} label="Loading monthly summary" />}
      {error && <div className="report-summary-error" role="alert"><p className="error">{error}</p><Button onClick={() => setRefresh(n => n + 1)}>Try again</Button></div>}
      {summary && view && <>
        <p className="role-muted">{monthName(summary.period.month)} · {periodLabel(summary)} · {summary.period.timezone}<br />
          {reportDate(summary.period.start)} → {reportDate(summary.period.cutoff)} (exclusive) · Generated {reportDate(summary.period.generatedAt)}</p>
        <details className="report-summary-rules">
          <summary>Which projects are included?</summary>
          <p>{summary.inclusion.rule}</p>
          <p>{summary.inclusion.included} {summary.inclusion.included === 1 ? "project" : "projects"} included{summary.inclusion.excludedAfterCutoff ? `; ${summary.inclusion.excludedAfterCutoff} created on or after the cutoff excluded` : ""}. Verified progress counts only approved required checklist activities; uploads awaiting review earn no credit. Missing historical values show as {UNAVAILABLE} and are never counted as zero. Project percentages are not combined into an overall figure.</p>
        </details>
        {!summary.rows.length ? <Empty title="No projects in this report">No authorized projects existed before the cutoff for {monthName(summary.period.month)}. Choose another month or check your project access.</Empty> : <>
          <div className="report-summary-filters" role="search" aria-label="Filter projects">
            <label htmlFor={ids.search}>Search projects<input id={ids.search} type="search" placeholder="Search by project name…" value={filters.search} onChange={e => setFilter("search", e.target.value)} /></label>
            <label htmlFor={ids.type}>Project type<select id={ids.type} value={filters.type} onChange={e => setFilter("type", e.target.value)}>
              <option value="">All types</option>{types.map(type => <option key={type} value={type}>{type}</option>)}
            </select></label>
            {metrics.pending && <label htmlFor={ids.outstanding}>Outstanding reviews<select id={ids.outstanding} value={filters.outstanding} onChange={e => setFilter("outstanding", e.target.value)}>
              <option value="all">All projects</option><option value="pending">With pending reviews</option><option value="none">No pending reviews</option>
            </select></label>}
            {filtered && <Button onClick={() => setFilters(SUMMARY_FILTERS)}>Clear filters</Button>}
          </div>
          <p role="status" className="role-muted">Showing {view.rows.length} of {summary.rows.length} {summary.rows.length === 1 ? "project" : "projects"}. Figures, statements and exports follow these filters.</p>
          <h3 className="report-summary-group">During {monthName(summary.period.month)}</h3>
          <div className="report-summary-cards">
            <SummaryCard label="Projects included" icon="building" value={view.totals.projects} note={filtered ? `Filtered from ${summary.rows.length}` : "Existed before the cutoff"} />
            {view.totals.approvals && <SummaryCard label="Approval events" icon="check" total={view.totals.approvals} />}
            <SummaryCard label="Phases completed" icon="trend" total={view.totals.completedPhases} />
            {view.totals.rework && <SummaryCard label="Confirmed rework" icon="alert" total={view.totals.rework} />}
          </div>
          {view.totals.pending && <>
            <h3 className="report-summary-group">Outstanding at the reporting cutoff{summary.projection === "site" ? " · your assigned phases" : ""}</h3>
            <div className="report-summary-cards">
              <SummaryCard label="Pending reviews" icon="clock" total={view.totals.pending} />
              <article className="metric-card report-summary-card report-summary-breakdown"><div className="metric-top"><h3>Waiting for review</h3></div>
                <dl><div><dt>Evidence</dt><dd>{view.totals.pending.evidence}</dd></div><div><dt>Progress reports</dt><dd>{view.totals.pending.reports}</dd></div><div><dt>Rework requests</dt><dd>{view.totals.pending.rework}</dd></div></dl>
              </article>
            </div>
          </>}
          <div className="report-summary-highlights">
            <section aria-labelledby="report-accomplishments"><h3 id="report-accomplishments"><Icon name="check" /> Monthly accomplishments</h3><ul>{view.highlights.during.map(text => <li key={text}>{text}</li>)}</ul></section>
            {view.highlights.outstanding.length > 0 && <section aria-labelledby="report-outstanding"><h3 id="report-outstanding"><Icon name="clock" /> Outstanding work at cutoff</h3><ul>{view.highlights.outstanding.map(text => <li key={text}>{text}</li>)}</ul></section>}
          </div>
          {view.highlights.coverage.map(text => <p className="monthly-report-limitation" key={text}>{text}</p>)}
          {!view.rows.length ? <div className="report-summary-empty"><p>No projects match these filters.</p><Button onClick={() => setFilters(SUMMARY_FILTERS)}>Clear filters</Button></div> :
            <div className="report-summary-table" tabIndex={0} role="region" aria-label="Project summary table">
              <table>
                <caption className="report-sr-only">Project summary for {monthName(summary.period.month)}</caption>
                <thead><tr><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Progress at month start</th><th scope="col">Progress at cutoff</th><th scope="col">Change</th>
                  {metrics.approvals && <th scope="col">Approval events</th>}<th scope="col">Phases completed</th>{metrics.rework && <th scope="col">Confirmed rework</th>}
                  {metrics.pending && <th scope="col">Pending reviews</th>}<th scope="col"><span className="report-sr-only">Details</span></th></tr></thead>
                <tbody>{view.rows.map(row => <tr key={row.id}>
                  <th scope="row" data-label="Project">{row.name}</th>
                  <td data-label="Type">{row.type}</td>
                  <td data-label="Progress at month start">{percentText(row.opening)}</td>
                  <td data-label="Progress at cutoff">{percentText(row.closing)}</td>
                  <td data-label="Change">{changeText(row)}{row.change === null && <small className="role-muted">{row.changeNote}</small>}</td>
                  {metrics.approvals && <td data-label="Approval events">{row.approvals ?? UNAVAILABLE}</td>}
                  <td data-label="Phases completed">{row.completedPhases?.length ?? UNAVAILABLE}</td>
                  {metrics.rework && <td data-label="Confirmed rework">{row.rework ?? UNAVAILABLE}</td>}
                  {metrics.pending && <td data-label="Pending reviews">{pendingCount(row) ?? UNAVAILABLE}</td>}
                  <td><Button aria-label={`View details for ${row.name}`} onClick={() => setDetail({ id: row.id, month: summary.period.month })}>View details</Button></td>
                </tr>)}</tbody>
              </table>
            </div>}
        </>}
      </>}
    </section>
    {detail && summary && <MonthlyReport projects={summary.rows} initialProjectId={detail.id} initialMonth={detail.month} allowProjectChange={false} onClose={() => setDetail(undefined)} />}
  </>
}

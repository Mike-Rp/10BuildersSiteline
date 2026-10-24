import { useEffect, useRef, useState, type ChangeEvent } from "react"
import "./manpower-import.css"
import { Button, Icon } from "./ui"
import { validateFile } from "./model"
import { downloadBlob } from "./panels"
import { describeIssue, type ManpowerImportReport } from "./manpower-import"
import { filterWorkers, importPayload, limitIssues, previewSentence, rejectionIssues } from "./manpower-ui"
import ManpowerApprovals from "./ManpowerApprovals"
import { importManpower, loadCompanyWorkers, submitManpower, type CompanyWorker, type ManpowerImportResult } from "./api/manpower"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const CREATED_SHOWN = 100
const WORKERS_PAGE = 25

type Step = "idle" | "preview" | "saving" | "done"
const nameOf = (w: { first_name: string | null; middle_name?: string | null; last_name: string | null; suffix?: string | null }) =>
  [w.first_name, w.middle_name, w.last_name, w.suffix].filter(Boolean).join(" ")
const fileSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"

function IssueTable({ issues, label }: { issues: { row: number; message: string }[]; label: string }) {
  const { shown, hidden } = limitIssues(issues)
  return (
    <div className="table-scroll">
      <table className="manpower-issues-table" aria-label={label}>
        <thead>
          <tr><th>ROW</th><th>PROBLEM</th></tr>
        </thead>
        <tbody>
          {shown.map((issue, index) => (
            <tr key={issue.row + ":" + index}><td>{issue.row}</td><td>{issue.message}</td></tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && <p className="manpower-more">…and {hidden} more. Fix these first, then upload again.</p>}
    </div>
  )
}

// A company's workers with their ID numbers, searchable, and downloadable in the upload layout.
function CompanyWorkers({ companyId, companyName, refreshKey }: { companyId: string; companyName: string; refreshKey: number }) {
  const [workers, setWorkers] = useState<CompanyWorker[]>()
  const [failed, setFailed] = useState("")
  const [query, setQuery] = useState("")
  const [shown, setShown] = useState(WORKERS_PAGE)
  useEffect(() => {
    let cancelled = false
    setFailed("")
    loadCompanyWorkers(companyId)
      .then((list) => { if (!cancelled) setWorkers(list) })
      .catch((error: Error) => { if (!cancelled) setFailed(error.message) })
    return () => { cancelled = true }
  }, [companyId, refreshKey])
  const matches = workers ? filterWorkers(workers, query) : []
  async function download() {
    try {
      const { buildManpowerExport } = await import("./manpower-workbook")
      downloadBlob(new Blob([buildManpowerExport(workers ?? []) as BlobPart], { type: XLSX_TYPE }), `${fileSlug(companyName)}-manpower.xlsx`)
    } catch (error) {
      setFailed((error as Error).message)
    }
  }
  if (failed) return <p role="alert" className="error">{failed}</p>
  if (!workers) return <p className="section-description" aria-live="polite">Loading workers…</p>
  return (
    <div className="manpower-workers">
      <div className="manpower-workers-head">
        <strong>{workers.length} {workers.length === 1 ? "worker" : "workers"}</strong>
        {workers.length > 0 && <Button icon="download" onClick={download}>Download list with IDs</Button>}
      </div>
      {workers.length === 0 ? (
        <p className="section-description">No workers yet. Upload a manpower list to add them.</p>
      ) : (
        <>
          <input
            className="manpower-search"
            type="search"
            aria-label="Search workers by ID number or name"
            placeholder="Search by ID number or name"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(WORKERS_PAGE) }}
          />
          <div className="table-scroll">
            <table aria-label="Workers">
              <thead>
                <tr><th>ID NUMBER</th><th>NAME</th><th>ROLE</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {matches.slice(0, shown).map((w) => (
                  <tr key={w.id}>
                    <td><code>{w.id_number}</code></td>
                    <td>{w.first_name ? nameOf(w) : w.full_name}</td>
                    <td>{w.role_title || "—"}</td>
                    <td>{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matches.length === 0 && <p className="section-description">No worker matches “{query}”.</p>}
          {matches.length > shown && (
            <Button onClick={() => setShown(shown + WORKERS_PAGE)}>Show more ({matches.length - shown} left)</Button>
          )}
        </>
      )}
    </div>
  )
}

// mode "import": an Admin's list is saved straight away. mode "submit": a Site PM's list is sent to an Admin, and
// the workers and their ID numbers are created only when the Admin approves it.
export default function ManpowerImport({
  companyId,
  companyName,
  mode = "import",
  userId,
  onImported,
}: {
  companyId: string
  companyName: string
  mode?: "import" | "submit"
  userId?: string
  onImported?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("idle")
  const [fileName, setFileName] = useState("")
  const [fileError, setFileError] = useState("")
  const [report, setReport] = useState<ManpowerImportReport>()
  const [rejection, setRejection] = useState<{ issues: { row: number; message: string }[]; message: string }>()
  const [result, setResult] = useState<ManpowerImportResult>()
  const [submitted, setSubmitted] = useState<{ new_count: number; existing_count: number }>()
  const [refreshKey, setRefreshKey] = useState(0)
  const submitting = mode === "submit"

  function reset() {
    setStep("idle"); setFileName(""); setFileError(""); setReport(undefined); setRejection(undefined); setResult(undefined); setSubmitted(undefined)
  }
  async function downloadTemplate() {
    try {
      const { buildManpowerTemplate } = await import("./manpower-workbook")
      downloadBlob(new Blob([buildManpowerTemplate() as BlobPart], { type: XLSX_TYPE }), "manpower-template.xlsx")
    } catch (error) {
      setFileError((error as Error).message)
    }
  }
  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    reset()
    const problem = validateFile(file, true)
    if (problem) { setFileError(problem); return }
    try {
      // The spreadsheet reader is loaded only when someone uploads, so it stays out of the main bundle.
      const { parseManpowerWorkbook } = await import("./manpower-workbook")
      setReport(parseManpowerWorkbook(await file.arrayBuffer()))
      setFileName(file.name)
      setStep("preview")
    } catch {
      setFileError("This file can't be read. Save it as .xlsx and try again.")
    }
  }
  async function confirm() {
    if (!report?.ok) return
    setStep("saving"); setRejection(undefined)
    try {
      if (submitting) setSubmitted(await submitManpower(companyId, importPayload(report), fileName))
      else setResult(await importManpower(companyId, importPayload(report)))
      setStep("done")
      setRefreshKey((n) => n + 1)
      onImported?.()
    } catch (error) {
      // Nothing was saved. Show the server's row-numbered reasons and let the user fix the file.
      setRejection(rejectionIssues(error))
      setStep("preview")
    }
  }

  const saving = step === "saving"
  return (
    <div className="manpower-import">
      <div className="notice">
        <Icon name="alert" size={18} />
        <p>
          Upload the company's manpower list as Excel (.xlsx). Leave <strong>idnumber</strong> blank for a new worker and the
          system assigns the ID number. Keep an existing worker's ID as it is.{" "}
          {submitting
            ? "An Admin reviews the list before any worker is added. If anything in the file is wrong, it is not submitted."
            : "If anything in the file is wrong, nothing is imported."}
        </p>
      </div>
      <ManpowerApprovals
        companyId={companyId}
        role={submitting ? "spm" : "admin"}
        userId={userId}
        refreshKey={refreshKey}
        onChanged={() => { setRefreshKey((n) => n + 1); onImported?.() }}
      />
      <div className="manpower-actions">
        <Button icon="download" onClick={downloadTemplate} disabled={saving}>Download template</Button>
        <Button variant="primary" icon="upload" onClick={() => input.current?.click()} disabled={saving}>Upload Excel</Button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          aria-label="Manpower list Excel file"
          onChange={chooseFile}
        />
      </div>
      {fileError && <p role="alert" className="error">{fileError}</p>}

      {(step === "preview" || step === "saving") && report && (
        <section className="manpower-preview" aria-live="polite" aria-label="Import preview">
          <h4>{fileName}</h4>
          {report.errors.length === 0 ? (
            <p className="manpower-summary">{previewSentence(report)}.</p>
          ) : (
            <div role="alert" className="manpower-problems">
              <strong>{report.errors.length} {report.errors.length === 1 ? "problem" : "problems"} to fix. Nothing was {submitting ? "submitted" : "imported"}.</strong>
              <IssueTable issues={report.errors} label="Problems in the file" />
            </div>
          )}
          {report.warnings.length > 0 && (
            <div className="manpower-warnings">
              <strong>{report.warnings.length} {report.warnings.length === 1 ? "note" : "notes"}. These will still be imported.</strong>
              <IssueTable issues={report.warnings} label="Notes about the file" />
            </div>
          )}
          {rejection && (
            <div role="alert" className="manpower-problems">
              <strong>The server did not accept the file. Nothing was saved.</strong>
              {rejection.issues.length > 0 ? <IssueTable issues={rejection.issues} label="Problems found by the server" /> : <p>{rejection.message}</p>}
            </div>
          )}
          {report.ok && !rejection && (
            <p className="manpower-hint">
              {submitting ? "New workers get their ID number when an Admin approves the list." : "New workers get their ID number when you confirm."}
            </p>
          )}
          <div className="manpower-actions">
            <Button onClick={reset} disabled={saving}>{report.ok ? "Cancel" : "Choose another file"}</Button>
            <Button variant="primary" onClick={confirm} disabled={!report.ok || saving}>
              {submitting ? (saving ? "Submitting…" : "Submit for approval") : saving ? "Importing…" : "Confirm import"}
            </Button>
          </div>
        </section>
      )}

      {step === "done" && submitted && (
        <section className="manpower-done" aria-live="polite" aria-label="Submission result">
          <div className="success-state">
            <span><Icon name="check" size={28} /></span>
            <h3>Submitted for approval</h3>
          </div>
          <p className="manpower-summary">{submitted.new_count} new, {submitted.existing_count} existing workers.</p>
          <p className="manpower-hint">
            An Admin will review the list. No worker is added and no ID number is used until it is approved. You will be notified of the decision.
          </p>
          <div className="manpower-actions">
            <Button variant="primary" onClick={reset}>Done</Button>
          </div>
        </section>
      )}

      {step === "done" && result && (
        <section className="manpower-done" aria-live="polite" aria-label="Import result">
          <div className="success-state">
            <span><Icon name="check" size={28} /></span>
            <h3>Import complete</h3>
          </div>
          <p className="manpower-summary">
            {result.created.length} new, {result.updated} updated, {result.unchanged} unchanged.
          </p>
          {result.created.length > 0 && (
            <>
              <p className="manpower-hint">Keep these ID numbers. Use them in the idnumber column the next time you upload this list.</p>
              <div className="table-scroll">
                <table aria-label="New workers and their ID numbers">
                  <thead>
                    <tr><th>ROW</th><th>ID NUMBER</th><th>NAME</th></tr>
                  </thead>
                  <tbody>
                    {result.created.slice(0, CREATED_SHOWN).map((w) => (
                      <tr key={w.id_number}>
                        <td>{w.row ?? "—"}</td>
                        <td><code>{w.id_number}</code></td>
                        <td>{nameOf(w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.created.length > CREATED_SHOWN && (
                <p className="manpower-more">Showing the first {CREATED_SHOWN}. The full list is in the workers table below.</p>
              )}
            </>
          )}
          <div className="manpower-actions">
            <Button variant="primary" onClick={reset}>Done</Button>
          </div>
        </section>
      )}

      <h4 className="manpower-heading">Workers and ID numbers</h4>
      <CompanyWorkers companyId={companyId} companyName={companyName} refreshKey={refreshKey} />
    </div>
  )
}

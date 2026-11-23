import { useRef, useState } from "react"
import { respondToAllocatedCompany } from "./api/intake-monitoring"
import { DOC_LABELS, type Doc, type Project } from "./model"
import { Upload } from "./panels"
import { Badge, Button } from "./ui"

export default function ProjectCompanyAllocation({ project, readOnly = false, disabled = false, onReload, onAgreement }: {
  project: Project
  readOnly?: boolean
  disabled?: boolean
  onReload?: () => unknown
  onAgreement?: (doc: Doc) => Promise<boolean>
}) {
  const [pending, setPending] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState("")
  const [refreshFailed, setRefreshFailed] = useState(false)
  const allocation = project.projectCompanyAllocation
  if (!allocation) return null
  const agreement = project.docs.find(doc => doc.label === DOC_LABELS[6] && doc.uploaded)
  const status = {
    awaiting_decision: "Awaiting company decision", accepted: "Accepted and locked",
    declined: "Company declined", no_eligible_company: "No eligible subcontractor available",
  }[allocation.status]
  const busy = disabled || pending || refreshFailed
  async function change(action: "accept" | "decline" | "reallocate") {
    if (!allocation || readOnly || busy || locked.current) return
    locked.current = true
    setPending(true)
    setError("")
    try {
      await respondToAllocatedCompany(project.id, allocation, action)
      try { await onReload?.() }
      catch { setRefreshFailed(true) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the company decision.")
    } finally {
      setPending(false)
      locked.current = false
    }
  }
  return <section className="detail-section" aria-label="Project-level subcontractor allocation">
    <div className="section-title"><h3>Project subcontractor</h3><Badge tone="blue">All construction phases</Badge></div>
    {allocation.company && <p><strong>{allocation.company.name}</strong> · Allocated by system</p>}
    <p role="status"><Badge tone={allocation.status === "accepted" ? "green" : "amber"}>{status}</Badge></p>
    {allocation.status === "no_eligible_company" && <p>Allocation is pending until an eligible company is available.</p>}
    {!readOnly && allocation.status === "awaiting_decision" && allocation.company && allocation.can_record_decision && <div className="attachment-actions">
      <Button variant="danger-ghost" disabled={busy} onClick={() => void change("decline")}>Record declined</Button>
      <Button variant="primary" disabled={busy} onClick={() => void change("accept")}>Record accepted</Button>
    </div>}
    {!readOnly && allocation.status === "declined" && allocation.can_reallocate && <Button variant="primary" disabled={busy} onClick={() => void change("reallocate")}>Reallocate to next company</Button>}
    <h4>Decision history</h4>
    {allocation.history.length ? <ul>{allocation.history.map(entry => <li key={entry.id}>{entry.company_name} · {entry.decision === "accepted" ? "Accepted" : "Declined"}</li>)}</ul> : <p className="role-muted">No company decisions recorded.</p>}
    <h4>{DOC_LABELS[6]}</h4>
    <p>{agreement ? `On file · ${agreement.name}` : "Awaiting signed agreement"}</p>
    {!readOnly && !agreement && allocation.status === "accepted" && allocation.can_upload_agreement && onAgreement && <Upload
      label={DOC_LABELS[6]} owner="Lead Site PM" buttonLabel="Upload signed subcontractor agreement" previewBeforeUpload multiple={false} disabled={busy} onSave={onAgreement} />}
    {pending && <p role="status">Saving subcontractor allocation…</p>}
    {error && <p role="alert">{error}</p>}
    {refreshFailed && <p role="alert">The action was saved. Reopen the project to load its current allocation.</p>}
  </section>
}

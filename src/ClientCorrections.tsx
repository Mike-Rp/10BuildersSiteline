import { useEffect, useState } from "react"
import { api } from "./api/client"
import { Icon, Modal } from "./ui"
type Correction = { id: string; field: string; before: string; after: string; reason: string; status: string }
export default function ClientCorrections({ id, details, admin, reload, projectType = false, contractLocked = false }: {
  id: string; details: Record<string, unknown>; admin: boolean; reload: () => void; projectType?: boolean; contractLocked?: boolean
}) {
  const [field, setField] = useState(projectType ? "project_type" : "email"), [value, setValue] = useState(""), [reason, setReason] = useState("")
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [history, setHistory] = useState<Correction[]>((details.client_corrections as Correction[]) ?? [])
  useEffect(() => { setHistory((details.client_corrections as Correction[]) ?? []) }, [details.client_corrections])
  async function send(action: string, requestId?: string) {
    setBusy(true); setMessage("")
    try {
      const result = await api<{ corrections: Correction[] }>(`/projects/inquiries/${id}/client-correction`, { method: "POST", json: { action, id: requestId, field, value, reason } })
      setHistory(result.corrections); setOpen(false); setValue(""); setReason("")
      setMessage("Correction " + (action === "request" ? "submitted for admin review." : action === "approve" ? "approved." : "returned.")); reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save correction.") } finally { setBusy(false) }
  }
  const labels: Record<string, string> = projectType ? { project_type: "Project type" }
    : { client_name: "Client name", email: "Email address", phone: "Mobile number", ...(details.client_type === "company" ? { company_name: "Company name", primary_contact: "Representative", designation: "Designation" } : {}) }
  const options = projectType
    ? ["Residential", "Commercial", "Mixed-Use"].filter(type => type !== details.project_type).map(type => [type, type])
    : Object.entries(labels)
  const relevant = history.filter(item => (item.field === "project_type") === projectType)
  if (admin && projectType && !relevant.length) return null
  return <section className={projectType && !admin ? "inquiry-project-type-correction" : "inquiry-card inquiry-client-corrections"}>
    {projectType && !admin ? <>
      <label htmlFor={`inquiry-project-type-${id}`}>Project type</label>
      <div className="inquiry-locked-project-type">
        <input id={`inquiry-project-type-${id}`} readOnly value={String(details.project_type ?? "")} />
        <Icon name="lock" size={16} />
      </div>
      <p>{contractLocked ? "Project type is locked under the finalized signed contract."
        : "Project type comes from the submitted inquiry. An approved correction requires a new scope and budget review."}</p>
    </> : <>
      <h3>{projectType ? "Project type corrections" : "Client information corrections"}</h3>
      {!projectType && <p>Client details are read-only for the OPM. Approved corrections retain the previous value in history. Existing signed documents remain unchanged.</p>}
    </>}
    {!admin && !contractLocked && !history.some(item => item.status === "pending") && <button type="button" className={projectType ? "button" : "button primary"} aria-haspopup="dialog"
      onClick={() => { setMessage(""); setOpen(true) }}>{projectType ? "Request correction" : "Request client correction"}</button>}
    {open && !contractLocked && <Modal title={projectType ? "Request project type correction" : "Request client information correction"}
      subtitle="An administrator will review your request."
      onClose={() => { if (!busy) setOpen(false) }} footer={<>
        <button type="button" className="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="button primary" disabled={busy || !value.trim() || !reason.trim()} onClick={() => void send("request")}>Submit request</button>
      </>}>
      <fieldset disabled={busy} className="inquiry-form-stack">
        <fieldset className="inquiry-correction-options">
          <legend>{projectType ? "Corrected project type" : "Field to update"}</legend>
          <div>
            {options.map(([key, label]) => <button key={key} type="button" className="button"
                aria-pressed={key === (projectType ? value : field)} onClick={() => {
                  if (key === (projectType ? value : field)) return
                  if (projectType) setValue(key)
                  else { setField(key); setValue("") }
                }}>
              {label}
            </button>)}
          </div>
        </fieldset>
        {!projectType && <>
          <label>Current value<input readOnly value={String(details[field] ?? "")} /></label>
          <label>Suggested replacement<input value={value} maxLength={150} onChange={e => setValue(e.target.value)} /></label>
        </>}
        <label>Reason for correction<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
        {message && <p role="alert">{message}</p>}
      </fieldset>
    </Modal>}
    {relevant.map(item => <article key={item.id}><strong>{labels[item.field] ?? item.field} · {item.status}</strong><p>Before: {item.before} → Proposed: {item.after}</p><p>Reason: {item.reason}</p>{admin && item.status === "pending" && <div className="inquiry-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void send("approve", item.id)}>Approve correction</button><button type="button" className="button" disabled={busy} onClick={() => void send("return", item.id)}>Return request</button></div>}</article>)}
    {!open && message && <p role="status">{message}</p>}
  </section>
}

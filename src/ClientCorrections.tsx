import { useEffect, useState } from "react"
import { api } from "./api/client"
type Correction = { id: string; field: string; before: string; after: string; reason: string; status: string }
export default function ClientCorrections({ id, details, admin, reload }: { id: string; details: Record<string, unknown>; admin: boolean; reload: () => void }) {
  const [field, setField] = useState("email"), [value, setValue] = useState(""), [reason, setReason] = useState("")
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [history, setHistory] = useState<Correction[]>((details.client_corrections as Correction[]) ?? [])
  useEffect(() => { setHistory((details.client_corrections as Correction[]) ?? []) }, [details.client_corrections])
  async function send(action: string, requestId?: string) {
    setBusy(true); setMessage("")
    try {
      const result = await api<{ corrections: Correction[] }>(`/projects/inquiries/${id}/client-correction`, { method: "POST", json: { action, id: requestId, field, value, reason } })
      setHistory(result.corrections); setOpen(false); setMessage("Correction " + (action === "request" ? "submitted for admin review." : action === "approve" ? "approved." : "returned.")); reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save correction.") } finally { setBusy(false) }
  }
  const labels: Record<string, string> = { client_name: "Client name", email: "Email address", phone: "Mobile number", ...(details.client_type === "company" ? { company_name: "Company name", primary_contact: "Representative", designation: "Designation" } : {}) }
  return <section className="inquiry-card"><h3>Client information corrections</h3><p>Client details are read-only for the OPM. Approved corrections retain the previous value in history. Existing signed documents remain unchanged.</p>
    {!admin && !history.some(item => item.status === "pending") && <button type="button" className="button" onClick={() => setOpen(!open)}>Request correction</button>}
    {open && <div className="inquiry-form-stack"><label>Field to update<select value={field} onChange={e => { setField(e.target.value); setValue("") }}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Current value<input readOnly value={String(details[field] ?? "")} /></label><label>Suggested replacement<input value={value} maxLength={150} onChange={e => setValue(e.target.value)} /></label><label>Reason for correction<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><button type="button" className="button primary" disabled={busy || !value.trim() || !reason.trim()} onClick={() => void send("request")}>Submit request</button><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button></div>}
    {history.map(item => <article key={item.id}><strong>{labels[item.field] ?? item.field} · {item.status}</strong><p>Before: {item.before} → Proposed: {item.after}</p><p>Reason: {item.reason}</p>{admin && item.status === "pending" && <div className="inquiry-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void send("approve", item.id)}>Approve correction</button><button type="button" className="button" disabled={busy} onClick={() => void send("return", item.id)}>Return request</button></div>}</article>)}
    {message && <p role="status">{message}</p>}
  </section>
}

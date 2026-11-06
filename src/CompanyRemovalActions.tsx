import { useRef, useState } from "react"
import { api } from "./api/client"
import type { Company } from "./model"
import { Button, Modal } from "./ui"
import "./company-removal.css"

type Readiness = { mode: "delete" | "archive" | "blocked" | "archived"; companyName: string }
export default function CompanyRemovalActions({ company, onView, onRemoved, labeled = false }: {
  company: Company; onView?: () => void; onRemoved: () => Promise<void>; labeled?: boolean
}) {
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false)
  const [readiness, setReadiness] = useState<Readiness>(), [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true); setReadiness(undefined); setError("")
    try { setReadiness(await api<Readiness>(`/subcontractors/${company.id}/removal-readiness`)) }
    catch (reason) { setError((reason as Error).message) }
  }
  async function remove() {
    if (!readiness || !["delete", "archive"].includes(readiness.mode) || running.current) return
    running.current = true; setBusy(true); setError("")
    try {
      await api(`/subcontractors/${company.id}/remove`, { method: "POST", json: { action: readiness.mode, companyName: readiness.companyName } })
      await onRemoved(); setConfirm(false); setOpen(false)
    } catch (reason) { setError((reason as Error).message) }
    finally { running.current = false; setBusy(false) }
  }
  const deleting = readiness?.mode === "delete"
  return <div className="company-removal-actions">
    <Button variant={labeled ? "" : "icon-button"} aria-label={labeled ? `Manage company ${company.name}` : `Actions for ${company.name}`} aria-expanded={open} onClick={() => void toggle()}>{labeled ? "Manage company" : "⋮"}</Button>
    {open && <div className="company-action-menu" aria-label="Company actions">
      {onView && <Button onClick={() => { setOpen(false); onView() }}>View company</Button>}
      {!readiness && !error && <p role="status">Checking project history…</p>}
      {readiness && ["delete", "archive"].includes(readiness.mode) && <Button variant={deleting ? "danger-ghost" : ""} onClick={() => { setConfirm(true); setOpen(false) }}>{deleting ? "Delete unused company" : "Archive company"}</Button>}
      {readiness?.mode === "blocked" && <p>Removal blocked. Resolve current commitments or allocation plans first.</p>}
      {readiness?.mode === "archived" && <p>Company already archived.</p>}
      {!confirm && error && <p className="error" role="alert">{error}</p>}
      <Button onClick={() => setOpen(false)}>Close menu</Button>
    </div>}
    {confirm && <Modal title={deleting ? "Delete unused company?" : "Archive company?"} onClose={() => { if (!busy) setConfirm(false) }}>
      <p><strong>{readiness?.companyName}</strong></p>
      <p>{deleting ? "This company has no project history. Deleting the unused company record is permanent. Supporting file references are retained for audit." : "The company will be excluded from new allocations. Its project history, documents and approvals will be preserved."}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={busy} variant={deleting ? "danger" : "primary"} onClick={() => void remove()}>{busy ? "Saving…" : deleting ? "Delete company" : "Archive company"}</Button></div>
    </Modal>}
  </div>
}

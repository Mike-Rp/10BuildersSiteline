import { useEffect, useState } from "react"
import { api } from "./api/client"
import type { ProgressTotals } from "./project-progress"
import { Button, Field, Modal } from "./ui"

type Preview = {
  activity: string
  phase_name: string
  review_token: string
  before: { phase: ProgressTotals; project: ProgressTotals }
  after: { phase: ProgressTotals; project: ProgressTotals }
}
const measure = (value: ProgressTotals) => value.earned === null || value.total === null
  ? "Unavailable"
  : `${value.earned} / ${value.total} points`

export default function EvidenceReview({projectId,evidenceId,reject,onClose,onConfirm}: {
  projectId: string
  evidenceId: string
  reject: boolean
  onClose: () => void
  onConfirm: (token: string, note: string) => Promise<boolean>
}) {
  const [preview,setPreview]=useState<Preview>()
  const [error,setError]=useState("")
  const [note,setNote]=useState("")
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    let active=true
    api<Preview>(`/projects/${projectId}/evidence/${evidenceId}/review-preview`)
      .then(value=>{if(active)setPreview(value)})
      .catch(error=>{if(active)setError((error as Error).message)})
    return ()=>{active=false}
  },[projectId,evidenceId])
  return <Modal title={reject ? "Reject activity evidence" : "Approve activity evidence"} onClose={()=>{if(!busy)onClose()}}>
    {!preview && !error && <p role="status">Loading review impact…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <h3>{preview.activity}</h3>
      <p>{preview.phase_name} · This decision applies to this activity only.</p>
      {!reject && preview.after.phase.percentage === 100 && <p>The phase checklist will be complete. The next phase activates automatically if all handoff requirements pass.</p>}
      <div className="notice subsection">
        <div>
          <strong>{reject ? "Progress remains unchanged" : "Impact if approved"}</strong>
          <p>Phase: {measure(preview.before.phase)} → {measure(reject ? preview.before.phase : preview.after.phase)}</p>
          {preview.before.phase.reason && <p>{preview.before.phase.reason}</p>}
        </div>
      </div>
      <Field label={reject ? "Reason for rejection *" : "Review note (optional)"}>
        <textarea rows={3} value={note} maxLength={10000} onChange={event=>setNote(event.target.value)} />
      </Field>
    </>}
    <div className="modal-actions">
      <Button disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!preview || busy || (reject && !note.trim())} onClick={async()=>{
        if(!preview)return
        setBusy(true)
        try {
          if(await onConfirm(preview.review_token,note.trim()))onClose()
          else {setPreview(undefined);setError("Review was not saved. Close this panel and reopen the activity to refresh its current state.")}
        }
        catch(error){setError((error as Error).message)}
        finally{setBusy(false)}
      }}>{busy ? "Saving…" : reject ? "Confirm rejection" : "Confirm approval"}</Button>
    </div>
  </Modal>
}

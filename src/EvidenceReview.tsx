import { useEffect, useState } from "react"
import { api, downloadApiFile, downloadBlob } from "./api/client"
import type { ProgressTotals } from "./project-progress"
import type { Doc } from "./model"
import { Button, Field, Icon, Modal } from "./ui"

type Preview = {
  item_id?: string
  submitted_by_name?: string
  submitted_at?: string
  submission_note?: string
  activity: string
  phase_name: string
  review_token: string
  before: { phase: ProgressTotals; project: ProgressTotals }
  after: { phase: ProgressTotals; project: ProgressTotals }
}
type EvidenceVersion = {
  id: string | number
  evidence_id: string | number
  status: string
  submitted_by_name?: string
  submitted_at: string
  review_note?: string
  files: {id: string; original_name: string}[]
}
const measure = (value: ProgressTotals) => value.earned === null || value.total === null
  ? "Unavailable"
  : `${Number(value.earned.toFixed(1))} / ${value.total} points`

export default function EvidenceReview({projectId,evidenceId,doc:primaryDoc,docs,onClose,onConfirm}: {
  projectId: string
  evidenceId: string
  doc?: Doc
  docs?: Doc[]
  onClose: () => void
  onConfirm: (token: string, note: string, reject: boolean) => Promise<boolean>
}) {
  const [selectedId,setSelectedId]=useState("")
  const doc=docs?.find(file=>file.id===selectedId) || primaryDoc || docs?.[0]
  const [preview,setPreview]=useState<Preview>()
  const [error,setError]=useState("")
  const [note,setNote]=useState("")
  const [busy,setBusy]=useState(false)
  const [reject,setReject]=useState(false)
  const [asking,setAsking]=useState(false)
  const [history,setHistory]=useState<EvidenceVersion[]>()
  const [historyError,setHistoryError]=useState("")
  const [fileUrl,setFileUrl]=useState("")
  const [fileLoading,setFileLoading]=useState(!!doc)
  const files=docs||[]
  const position=doc?files.findIndex(file=>file.id===doc.id):-1
  const step=(direction:-1|1)=>{const next=files[position+direction];if(next)setSelectedId(next.id)}
  useEffect(()=>{
    if(files.length<2)return
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null
      // Arrow keys keep their normal meaning inside the review note and other fields.
      if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return
      if(target&&(["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable))return
      event.preventDefault();step(event.key==="ArrowLeft"?-1:1)
    }
    document.addEventListener("keydown",onKey)
    return ()=>document.removeEventListener("keydown",onKey)
  })
  useEffect(()=>{
    let active=true
    api<Preview>(`/projects/${projectId}/evidence/${evidenceId}/review-preview`)
      .then(value=>{if(active)setPreview(value)})
      .catch(error=>{if(active)setError((error as Error).message)})
    return ()=>{active=false}
  },[projectId,evidenceId])
  useEffect(()=>{
    let active=true
    let objectUrl=""
    if(!doc){setFileLoading(false);return}
    setFileLoading(true)
    downloadApiFile(doc.id).then(file=>{
      if(!active)return
      if(file){objectUrl=URL.createObjectURL(file);setFileUrl(objectUrl)}
      setFileLoading(false)
    }).catch(()=>{if(active)setFileLoading(false)})
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[doc?.id])
  return <Modal wide title="Review activity evidence" subtitle={doc?.name} onClose={()=>{if(!busy)onClose()}}>
    <div className="evidence-review-layout">
    <section className="evidence-review-preview" aria-label="Submitted evidence preview">
      {!!docs?.length && <div className="attachment-actions">{docs.map(file=><Button key={file.id} onClick={()=>setSelectedId(file.id)}>{file.name}</Button>)}</div>}
      <div className="evidence-review-preview-heading"><Icon name="doc"/><strong>{doc?.label || "Submitted evidence"}</strong></div>
      <div className="evidence-review-stage">
        {files.length>1 && <button type="button" className="evidence-nav evidence-nav-prev" aria-label="Previous attachment" disabled={position<=0} onClick={()=>step(-1)}>‹</button>}
        {fileUrl && doc?.name && /\.(png|jpe?g|gif|webp)$/i.test(doc.name)
          ? <img src={fileUrl} alt={doc.label} />
          : fileUrl
            ? <object data={`${fileUrl}#toolbar=0&navpanes=0`} type="application/pdf" aria-label={doc?.name || "Submitted evidence"}><p>Preview is unavailable in this browser.</p></object>
            : <div className="evidence-review-preview-empty" role="status">{fileLoading ? "Loading submitted evidence…" : "Evidence preview is unavailable. You can still review the submission details."}</div>}
        {files.length>1 && <button type="button" className="evidence-nav evidence-nav-next" aria-label="Next attachment" disabled={position>=files.length-1} onClick={()=>step(1)}>›</button>}
      </div>
      {files.length>1 && <p className="evidence-nav-count" role="status" aria-live="polite">Attachment {position+1} of {files.length} · use ← → to switch</p>}
      {fileUrl && <a className="evidence-download" href={fileUrl} download={doc?.name}><Icon name="download"/>Download attachment</a>}
    </section>
    <section className="evidence-review-decision">
    <h3>{preview?.activity || doc?.label || "Submitted evidence"}</h3>
    {!preview && !error && <p role="status">Loading review impact…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <p>{preview.phase_name} · This decision applies to this activity only.</p>
      {preview.submitted_by_name && <p>Submitted by {preview.submitted_by_name}{preview.submitted_at ? ` · ${new Date(preview.submitted_at).toLocaleString()}` : ""}</p>}
      {preview.submission_note && <p>{preview.submission_note}</p>}
      <Button onClick={()=>void api<EvidenceVersion[]>(`/projects/${projectId}/evidence-history`)
        .then(rows=>{setHistory(rows.filter(row=>String(row.id)===String(preview.item_id)));setHistoryError("")})
        .catch(error=>setHistoryError((error as Error).message))}>View submission history</Button>
      {historyError && <p role="status">History unavailable: {historyError}</p>}
      {history && <div>{history.map(version=><div key={version.evidence_id}>
        <p>{version.submitted_by_name || "Original submitter"} · {new Date(version.submitted_at).toLocaleString()} · {version.status}</p>
        {version.review_note && <p>{version.review_note}</p>}
        {version.files.map(file=><Button key={file.id} onClick={()=>void downloadBlob(`/projects/${projectId}/phase-files/${file.id}`).then(blob=>{
          if(!blob)throw new Error("Attachment unavailable.");const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.original_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
        }).catch(error=>setHistoryError((error as Error).message))}>Download {file.original_name}</Button>)}
      </div>)}</div>}
      {!reject && preview.after.phase.percentage === 100 && <p>The phase checklist will be complete. The next phase activates automatically if all handoff requirements pass.</p>}
      <div className="notice subsection">
        <div>
          <strong>{reject ? "Progress remains unchanged" : "Impact if approved"}</strong>
          <p>Phase: {measure(preview.before.phase)} → {measure(reject ? preview.before.phase : preview.after.phase)}</p>
          {preview.before.phase.reason && <p>{preview.before.phase.reason}</p>}
        </div>
      </div>
      <div className="evidence-decision-choice">
        <span className="evidence-decision-label" id="evidence-decision-label">Your decision</span>
        <div className="evidence-review-choice" role="radiogroup" aria-labelledby="evidence-decision-label"
          onKeyDown={event=>{if(!busy&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();setReject(value=>!value)}}}>
          <button type="button" role="radio" aria-checked={!reject} tabIndex={!reject?0:-1} disabled={busy}
            className={`evidence-choice approve${!reject?" selected":""}`} onClick={()=>setReject(false)}><Icon name="check" size={18}/>Approve</button>
          <button type="button" role="radio" aria-checked={reject} tabIndex={reject?0:-1} disabled={busy}
            className={`evidence-choice reject${reject?" selected":""}`} onClick={()=>setReject(true)}><Icon name="close" size={18}/>Reject</button>
        </div>
        <small className="evidence-decision-hint">Choosing a decision does not save it. {reject ? "Enter a reason, then confirm the rejection." : "Confirm the approval when you are ready."}</small>
      </div>
      <Field label={reject ? "Reason for rejection *" : "Review note (optional)"}>
        <textarea rows={3} value={note} maxLength={10000} onChange={event=>setNote(event.target.value)} />
      </Field>
    </>}
    <div className="modal-actions">
      <Button disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant={reject ? "danger" : "primary"} disabled={!preview || busy || (reject && !note.trim())} onClick={()=>setAsking(true)}>{busy ? "Saving…" : reject ? "Confirm rejection" : "Confirm approval"}</Button>
    </div>
    </section>
    </div>
    {asking && preview && <Modal title={reject ? "Reject evidence?" : "Approve evidence?"} onClose={()=>{if(!busy)setAsking(false)}}>
      {reject
        ? <>
            <p>Reject <strong>{preview.activity}</strong>? The submitter will see your reason, and phase progress stays unchanged.</p>
            <blockquote className="evidence-confirm-reason">{note.trim()}</blockquote>
          </>
        : <p>Approve <strong>{preview.activity}</strong>? This counts toward phase progress: {measure(preview.before.phase)} → {measure(preview.after.phase)}.{preview.after.phase.percentage === 100 ? " The phase checklist will be complete." : ""}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={()=>setAsking(false)}>No</Button>
        <Button variant={reject ? "danger" : "primary"} disabled={busy} onClick={async()=>{
          setBusy(true)
          try {
            if(await onConfirm(preview.review_token,note.trim(),reject))onClose()
            else {setAsking(false);setPreview(undefined);setError("Review was not saved. Close this panel and reopen the activity to refresh its current state.")}
          }
          catch(error){setAsking(false);setError((error as Error).message)}
          finally{setBusy(false)}
        }}>{busy ? "Saving…" : "Yes"}</Button>
      </div>
    </Modal>}
  </Modal>
}

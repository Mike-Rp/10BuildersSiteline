import { useRef, useState } from "react"
import { Button, Field, Icon } from "./ui"
import type { Company, Doc, Role } from "./model"
import CompanyTradePicker from "./CompanyTradePicker"
import CompanyTradeMatches from "./CompanyTradeMatches"
import { Upload } from "./panels"
import "./TradeAllocationPanel.css"

export default function CompanyCapabilities({
  company,
  role,
  onSave,
  onPreview,
  onUpload,
  onCancel,
}: {
  company: Company
  role: Role
  onSave?: (review: NonNullable<Company["capabilityReview"]>) => Promise<void>
  onPreview?: (doc: Doc) => void
  onUpload?: (doc: Doc) => Promise<void>
  onCancel?: () => void
}) {
  const review = company.capabilityReview
  const [editing, setEditing] = useState(false)
  const [draftDocuments, setDraftDocuments] = useState<Doc[]>([])
  const [uploadVersion, setUploadVersion] = useState(0)
  const [uploading, setUploading] = useState(false)
  const editSession = useRef(0)
  const [selected, setSelected] = useState(review?.disciplines || company.proposedDisciplines || [])
  const [documents, setDocuments] = useState(review?.documentIds || [])
  const [note, setNote] = useState(review?.note || "")
  const [unavailable, setUnavailable] = useState(review?.unavailable || false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const locked = useRef(false)
  const editable = role === "admin" && !!onSave
  const supportingRecords = [...company.documents, ...draftDocuments.filter(doc => !company.documents.some(saved => saved.id === doc.id))].filter(document => document.uploaded)
  const linkedDocuments = documents.filter(id => supportingRecords.some(document => document.id === id))
  const differentSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort())
  const changed = differentSet(selected, review?.disciplines || company.proposedDisciplines || []) || differentSet(linkedDocuments, review?.documentIds || []) || note.trim() !== (review?.note || "") || unavailable !== !!review?.unavailable || draftDocuments.length > 0
  function resetDraft() {
    editSession.current++
    setSelected(review?.disciplines || company.proposedDisciplines || [])
    setDocuments(review?.documentIds || [])
    setNote(review?.note || "")
    setUnavailable(review?.unavailable || false)
    setDraftDocuments([])
    setUploadVersion(version => version + 1)
    setError("")
  }
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value]
  async function save() {
    if (locked.current || uploading || !editable || !editing || !onSave || !selected.length || !linkedDocuments.length || !note.trim() || (!!review && !changed)) return
    locked.current = true
    setBusy(true)
    setError("")
    try {
      for (const document of draftDocuments) {
        if (onUpload && !company.documents.some(saved => saved.id === document.id)) await onUpload(document)
      }
      await onSave({
        disciplines: selected,
        documentIds: linkedDocuments,
        note: note.trim(),
        unavailable,
        reviewedAt: "",
        reviewedBy: "",
        reviewedById: "",
      })
      setDraftDocuments([])
      setEditing(false)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  if (!editable) return (
    <section className="detail-section trade-allocation">
      <h3>Company capabilities</h3>
      <p>View only. Capabilities are verified by Admin in the Subcontractor directory.</p>
      <p>Directory classification: <strong>{company.primaryTrade || "Not recorded"}</strong></p>
      {review ? <>
        <div className="tag-list">{review.disciplines.map(discipline => <span key={discipline}>{discipline}</span>)}</div>
        {!review.disciplines.length && <p>No verified capabilities recorded.</p>}
        <p><Icon name="check" size={16} /> Last reviewed by {review.reviewedBy} on {new Date(review.reviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p>
        <p>{review.note}</p>
        <p>{review.unavailable ? "Unavailable for new commitments" : "Available for capacity checks"}</p>
        <p>Supporting records: {company.documents.filter(document => (review.documentIds || []).includes(document.id)).map(document => document.name).join(", ") || "No linked records available"}</p>
      </> : <><p>Admin capability verification required.</p>{!!company.proposedDisciplines?.length && <><p>Proposed trades · Not verified</p><div className="tag-list">{company.proposedDisciplines.map(discipline => <span key={discipline}>{discipline}</span>)}</div></>}</>}
      <CompanyTradeMatches trades={review?.disciplines || company.proposedDisciplines || []} verified={!!review?.reviewedAt} />
    </section>
  )
  return (
    <section className="detail-section trade-allocation company-capability-review">
      <h3>Admin capability verification</h3>
      {!editing && <Button onClick={() => { resetDraft(); setEditing(true) }}>Edit credentials</Button>}
      <p>Select company trades supported by the records. Verification is applied when you save this review.</p>
      <div className="capability-summary">
        <div><span>Directory classification</span><strong>{company.primaryTrade || "Not recorded"}</strong></div>
        <div><span>Review status</span><strong><Icon name={review && !changed ? "check" : "clock"} size={17} />{!review ? "Review required" : changed ? "Unsaved changes" : "Reviewed"}</strong></div>
        <div><span>Selected capabilities</span><strong>{selected.length}</strong></div>
      </div>
      {review && (
        <p>
          <Icon name="check" size={16} /> Last reviewed by {review.reviewedBy}{" "}
          on{" "}
          {new Date(review.reviewedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          .
        </p>
      )}
      {!review && !!company.proposedDisciplines?.length && <p className="capability-proposal-note"><Icon name="clock" size={16} />Proposed trades are preselected. Review the supporting records before verifying them.</p>}
      <div className="capability-review-columns">
        <CompanyTradePicker selected={selected} recordedTrades={review?.disciplines || company.proposedDisciplines || []} onChange={setSelected} disabled={busy || !editing} />
        <section className="capability-records" aria-label="Supporting company records">
          <div className="capability-section-heading"><h4>Supporting company records</h4></div>
          {supportingRecords.map(document => <div className="capability-record" key={document.id}>
            <label className="trade-check">
              <input type="checkbox" disabled={busy || !editing} checked={documents.includes(document.id)} onChange={() => setDocuments(toggle(documents, document.id))} />
              <Icon name="doc" size={20} /><span>{document.name}</span>
            </label>
            {onPreview && <Button disabled={busy} onClick={() => onPreview(document)}>Preview {document.name}</Button>}
          </div>)}
          {!supportingRecords.length && <p>No supporting records on file. Add company records to verify the selected trades.</p>}
          {onUpload && editing && <Upload key={uploadVersion} onBusyChange={setUploading} label="Company Supporting Document" owner="Administrator" disabled={busy} buttonLabel="Add document" onSave={(() => {
            const session = editSession.current
            return async (document: Doc) => {
              if (session !== editSession.current) return
              setDraftDocuments(current => [...current, document])
              setDocuments(current => [...new Set([...current, document.id])])
            }
          })()} />}
          {draftDocuments.length > 0 && <p role="status">New documents are staged for this review. Undo or Cancel removes them from the draft without deleting saved company records.</p>}
          <p className="capability-help"><Icon name="doc" size={16} />Select records supporting this review. One record can support several capabilities.</p>
          <Field label="Capability review note (required)"><textarea disabled={busy || !editing} value={note} onChange={event => setNote(event.target.value)} placeholder="Which records support these capabilities?" maxLength={2000} aria-required="true" /></Field>
          {!note.trim() && <p className="role-muted" role="status">Add a short review note to enable saving.</p>}
          <label className="trade-check"><input type="checkbox" disabled={busy || !editing} checked={unavailable} onChange={event => setUnavailable(event.target.checked)} />Unavailable for new commitments</label>
        </section>
      </div>
      <CompanyTradeMatches trades={selected} verified={!!review?.reviewedAt && !changed} />
      {error && <p role="alert">{error}</p>}
      <div className="capability-review-footer">
        <div><strong aria-live="polite">{selected.length} selected · {linkedDocuments.length} document{linkedDocuments.length === 1 ? "" : "s"} linked</strong><p>{!review ? "No capabilities are verified until this review is saved." : "Changes take effect after this review is saved."}</p></div>
        {editing && <div className="capability-footer-actions"><Button disabled={busy || uploading || !changed} onClick={resetDraft}>Undo changes</Button><Button disabled={busy || uploading} onClick={() => { resetDraft(); setEditing(false); onCancel?.() }}>Cancel</Button><Button variant="primary" disabled={busy || uploading || (!!review && !changed) || !selected.length || !linkedDocuments.length || !note.trim()} onClick={() => void save()}>{busy ? "Saving review…" : "Save verified capabilities"}</Button></div>}
      </div>
      <p className="capability-help">Company approval and project acceptance are separate.</p>
    </section>
  )
}

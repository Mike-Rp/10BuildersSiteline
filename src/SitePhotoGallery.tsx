import { useEffect, useState } from "react"
import type { Doc } from "./model"
import { dateLabel } from "./model"
import { downloadApiFile } from "./api/client"
import { Badge, Button, Field, Icon, Modal } from "./ui"

export default function SitePhotoGallery({ photos, onApprove, onReject }: {
  photos: Doc[]
  onApprove?: (photoId: string) => Promise<unknown>
  onReject?: (photoId: string, note: string) => Promise<unknown>
}) {
  const [selected, setSelected] = useState<Doc>()
  const [reject, setReject] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const canReview = !!onApprove && !!onReject

  useEffect(() => {
    if (!selected) return
    let active = true
    let objectUrl = ""
    setLoading(true)
    setImageUrl("")
    downloadApiFile(selected.id).then(file => {
      if (!active) return
      if (file) {
        objectUrl = URL.createObjectURL(file)
        setImageUrl(objectUrl)
      }
      setLoading(false)
    }).catch(() => { if (active) setLoading(false) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selected?.id])

  async function submitDecision() {
    if (!selected) return
    setSaving(true)
    setError("")
    try {
      if (reject) {
        if (!note.trim()) throw new Error("Explain why this photo is being returned to the Site PM.")
        await onReject?.(selected.id, note.trim())
      } else {
        await onApprove?.(selected.id)
      }
      setSelected(undefined)
      setNote("")
      setReject(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo review failed. Refresh and try again.")
    } finally {
      setSaving(false)
    }
  }

  return <>
    <p>{canReview
      ? "Preview each Site PM gallery photo, then approve it for the Client Portal or return it with a reason. QA/QC evidence remains internal."
      : "Site gallery photos stay internal until the assigned Office PM or an Administrator approves them for the Client Portal."}</p>
    {!photos.length && <p>No site photos uploaded yet.</p>}
    {photos.map(doc => <div className="photo-gallery-record" key={doc.id}>
      <button className="assignment-history" onClick={() => { setSelected(doc); setReject(false); setNote(""); setError("") }}>
        <Icon name="doc" />
        <span>
          <strong>{doc.name}</strong>
          <Badge tone={doc.clientVisible ? "green" : doc.photoReviewStatus === "rejected" ? "red" : "amber"}>
            {doc.clientVisible ? "Client-visible" : doc.photoReviewStatus === "rejected" ? "Returned to Site PM" : "Internal · awaiting review"}
          </Badge>
          <small>{dateLabel(doc.date)} · {doc.owner}</small>
          {doc.photoReviewStatus === "rejected" && doc.photoReviewNote && <small className="photo-review-return-note">Reason returned: {doc.photoReviewNote}</small>}
        </span>
        <Icon name="eye" size={18} />
      </button>
    </div>)}
    {selected && <Modal wide title="Review site photo" subtitle={`${selected.name} · uploaded by ${selected.owner}`} onClose={() => { if (!saving) setSelected(undefined) }}>
      <div className="site-photo-review">
        <div className="site-photo-review-image">
          {imageUrl && /\.(png|jpe?g|gif|webp)$/i.test(selected.name)
            ? <img src={imageUrl} alt={selected.name} />
            : imageUrl
              ? <object data={`${imageUrl}#toolbar=0&navpanes=0`} type="application/pdf" aria-label={selected.name}><p>Preview is unavailable in this browser.</p></object>
              : <div role="status">{loading ? "Loading photo preview…" : "Photo preview is unavailable."}</div>}
        </div>
        <div className="site-photo-review-form">
          <div className="site-photo-review-summary">
            <strong>{selected.clientVisible ? "Already shared with client" : selected.photoReviewStatus === "rejected" ? "Returned to uploader" : "Internal · not visible to client"}</strong>
            <span>{selected.date ? dateLabel(selected.date) : "Upload date unavailable"}</span>
          </div>
          {canReview && !selected.clientVisible && selected.photoReviewStatus !== "rejected" && <>
            <p>Approve only if this photo is relevant to the project and appropriate for the client.</p>
            {reject && <Field label="Reason for returning to the Site PM *">
              <textarea rows={4} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Explain what is unrelated or needs correction." />
            </Field>}
            {error && <p className="error" role="alert">{error}</p>}
          </>}
          {selected.photoReviewStatus === "rejected" && selected.photoReviewNote && <div className="notice subsection"><Icon name="alert"/><p>Returned reason: {selected.photoReviewNote}</p></div>}
        </div>
      </div>
      <div className="modal-actions site-photo-review-actions">
        {canReview && !selected.clientVisible && selected.photoReviewStatus !== "rejected" && <div className="site-photo-review-decisions" role="group" aria-label="Photo review decision">
          <label className={`photo-decision-check${!reject ? " checked" : ""}`}>
            <input type="checkbox" checked={!reject} disabled={saving} onChange={() => setReject(false)} />
            <span>Approve for client <small>(photo becomes visible to the client)</small></span>
          </label>
          <label className={`photo-decision-check danger${reject ? " checked" : ""}`}>
            <input type="checkbox" checked={reject} disabled={saving} onChange={() => setReject(true)} />
            <span>Reject as unrelated <small>(returned to the Site PM)</small></span>
          </label>
        </div>}
        <Button disabled={saving} onClick={() => setSelected(undefined)}>Close</Button>
        {canReview && !selected.clientVisible && selected.photoReviewStatus !== "rejected" && <Button variant="primary" disabled={saving || (reject && !note.trim())} onClick={() => void submitDecision()}>
          {saving ? "Saving…" : reject ? "Confirm rejection" : "Confirm approval"}
        </Button>}
      </div>
    </Modal>}
  </>
}

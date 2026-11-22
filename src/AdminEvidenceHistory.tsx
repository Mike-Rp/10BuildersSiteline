import { useEffect, useState } from "react"
import { api, registerFileUrl } from "./api/client"
import type { Doc } from "./model"
import { Badge, Button } from "./ui"

type EvidenceFile = { id: string; original_name: string | null; content_type: string | null }
type EvidenceSubmission = {
  evidence_id: string | number
  title: string
  stage_code: string
  status: string
  submitted_by_name?: string
  submitted_at: string
  submission_note?: string
  reviewed_by_name?: string
  reviewed_at?: string
  review_note?: string
  file_id?: string
  original_name: EvidenceFile["original_name"]
  content_type: EvidenceFile["content_type"]
  files: EvidenceFile[]
}

export default function AdminEvidenceHistory({ projectId, onPreview }: {
  projectId: string
  onPreview: (doc: Doc) => void
}) {
  const [open, setOpen] = useState(false)
  const [submissions, setSubmissions] = useState<EvidenceSubmission[]>()
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    setSubmissions(undefined)
    setError("")
    api<EvidenceSubmission[]>(`/projects/${projectId}/evidence-history`)
      .then(rows => { if (active) setSubmissions(rows.slice().reverse()) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [open, projectId])

  function previewAttachment(submission: EvidenceSubmission, file: EvidenceFile) {
    registerFileUrl(file.id, `/projects/${projectId}/phase-files/${file.id}`)
    onPreview({
      id: file.id,
      name: file.original_name || "Checklist evidence",
      label: submission.title,
      owner: submission.submitted_by_name || "Site PM",
      date: submission.submitted_at,
      mime: file.content_type || undefined,
      uploaded: true,
      clientVisible: false,
    })
  }

  return (
    <section className="detail-section">
      <details className="opm-progress-history" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary><span>Phase evidence history</span><small>Read only</small></summary>
        {error && <p role="alert">Unable to load phase evidence history. {error}</p>}
        {!submissions && !error && <p role="status">Loading phase evidence…</p>}
        {submissions?.length === 0 && <p className="role-muted">No phase evidence has been submitted.</p>}
        {submissions?.map(submission => {
          const files = submission.files.length > 0 ? submission.files : submission.file_id
            ? [{ id: submission.file_id, original_name: submission.original_name, content_type: submission.content_type }]
            : []
          const status = submission.status === "pending" ? "Awaiting Office PM review"
            : submission.status === "rejected" ? "Returned for correction" : "Approved"
          return <section key={submission.evidence_id} className="detail-section">
            <div className="section-title"><h3>{submission.title}</h3><Badge tone={submission.status === "approved" ? "green" : "amber"}>{status}</Badge></div>
            <p>{submission.stage_code} · {submission.submitted_by_name || "Site PM"} · {new Date(submission.submitted_at).toLocaleString()}</p>
            {submission.submission_note && <p>{submission.submission_note}</p>}
            {submission.reviewed_at && <p>Reviewed by {submission.reviewed_by_name || "Recorded reviewer"} · {new Date(submission.reviewed_at).toLocaleString()}</p>}
            {submission.review_note && <p>{submission.review_note}</p>}
            {files.length > 0 && <div className="attachment-actions">{files.map(file =>
              <Button key={file.id} icon="doc" onClick={() => previewAttachment(submission, file)}>View {file.original_name || "attachment"}</Button>
            )}</div>}
          </section>
        })}
      </details>
    </section>
  )
}

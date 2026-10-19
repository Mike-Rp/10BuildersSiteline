import { useEffect, useState } from "react"
import { Badge, Button, Field, Icon, Modal } from "./ui"
import { fileFor } from "./panels"
import { dateLabel, type Account, type Doc, type Project } from "./model"
import {
  clientSubconAgreement,
  clientSubconReview,
  openClientSubconIssue,
  type WorkflowCommand,
} from "./workflows"

function stamp(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : ""
}

async function pageCount(blob: Blob) {
  const text = await blob.text()
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
  const pages = text.match(/\/Type\s*\/Page(?![s\w])/g)?.length || 0
  return Math.max(1, pages, ...counts)
}

function AgreementViewer({ doc }: { doc: Doc }) {
  const [url, setUrl] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const isImage = /\.(png|jpe?g)$/i.test(doc.name)
  useEffect(() => {
    let cancelled = false
    let objectUrl = ""
    fileFor(doc.id)
      .then(async (file) => {
        if (cancelled) return
        if (file) {
          objectUrl = URL.createObjectURL(file)
          setUrl(objectUrl)
          if (!isImage) setPages(await pageCount(file))
        }
        setLoaded(true)
      })
      .catch(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc.id, isImage])
  const go = (n: number) => setPage(Math.min(pages, Math.max(1, n)))
  return (
    <div className="agreement-viewer">
      <div className="agreement-toolbar">
        <strong>
          <Icon name="doc" size={17} /> {doc.name}
        </strong>
        {!isImage && url && (
          <div className="page-nav" aria-label="Page navigation">
            <Button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => go(page - 1)}
            >
              Previous
            </Button>
            <label>
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={pages}
                value={page}
                aria-label="Page number"
                onChange={(e) => go(Number(e.target.value) || 1)}
              />
              <span>of {pages}</span>
            </label>
            <Button
              aria-label="Next page"
              disabled={page >= pages}
              onClick={() => go(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
      <div className="agreement-frame">
        {url ? (
          isImage ? (
            <img src={url} alt="Client and subcontractor agreement" />
          ) : (
            <iframe
              key={page}
              title="Client–Subcontractor Agreement PDF"
              src={`${url}#page=${page}&toolbar=0&navpanes=0&view=FitH`}
            />
          )
        ) : (
          <div className="sample-record">
            <Icon name="doc" size={40} />
            <h3>{loaded ? "Agreement record" : "Loading agreement…"}</h3>
            <p>
              {loaded
                ? "This record has no attached original file. Agreements uploaded by Admin display as a scrollable PDF."
                : "Preparing the document preview."}
            </p>
          </div>
        )}
      </div>
      <small className="role-muted">
        Read-only view. You cannot modify, replace or download this
        agreement.
      </small>
    </div>
  )
}

export function AgreementPreviewModal({
  project,
  actor,
  onAction,
  onClose,
}: {
  project: Project
  actor: Account
  onAction: (command: WorkflowCommand, message?: string) => boolean | Promise<boolean>
  onClose: () => void
}) {
  const [reviewed, setReviewed] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [issue, setIssue] = useState("")
  const [error, setError] = useState("")
  const doc = clientSubconAgreement(project)
  const review = clientSubconReview(project)
  const open = openClientSubconIssue(project)
  const acknowledged = !!review.acknowledgedAt
  const send = async (command: WorkflowCommand, message: string) =>
    await onAction({ ...command, projectId: project.id }, message)
  return (
    <Modal
      title="Agreement Preview"
      subtitle={`${project.clientSubcon} · ${project.name}`}
      wide
      onClose={onClose}
    >
      <div className="agreement-summary">
        <div>
          <small>Subcontractor company</small>
          <strong>{project.clientSubcon}</strong>
        </div>
        <div>
          <small>Company email</small>
          <strong className="wrap-anywhere">
            {project.clientSubconEmail || "Not on file"}
          </strong>
        </div>
        <div>
          <small>Project</small>
          <strong>{project.name}</strong>
        </div>
        <div>
          <small>Agreement source</small>
          <Badge tone="green">Uploaded by Administrator</Badge>
          {doc && <span>{dateLabel(doc.date)}</span>}
        </div>
        <div>
          <small>Assignment status</small>
          <Badge tone={acknowledged ? "green" : open ? "red" : "amber"}>
            {acknowledged
              ? "Acknowledged · Locked"
              : open
                ? "On hold · Issue open"
                : "Assigned by Admin · Locked"}
          </Badge>
        </div>
      </div>
      {doc ? (
        <AgreementViewer doc={doc} />
      ) : (
        <div className="role-error">
          <Icon name="alert" />
          <span>
            The Admin-uploaded agreement is missing. Report this to Admin.
          </span>
        </div>
      )}
      <section
        className="agreement-review"
        aria-label="Review and acknowledgment"
      >
        {acknowledged ? (
          <div className="acknowledged-banner" role="status">
            <Icon name="shield" />
            <div>
              <strong>Assignment Acknowledged — Locked</strong>
              <p>
                Reviewed by {review.acknowledgedBy} on{" "}
                {stamp(review.acknowledgedAt)}. This confirms your review, not
                independent subcontractor acceptance.
              </p>
            </div>
          </div>
        ) : (
          <>
            {open && (
              <div className="role-error" role="status">
                <Icon name="clock" />
                <span>
                  Acknowledgment is on hold. Your issue was sent to Admin on{" "}
                  {stamp(open.at)}: “{open.text}”
                </span>
              </div>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={!!open}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I have reviewed the assigned subcontractor details and agreement.
            </label>
            <p className="role-muted">
              Acknowledgment confirms {actor.name}’s review only. The company
              and agreement stay locked as assigned by Admin.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                icon="alert"
                disabled={!!open}
                onClick={() => {
                  setReporting((v) => !v)
                  setError("")
                }}
              >
                Report Issue
              </Button>
              <Button
                variant="primary"
                icon="check"
                disabled={!reviewed || !!open || !doc}
                onClick={async () => {
                  if (
                    await send(
                      { type: "acknowledge_client_subcon" },
                      "Assignment acknowledged and locked.",
                    )
                  )
                    setError("")
                  else
                    setError(
                      "Acknowledgment was not recorded. Check for an open issue or an existing acknowledgment.",
                    )
                }}
              >
                Confirm Assigned Subcontractor
              </Button>
            </div>
            {reporting && !open && (
              <div className="issue-form">
                <Field
                  label="Describe the issue"
                  hint="Incorrect company details or agreement discrepancy. Admin is notified and acknowledgment is held."
                >
                  <textarea
                    rows={4}
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                  />
                </Field>
                <div className="modal-actions">
                  <Button onClick={() => setReporting(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      if (
                        await send(
                          { type: "report_client_subcon_issue", note: issue },
                          "Issue sent to Admin. Acknowledgment is on hold.",
                        )
                      ) {
                        setIssue("")
                        setReporting(false)
                        setReviewed(false)
                        setError("")
                      } else
                        setError(
                          "Describe the issue in at least 10 characters before sending it to Admin.",
                        )
                    }}
                  >
                    Send to Admin
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </Modal>
  )
}

export function ClientSubconAdminCard({
  project,
  onResolve,
  onPreview,
}: {
  project: Project
  onResolve: (issueId: string, resolution: string) => Promise<string | undefined>
  onPreview: (doc: Doc) => void
}) {
  const [resolution, setResolution] = useState("")
  const [error, setError] = useState("")
  const review = clientSubconReview(project)
  const open = openClientSubconIssue(project)
  const doc = clientSubconAgreement(project)
  if (!project.clientSubcon) return null
  return (
    <section className="detail-section client-subcon-admin">
      <div className="section-title">
        <h3>Client-provided subcontractor</h3>
        <Badge tone={review.acknowledgedAt ? "green" : open ? "red" : "amber"}>
          {review.acknowledgedAt
            ? "Acknowledged · Locked"
            : open
              ? "Issue open · On hold"
              : "Awaiting Lead review"}
        </Badge>
      </div>
      <p className="section-description">
        {project.clientSubcon} ·{" "}
        {project.clientSubconEmail || "No email on file"}
      </p>
      {review.acknowledgedAt && (
        <p>
          Reviewed by {review.acknowledgedBy} on {stamp(review.acknowledgedAt)}.
          Review only, not subcontractor acceptance.
        </p>
      )}
      {doc && (
        <Button icon="doc" onClick={() => onPreview(doc)}>
          View agreement
        </Button>
      )}
      {review.issues.map((i) => (
        <div
          key={i.id}
          className={i.status === "open" ? "role-error" : "notice"}
        >
          <Icon name={i.status === "open" ? "alert" : "check"} />
          <p>
            <strong>
              {i.status === "open" ? "Open issue" : "Resolved issue"} · {i.by} ·{" "}
              {stamp(i.at)}
            </strong>
            <br />
            {i.text}
            {i.resolution && (
              <>
                <br />
                Resolution ({i.resolvedBy}, {stamp(i.resolvedAt)}):{" "}
                {i.resolution}
              </>
            )}
          </p>
        </div>
      ))}
      {open && (
        <div className="issue-form">
          <Field label="Resolution note">
            <textarea
              rows={3}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            onClick={async () => {
              const result = await onResolve(open.id, resolution)
              if (result) setError(result)
              else {
                setError("")
                setResolution("")
              }
            }}
          >
            Resolve issue
          </Button>
        </div>
      )}
    </section>
  )
}

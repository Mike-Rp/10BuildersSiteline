import { useMemo, useRef, useState } from "react"
import { Button, Field, Icon, Modal } from "./ui"
import { createReportRejecter, validateRejectReason } from "./reportReject"

type Result = { ok: boolean; error?: string }

/** Two steps: write the reason, then confirm. Duplicate clicks send one request. */
export default function ReportRejectDialog({
  projectName,
  onReject,
  onStale,
  onClose,
  onDone,
}: {
  projectName: string
  onReject: (reason: string) => Promise<Result>
  onStale: () => void
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [resolved, setResolved] = useState(false)
  // One guard for the life of the dialog, always calling the latest handler, so a double click sends one request.
  const latest = useRef(onReject)
  latest.current = onReject
  const reject = useMemo(() => createReportRejecter((text) => latest.current(text)), [])

  function next(event: React.FormEvent) {
    event.preventDefault()
    const check = validateRejectReason(reason)
    if (!check.ok) return setError(check.error)
    setError("")
    setConfirming(true)
  }
  async function confirm() {
    setBusy(true)
    const outcome = await reject(reason)
    setBusy(false)
    if (outcome.status === "done") return onDone()
    if (outcome.status === "stale") {
      setResolved(true)
      setError(outcome.message)
      return onStale()
    }
    setError(outcome.message)
    if (outcome.status === "invalid") setConfirming(false)
  }

  return (
    <Modal title="Reject progress report" subtitle={projectName} onClose={onClose}>
      {!confirming ? (
        <form className="form-grid" onSubmit={next}>
          <Field label="Reason for rejecting (the Site PM will see it) *" wide>
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && (
            <p className="error wide" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions wide">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </div>
        </form>
      ) : (
        <div className="form-grid">
          <div className="notice wide">
            <Icon name="alert" />
            <p>
              Reject this progress report? The Site PM is told why and can submit a new report. Rejecting a report does not
              change checklist activities, approvals or progress, and does not start another phase.
            </p>
          </div>
          <p className="wide">
            <strong>Your reason:</strong> {reason.trim()}
          </p>
          {error && (
            <p className="error wide" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions wide">
            {resolved ? (
              <Button variant="primary" onClick={onClose}>
                Close
              </Button>
            ) : (
              <>
                <Button disabled={busy} onClick={() => setConfirming(false)}>
                  Back
                </Button>
                <Button variant="danger-ghost" disabled={busy} onClick={confirm}>
                  {busy ? "Rejecting…" : "Reject report"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

import { useEffect, useState } from "react"
import "./manpower-import.css"
import { Badge, Button } from "./ui"
import { dateLabel } from "./model"
import { rejectionIssues } from "./manpower-ui"
import {
  approveManpowerSubmission, getManpowerSubmission, listManpowerSubmissions, rejectManpowerSubmission, withdrawManpowerSubmission,
  type ManpowerSubmission, type SubmissionStatus,
} from "./api/manpower"

const REVIEW_ROWS = 200
const TONE: Record<SubmissionStatus, string> = { pending: "amber", approved: "green", rejected: "red", withdrawn: "" }
const LABEL: Record<SubmissionStatus, string> = {
  pending: "Waiting for Admin approval", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn",
}
const counts = (s: { new_count: number; existing_count: number }) =>
  `${s.new_count} new, ${s.existing_count} existing`
const nameOf = (w: { first_name: string; middle_name: string; last_name: string; suffix: string }) =>
  [w.first_name, w.middle_name, w.last_name, w.suffix].filter(Boolean).join(" ")

// Lists a company's submitted manpower lists. An Admin can review, approve or reject the one that is waiting;
// the Site PM who sent it can withdraw it. Approving is what creates the workers and their ID numbers.
export default function ManpowerApprovals({
  companyId,
  role,
  userId,
  refreshKey = 0,
  onChanged,
}: {
  companyId: string
  role: "admin" | "spm"
  userId?: string
  refreshKey?: number
  onChanged?: () => void
}) {
  const [list, setList] = useState<ManpowerSubmission[]>()
  const [failed, setFailed] = useState("")
  const [version, setVersion] = useState(0)
  const [detail, setDetail] = useState<ManpowerSubmission>()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; issues: { row: number; message: string }[] }>()

  useEffect(() => {
    let cancelled = false
    listManpowerSubmissions(companyId)
      .then((rows) => { if (!cancelled) { setList(rows); setFailed("") } })
      .catch((error: Error) => { if (!cancelled) setFailed(error.message) })
    return () => { cancelled = true }
  }, [companyId, refreshKey, version])

  const changed = () => { setVersion((n) => n + 1); setDetail(undefined); setRejecting(false); setReason(""); setProblem(undefined); onChanged?.() }
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setProblem(undefined)
    try { await action(); changed() }
    catch (error) { setProblem(rejectionIssues(error)) }
    finally { setBusy(false) }
  }
  async function review(id: string) {
    setProblem(undefined); setRejecting(false); setReason("")
    try { setDetail(await getManpowerSubmission(id)) }
    catch (error) { setProblem(rejectionIssues(error)) }
  }

  if (failed) return <p role="alert" className="error">{failed}</p>
  if (!list || list.length === 0) return null
  const pending = list.filter((s) => s.status === "pending")
  const decided = list.filter((s) => s.status !== "pending")
  return (
    <section className="manpower-approvals" aria-label="Submitted manpower lists">
      {pending.map((s) => (
        <div className="manpower-pending" key={s.id}>
          <div className="manpower-pending-head">
            <div>
              <strong>{s.file_name || "Manpower list"}</strong>
              <p className="manpower-hint">
                Submitted by {s.submitted_by_name} on {dateLabel(s.created_at)} · {counts(s)}
              </p>
            </div>
            <Badge tone={TONE.pending}>{LABEL.pending}</Badge>
          </div>
          {role === "spm" && (
            <p className="manpower-hint">
              An Admin has to approve this list before the workers are added. New workers get their ID numbers when it is approved.
            </p>
          )}
          {role === "spm" && s.submitted_by === userId && (
            <div className="manpower-actions">
              <Button disabled={busy} onClick={() => run(() => withdrawManpowerSubmission(s.id))}>Withdraw list</Button>
            </div>
          )}
          {role === "admin" && detail?.id !== s.id && (
            <div className="manpower-actions">
              <Button variant="primary" onClick={() => review(s.id)}>Review list</Button>
            </div>
          )}
          {role === "admin" && detail?.id === s.id && (
            <div className="manpower-review">
              <div className="table-scroll">
                <table aria-label="Workers in the submitted list">
                  <thead>
                    <tr><th>ROW</th><th>ID NUMBER</th><th>NAME</th></tr>
                  </thead>
                  <tbody>
                    {(detail.payload ?? []).slice(0, REVIEW_ROWS).map((w, index) => (
                      <tr key={w.row + ":" + index}>
                        <td>{w.row}</td>
                        <td>{w.id_number ? <code>{w.id_number}</code> : <em>New. Assigned on approval</em>}</td>
                        <td>{nameOf(w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(detail.payload?.length ?? 0) > REVIEW_ROWS && (
                <p className="manpower-more">Showing the first {REVIEW_ROWS} of {detail.payload?.length} workers.</p>
              )}
              {rejecting && (
                <label className="manpower-reason">
                  <span>Reason for rejecting (the Site PM will see it)</span>
                  <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
                </label>
              )}
              <div className="manpower-actions">
                <Button disabled={busy} onClick={() => { setDetail(undefined); setRejecting(false); setProblem(undefined) }}>Close</Button>
                {!rejecting ? (
                  <Button variant="danger-ghost" disabled={busy} onClick={() => setRejecting(true)}>Reject…</Button>
                ) : (
                  <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => run(() => rejectManpowerSubmission(s.id, reason.trim()))}>
                    Confirm rejection
                  </Button>
                )}
                {!rejecting && (
                  <Button variant="primary" disabled={busy} onClick={() => run(() => approveManpowerSubmission(s.id))}>
                    {busy ? "Approving…" : `Approve and add ${s.new_count} new ${s.new_count === 1 ? "worker" : "workers"}`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      {problem && (
        <div role="alert" className="manpower-problems">
          <strong>{problem.issues.length ? "This list can't be approved as it stands. Nothing was changed." : problem.message}</strong>
          {problem.issues.length > 0 && (
            <div className="table-scroll">
              <table aria-label="Problems with the submitted list">
                <thead><tr><th>ROW</th><th>PROBLEM</th></tr></thead>
                <tbody>{problem.issues.slice(0, 20).map((i, n) => <tr key={i.row + ":" + n}><td>{i.row}</td><td>{i.message}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {decided.length > 0 && (
        <details className="manpower-history">
          <summary>Earlier lists ({decided.length})</summary>
          <div className="table-scroll">
            <table aria-label="Earlier manpower lists">
              <thead>
                <tr><th>SUBMITTED</th><th>FILE</th><th>BY</th><th>RESULT</th></tr>
              </thead>
              <tbody>
                {decided.map((s) => (
                  <tr key={s.id}>
                    <td>{dateLabel(s.created_at)}</td>
                    <td>{s.file_name || "—"}</td>
                    <td>{s.submitted_by_name}</td>
                    <td>
                      <Badge tone={TONE[s.status]}>{LABEL[s.status]}</Badge>
                      {s.status === "approved" && s.result && (
                        <p className="manpower-hint">{s.result.created.length} new, {s.result.updated} updated, {s.result.unchanged} unchanged</p>
                      )}
                      {s.status === "rejected" && s.decision_note && <p className="manpower-hint">{s.decision_note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}

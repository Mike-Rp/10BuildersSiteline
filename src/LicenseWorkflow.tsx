import { licenseAccessPolicy } from "../Thesis-Backend/src/domain/license-access.js"
// Expired-license workflow screens. All rules (who is paused, when an override opens, who may be suggested) are
// enforced by the backend; these components only show the state and send the requests.
import { useEffect, useState, type ReactNode } from "react"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import { dateLabel, daysUntil, licenseExpiresDuringProject } from "./model"
import { LICENSE_PAUSED_MESSAGE } from "./workflows"
import * as licenses from "./api/licenses"
import type {
  HistoryRow,
  LicenseSelf,
  OverrideOptions,
  OverviewItem,
  ReassignRequest,
  RenewalQueueItem,
  WorkRecordRow,
} from "./licenseTypes"

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Try again.")
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const appointmentNote = (note: string) => {
  try {
    const audit = JSON.parse(note)
    if (audit.appointmentSigned) return `Office appointment signed ${dateLabel(audit.signedOn)} · confirmed by Admin`
  } catch { /* Historical free-text response. */ }
  return note
}

/** Warning shown while assigning: the engineer's license ends before the project does. Never blocks. */
export function LicenseAssignmentWarning({ expiry, projectEnd }: { expiry?: string; projectEnd?: string }) {
  if (!expiry || !licenseExpiresDuringProject(expiry, projectEnd)) return null
  return (
    <p className="license-warning" role="note">
      <Icon name="alert" size={16} />
      <span>
        {daysUntil(expiry) < 0
          ? `License expired on ${dateLabel(expiry)}.`
          : `License expires on ${dateLabel(expiry)}, during this project.`}
      </span>
    </p>
  )
}

/** The engineer's own banner: reminders and directions to the Administrator who updates the license. */
export function LicenseBanner({ license }: { license?: LicenseSelf }) {
  if (!license || license.status === "missing" || !license.expiry) return null
  const renewal = license.renewal
  const rejected = renewal?.status === "rejected" && license.base !== "valid"
  const expiry = dateLabel(license.expiry)
  let tone = "amber"
  let icon = "clock"
  let title = ""
  let detail: ReactNode = null
  const policy = licenseAccessPolicy(license.expiry)
  if (policy.mode === "view_only" && license.status !== "renewal_under_review") {
    title = "License expired · viewing-only access"
    detail = "Submissions, approvals and project changes are disabled until your renewed license is verified. You can still view your records and submit your renewal. Your past work stays on record."
  } else if (policy.prepareReplacement) {
    title = "Replacement preparation notice"
    detail = "New assignments are blocked and the Admin is preparing a replacement. Submit your renewed license for verification before " + expiry + " to stay eligible."
  } else if (license.status === "renewal_under_review") {
    title = "Renewal under review"
    detail = "An Administrator is verifying your renewed license."
  } else if (license.status === "expiring_soon") {
    title = "Your license expires in " + plural(daysUntil(license.expiry), "day")
    detail = "PRC license valid until " + expiry + "."
  } else return null
  return (
    <section className={`license-banner ${tone}`} role="status" aria-label="License status">
      <span className="license-banner-icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {license.status !== "renewal_under_review" && <RenewalSubmit />}
        {rejected && renewal && (
          <p className="license-reason">
            <strong>Your last renewal was not accepted:</strong> {renewal.reviewNote}
          </p>
        )}
      </div>
    </section>
  )
}

/** The engineer submits their renewed license; an Administrator still verifies it. */
function RenewalSubmit() {
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [file, setFile] = useState<File>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!file) return setError("Choose the renewed license file (PDF, JPG or PNG).")
    setBusy(true)
    try {
      await licenses.submitOwnRenewal({ licenseNumber: number, licenseExpiry: expiry, file })
      window.location.reload()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }
  if (!open) return <Button onClick={() => setOpen(true)}>Submit renewed license</Button>
  return (
    <div className="license-renewal-form">
      <Field label="License number"><input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
      <Field label="New expiry date"><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
      <Field label="Renewed license file"><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0])} /></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <Button onClick={send} disabled={busy}>{busy ? "Submitting…" : "Send for verification"}</Button>
    </div>
  )
}

/** Administrator: renewals waiting for verification. */
export function RenewalQueue({
  renewals,
  onChanged,
}: {
  renewals: RenewalQueueItem[]
  onChanged: () => void
}) {
  const [rejecting, setRejecting] = useState<RenewalQueueItem>()
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    try {
      await task()
      setError("")
      setRejecting(undefined)
      setReason("")
      onChanged()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }
  if (!renewals.length) return <Empty title="No renewals to review">Uploaded licenses appear here for verification.</Empty>
  return (
    <div className="license-list">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {renewals.map((r) => (
        <div className="license-row" key={r.id}>
          <div>
            <strong>{r.full_name}</strong>
            <small>
              {r.role === "opm" ? "Office PM" : "Site PM"} · license {r.license_number} · new expiry {dateLabel(r.license_expiry)}
            </small>
            <small>Uploaded {dateLabel(r.submitted_at)}</small>
          </div>
          <Badge tone="amber">Renewal under review</Badge>
          <div className="license-actions">
            <Button
              icon="doc"
              onClick={() => licenses.openRenewalFile(r.id).catch((err) => setError(messageOf(err)))}
            >
              View document
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => run(() => licenses.verifyRenewal(r.id))}>
              Verify renewal
            </Button>
            <Button variant="danger-ghost" disabled={busy} onClick={() => setRejecting(r)}>
              Reject…
            </Button>
          </div>
        </div>
      ))}
      {rejecting && (
        <Modal
          title="Reject renewal"
          subtitle={`${rejecting.full_name} must visit the admin office with a corrected license for an Administrator to upload.`}
          onClose={() => setRejecting(undefined)}
        >
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason.trim()) return setError("A reason is required. The engineer will see it.")
              void run(() => licenses.rejectRenewal(rejecting.id, reason.trim()))
            }}
          >
            <Field label="Reason (shown to the engineer) *" wide>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {error && (
              <p className="error wide" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions wide">
              <Button onClick={() => setRejecting(undefined)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Reject renewal
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export type OverrideTarget = { projectId: string; stageId?: number | null }

/** Override window: current engineer, suggestions, reason and a plain summary of what happens. */
export function OverrideDialog({
  target,
  onClose,
  onDone,
}: {
  target: OverrideTarget
  onClose: () => void
  onDone: () => void
}) {
  const [options, setOptions] = useState<OverrideOptions>()
  const [picked, setPicked] = useState("")
  const [reason, setReason] = useState("")
  const [signed, setSigned] = useState(false)
  const [signedOn, setSignedOn] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    licenses
      .fetchOverrideOptions(target.projectId, target.stageId)
      .then((o) => {
        if (!live) return
        setOptions(o)
        setPicked(o.candidates[0]?.id || "")
      })
      .catch((err) => live && setError(messageOf(err)))
    return () => {
      live = false
    }
  }, [target.projectId, target.stageId])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) return setError("Choose a replacement.")
    if (!reason.trim()) return setError("A reason is required. It is visible to Administrators only.")
    if (!signed || !signedOn) return setError("Confirm the appointment was signed at the office and enter its signing date.")
    setBusy(true)
    try {
      await licenses.createOverride({ projectId: target.projectId, stageId: target.stageId, toUserId: picked, fromUserId: options!.current.id, reason: reason.trim(), appointmentSigned: signed, signedOn })
      onDone()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }
  const place = options ? (options.role === "opm" ? "Office PM role" : options.stage) : ""
  return (
    <Modal
      title="Prepare engineer replacement"
      subtitle={options ? `${options.project.name} · ${place}` : "Loading…"}
      onClose={onClose}
      wide
    >
      {!options ? (
        error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p>Loading suggestions…</p>
        )
      ) : (
        <form className="override-form" onSubmit={submit}>
          <div className="override-current">
            <span className="eyebrow">CURRENT ENGINEER</span>
            <strong>{options.current.name}</strong>
            {options.isLead && <Badge tone="amber">Lead Site PM</Badge>}
            <small>
              License expiry {options.current.expiry ? dateLabel(options.current.expiry) : ""}
              {options.current.reason ? ` · ${options.current.reason}` : ""}
            </small>
            {options.summary.required !== null && (
              <small>
                Verified progress: {options.summary.approved} of {options.summary.required} items ({options.summary.pct}%)
              </small>
            )}
          </div>
          {!options.available ? (
            <div className="notice neutral">
              <Icon name="clock" />
              <p>
                Replacement becomes available when the license has 30 days or fewer remaining.
              </p>
            </div>
          ) : (
            <>
              <fieldset className="override-candidates">
                <legend>Suggested replacements</legend>
                {options.candidates.length === 0 && (
                  <p className="license-note">
                    No engineer has a valid license, no hold and matching {options.role === "opm" ? "project types" : "disciplines"}.
                    Check Directory → Engineers.
                  </p>
                )}
                {options.candidates.map((c) => (
                  <label key={c.id} className={picked === c.id ? "selected" : ""}>
                    <input type="radio" name="replacement" checked={picked === c.id} onChange={() => setPicked(c.id)} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>Contact number: {c.phone || "Not on file"} · Email: {c.email || "Not on file"}</small>
                      {c.best && <Badge tone="green">Best match</Badge>}
                      <small>
                        {options.role === "spm" ? `${c.matchPercent}% discipline match · ` : ""}
                        {plural(c.workload, "active assignment")}
                        {c.licenseExpiry ? ` · license valid to ${dateLabel(c.licenseExpiry)}` : ""}
                      </small>
                      {c.expiresBeforeProjectEnd && (
                        <small className="license-warning-inline">
                          <Icon name="alert" size={14} /> License expires before this project ends.
                        </small>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field label="Reason (visible to Administrators only) *" wide>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <section className="appointment-confirmation">
                <h3>Office appointment confirmation</h3>
                <p>Contact the chosen engineer and arrange signing at the office. Confirm only after the appointment is signed.</p>
                <label><input type="checkbox" checked={signed} onChange={e => setSigned(e.target.checked)} /> I confirm the project-specific appointment was signed at the office.</label>
                <Field label="Actual signing date"><input type="date" value={signedOn} max={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())} onChange={e => setSignedOn(e.target.value)} required /></Field>
              </section>
              <div className="notice neutral what-happens">
                <Icon name="shield" />
                <div>
                  <strong>What happens</strong>
                  <ul>
                    <li>Past approvals stay valid.</li>
                    <li>Pending activities move to the replacement when you approve the switch.</li>
                    <li>Your approval confirms office signing and switches the assignment immediately. No in-system acceptance is needed.</li>
                    {options.isLead && <li>The Lead Site PM designation moves with this phase.</li>}
                    <li>The original engineer stays on record.</li>
                    <li>The client is not notified.</li>
                  </ul>
                </div>
              </div>
            </>
          )}
          {options.previous.length > 0 && (
            <section className="override-previous">
              <strong>Earlier requests (visible to Administrators only)</strong>
              {options.previous.map((p) => (
                <p key={p.id}>
                  {p.to_name} · {p.status.replace(/_/g, " ")} · {dateLabel(p.requested_at.slice(0, 10))}
                  <small>Reason: {p.reason}</small>
                  {p.response_note && <small>{appointmentNote(p.response_note)}</small>}
                </p>
              ))}
            </section>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={onClose}>{options.available ? "Cancel" : "Close"}</Button>
            {options.available && (
              <Button type="submit" variant="primary" disabled={busy || !options.candidates.length || !signed || !signedOn}>
                Approve & switch engineer
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Replacement engineer: reassignment requests waiting for an answer. */
export function ReassignRequests({
  requests,
  onChanged,
  onError,
}: {
  requests: ReassignRequest[]
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState<number>()
  if (!requests.length) return null
  async function answer(id: number, accept: boolean) {
    setBusy(id)
    try {
      if (accept) await licenses.acceptRequest(id)
      else await licenses.declineRequest(id, "")
      onChanged()
    } catch (err) {
      onError(messageOf(err))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <section className="reassign-requests" aria-label="Reassignment requests">
      {requests.map((r) => (
        <article className="reassign-card" key={r.id}>
          <header>
            <Icon name="users" size={20} />
            <strong>{r.title}</strong>
            <Badge tone="amber">Waiting for you</Badge>
          </header>
          <p>
            <strong>{r.projectName}</strong> · {r.role === "opm" ? "Office PM role" : r.stage}
          </p>
          {r.summary.required !== null && (
            <p>
              Verified progress: {r.summary.approved} of {r.summary.required} items ({r.summary.pct}%). You will take over{" "}
              {plural(r.summary.pendingEvidence + r.summary.pendingUpdates, "item")} still waiting for review.
            </p>
          )}
          <p className="license-note">Reason: {r.reason}</p>
          {r.responseDeadlineAt && <small>Please respond by {dateLabel(r.responseDeadlineAt)}.</small>}
          <div className="reassign-actions">
            <Button variant="primary" disabled={busy === r.id} onClick={() => answer(r.id, true)}>
              Accept
            </Button>
            <Button disabled={busy === r.id} onClick={() => answer(r.id, false)}>
              Decline
            </Button>
          </div>
        </article>
      ))}
    </section>
  )
}

const rangeLabel = (row: { started_at: string; ended_at: string | null }) =>
  `${dateLabel(row.started_at.slice(0, 10))}${row.ended_at ? ` – ${dateLabel(row.ended_at.slice(0, 10))}` : " – present"}`

/** Who held each phase (and the Office PM role) with dates. Never shows reasons. */
export function EngineerHistory({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<HistoryRow[]>()
  useEffect(() => {
    let live = true
    licenses
      .fetchHistory(projectId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [projectId])
  if (!rows || !rows.some((r) => r.kind === "took_over" || r.ended_at)) return null
  const groups = new Map<string, HistoryRow[]>()
  for (const row of rows) {
    const key = row.role === "opm" ? "Office PM role" : row.stage || "Phase"
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const changed = [...groups.entries()].filter(([, list]) => list.length > 1)
  if (!changed.length) return null
  return (
    <section className="detail-section engineer-history">
      <h3>Engineer history</h3>
      {changed.map(([place, list]) => (
        <div className="history-block" key={place}>
          <strong>{place}</strong>
          {list.map((row) => (
            <p key={row.id}>
              <span>{row.name}</span>
              <Badge tone={row.completed_at ? "green" : row.kind === "took_over" ? "amber" : ""}>{row.label}</Badge>
              <small>{rangeLabel(row)}</small>
            </p>
          ))}
        </div>
      ))}
    </section>
  )
}

/** Engineer profile: completed, took over and contributed work. */
export function WorkRecord({ userId }: { userId: string }) {
  const [rows, setRows] = useState<WorkRecordRow[]>()
  useEffect(() => {
    let live = true
    licenses
      .fetchWorkRecord(userId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [userId])
  if (!rows?.length) return null
  return (
    <section className="detail-section work-record">
      <h3>Work record</h3>
      {rows.map((row) => (
        <p key={row.id}>
          <span>
            <strong>{row.project_name}</strong> · {row.role === "opm" ? "Office PM role" : row.stage}
          </span>
          <Badge tone={row.completed_at ? "green" : row.ended_at ? "" : "amber"}>{row.label}</Badge>
        </p>
      ))}
    </section>
  )
}

/** Active Sites → project → Phase assignments: a flagged phase with the override entry point. */
export function PhaseLicenseFlag({
  item,
  assignment,
  onOverride,
}: {
  item: OverviewItem
  assignment: OverviewItem["assignments"][number]
  onOverride: (target: OverrideTarget) => void
}) {
  const expired = item.expiry ? dateLabel(item.expiry) : ""
  return (
    <div className="phase-flag" role="note">
      <Icon name="alert" size={16} />
      <span>
        License expiry {expired} ·{" "}
        {item.daysToExpiry !== null && item.daysToExpiry <= 30 ? "Replacement overdue; new assignments disabled" : "Prepare replacement before the 30-day notice"}
      </span>
      {item.daysToExpiry !== null && item.daysToExpiry <= 30 ? (
        assignment.pendingOverrideId ? (
          <Badge tone="amber">Waiting for replacement</Badge>
        ) : (
          <Button onClick={() => onOverride({ projectId: assignment.projectId, stageId: assignment.stageId })}>Prepare replacement</Button>
        )
      ) : (
        <small>Replacement preparation opens 30 days before license expiry.</small>
      )}
    </div>
  )
}

/** Directory → Engineers → profile: license countdown, active assignments and the override entry point. */
export function LicenseProfileBlock({
  item,
  reviewing,
  onOverride,
  onReview,
}: {
  item?: OverviewItem
  reviewing: boolean
  onOverride: (target: OverrideTarget) => void
  onReview: () => void
}) {
  if (!item) return null
  return (
    <div className="license-profile">
      {item.daysToExpiry !== null && item.daysToExpiry <= 30 && (
        <p className="license-warning">
          <Icon name="alert" size={16} />
          <span>
            {item.daysToExpiry !== null && item.daysToExpiry < 0 ? "License expired. Replace this engineer or verify their renewed license." : "New assignments are blocked. Contact a replacement, confirm office signing, or verify the renewed license."}
          </span>
        </p>
      )}
      {item.expiry && <p className="license-note">License expiry: {dateLabel(item.expiry)} · New assignments blocked from: {dateLabel(licenseAccessPolicy(item.expiry).noticeOn || "")} · Viewing-only from: {dateLabel(licenseAccessPolicy(item.expiry).restrictedOn || "")}</p>}
      {reviewing && (
        <p className="license-warning">
          <Icon name="shield" size={16} />
          <span>Renewal under review.</span>
          <Button onClick={onReview}>Review renewals</Button>
        </p>
      )}
      {item.assignments.length > 0 && (
        <div className="license-assignments">
          <strong>Active assignments</strong>
          {item.assignments.map((a) => (
            <span key={`${a.projectId}-${a.stageId ?? "opm"}`}>
              {a.projectName} · {a.role === "opm" ? "Office PM" : a.stage}
              {a.isLead ? " (Lead Site PM)" : ""}
              {a.pendingOverrideId ? (
                <Badge tone="amber">Waiting for replacement</Badge>
              ) : (
                item.daysToExpiry !== null && item.daysToExpiry <= 30 && (
                  <Button onClick={() => onOverride({ projectId: a.projectId, stageId: a.stageId })}>Replace engineer</Button>
                )
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

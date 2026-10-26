import { useState, type FormEvent } from "react"
import { Badge, Button, Empty, Field, Modal } from "./ui"
import { dateLabel } from "./model"
import { useExtensionDemo } from "./ExtensionDemoContext"
import {
  canSeeProject,
  DEMO_ACCOUNTS,
  isOpenRequest,
  progressLabel,
  reportErrors,
  schedulePerformance,
  type DemoActor,
  type DemoProject,
  type Evidence,
  type ExtensionCommand,
  type ExtensionRequest,
  type Report,
  type RequestStatus,
} from "./extension-demo"
import "./extension-demo.css"

function RequestBadge({ status }: { status: RequestStatus | string }) {
  return (
    <Badge
      tone={
        status === "Approved" || status === "On Schedule"
          ? "green"
          : status === "Rejected" || status === "Delayed"
            ? "red"
            : "amber"
      }
    >
      {status}
    </Badge>
  )
}
function EvidenceList({
  files,
  onRemove,
}: {
  files: Evidence[]
  onRemove?: (id: string) => void
}) {
  return (
    <div className="extension-evidence">
      <p>
        Demo attachments: filenames and metadata only. Files are not uploaded to
        a server; file contents are not retained.
      </p>
      {files.length ? (
        <ul>
          {files.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {f.type || "Unknown file type"} · {f.size.toLocaleString()}{" "}
                  bytes
                </small>
              </span>
              {onRemove && (
                <Button
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemove(f.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No supporting evidence attached.</p>
      )}
    </div>
  )
}
function DeadlineHistory({ project }: { project: DemoProject }) {
  return (
    <details className="extension-history">
      <summary>
        Deadline history · {project.deadlines.length} approved extension
        {project.deadlines.length === 1 ? "" : "s"}
      </summary>
      <ol>
        <li>
          <strong>Original ETC: {dateLabel(project.original)}</strong>
          <p>Preserved original estimate</p>
        </li>
        {project.deadlines.map((d, i) => (
          <li key={d.requestId}>
            <strong>
              Extension {i + 1}: {dateLabel(d.date)}
            </strong>
            <p>
              Approved by {d.approvedBy} · {dateLabel(d.at)}
            </p>
          </li>
        ))}
      </ol>
    </details>
  )
}
function ProjectStatus({ project }: { project: DemoProject }) {
  return (
    <div className="extension-statuses">
      <span>
        Project Lifecycle: <Badge>{project.lifecycle}</Badge>
      </span>
      <span>
        Schedule Performance:{" "}
        <RequestBadge status={schedulePerformance(project)} />
      </span>
    </div>
  )
}
type Editing = {
  projectId: string
  requestId?: string
  report: Report
}
type Decision = {
  type: "endorse" | "return" | "reject" | "approve" | "withdraw"
  requestId: string
}
const decisionLabels = {
  endorse: "Endorse to Client",
  return: "Return for Revision",
  reject: "Reject Request",
  approve: "Approve Extension",
  withdraw: "Withdraw Request",
}

export default function ExtensionWorkflow({
  actor,
  projectId,
}: {
  actor: DemoActor
  projectId?: string
}) {
  const demo = useExtensionDemo()
  const [editing, setEditing] = useState<Editing>()
  const [viewId, setViewId] = useState("")
  const [decision, setDecision] = useState<Decision>()
  const [remarks, setRemarks] = useState("")
  const [error, setError] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [filter, setFilter] = useState("All")
  if (!demo) return null
  const { state, execute } = demo
  const projects = state.projects.filter(
    (p) => canSeeProject(actor, p) && (!projectId || p.id === projectId),
  )
  // Drafts are private to the assigned SPM; Clients only receive endorsed reports.
  const requests = state.requests.filter(
    (r) =>
      projects.some((p) => p.id === r.projectId) &&
      (actor.role === "spm" || r.status !== "Draft") &&
      (actor.role !== "client" ||
        r.history.some((h) => h.status === "Pending Client Approval")),
  )
  const request = requests.find((r) => r.id === viewId)
  const selectedProject = projects.find((p) => p.id === request?.projectId)
  const editProject = projects.find((p) => p.id === editing?.projectId)
  const decidingRequest = requests.find((r) => r.id === decision?.requestId)
  const decidingProject = projects.find(
    (p) => p.id === decidingRequest?.projectId,
  )
  function run(command: ExtensionCommand, success: string) {
    try {
      execute(actor, command)
      setError("")
      setMessage(success)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }
  function edit(p: DemoProject, r?: ExtensionRequest) {
    setViewId("")
    setError("")
    setErrors({})
    setMessage("")
    setEditing({
      projectId: p.id,
      requestId: r?.id,
      report: r
        ? {
            reason: r.reason,
            activities: r.activities,
            proposed: r.proposed,
            evidence: [...r.evidence],
          }
        : { reason: "", activities: "", proposed: "", evidence: [] },
    })
  }
  function save(submit: boolean, event?: FormEvent) {
    event?.preventDefault()
    if (!editing || !editProject) return
    const invalid = submit ? reportErrors(editing.report, editProject) : {}
    setErrors(invalid)
    if (Object.keys(invalid).length) {
      setError("Complete the required delay report fields.")
      return
    }
    if (
      run(
        {
          type: submit ? "submit" : "save",
          projectId: editing.projectId,
          requestId: editing.requestId,
          report: editing.report,
        },
        submit
          ? "Delay report submitted. Pending OPM Review."
          : "Draft saved in this browser.",
      )
    )
      setEditing(undefined)
  }
  function choose(type: Decision["type"], r: ExtensionRequest) {
    setError("")
    setRemarks("")
    setDecision({ type, requestId: r.id })
  }
  const actions = (r: ExtensionRequest, p: DemoProject) => (
    <div className="button-group">
      {actor.role === "spm" &&
        ["Draft", "Returned for Revision"].includes(r.status) && (
          <Button variant="primary" onClick={() => edit(p, r)}>
            {r.status === "Draft" ? "Edit Draft" : "Revise & Resubmit"}
          </Button>
        )}
      {actor.role === "spm" &&
        ["Draft", "Returned for Revision", "Pending OPM Review"].includes(
          r.status,
        ) && (
          <Button onClick={() => choose("withdraw", r)}>
            Withdraw Request
          </Button>
        )}
      {actor.role === "opm" && r.status === "Pending OPM Review" && (
        <>
          <Button variant="primary" onClick={() => choose("endorse", r)}>
            Endorse to Client
          </Button>
          <Button onClick={() => choose("return", r)}>
            Return for Revision
          </Button>
          <Button variant="danger-ghost" onClick={() => choose("reject", r)}>
            Reject Request
          </Button>
        </>
      )}
      {actor.role === "client" && r.status === "Pending Client Approval" && (
        <>
          <Button variant="primary" onClick={() => choose("approve", r)}>
            Approve Extension
          </Button>
          <Button variant="danger-ghost" onClick={() => choose("reject", r)}>
            Reject Extension
          </Button>
        </>
      )}
    </div>
  )
  return (
    <section
      className="panel extension-workflow"
      aria-label="Extension workflow demo"
    >
      <header className="panel-header">
        <div>
          <h2>
            {actor.role === "client"
              ? "Extension Approval Requests"
              : actor.role === "admin"
                ? "Delay & Extension Monitoring"
                : "Extension Requests"}
          </h2>
          <p>
            Frontend demo · isolated project records · original estimates
            preserved
          </p>
        </div>
        <Badge>DEMO ONLY</Badge>
      </header>
      {message && (
        <p className="extension-message" role="status">
          {message}
        </p>
      )}
      {error && !editing && !decision && (
        <p className="extension-error" role="alert">
          {error}
        </p>
      )}
      {actor.role === "admin" && (
        <div
          className="extension-metrics"
          aria-label="Extension monitoring totals"
        >
          {[
            [
              "Delayed projects",
              projects.filter((p) => schedulePerformance(p) === "Delayed")
                .length,
            ],
            ...[
              "Pending OPM Review",
              "Pending Client Approval",
              "Approved",
              "Rejected",
            ].map((s) => [s, requests.filter((r) => r.status === s).length]),
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="extension-projects">
        {projects.map((p) => {
          const open = state.requests.find(
            (r) => r.projectId === p.id && isOpenRequest(r),
          )
          return (
            <article className="extension-project" key={p.id}>
              <div className="extension-project-heading">
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.scenario}</p>
                </div>
                {actor.role === "spm" && !open && (
                  <Button variant="primary" icon="plus" onClick={() => edit(p)}>
                    Request Extension
                  </Button>
                )}
              </div>
              <ProjectStatus project={p} />
              <dl className="extension-facts">
                <div>
                  <dt>Original ETC</dt>
                  <dd>{dateLabel(p.original)}</dd>
                </div>
                <div>
                  <dt>Current Approved Completion Date</dt>
                  <dd>{dateLabel(p.approved)}</dd>
                </div>
                <div>
                  <dt>Current Project Progress</dt>
                  <dd>{progressLabel(p.progress)}</dd>
                </div>
              </dl>
              {open &&
                (actor.role !== "client" ||
                  requests.some((r) => r.id === open.id)) && (
                  <div className="extension-current">
                    <span>
                      Extension Request: <RequestBadge status={open.status} />
                    </span>
                    {requests.some((r) => r.id === open.id) && (
                      <Button onClick={() => setViewId(open.id)}>
                        View current request
                      </Button>
                    )}
                  </div>
                )}
              <DeadlineHistory project={p} />
            </article>
          )
        })}
      </div>
      <div className="extension-request-list">
        <Field label="Filter extension requests">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["All", ...new Set(requests.map((r) => r.status))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="extension-table-wrap">
          <table>
            <caption>Request and review history</caption>
            <thead>
              <tr>
                {[
                  "Project Name",
                  "Assigned SPM",
                  "Current Approved Completion Date",
                  "Proposed Revised Completion Date",
                  "Request Submission Date",
                  "Request Status",
                  "Details",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests
                .filter((r) => filter === "All" || r.status === filter)
                .slice()
                .reverse()
                .map((r) => {
                  const p = projects.find((p) => p.id === r.projectId)!
                  return (
                    <tr key={r.id}>
                      <td>{p.name}</td>
                      <td>
                        {DEMO_ACCOUNTS.find((a) => a.id === p.spmId)?.name}
                      </td>
                      <td>{dateLabel(p.approved)}</td>
                      <td>{r.proposed ? dateLabel(r.proposed) : "Not set"}</td>
                      <td>
                        {r.submittedAt
                          ? dateLabel(r.submittedAt)
                          : "Not submitted"}
                      </td>
                      <td>
                        <RequestBadge status={r.status} />
                      </td>
                      <td>
                        <Button
                          onClick={() => {
                            setError("")
                            setViewId(r.id)
                          }}
                        >
                          View report
                        </Button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        {!requests.some((r) => filter === "All" || r.status === filter) && (
          <Empty title="No extension requests">
            {actor.role === "client"
              ? "Requests appear here after the OPM endorses them."
              : "Reports for your assigned demo projects appear here."}
          </Empty>
        )}
      </div>
      {editing && editProject && (
        <Modal
          title="Delay Report — Request Extension"
          subtitle="Frontend demo · eight finalized fields"
          wide
          onClose={() => {
            setEditing(undefined)
            setError("")
          }}
        >
          <form
            className="extension-form"
            noValidate
            onSubmit={(e) => save(true, e)}
          >
            <Field label="Project Name">
              <input value={editProject.name} readOnly />
            </Field>
            <Field label="Estimated Time of Completion (ETC)">
              <input value={dateLabel(editProject.original)} readOnly />
            </Field>
            <Field label="Current Approved Completion Date">
              <input value={dateLabel(editProject.approved)} readOnly />
            </Field>
            <Field label="Reason for Delay" error={errors.reason}>
              <textarea
                required
                rows={4}
                value={editing.report.reason}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    report: { ...editing.report, reason: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Current Project Progress">
              <input value={progressLabel(editProject.progress)} readOnly />
            </Field>
            <Field
              label="Remaining Construction Activities"
              error={errors.activities}
            >
              <textarea
                required
                rows={4}
                value={editing.report.activities}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    report: { ...editing.report, activities: e.target.value },
                  })
                }
              />
            </Field>
            <Field
              label="Proposed Revised Completion Date"
              hint={`Must be later than ${dateLabel(editProject.approved)}.`}
              error={errors.proposed}
            >
              <input
                type="date"
                required
                min={new Date(Date.parse(editProject.approved) + 86400000)
                  .toISOString()
                  .slice(0, 10)}
                value={editing.report.proposed}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    report: { ...editing.report, proposed: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Supporting Documents / Site Evidence">
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []).map((f) => ({
                    id: crypto.randomUUID(),
                    name: f.name,
                    type: f.type || f.name.split(".").pop() || "Unknown",
                    size: f.size,
                  }))
                  setEditing({
                    ...editing,
                    report: {
                      ...editing.report,
                      evidence: [...editing.report.evidence, ...files],
                    },
                  })
                  e.target.value = ""
                }}
              />
            </Field>
            <EvidenceList
              files={editing.report.evidence}
              onRemove={(id) =>
                setEditing({
                  ...editing,
                  report: {
                    ...editing.report,
                    evidence: editing.report.evidence.filter(
                      (f) => f.id !== id,
                    ),
                  },
                })
              }
            />
            {error && (
              <p role="alert" className="extension-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                onClick={() => {
                  setEditing(undefined)
                  setError("")
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => save(false)}>Save Draft</Button>
              <Button type="submit" variant="primary">
                Submit Delay Report
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {request && selectedProject && (
        <Modal
          title={`${selectedProject.name} — Delay Report`}
          subtitle="Demo report · metadata only"
          wide
          onClose={() => setViewId("")}
        >
          <ProjectStatus project={selectedProject} />
          <p>
            Extension Request: <RequestBadge status={request.status} />
          </p>
          <dl className="extension-report">
            <div>
              <dt>Project Name</dt>
              <dd>{selectedProject.name}</dd>
            </div>
            <div>
              <dt>Estimated Time of Completion (ETC)</dt>
              <dd>{dateLabel(request.original)}</dd>
            </div>
            <div>
              <dt>Current Approved Completion Date</dt>
              <dd>
                {dateLabel(selectedProject.approved)}
                <small>At submission: {dateLabel(request.baseline)}</small>
              </dd>
            </div>
            <div>
              <dt>Reason for Delay</dt>
              <dd>{request.reason || "Draft — not provided"}</dd>
            </div>
            <div>
              <dt>Current Project Progress</dt>
              <dd>
                {progressLabel(request.progress)}
                <small>Snapshot at report submission / save</small>
              </dd>
            </div>
            <div>
              <dt>Remaining Construction Activities</dt>
              <dd>{request.activities || "Draft — not provided"}</dd>
            </div>
            <div>
              <dt>Proposed Revised Completion Date</dt>
              <dd>
                {request.proposed ? dateLabel(request.proposed) : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Supporting Documents / Site Evidence</dt>
              <dd>
                <EvidenceList files={request.evidence} />
              </dd>
            </div>
          </dl>
          <h3>OPM Endorsement and Remarks</h3>
          <p className="extension-remarks">
            {request.history
              .filter((h) => h.status === "Pending Client Approval")
              .map((h) => `${h.actor}: ${h.remarks}`)
              .join("\n") || "Not yet endorsed."}
          </p>
          <h3>Review & revision history</h3>
          <ol className="extension-review-history">
            {request.history.map((h, i) => (
              <li key={i}>
                <strong>
                  {h.status} · {h.actor}
                </strong>
                <small>
                  {new Date(h.at).toLocaleString("en-US", {
                    timeZone: "Asia/Taipei",
                  })}{" "}
                  (Taipei)
                </small>
                <p>{h.remarks}</p>
                {h.report && (
                  <details>
                    <summary>
                      Report version{" "}
                      {
                        request.history.slice(0, i + 1).filter((e) => e.report)
                          .length
                      }
                    </summary>
                    <p>{h.report.reason}</p>
                    <p>{h.report.activities}</p>
                    <p>
                      Proposed date:{" "}
                      {h.report.proposed
                        ? dateLabel(h.report.proposed)
                        : "Not set"}{" "}
                      · {progressLabel(h.report.progress)}
                    </p>
                    <EvidenceList files={h.report.evidence} />
                  </details>
                )}
              </li>
            ))}
          </ol>
          <DeadlineHistory project={selectedProject} />
          {actor.role === "admin" && (
            <p className="extension-remarks">
              Read-only monitoring. The assigned Client makes the final
              decision.
            </p>
          )}
          <div className="modal-actions">
            {actions(request, selectedProject)}
            <Button onClick={() => setViewId("")}>Close</Button>
          </div>
        </Modal>
      )}
      {decision && decidingRequest && decidingProject && (
        <Modal
          title={`${
            decision.type === "reject" && actor.role === "client"
              ? "Reject Extension"
              : decisionLabels[decision.type]
          } — Confirmation`}
          subtitle={decidingProject.name}
          onClose={() => {
            setDecision(undefined)
            setError("")
          }}
        >
          <p>
            Current approved deadline:{" "}
            <strong>{dateLabel(decidingProject.approved)}</strong>
          </p>
          <p>
            Proposed revised deadline:{" "}
            <strong>
              {decidingRequest.proposed
                ? dateLabel(decidingRequest.proposed)
                : "Not set"}
            </strong>
          </p>
          <p className="extension-remarks">
            {decision.type === "approve"
              ? "Confirming updates only this demo project's approved deadline and deadline history. Original ETC and construction phases are preserved."
              : decision.type === "endorse"
                ? "Send this report to the assigned Client for final approval. The approved deadline remains unchanged."
                : decision.type === "return"
                  ? "The SPM can revise and resubmit this report. Provide clear feedback below."
                  : "Close this request. The approved deadline remains unchanged; the SPM can create a new request."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (
                run(
                  { ...decision, remarks },
                  `Demo request ${decisionLabels[decision.type].toLowerCase()} confirmed.`,
                )
              ) {
                setDecision(undefined)
                setRemarks("")
              }
            }}
          >
            <Field
              label={
                ["return", "reject"].includes(decision.type)
                  ? "Written reason (required)"
                  : "Review remarks (optional)"
              }
            >
              <textarea
                rows={4}
                required={["return", "reject"].includes(decision.type)}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="extension-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                onClick={() => {
                  setDecision(undefined)
                  setError("")
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={decision.type === "reject" ? "danger" : "primary"}
              >
                Confirm {decisionLabels[decision.type]}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

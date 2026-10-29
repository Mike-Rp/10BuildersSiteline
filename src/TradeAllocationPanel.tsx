import { useRef, useState } from "react"
import { Badge, Button, Field, Icon, Modal } from "./ui"
import { Upload } from "./panels"
import {
  DOC_LABELS,
  type Account,
  type Doc,
  type Project,
  type State,
} from "./model"
import {
  activationChecks,
  allocationReady,
  leadId,
  workflowFor,
  type WorkflowCommand,
} from "./workflows"
import {
  allocationCandidates,
  allocationConsented,
  allocationPhases,
  canReleaseCompany,
  compareCandidatePreference,
  eligibility,
  recommendTeam,
  replaceCompany,
  replacementCandidates,
  requiredCompanies,
  scopeFor,
  type AllocationPlan,
} from "./subcontractor-allocation"
import "./TradeAllocationPanel.css"

type Props = {
  state: State
  project: Project
  actor: Account
  saving?: boolean
  onAction: (
    command: WorkflowCommand,
    message?: string,
  ) => boolean | Promise<boolean>
  onNewCompany: () => void
  onPreview: (doc: Doc) => void
  onActivated: () => void
  onOpenActive: () => void
}
export function TradeAllocationOverview({
  state,
  project,
}: {
  state: State
  project: Project
}) {
  const plan = project.subcontractorAllocation,
    work = workflowFor(project)
  const name = (id: string) =>
    state.companies.find((c) => c.id === id)?.name ||
    "Company record unavailable"
  return (
    <div className="trade-allocation">
      <h3>Trade-based subcontractor allocation</h3>
      <p>
        {requiredCompanies(project.type)} companies required · Up to 2
        concurrent commitments per company.
      </p>
      {!plan ? (
        <p>
          No allocation plan saved yet. The Lead Site PM prepares the team after
          intake requirements are complete.
        </p>
      ) : (
        <>
          <div className="trade-company-grid">
            {plan.companyIds.map((id) => {
              const status =
                work.selections.find((s) => s.companyId === id)?.status ||
                "selected"
              return (
                <article className="trade-company" key={id}>
                  <h4>{name(id)}</h4>
                  <Badge tone={status === "accepted" ? "green" : "amber"}>
                    {status === "selected" ? "Not contacted" : status}
                  </Badge>
                  <p>
                    {[...new Set(scopeFor(plan, id).map((r) => r.phase))].join(
                      " · ",
                    )}
                  </p>
                </article>
              )
            })}
          </div>
          <Coverage state={state} plan={plan} />
        </>
      )}
    </div>
  )
}
function Coverage({ state, plan }: { state: State; plan: AllocationPlan }) {
  return (
    <div
      className="trade-coverage"
      role="region"
      aria-label="Phase discipline coverage"
      tabIndex={0}
    >
      <table>
        <caption>Company coverage by phase and discipline</caption>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Required discipline</th>
            <th>Company</th>
          </tr>
        </thead>
        <tbody>
          {plan.coverage.map((row) => (
            <tr key={row.phase + "/" + row.discipline}>
              <td>{row.phase}</td>
              <td>{row.discipline}</td>
              <td>
                {state.companies.find((c) => c.id === row.companyId)?.name ||
                  "Company record unavailable"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default function TradeAllocationPanel({
  state,
  project,
  actor,
  saving = false,
  onAction,
  onNewCompany,
  onPreview,
  onActivated,
  onOpenActive,
}: Props) {
  const plan = project.subcontractorAllocation,
    work = workflowFor(project),
    phases = allocationPhases(state, project),
    candidates = allocationCandidates(state, project)
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [statusMessage, setStatusMessage] = useState("")
  const [alternatives, setAlternatives] = useState<string>(),
    [manual, setManual] = useState(false),
    [team, setTeam] = useState<string[]>([])
  const [action, setAction] = useState<{
    id: string
    type: "contact_company" | "respond_company" | "release_allocation_company"
    accepted?: boolean
  }>()
  const [note, setNote] = useState(""),
    [editing, setEditing] = useState<AllocationPlan>()
  const lock = useRef(false)
  const active = project.status === "active" || project.status === "completed",
    readOnly = actor.role !== "spm" || actor.id !== leadId(project)
  const ready = allocationReady(project),
    disabled = saving || busy,
    count = requiredCompanies(project.type)
  const eligible = candidates.filter(company => !eligibility(company)).sort((a, b) => compareCandidatePreference(a, b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const excluded = candidates.filter(company => !!eligibility(company))
  const recommended = !active && !plan ? recommendTeam(project.type, phases, candidates) : null
  const statusOf = (id: string) =>
    work.selections.find((s) => s.companyId === id)?.status || "selected"
  const protectedCompany = (id: string) =>
    ["contacted", "accepted"].includes(statusOf(id))
  const name = (id: string) =>
    candidates.find((c) => c.id === id)?.name || "Company record unavailable"
  async function send(command: WorkflowCommand, message: string) {
    if (lock.current || saving) return false
    lock.current = true
    setBusy(true)
    setError("")
    setStatusMessage("")
    try {
      const result = await onAction(
        { ...command, allocationRevision: plan?.revision || 0 },
        message,
      )
      if (result) {
        setAction(undefined)
        setNote("")
        setAlternatives(undefined)
        setManual(false)
        setEditing(undefined)
        setStatusMessage(message)
      } else
        setError(
          "The change was not saved. Check the workspace message and try again. Your current selection is retained.",
        )
      return result
    } catch (failure) {
      setError((failure as Error).message)
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  if (readOnly)
    return <TradeAllocationOverview state={state} project={project} />
  return (
    <div className="trade-allocation">
      <header className="trade-heading">
        <div>
          <h3>Subcontractor allocation</h3>
          <p>
            {project.type}: <strong>{count} companies required</strong> · 2
            concurrent commitments per company.
          </p>
        </div>
        <Badge
          tone={
            active || allocationConsented(state, project) ? "green" : "amber"
          }
        >
          <Icon
            name={
              active || allocationConsented(state, project) ? "check" : "clock"
            }
            size={16}
          />
          {active
            ? project.status === "completed"
              ? "Allocation complete"
              : "Active allocation"
            : allocationConsented(state, project)
              ? "All companies accepted"
              : "Allocation pending"}
        </Badge>
      </header>
      <p>
        Match Site PM-reviewed capabilities to each phase’s required disciplines.
        A company can cover several phases and return later; each company
        reserves one project slot after acceptance. The crew foreman handles
        workforce distribution.
      </p>
      <p>{eligible.length} eligible companies · {count} required.</p>
      {project.clientSubcon && !plan && (
        <p className="notice">
          The client-nominated company must be registered and reviewed in the
          directory before it can join this multi-company allocation.
        </p>
      )}
      {!ready && !active && (
        <p className="notice">
          <Icon name="clock" />
          Complete the six registered documents and all Site PM confirmations
          before preparing the allocation.
        </p>
      )}
      {error && (
        <p className="role-error" role="alert">
          {error}
        </p>
      )}
      {statusMessage && <p role="status">{statusMessage}</p>}
      {!plan ? (
        <section className="trade-company">
          <h4>Prepare the company team</h4>
          <p>
            Auto-allocation proposes a complete team using verified trade
            coverage, then fewer existing commitments. It records no contact or
            acceptance.
          </p>
          {recommended && <details className="allocation-team-preview"><summary>Preview recommended companies</summary><ul>{recommended.companyIds.map(id => {
            const company = candidates.find(company => company.id === id)!
            return <li key={id}><strong>{company.name}</strong><p>{company.disciplines.join(" · ")} · {company.commitments}/2 other commitments</p></li>
          })}</ul></details>}
          <div className="trade-actions">
            <Button
              variant="primary"
              disabled={disabled || !ready || active || !recommended}
              onClick={() =>
                void send(
                  { type: "auto_allocate_company" },
                  "Company team proposed. Review phase coverage before contacting companies.",
                )
              }
            >
              Auto-allocate team
            </Button>
            <Button
              disabled={disabled || !ready || active || !eligible.length}
              onClick={() => {
                setError("")
                setManual(true)
              }}
            >
              Choose companies manually
            </Button>
            <Button disabled={disabled || active} onClick={onNewCompany}>
              Request another company
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="trade-company-grid">
            {plan.companyIds.map((id) => {
              const company = candidates.find((c) => c.id === id),
                status = statusOf(id),
                reason = eligibility(company)
              const responded = ["accepted", "declined", "archived"].includes(
                status,
              )
              return (
                <article className="trade-company" key={id}>
                  <div className="trade-heading">
                    <h4>{name(id)}</h4>
                    <Badge
                      tone={
                        status === "accepted"
                          ? "green"
                          : status === "declined"
                            ? "red"
                            : "amber"
                      }
                    >
                      <Icon
                        name={
                          status === "accepted"
                            ? "check"
                            : status === "declined"
                              ? "x"
                              : "clock"
                        }
                        size={16}
                      />
                      {status === "selected"
                        ? "Not contacted"
                        : status === "archived"
                          ? "Released"
                          : status}
                    </Badge>
                  </div>
                  <div className="tag-list">
                    {company?.disciplines.map((d) => <span key={d}>{d}</span>)}
                  </div>
                  <p>
                    <strong>{company?.commitments || 0}/2</strong> other
                    commitments
                    {status === "accepted"
                      ? " · This project’s slot is reserved"
                      : status === "archived"
                        ? " · Project slot released"
                        : " · Proposal reserves no slot"}
                  </p>
                  <p>
                    Covered phases:{" "}
                    {[...new Set(scopeFor(plan, id).map((r) => r.phase))].join(
                      " · ",
                    )}
                  </p>
                  {reason && status !== "archived" && (
                    <p className="trade-warning">
                      <Icon name="alert" size={16} />
                      {reason}.{" "}
                      {status === "declined"
                        ? "Choose a replacement; other accepted scopes remain unchanged."
                        : "Resolve this before acceptance or activation."}
                    </p>
                  )}
                  <div className="trade-actions">
                    {!active && !protectedCompany(id) && (
                      <>
                        <Button
                          disabled={disabled}
                          onClick={() => {
                            setError("")
                            setAlternatives(id)
                          }}
                        >
                          Review alternatives
                        </Button>
                        <Button
                          variant="primary"
                          disabled={disabled}
                          onClick={() =>
                            void send(
                              { type: "auto_allocate_company", companyId: id },
                              "Auto-allocation checked this scope. Eligible replacements are proposed; the current company stays when equally suitable.",
                            )
                          }
                        >
                          Auto-allocate
                        </Button>
                      </>
                    )}
                    {!active && status === "selected" && (
                      <Button
                        disabled={disabled || !!reason}
                        onClick={() => {
                          setNote("")
                          setAction({ id, type: "contact_company" })
                        }}
                      >
                        Record contact
                      </Button>
                    )}
                    {!active && status === "contacted" && (
                      <>
                        <Button
                          variant="primary"
                          disabled={disabled || !!reason}
                          onClick={() => {
                            setNote("")
                            setAction({
                              id,
                              type: "respond_company",
                              accepted: true,
                            })
                          }}
                        >
                          Record acceptance
                        </Button>
                        <Button
                          disabled={disabled}
                          onClick={() => {
                            setNote("")
                            setAction({
                              id,
                              type: "respond_company",
                              accepted: false,
                            })
                          }}
                        >
                          Record decline
                        </Button>
                      </>
                    )}
                    {active && status === "accepted" && (
                      <Button
                        disabled={disabled || !canReleaseCompany(project, id)}
                        onClick={() => {
                          setNote("")
                          setAction({ id, type: "release_allocation_company" })
                        }}
                      >
                        Formally release company
                      </Button>
                    )}
                  </div>
                  {active &&
                    status === "accepted" &&
                    !canReleaseCompany(project, id) && (
                      <p>
                        Commitment stays reserved through the last agreed phase,
                        including gaps between phases.
                      </p>
                    )}
                  {responded && status !== "archived" && (
                    <p>
                      {status === "accepted"
                        ? "Accepted scope is locked."
                        : "Decline retained in project history."}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
          <details className="trade-company">
            <summary>Review phase and discipline coverage</summary>
            <Coverage state={state} plan={plan} />
            {!active && (
              <Button
                disabled={disabled || plan.companyIds.every(protectedCompany)}
                onClick={() => setEditing(structuredClone(plan))}
              >
                Adjust uncontacted phase coverage
              </Button>
            )}
          </details>
          <section className="trade-company">
            <h4>
              {active ? "Project allocation record" : "Final activation checks"}
            </h4>
            {!active && (
              <>
                <div className="activation-checklist">
                  {activationChecks(state, project).map((check) => (
                    <div
                      key={check.id}
                      className={check.passed ? "passed" : "blocked"}
                    >
                      <Icon name={check.passed ? "check" : "clock"} size={17} />
                      <span>{check.label}</span>
                      <strong>{check.passed ? "Passed" : "Pending"}</strong>
                    </div>
                  ))}
                </div>
                <p>
                  Every required company must accept the full agreed scope.
                  Upload a signed agreement package covering all selected
                  companies. Activation rechecks capacity, coverage, documents,
                  team confirmations and client access.
                </p>
              </>
            )}
            {active ? (
              <>
                <Button onClick={onOpenActive}>Open Active Sites</Button>
                {project.docs
                  .filter((d) => d.label === DOC_LABELS[6] && d.uploaded)
                  .map((d) => (
                    <Button key={d.id} onClick={() => onPreview(d)}>
                      View signed agreement
                    </Button>
                  ))}
              </>
            ) : (
              <Upload
                label={DOC_LABELS[6]}
                owner={actor.name}
                disabled={disabled || !allocationConsented(state, project)}
                buttonLabel="Upload signed subcontractor agreements"
                onSave={async (doc) => {
                  const saved = await send(
                    { type: "upload_agreement", doc },
                    "All companies and activation requirements verified. Project activated.",
                  )
                  if (saved) onActivated()
                  return saved
                }}
              />
            )}
          </section>
        </>
      )}
      {!active && excluded.length > 0 && <details className="trade-company"><summary>Excluded companies ({excluded.length})</summary>{excluded.map(company => <p key={company.id}><strong>{company.name}</strong> · {eligibility(company)}</p>)}</details>}
      {!active && !plan && !recommended && <p className="notice">No complete eligible team covers the project. Allocation remains pending. Review company trades and availability, or request another company.</p>}
      {(project.subcontractorAllocationHistory?.length || 0) > 0 && (
        <details className="trade-company">
          <summary>Allocation history</summary>
          {project.subcontractorAllocationHistory
            ?.slice()
            .reverse()
            .map((item, index) => (
              <p key={index}>
                <strong>{item.action.replace(/_/g, " ")}</strong>
                {item.companyId ? ` · ${name(item.companyId)}` : ""} · {item.by}{" "}
                · {new Date(item.at).toLocaleString()}
                {item.note && ` — ${item.note}`}
              </p>
            ))}
        </details>
      )}
      {alternatives && plan && (
        <Modal
          title="Review alternatives"
          subtitle={name(alternatives)}
          onClose={() => !disabled && setAlternatives(undefined)}
        >
          <p>
            Only approved, reviewed companies with an open project slot and
            every discipline in this scope can replace this company.
          </p>
          {replacementCandidates(plan, alternatives, candidates).map((c) => (
            <div className="trade-company" key={c.id}>
              <h4>{c.name}</h4>
              <p>
                {c.disciplines.join(" · ")} · {c.commitments}/2 other
                commitments
              </p>
              <Button
                disabled={disabled}
                onClick={() =>
                  void send(
                    {
                      type: "save_allocation_plan",
                      plan: replaceCompany(plan, alternatives, c.id),
                    },
                    "Replacement proposed with the same phase coverage. Record its actual response after contact.",
                  )
                }
              >
                Propose {c.name}
              </Button>
            </div>
          ))}
          {!replacementCandidates(plan, alternatives, candidates).length && (
            <p role="status">
              No eligible replacement covers this full scope. Allocation remains
              pending.
            </p>
          )}
          <Button
            disabled={disabled}
            onClick={() => setAlternatives(undefined)}
          >
            Close
          </Button>
        </Modal>
      )}
      {manual && (
        <Modal
          title="Choose company team"
          subtitle={`${count} companies required`}
          onClose={() => !disabled && setManual(false)}
        >
          <div className="trade-checks">
            {eligible.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  disabled={
                    disabled ||
                    !!eligibility(c) ||
                    (!team.includes(c.id) && team.length >= count)
                  }
                  checked={team.includes(c.id)}
                  onChange={() =>
                    setTeam(
                      team.includes(c.id)
                        ? team.filter((id) => id !== c.id)
                        : [...team, c.id],
                    )
                  }
                />
                <span>
                  <strong>{c.name}</strong>
                  <br />
                  {eligibility(c) ||
                    `${c.commitments}/2 commitments · ${c.disciplines.join(", ")}`}
                </span>
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={disabled || team.length !== count}
            onClick={() => {
              const proposed = recommendTeam(
                project.type,
                phases,
                candidates.filter((c) => team.includes(c.id)),
              )
              if (!proposed)
                setError(
                  "These companies do not cover every phase discipline. Choose a different team.",
                )
              else
                void send(
                  { type: "save_allocation_plan", plan: proposed },
                  "Company team proposed. Review phase coverage before contact.",
                )
            }}
          >
            Propose selected team
          </Button>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {action && (
        <Modal
          title={
            action.type === "contact_company"
              ? "Record company contact"
              : action.type === "release_allocation_company"
                ? "Formally release company?"
                : action.accepted
                  ? "Record actual acceptance?"
                  : "Record actual decline?"
          }
          subtitle={name(action.id)}
          onClose={() => !disabled && setAction(undefined)}
        >
          <p>
            {action.type === "release_allocation_company"
              ? "The agreed phase scope is complete. Formal release frees this project’s commitment slot."
              : "Contact the company outside SiteCore and record its actual response. Acceptance reserves a project slot; it does not activate the project."}
          </p>
          <Field label="Contact or response details">
            <textarea
              value={note}
              disabled={disabled}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {error && <p role="alert">{error}</p>}
          <div className="trade-actions">
            <Button disabled={disabled} onClick={() => setAction(undefined)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={disabled || !note.trim()}
              onClick={() =>
                void send(
                  {
                    type: action.type,
                    companyId: action.id,
                    accepted: action.accepted,
                    note,
                  },
                  "Company contact or response saved.",
                )
              }
            >
              Confirm record
            </Button>
          </div>
        </Modal>
      )}
      {editing && plan && (
        <Modal
          title="Adjust phase coverage"
          onClose={() => !disabled && setEditing(undefined)}
        >
          <p>
            Contacted and accepted scopes stay locked. Assign each discipline to
            one capable company.
          </p>
          {editing.coverage.map((row, index) => (
            <Field
              key={row.phase + row.discipline}
              label={`${row.phase} · ${row.discipline}`}
            >
              <select
                disabled={disabled || protectedCompany(row.companyId)}
                value={row.companyId}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    coverage: editing.coverage.map((r, i) =>
                      i === index ? { ...r, companyId: e.target.value } : r,
                    ),
                  })
                }
              >
                {candidates
                  .filter(
                    (c) =>
                      plan.companyIds.includes(c.id) &&
                      c.disciplines.includes(row.discipline) &&
                      (!protectedCompany(c.id) || c.id === row.companyId),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
          {error && <p role="alert">{error}</p>}
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() =>
              void send(
                { type: "save_allocation_plan", plan: editing },
                "Uncontacted phase coverage updated.",
              )
            }
          >
            Save phase coverage
          </Button>
        </Modal>
      )}
    </div>
  )
}

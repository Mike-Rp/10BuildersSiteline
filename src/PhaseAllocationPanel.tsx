import { useEffect, useRef, useState } from "react"
import { api } from "./api/client"
import { Badge, Button, Field } from "./ui"
import { Upload } from "./panels"
import { DOC_LABELS, type Project } from "./model"
import type { WorkflowCommand } from "./workflows"
import { suggestCompanyPair, alternateForemen } from "./allocation-suggestion"
import "./phase-allocation.css"
import { startPolling } from "./refresh-interval"

type Row = {
  phase: string
  companyId: string
  foremanId: string
  foremanName?: string
  foremanPhone?: string
}
type Company = {
  id: string
  name: string
  status: string
  reviewed: boolean
  unavailable: boolean
  declinedForProject?: boolean
  disciplines: string[]
  commitments: number
  contactPhone: string
  foremen: { id: string; name: string; phone: string; otherProjectCount?: number }[]
}
type Request = {
  id: number
  status: string
  reason: string
  proposal: Row[]
  requested_by_name: string
  reviewed_by_name?: string
  review_note?: string
  responses: Record<string, { status: string; note: string }>
}
type Data = {
  revision: number
  canEdit: boolean
  phases: { name: string; disciplines: string[] }[]
  completed: string[]
  assignments: Row[]
  companies: Company[]
  legacyCompanies?: { id: string; name: string; status: string; phases: string[] }[]
  requests: Request[]
  history: {
    id: number
    action: string
    actor_name: string
    created_at: string
    detail: { note?: string; contactMethod?: string }
  }[]
}
export default function PhaseAllocationPanel({
  projectId,
  project,
  onReload,
  onAction,
  onActivated,
  admin = false,
  readOnly = false,
}: {
  projectId: string
  project?: Project
  onReload?: () => unknown
  onAction?: (
    c: WorkflowCommand,
    message?: string,
  ) => boolean | Promise<boolean>
  onActivated?: () => void
  admin?: boolean
  readOnly?: boolean
}) {
  const [data, setData] = useState<Data>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false),
    [rows, setRows] = useState<Row[]>([]),
    [roster, setRoster] = useState<string[]>([])
  const [note, setNote] = useState(""),
    [companyChoice, setCompanyChoice] = useState(""),
    [replaceId, setReplaceId] = useState("")
  const [available, setAvailable] = useState(false),
    [message, setMessage] = useState("")
  const [method, setMethod] = useState("phone")
  const loadSequence=useRef(0)
  const saving=useRef(false)
  const refresh = async () => {
    const sequence=++loadSequence.current
    const next = await api<Data>(`/projects/${projectId}/phase-allocation`)
    if(sequence===loadSequence.current)setData(next)
    return next
  }
  useEffect(() => {
    let live = true
    setData(undefined)
    api<Data>(`/projects/${projectId}/phase-allocation`)
      .then((v) => live && setData(v))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [projectId])
  const waitingForResponse=!!data?.requests.some(r=>['pending_admin','approved'].includes(r.status))
  useEffect(()=>{
    if(!waitingForResponse)return
    let live=true
    const update=()=>{const sequence=++loadSequence.current;api<Data>(`/projects/${projectId}/phase-allocation`).then(next=>{if(live&&sequence===loadSequence.current)setData(next)}).catch(e=>{if(live)setError(e.message)})}
    const stop=startPolling(update)
    window.addEventListener('focus',update)
    return()=>{live=false;stop();window.removeEventListener('focus',update)}
  },[projectId,waitingForResponse])
  const post = async (action: string, extra: Record<string, unknown> = {}) => {
    if (busy || saving.current || !data) return
    saving.current=true
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await api(`/projects/${projectId}/phase-allocation`, {
        method: "POST",
        json: { action, note, method, revision: data.revision, ...extra },
      })
      await refresh()
      setEditing(false)
      setNote("")
      setAvailable(false)
      setMessage("Allocation record saved.")
      await onReload?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      saving.current=false
      setBusy(false)
    }
  }
  if (!data)
    return (
      <section className="detail-section">
        <h3>Phase and foreman allocation</h3>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Loading allocation records…</p>
        )}
      </section>
    )
  const open = data.requests.find((r) =>
    ["draft", "pending_admin", "approved"].includes(r.status),
  )
  const remaining = data.phases.filter((p) => !data.completed.includes(p.name))
  const company = (id: string) => data.companies.find((c) => c.id === id)
  const eligible = data.companies
    .filter(
      (c) =>
        c.status === "approved" &&
        c.reviewed &&
        !c.unavailable &&
        c.commitments < 2 &&
        c.foremen.length > 0,
    )
    .sort(
      (a, b) => a.commitments - b.commitments || a.name.localeCompare(b.name),
    )
  const start = (proposal?: Row[]) => {
    const next = remaining.map(
      (p) =>
        proposal?.find((r) => r.phase === p.name) ||
        data.assignments.find((r) => r.phase === p.name) || {
          phase: p.name,
          companyId: "",
          foremanId: "",
        },
    )
    setRows(next)
    setReplaceId("")
    setCompanyChoice("")
    setRoster([...new Set(next.map((r) => r.companyId).filter(Boolean))])
    setEditing(true)
    setError("")
    setNote("")
  }
  const changed = (id: string) => {
    const scope = (list: Row[]) =>
      JSON.stringify(
        list
          .filter(
            (r) => r.companyId === id && !data.completed.includes(r.phase),
          )
          .map((r) => [r.phase, r.foremanId])
          .sort(),
      )
    return scope(open?.proposal || []) !== scope(data.assignments)
  }
  const update = (phase: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((r) => (r.phase === phase ? { ...r, ...patch } : r)),
    )
  const allAssigned =
    rows.length === remaining.length &&
    rows.every((r) => r.companyId && r.foremanId) && roster.every(id=>rows.some(r=>r.companyId===id))
  return (
    <section className="phase-allocation detail-section">
      <div className="trade-heading">
        <div>
          <h3>Subcontractor allocation</h3>
          <p>
            Company suggestions by the system · Phase assignments by the Lead
            Site PM
          </p>
        </div>
        <Badge tone={open ? "amber" : "green"}>
          {open
            ? open.status.replace(/_/g, " ")
            : data.assignments.length
              ? "Confirmed allocation"
              : "Needs assignment"}
        </Badge>
      </div>
      <p>
        One foreman per phase, alternating between the company's two foremen automatically (you can still change any phase). A company uses one project commitment even when
        both foremen are assigned. Maximum two open project commitments per
        company.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data.completed.length > 0 && (
        <details>
          <summary>Completed phase responsibility — preserved history</summary>
          {data.completed.map((phase) => {
            const row = data.assignments.find((r) => r.phase === phase)
            return (
              <p key={phase}>
                {phase} ·{" "}
                {row
                  ? `${company(row.companyId)?.name || "Company"} / ${row.foremanName || "Saved foreman"}`
                  : "Legacy allocation — original record retained"}
              </p>
            )
          })}
        </details>
      )}
      <div className="trade-company-grid">
        {data.legacyCompanies?.map(c=><article className="trade-company" key={c.id}><h4>{c.name}</h4><Badge>{c.status}</Badge><div className="tag-list">{c.phases.map(phase=><span key={phase}>{phase}</span>)}</div><p>Original company scope retained. Assign foremen manually before confirming a phase-based transition.</p></article>)}
        {[
          ...new Set(
            data.assignments
              .filter((r) => !data.completed.includes(r.phase))
              .map((r) => r.companyId),
          ),
        ].map((id) => {
          const c = company(id)
          return (
            <article className="trade-company" key={id}>
              <h4>{c?.name || "Company record"}</h4>
              <p>
                {(c?.commitments || 0)+1}/2 project commitments · This project
                reserved
              </p>
              <div className="phase-foremen">
                {[
                  ...new Set(
                    data.assignments
                      .filter(
                        (r) =>
                          r.companyId === id &&
                          !data.completed.includes(r.phase),
                      )
                      .map((r) => r.foremanId),
                  ),
                ].map((fid) => {
                  const owned = data.assignments.filter(
                    (r) =>
                      r.companyId === id &&
                      r.foremanId === fid &&
                      !data.completed.includes(r.phase),
                  )
                  const f = c?.foremen.find((f) => f.id === fid)
                  return (
                    <div key={fid}>
                      <strong>
                        {f?.name || owned[0]?.foremanName || "Recorded foreman"}
                      </strong>
                      <div className="tag-list">
                        {owned.map((r) => (
                          <span key={r.phase}>{r.phase}</span>
                        ))}
                      </div>
                      <a href={`tel:${f?.phone || owned[0]?.foremanPhone}`}>
                        Contact foreman
                      </a>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
      {!data.assignments.length && (
        <p className="notice">
          {project?.subcontractorAllocation
            ? "Existing company scope remains in effect. Prepare a reviewed phase allocation; no foreman assignments are guessed."
            : "No phase allocation confirmed yet. Select an eligible company, then assign its foremen manually."}
        </p>
      )}
      {data.canEdit && !readOnly && !open && !editing && remaining.length > 0 && (
        <div className="trade-actions"><Button disabled={busy} onClick={() => start()}>
          {data.assignments.length
            ? "Edit phase assignments"
            : "Prepare allocation"}
        </Button>{data.assignments.length>0&&<><Button disabled={busy} onClick={()=>start()}>Add subcontractor company</Button><Button disabled={busy} onClick={()=>{start();setReplaceId(data.assignments.find(r=>!data.completed.includes(r.phase))?.companyId||"")}}>Replace company</Button></>}</div>
      )}
      {editing && data.canEdit && !readOnly && (
        <section className="trade-company">
          <h4>Prepare phase assignments</h4>
          <p>
            Additional companies, replacements and transfers between companies require Admin approval. Existing responsibility stays in effect
            until confirmation.
          </p>
          <div className="trade-actions">
            <Button
              disabled={busy}
              onClick={() => {
                const suggested = eligible.find((c) => !c.declinedForProject &&
                  remaining.every((p) =>
                    p.disciplines.every((d) => c.disciplines.includes(d)),
                  ),
                )
                if (!suggested) {
                  // Fallback: two eligible companies that together cover every remaining phase.
                  const pair = suggestCompanyPair(
                    eligible.filter((c) => !c.declinedForProject),
                    remaining,
                  )
                  if (pair) {
                    setError("")
                    setRoster(pair.companyIds)
                    setRows(pair.rows.map((r) => ({ ...r, foremanId: "" })))
                    return
                  }
                  setError(
                    "No single eligible company covers every remaining phase. Add eligible companies and divide whole phases manually.",
                  )
                  return
                }
                setRoster([suggested.id])
                setRows(
                  alternateForemen(
                    remaining.map((p) => ({
                      phase: p.name,
                      companyId: suggested.id,
                      foremanId: "",
                    })),
                    suggested,
                  ),
                )
              }}
            >
              Suggest company
            </Button>
            <select
              aria-label="Company to add or replace"
              value={companyChoice}
              onChange={(e) => setCompanyChoice(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose an eligible company</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.commitments}/2 other commitments{c.declinedForProject?" · Previously declined — recontact required":""}
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !companyChoice}
              onClick={() => {
                setRoster((ids) => [...new Set([...ids, companyChoice])])
                if (roster.length === 0)
                  setRows((current) =>
                    alternateForemen(
                      current.map((r) => ({
                        ...r,
                        companyId: companyChoice,
                        foremanId: "",
                      })),
                      company(companyChoice),
                    ),
                  )
                setCompanyChoice("")
              }}
            >
              Add subcontractor company
            </Button>
          </div>
          <p>If a company is not listed, ask Admin to register and verify it in the directory. Site PM accounts cannot register companies.</p>
          <p>Assign at least one phase to each company before submitting. Drafts retain only companies selected in phase rows.</p>
          {roster.map((id) => (
            <div className="phase-roster" key={id}>
              <strong>{company(id)?.name}</strong>
              <span>{company(id)?.disciplines.join(" · ")}</span>
              <Button
                disabled={busy}
                onClick={() => {
                  setReplaceId(id)
                }}
              >
                Replace company
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setRoster((ids) => ids.filter((v) => v !== id))
                  setRows((current) =>
                    current.map((r) =>
                      r.companyId === id
                        ? { ...r, companyId: "", foremanId: "" }
                        : r,
                    ),
                  )
                }}
              >
                Remove from proposal
              </Button>
            </div>
          ))}
          {replaceId && (
            <div className="notice">
              <p>
                Select the replacement above. Current assignments are retained
                until the approved replacement accepts.
              </p>
              <Button
                disabled={busy || !companyChoice || companyChoice === replaceId}
                onClick={() => {
                  setRoster((ids) => [
                    ...new Set(
                      ids.map((id) => (id === replaceId ? companyChoice : id)),
                    ),
                  ])
                  setRows((current) =>
                    current.map((r) =>
                      r.companyId === replaceId
                        ? { ...r, companyId: companyChoice, foremanId: "" }
                        : r,
                    ),
                  )
                  setReplaceId("")
                  setCompanyChoice("")
                }}
              >
                Use replacement company
              </Button>
              <Button onClick={() => setReplaceId("")}>
                Cancel replacement
              </Button>
            </div>
          )}
          <div className="phase-assignment-list">
            {remaining.map((p) => {
              const row = rows.find((r) => r.phase === p.name)!
              const c = company(row.companyId)
              return (
                <div className="phase-assignment-row" key={p.name}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.disciplines.join(" · ")}</small>
                  </div>
                  <Field label="Company">
                    <select
                      disabled={busy}
                      value={row.companyId}
                      onChange={(e) =>
                        update(p.name, {
                          companyId: e.target.value,
                          foremanId: "",
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {roster
                        .filter((id) =>
                          p.disciplines.every((d) =>
                            company(id)?.disciplines.includes(d),
                          ),
                        )
                        .map((id) => (
                          <option key={id} value={id}>
                            {company(id)?.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Responsible foreman">
                    <select
                      disabled={busy || !c}
                      value={row.foremanId}
                      onChange={(e) =>
                        update(p.name, { foremanId: e.target.value })
                      }
                    >
                      <option value="">Select foreman</option>
                      {c?.foremen.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}{f.otherProjectCount ? ` · ${f.otherProjectCount} other open project(s)` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )
            })}
          </div>
          {rows.some(r=>company(r.companyId)?.foremen.find(f=>f.id===r.foremanId)?.otherProjectCount)&&<p className="notice">A selected foreman has assignments recorded on another open project. Confirm availability with the company. Phase dates are not tracked, so this is an advisory rather than a scheduling conflict.</p>}
          <Field label="Reason / proposed scope">
            <textarea
              maxLength={2000}
              disabled={busy}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="trade-actions">
            <Button disabled={busy} onClick={() => setEditing(false)}>
              Cancel editing
            </Button>
            <Button
              disabled={busy || !note.trim()}
              onClick={() =>
                void post("draft", {
                  assignments: rows,
                  ...(open?.status === "draft"
                    ? { requestId: Number(open.id) }
                    : {}),
                })
              }
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              disabled={busy || !allAssigned || !note.trim()}
              onClick={() =>
                void post("submit", {
                  assignments: rows,
                  ...(open?.status === "draft"
                    ? { requestId: Number(open.id) }
                    : {}),
                })
              }
            >
              Submit allocation proposal
            </Button>
          </div>
        </section>
      )}
      {open && !editing && (
        <section className="trade-company">
          <h4>
            Request #{open.id} · {open.status.replace(/_/g, " ")}
          </h4>
          <p>{open.reason}</p>
          {open.review_note && <p>Admin decision: {open.review_note}</p>}
          {readOnly && <div className="trade-company-grid">
            {[...new Set(open.proposal.map(row => row.companyId))].map(id => <article className="trade-company" key={id}>
              <h4>{company(id)?.name || "Company record unavailable"}</h4>
              <Badge tone={open.responses[id]?.status === "accepted" ? "green" : "amber"}>{open.responses[id]?.status?.replace(/_/g, " ") || (open.status === "pending_admin" ? "Awaiting Admin approval" : "Not contacted")}</Badge>
              {open.responses[id]?.note && <p>{open.responses[id].note}</p>}
              {open.proposal.filter(row => row.companyId === id).map(row => <p key={row.phase}><strong>{row.phase}</strong> · {company(id)?.foremen.find(foreman => foreman.id === row.foremanId)?.name || row.foremanName || "Foreman record unavailable"}</p>)}
            </article>)}
          </div>}
          {!readOnly && <details>
            <summary>View exact proposed phase assignments</summary>
            {open.proposal.map((row) => (
              <p key={row.phase}>
                {row.phase} · {company(row.companyId)?.name} ·{" "}
                {company(row.companyId)?.foremen.find(
                  (f) => f.id === row.foremanId,
                )?.name || "Contact no longer current — resubmit"}
              </p>
            ))}
          </details>}
          {data.canEdit && !readOnly && (
            <>
              <Field label="Contact method">
                <select
                  value={method}
                  disabled={busy}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="phone">Phone call</option>
                  <option value="message">Message</option>
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                </select>
              </Field>
              <div className="trade-actions">
                {[...new Set(open.proposal.map((r) => r.companyId))].map(
                  (id) => (
                    <a key={id} href={`tel:${company(id)?.contactPhone}`}>
                      Contact {company(id)?.name}
                    </a>
                  ),
                )}
              </div>
              <Field label="Contact, response, handover or cancellation note">
                <textarea
                  disabled={busy}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <label className="trade-check">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                />
                Company confirmed the proposed scope and all assigned foremen’s
                availability
              </label>
              {open.status === "approved" &&
                [...new Set(open.proposal.map((r) => r.companyId))]
                  .filter(changed)
                  .map((id) => {
                    const response = open.responses[id]
                    return (
                      <div className="phase-roster" key={id}>
                        <strong>{company(id)?.name}</strong>
                        <Badge>{response?.status || "Not contacted"}</Badge>
                        {!response && (
                          <Button
                            disabled={busy || !note.trim()}
                            onClick={() =>
                              void post("contact", {
                                requestId: Number(open.id),
                                companyId: id,
                              })
                            }
                          >
                            Record contact
                          </Button>
                        )}
                        {response?.status === "contacted" && (
                          <>
                            <Button
                              disabled={busy || !note.trim() || !available}
                              onClick={() =>
                                void post("accept", {
                                  requestId: Number(open.id),
                                  companyId: id,
                                  availabilityConfirmed: available,
                                })
                              }
                            >
                              Record acceptance
                            </Button>
                            <Button
                              disabled={busy || !note.trim()}
                              onClick={() =>
                                void post("decline", {
                                  requestId: Number(open.id),
                                  companyId: id,
                                })
                              }
                            >
                              Record rejection
                            </Button>
                            <Button disabled={busy||!note.trim()} onClick={()=>void post("contact",{requestId:Number(open.id),companyId:id})}>Record follow-up contact</Button>
                          </>
                        )}
                      </div>
                    )
                  })}
              <div className="trade-actions">
                {open.status === "draft" && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      start(open.proposal)
                      setNote(open.reason)
                    }}
                  >
                    Edit / submit saved draft
                  </Button>
                )}
                <Button
                  disabled={busy || !note.trim()}
                  onClick={() =>
                    void post("cancel", { requestId: Number(open.id) })
                  }
                >
                  Cancel allocation request
                </Button>
                {open.status === "approved" && (
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      !note.trim() ||
                      [...new Set(open.proposal.map((r) => r.companyId))]
                        .filter(changed)
                        .some((id) => open.responses[id]?.status !== "accepted")
                    }
                    onClick={() =>
                      void post("confirm", { requestId: Number(open.id) })
                    }
                  >
                    Confirm phase allocation
                  </Button>
                )}
              </div>
              {open.status === "draft" && (
                <p>
                  A draft reserves no commitment. Edit it to submit the exact
                  company and phase proposal for review.
                </p>
              )}
            </>
          )}
          {admin && open.status === "pending_admin" && (
            <>
              <Field label="Admin decision note">
                <textarea
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <div className="trade-actions">
                <Button
                  disabled={busy || !note.trim()}
                  onClick={() =>
                    void post("reject", { requestId: Number(open.id) })
                  }
                >
                  Reject request
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !note.trim()}
                  onClick={() =>
                    void post("approve", { requestId: Number(open.id) })
                  }
                >
                  Approve company allocation
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {project?.status === "pending" &&
        project.subcontractorAllocation?.phaseOwned &&
        !open &&
        onAction && (
          <section className="trade-company">
            <h4>Signed agreement and activation</h4>
            <p>
              Existing document, team, client, license and signed-agreement
              checks still apply.
            </p>
            <Upload
              label={DOC_LABELS[6]}
              owner="Lead Site PM"
              disabled={busy}
              onSave={async (doc) => {
                const result = await onAction(
                  {
                    type: "upload_agreement",
                    projectId,
                    doc,
                    allocationRevision: data.revision,
                  },
                  "Subcontractor agreement saved and project activated.",
                )
                if (result) onActivated?.()
                return result
              }}
            />
          </section>
        )}
      {data.requests.length > 0 && (
        <details>
          <summary>Allocation requests and response history</summary>
          {data.requests.map((r) => (
            <article key={r.id}>
              <strong>
                #{r.id} · {r.status.replace(/_/g, " ")}
              </strong>
              <p>
                {r.reason} · Requested by {r.requested_by_name}
              </p>
              {r.review_note && (
                <p>
                  {r.reviewed_by_name}: {r.review_note}
                </p>
              )}
              {Object.entries(r.responses).map(([id, response]) => (
                <p key={id}>
                  {company(id)?.name}: {response.status} · {response.note}
                </p>
              ))}
            </article>
          ))}
        </details>
      )}
      {data.history.length > 0 && (
        <details>
          <summary>Assignment and handover audit trail</summary>
          {data.history.map((e) => (
            <p key={e.id}>
              {e.action} · {e.actor_name} ·{" "}
              {new Date(e.created_at).toLocaleString()} {e.detail.note}
            </p>
          ))}
        </details>
      )}
    </section>
  )
}

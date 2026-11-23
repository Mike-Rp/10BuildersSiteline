import { useRef, useState } from "react"
import { approveParallelUploads, confirmMonitoringTurnover, type OverlapItem } from "./api/intake-monitoring"
import EvidenceReview from "./EvidenceReview"
import type { Account, Project } from "./model"
import { Upload } from "./panels"
import { Badge, Button } from "./ui"
import type { WorkflowCommand } from "./workflows"

const phaseLabels = { active: "Official active phase", upcoming: "Official turnover pending", completed: "Turned over" }
const uploadLabels = { open: "Uploads open", parallel: "Parallel uploads open", locked: "Uploads locked" }
const evidenceLabels = { missing: "Evidence needed", submitted: "Awaiting review", approved: "Approved", rework_required: "Returned for revision" }

export default function PhaseOverlapPanel({ project, actor, disabled = false, onReload, onCommand }: {
  project: Project
  actor: Account
  disabled?: boolean
  onReload: () => unknown
  onCommand: (command: WorkflowCommand, message?: string) => Promise<boolean>
}) {
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [review, setReview] = useState<{ phase: string; responsibilityId: string; item: OverlapItem }>()
  const pending = useRef(false)
  const data = project.overlapMonitoring
  const office = actor.role === "opm" && actor.id === project.opmId
  if (!data || (!office && actor.role !== "spm")) return null
  const phases = office ? data.phases : data.phases.filter(phase => phase.responsibilities.some(row => row.user_id === actor.id))
  const phase = phases.find(row => row.name === selected) ?? phases.find(row => row.name === project.phase) ?? phases[0]
  const responsibilities = phase?.responsibilities.filter(row => office || row.user_id === actor.id) ?? []
  const { approved, required } = data.active_checklist
  const suggested = office && project.status === "active" && data.arrangement !== "Sequential phases" && required > 0 && approved * 3 >= required * 2 && approved < required
  const paused = disabled || busy || refreshFailed

  async function run(action: () => Promise<unknown>) {
    if (paused || pending.current || !office) return
    pending.current = true
    setBusy(true)
    setError("")
    try {
      await action()
      try { await onReload() }
      catch { setRefreshFailed(true) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the phase change.")
    } finally {
      setBusy(false)
      pending.current = false
    }
  }

  return <section className="detail-section" aria-label="Phase checklist and upload access">
    <div className="section-title"><h3>Personnel by phase</h3><Badge tone="blue">{data.arrangement}</Badge></div>
    <p>Official active phase · {project.phase} · {approved} of {required} required checklist items approved</p>
    {suggested && <p className="notice" role="status">Overlap review suggested</p>}
    {!phase && <p className="role-muted">No phase responsibilities are available.</p>}
    {phase && <>
      <label>Inspect phase<select value={phase.name} onChange={event => setSelected(event.target.value)}>
        {phases.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
      </select></label>
      <h4>{phase.name} <Badge tone={phase.status === "active" ? "blue" : "muted"}>{phaseLabels[phase.status]}</Badge></h4>
      {!responsibilities.length && <p className="role-muted">No Site PM responsibilities are recorded for this phase.</p>}
      {responsibilities.map(row => <article className="monitor-card" key={row.id} aria-label={`${row.name} responsibilities`}>
        <div className="section-title"><h4>{row.name}</h4><Badge tone={row.upload_access === "locked" ? "amber" : "green"}>{uploadLabels[row.upload_access]}</Badge></div>
        <p>{row.scopes.join(" · ")} · {row.assignment_status === "confirmed" ? "Accepted" : row.assignment_status === "pending" ? "Awaiting acceptance" : "Declined"}</p>
        {row.blocker && <p className="role-muted">{row.blocker}</p>}
        {office && project.status === "active" && data.arrangement !== "Sequential phases" && row.can_approve_parallel_uploads && <Button disabled={paused} onClick={() => void run(() => approveParallelUploads(project.id, row.id, data.turnover.stage_id))}>Approve parallel uploads</Button>}
        {!row.items.length && <p className="role-muted">No checklist items for this responsibility.</p>}
        {row.items.map(item => <div className="qa-checklist-row" key={item.id}>
          <div><strong>{item.title}</strong><p>{evidenceLabels[item.status]}</p>
            {item.responsibility_totals && <p>{item.responsibility_totals.approved} of {item.responsibility_totals.required} responsibilities approved</p>}
            {item.blocker && <p className="role-muted">{item.blocker}</p>}
            {item.review_note && <p>{item.review_note}</p>}
          </div>
          {!office && row.assignment_status === "confirmed" && row.upload_access !== "locked" && item.can_submit &&
            (phase.status === "active" || (phase.status === "upcoming" && data.arrangement !== "Sequential phases" && row.upload_access === "parallel")) && <Upload
            label={item.title} owner={actor.name} storageKind="evidence" previewBeforeUpload ariaLabel={`Submit evidence for ${item.title}`} disabled={paused}
            onSave={() => false} onSaveMany={docs => onCommand({ type: "submit_checklist", projectId: project.id, phase: phase.name, itemId: item.id, responsibilityId: row.id, docs }, "Checklist evidence submitted.")} />}
          {office && item.can_review && item.status === "submitted" && item.evidence_id && <Button disabled={paused} onClick={() => setReview({ phase: phase.name, responsibilityId: row.id, item })}>Review evidence</Button>}
        </div>)}
      </article>)}
    </>}
    {office && project.status === "active" && <div className="attachment-actions">
      <Button variant="primary" disabled={paused || !data.turnover.can_confirm} onClick={() => void run(() => confirmMonitoringTurnover(project.id, data.turnover.stage_id))}>Confirm phase turnover</Button>
      {data.turnover.blocker && <p>{data.turnover.blocker}</p>}
    </div>}
    {busy && <p role="status">Saving phase change…</p>}
    {error && <p role="alert">{error}</p>}
    {refreshFailed && <p role="alert">The change was saved. Reopen the project to load its current phase status.</p>}
    {office && review?.item.evidence_id && <EvidenceReview projectId={project.id} evidenceId={review.item.evidence_id} docs={review.item.attachments} manualTurnover responsibilityId={review.responsibilityId}
      onClose={() => setReview(undefined)} onConfirm={async (expectedReviewToken, note, reject) => {
        const saved = await onCommand({ type: reject ? "reject_checklist" : "approve_checklist", projectId: project.id, phase: review.phase,
          itemId: review.item.id, evidenceId: review.item.evidence_id, expectedReviewToken, note })
        if (saved) setReview(undefined)
        return saved
      }} />}
  </section>
}

import { useRef, useState } from "react"
import type { Account, Project } from "./model"
import { phaseHandoff } from "./phase-handoff"
import type { WorkflowCommand } from "./workflows"
import InfoPopover from "./InfoPopover"
import { Button } from "./ui"

export default function PhaseHandoff({ project, actor, onCommand }: {
  project: Project
  actor: Account
  onCommand: (command: WorkflowCommand) => Promise<{ ok: boolean; error?: string; message?: string }>
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const handoff = phaseHandoff(project, actor)
  if (!handoff.authorized) return null
  return <section className="detail-section" aria-label="Phase handoff">
    <h3>Phase handoff <InfoPopover title="Activating the next phase" label="Help: phase handoff">
      <p>The final Office PM activity approval automatically activates the next phase when assignments, reviews, and checklist setup allow it. If blocked, resolve those requirements and retry activation here.</p>
    </InfoPopover></h3>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {!handoff.available ? <p>Verified phase completion is unavailable. Refresh the project or ask your team to check its checklist scope.</p>
      : !handoff.complete ? <p>The next phase activates automatically after all required {project.phase} activities are approved and handoff requirements pass.</p>
      : handoff.final ? <p>Final phase checklist complete. Project completion still requires the existing closeout and completion checks.</p>
      : !handoff.next ? <p>The next phase is unavailable. Check the project’s phase assignments.</p>
      : <>
        <p><strong>{project.phase} checklist complete</strong> · Next phase: {handoff.next}</p>
        {!confirm ? <Button variant="primary" onClick={() => { setConfirm(true); setError("") }}>Activate {handoff.next}</Button>
          : <div role="group" aria-label={`Activate ${handoff.next}?`}>
            <p><strong>Activate {handoff.next}?</strong></p>
            <p>{project.phase}’s approved records will be retained. {handoff.next} will become the current phase.</p>
            <div className="modal-actions">
              <Button disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
              <Button variant="primary" disabled={busy} onClick={async () => {
                if (locked.current) return
                locked.current = true
                setBusy(true)
                setError("")
                try {
                  const result = await onCommand({ type: "advance_phase", projectId: project.id })
                  if (result.ok) setMessage(result.message || "Phase activation confirmed. Project data refreshed.")
                  else setError(result.error || "Phase activation failed.")
                } catch (failure) { setError((failure as Error).message) }
                finally { setConfirm(false); setBusy(false); locked.current = false }
              }}>{busy ? "Activating…" : `Confirm activation of ${handoff.next}`}</Button>
            </div>
          </div>}
      </>}
  </section>
}

import type { Account, Project, State } from "./model"
import { dateLabel } from "./model"
import { Button } from "./ui"
import IntakeGuidance from "./IntakeGuidance"
import { isIntakeHistory, intakeHistoryLabel } from "./intake-guidance"
import { registeredCount } from "./workflows"

// Read-only intake records deliberately omit the ongoing monitoring controls.
export default function IntakeRecord({ state, project, actor, onOpenActive }: {
  state: State; project: Project; actor: Account; onOpenActive: () => void
}) {
  const office = state.accounts.find(account => account.id === project.opmId)
  return <div className="intake-record">
    <header><h3>{project.name}</h3><p>{project.type}</p>
      {isIntakeHistory(project) ? <span className="intake-stage completed">{intakeHistoryLabel(project)}</span> : <IntakeGuidance state={state} project={project} actor={actor} details />}
    </header>
    <section><h3>Intake & Confirmation Record</h3>
      <dl className="intake-record-summary">
        <div><dt>Created</dt><dd>{project.created ? dateLabel(project.created) : "Not recorded"}</dd></div>
        <div><dt>Office PM</dt><dd>{office?.name || "Unassigned"} · {project.opmAccepted ? "Accepted" : "Awaiting acceptance"}</dd></div>
        <div><dt>Required Documents</dt><dd>{registeredCount(project)}/6 uploaded</dd></div>
        <div><dt>Phase Confirmations</dt><dd>{project.team.filter(row => row.status === "confirmed").length}/{project.team.length} confirmed</dd></div>
      </dl>
      <details><summary>Phase Assignment Responses</summary><ul>{project.team.map(row => <li key={row.phase}>{row.phase}: {state.accounts.find(account => account.id === row.accountId)?.name || "Unassigned"} · {row.status}</li>)}</ul></details>
    </section>
    <section><h3>Recorded Project History</h3><p className="intake-record-note">Saved activity includes intake decisions and activation events when recorded. Later project activity remains available for reference.</p>
      {project.history.length ? <ol className="intake-record-history">{project.history.slice().reverse().map((entry, index) => <li key={entry.id || index}><time>{dateLabel(entry.date)}</time><span>{entry.text}</span></li>)}</ol> : <p>No activity history has been recorded.</p>}
    </section>
    {project.status === "active" && <div className="modal-actions"><Button variant="primary" onClick={onOpenActive}>Open in Active Sites</Button></div>}
  </div>
}

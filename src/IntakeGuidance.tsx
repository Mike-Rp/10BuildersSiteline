import type { Account, Project, State } from "./model"
import { intakeGuidance, type IntakeView } from "./intake-guidance"
import InfoPopover from "./InfoPopover"

export function IntakeTabs({ value, counts, onChange, allLabel = "All intake" }: {
  value: IntakeView; counts: Record<IntakeView, number>; onChange: (value: IntakeView) => void; allLabel?: string
}) {
  return <div className="intake-tabs" role="group" aria-label="Intake responsibility">
    {([["all", allLabel], ["action", "Needs your action"], ["waiting", "Waiting for others"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label} <span>({counts[key]})</span></button>)}
    <InfoPopover title="Who needs to act?">Needs your action shows records with an available step for your account. Waiting for others includes prerequisites, missing assignments, and responses that must be handled through the responsible role. Viewing details does not accept or approve on someone else’s behalf.</InfoPopover>
  </div>
}

export default function IntakeGuidance({ state, project, actor }: { state: State; project: Project; actor: Account }) {
  const guidance = intakeGuidance(state, project, actor)
  if (!guidance) return null
  return <section className="intake-next" aria-label={`${project.name} intake next step`}>
    <div className={`intake-responsibility ${guidance.kind}`}>{guidance.kind === "action" ? "Needs your action" : "Waiting / prerequisites"}
      <InfoPopover title="Intake responsibilities">The next step follows existing project requirements. Office PM acceptance and documents come before Site PM confirmations. Project-specific Lead responsibilities and all activation checks remain required.</InfoPopover>
    </div>
    <dl><div><dt>Current intake stage</dt><dd>{guidance.stage}</dd></div><div><dt>Who acts next</dt><dd>{guidance.who}</dd></div><div className="intake-next-copy"><dt>Next step</dt><dd>{guidance.next}</dd></div></dl>
  </section>
}

export function AdminIntakeTable({ state, projects, actor, onOpen }: { state: State; projects: Project[]; actor: Account; onOpen: (project: Project, edit: boolean) => void }) {
  return <table className="intake-guidance-table"><thead><tr><th>Project / Office PM</th><th>Current stage</th><th>Who acts next</th><th>Next step</th><th>Action</th></tr></thead>
    <tbody>{projects.map(project => {
      const guidance = intakeGuidance(state, project, actor)
      if (!guidance) return null
      const office = !project.opmId ? "Unassigned" : state.accounts.find(a => a.id === project.opmId)?.name || "Assigned Office PM"
      return <tr key={project.id}>
        <td data-label="Project / Office PM"><button type="button" className="intake-project-link" onClick={() => onOpen(project, false)}>{project.name}</button><small>{project.type} · Office PM: {office}</small><small>{project.opmAccepted ? "Office PM accepted" : "Office PM pending"} · {project.team.filter(row => row.status === "confirmed").length}/{project.team.length} phases confirmed</small></td>
        <td data-label="Current stage"><span className={`intake-stage ${guidance.kind}`}>{guidance.stage}</span></td><td data-label="Who acts next">{guidance.who}</td><td data-label="Next step">{guidance.next}</td>
        <td data-label="Action"><button type="button" className="button" onClick={() => onOpen(project, guidance.action === "edit")}>{guidance.label}</button></td>
      </tr>
    })}</tbody></table>
}

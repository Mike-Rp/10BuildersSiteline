import type { Account, Project, State } from "./model"
import { intakeGuidance, type IntakeGuidance as Guidance, type IntakeView } from "./intake-guidance"
import { clientSubconAgreement, openClientSubconIssue, registeredCount } from "./workflows"
import InfoPopover from "./InfoPopover"

export function IntakeTabs({ value, counts, onChange, allLabel = "All intake" }: {
  value: IntakeView; counts: Record<IntakeView, number>; onChange: (value: IntakeView) => void; allLabel?: string
}) {
  return <div className="intake-tabs" role="group" aria-label="Intake responsibility">
    {([["all", allLabel], ["action", "Needs your action"], ["waiting", "Waiting for others"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label} <span>({counts[key]})</span></button>)}
    <InfoPopover title="Who needs to act?">Needs your action shows steps available to your account. Waiting for others means a prerequisite or another role’s response is needed; viewing details does not approve on their behalf.</InfoPopover>
  </div>
}

function stageLabel(guidance: Guidance, project: Project) {
  if (guidance.stage === "Required documents") return `Documents incomplete (${registeredCount(project)}/6)`
  if (guidance.stage === "Client subcontractor review") {
    if (openClientSubconIssue(project)) return "Client agreement issue open"
    if (!clientSubconAgreement(project)) return "Client agreement missing"
  }
  return ({ "Office PM acceptance": "Office PM acceptance pending", "Lead Site PM acceptance": "Lead Site PM acceptance pending",
    "Site PM confirmations": "Site PM confirmations pending", "Phase reassignment": "Phase reassignment required",
    "Client account prerequisite": "Client account unavailable", "Signed agreement": "Signed agreement required" } as Record<string, string>)[guidance.stage] || guidance.stage
}

function NextStepHelp({ guidance, project, details = false }: { guidance: Guidance; project: Project; details?: boolean }) {
  return <InfoPopover title="What happens next?" label={`Help: next step for ${project.name}`}>
    {guidance.next}
    {details && <small className="intake-help-meta">{project.opmAccepted ? "Office PM accepted" : "Office PM pending"} · {project.team.filter(row => row.status === "confirmed").length}/{project.team.length} Site PM phases confirmed</small>}
  </InfoPopover>
}

export default function IntakeGuidance({ state, project, actor, details = false }: { state: State; project: Project; actor: Account; details?: boolean }) {
  const guidance = intakeGuidance(state, project, actor)
  if (!guidance) return null
  return <div className="intake-next" aria-label={`${project.name} intake next step`}>
    <span className={`intake-stage ${guidance.kind}`}>{stageLabel(guidance, project)}</span>
    <span className={`intake-responsibility ${guidance.kind}`}>{guidance.kind === "action" ? "Needs your action" : "Waiting / prerequisites"}</span>
    <span className="intake-owner"><span>Responsible: {guidance.who}</span><NextStepHelp guidance={guidance} project={project} details={details} /></span>
  </div>
}

export function AdminIntakeTable({ state, projects, actor, onOpen }: { state: State; projects: Project[]; actor: Account; onOpen: (project: Project, edit: boolean) => void }) {
  return <table className="intake-guidance-table"><thead><tr><th>Project</th><th>Current stage</th><th>Responsible person</th><th>Action</th></tr></thead>
    <tbody>{projects.map(project => {
      const guidance = intakeGuidance(state, project, actor)
      if (!guidance) return null
      const office = !project.opmId ? "Unassigned" : state.accounts.find(a => a.id === project.opmId)?.name || "Assigned Office PM"
      return <tr key={project.id}>
        <td data-label="Project"><button type="button" className="intake-project-link" onClick={() => onOpen(project, false)}>{project.name}</button><small>{project.type} · Office PM: {office}</small></td>
        <td data-label="Current stage"><span className={`intake-stage ${guidance.kind}`}>{stageLabel(guidance, project)}</span></td>
        <td data-label="Responsible person"><div className="intake-owner"><span>{guidance.who}</span><NextStepHelp guidance={guidance} project={project} /></div><small className={`intake-responsibility ${guidance.kind}`}>{guidance.kind === "action" ? "Needs your action" : "Waiting / prerequisites"}</small></td>
        <td data-label="Action"><button type="button" className="button" onClick={() => onOpen(project, guidance.action === "edit")}>{guidance.label}</button></td>
      </tr>
    })}</tbody></table>
}

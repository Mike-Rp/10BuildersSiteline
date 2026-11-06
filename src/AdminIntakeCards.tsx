import { dateLabel, type Account, type Project, type State } from "./model"
import { intakeGuidance, intakeProgressStep } from "./intake-guidance"
import { stageLabel } from "./IntakeGuidance"
import { Button, Icon } from "./ui"
import "./admin-intake-cards.css"

export default function AdminIntakeCards({ state, projects, actor, onOpen }: {
  state: State; projects: Project[]; actor: Account; onOpen: (project: Project, edit: boolean) => void
}) {
  return <div className="admin-intake-cards">
    {projects.map(project => {
      const guidance = intakeGuidance(state, project, actor)
      if (!guidance) return null
      const current = intakeProgressStep(project, guidance)
      const steps = [current === 0 ? "Intake Setup" : "Intake Submitted", "Office PM Review", "Documents", "Site PM Confirmation", "Subcontractor Allocation"]
      return <article className="admin-intake-card" key={project.id} aria-label={project.name}>
        <header className="admin-intake-card-heading">
          <div className="admin-intake-card-identity">
            <h3><button type="button" onClick={() => onOpen(project, false)}>{project.name}</button></h3>
            <p>{[project.type, project.area ? `${project.area} sqm` : "", project.floors ? `${project.floors} floors` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <span className={`intake-stage ${guidance.kind}`}>{stageLabel(guidance, project)}</span>
          <dl className="admin-intake-card-dates">
            <div><dt>Estimated Start:</dt><dd>{project.start ? dateLabel(project.start) : "Not recorded"}</dd></div>
            <div><dt>Estimated End:</dt><dd>{project.end ? dateLabel(project.end) : "Not recorded"}</dd></div>
          </dl>
        </header>
        <ol className="admin-intake-progress" aria-label={`${project.name} intake progress`}>
          {steps.map((label, index) => <li key={index} className={index < current ? "complete" : index === current ? "current" : "upcoming"} aria-current={index === current ? "step" : undefined} aria-label={`${label}: ${index < current ? "completed" : index === current ? "current step" : "upcoming"}`}>
            <span className="admin-intake-step-marker" aria-hidden="true">{index < current ? <Icon name="check" size={13} /> : null}</span>
            <span>{label}</span>
          </li>)}
        </ol>
        <footer className="admin-intake-card-footer">
          <div><p><strong>Next Action:</strong> {guidance.next}</p><small>Responsible: {guidance.who} · {guidance.kind === "action" ? "Needs your action" : "Waiting for others"}</small></div>
          <Button variant="primary" onClick={() => onOpen(project, guidance.action === "edit")}>{guidance.label}</Button>
        </footer>
      </article>
    })}
  </div>
}

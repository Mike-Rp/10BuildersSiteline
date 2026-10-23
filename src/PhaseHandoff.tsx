import type { Account, Project } from "./model"
import { phaseHandoff } from "./phase-handoff"
import InfoPopover from "./InfoPopover"

export default function PhaseHandoff({ project, actor }: { project: Project; actor: Account }) {
  const handoff = phaseHandoff(project, actor)
  if (project.status !== "active" || !["opm", "spm"].includes(actor.role) || (!handoff.complete && !project.handoffBlocker) || handoff.final) return null
  return <section className="detail-section" aria-label="Automatic phase handoff">
    <h3>Automatic phase handoff <InfoPopover title="Automatic phase handoff" label="Help: phase handoff">
      <p>Completed checklists are checked automatically when the workspace loads and while staff use it. The next phase opens for its confirmed Site PM once blocking reviews and checklist setup are resolved.</p>
    </InfoPopover></h3>
    <p role="status">{project.handoffBlocker
      ? `${handoff.complete ? `${project.phase} checklist complete. ` : ""}Waiting: ${project.handoffBlocker}`
      : handoff.next ? `${project.phase} checklist complete. Checking automatic handoff to ${handoff.next}.`
      : "The next phase is unavailable. The project team must check its phase assignments."}</p>
  </section>
}

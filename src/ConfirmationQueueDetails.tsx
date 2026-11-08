import { DOC_LABELS, projectPhaseDisciplines, type Project, type State } from "./model"
import { requiredPhaseNames } from "./workflows"
import { SubcontractorAllocationReadOnly } from "./LeadSubcontractorPanel"
import { Badge, Button, Modal } from "./ui"
import "./confirmation-queue-details.css"

export default function ConfirmationQueueDetails({ state, project, view, onClose }: {
  state: State
  project: Project
  view: "team" | "subcontractors"
  onClose: () => void
}) {
  const agreement = project.docs.find(doc => doc.label === DOC_LABELS[6] && doc.uploaded)
  return <Modal title={view === "team" ? "Site PM Team by Phase" : "Subcontractor Allocation"} subtitle={`${project.name} · Read-only`} onClose={onClose} wide>
    <div className="confirmation-queue-details">
      {view === "team" ? <>
        <p className="confirmation-details-intro">Assigned responsibilities and each engineer’s acceptance status for every phase.</p>
        {[...new Set([...requiredPhaseNames(project), ...project.team.map(row => row.phase)])].map(phase => {
          const rows = project.team.filter(row => row.phase === phase)
          const required = rows.find(row => row.requiredDisciplines?.length)?.requiredDisciplines || projectPhaseDisciplines(project, phase)
          const engineers = rows.flatMap(row => row.engineers?.length ? row.engineers : row.accountId ? [{ accountId: row.accountId, assignedDisciplines: row.assignedDisciplines || [], status: row.status }] : [])
          return <section className="confirmation-phase-card" key={phase}>
            <header><h3>{phase}</h3></header>
            <p className="confirmation-phase-required">Required: {required.join(", ") || "No specialization requirements recorded"}</p>
            {engineers.length ? <div className="confirmation-engineer-grid">{engineers.map((engineer, index) => <article className="confirmation-engineer" key={`${engineer.accountId}-${index}`}>
              <header><strong>{state.accounts.find(account => account.id === engineer.accountId)?.name || "Engineer record unavailable"}</strong><Badge tone={engineer.status === "confirmed" ? "green" : "amber"}>{engineer.status === "confirmed" ? "Confirmed" : engineer.status === "declined" ? "Declined" : "Awaiting acceptance"}</Badge></header>
              {engineer.assignedDisciplines.length ? <div className="confirmation-assigned-tags">{engineer.assignedDisciplines.map(tag => <span key={tag}>{tag}</span>)}</div> : <p>No specialization details recorded.</p>}
            </article>)}</div> : <p>No engineers assigned to this phase.</p>}
          </section>
        })}
      </> : <>
        <div className="confirmation-agreement-status"><Badge tone={agreement ? "green" : "amber"}>{agreement ? "Signed agreement on file" : "Signed agreement required"}</Badge><p>{agreement ? agreement.name : project.clientSubcon ? "The Administrator must provide the signed client subcontractor agreement before activation." : "The Lead Site PM must provide the signed subcontractor agreement before activation."}</p></div>
        <SubcontractorAllocationReadOnly state={state} project={project} />
      </>}
    </div>
    <div className="modal-actions"><Button onClick={onClose}>Close</Button></div>
  </Modal>
}

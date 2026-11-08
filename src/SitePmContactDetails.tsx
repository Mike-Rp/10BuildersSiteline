import { useState } from "react"
import type { Account, Project } from "./model"
import { Badge, Button, Field, Modal } from "./ui"
import "./site-pm-contact-details.css"

export default function SitePmContactDetails({ account, project, onClose }: { account?: Account; project: Project; onClose: () => void }) {
  const [feedback, setFeedback] = useState("")
  const assignments = account ? project.team.flatMap(row => {
    const engineer = row.engineers?.find(person => person.accountId === account.id)
    if (engineer) return [{ phase: row.phase, tags: engineer.assignedDisciplines, status: engineer.status }]
    return row.accountId === account.id ? [{ phase: row.phase, tags: row.assignedDisciplines || [], status: row.status }] : []
  }) : []
  async function copy() {
    try {
      await window.navigator.clipboard.writeText([account?.name, `Project: ${project.name}`, account?.email && `Work email: ${account.email}`, account?.phone && `Phone: ${account.phone}`].filter(Boolean).join("\n"))
      setFeedback("Contact details copied.")
    } catch { setFeedback("Copy is unavailable. Select and copy the contact details below.") }
  }
  return <Modal title="Site PM Contact Details" subtitle={project.name} onClose={onClose}>
    <div className="site-pm-contact-details">
      <h3>{account?.name || "Site PM record unavailable"}</h3>
      <p>Site Project Manager</p>
      <div className="site-pm-contact-fields">
        <Field label="Work email"><input aria-label="Site PM work email" readOnly value={account?.email || "Not recorded"} /></Field>
        <Field label="Contact number"><input aria-label="Site PM contact number" readOnly value={account?.phone || "Not recorded"} /></Field>
      </div>
      <h4>Responsibilities on this project</h4>
      {assignments.map(assignment => <div className="site-pm-contact-assignment" key={assignment.phase}>
        <div><strong>{assignment.phase}</strong>{assignment.tags.length > 0 && <p>{assignment.tags.join(", ")}</p>}</div>
        <Badge tone={assignment.status === "confirmed" ? "green" : "amber"}>{assignment.status === "confirmed" ? "Confirmed" : assignment.status === "declined" ? "Declined" : "Awaiting acceptance"}</Badge>
      </div>)}
      {!account && <p>The assigned Site PM’s contact record is unavailable. Ask the Administrator to check the personnel record.</p>}
      {feedback && <p role="status">{feedback}</p>}
    </div>
    <div className="modal-actions"><Button onClick={onClose}>Close</Button><Button disabled={!account?.email && !account?.phone} onClick={() => void copy()}>Copy Contact Details</Button></div>
  </Modal>
}

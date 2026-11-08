import { initials, type Account, type Doc, type Project } from "./model"
import { downloadDoc, Upload } from "./panels"
import { Badge, Button, Empty, Modal } from "./ui"
import "./site-pm-appointment-agreements.css"

export function appointmentStaff(project: Project, accounts: Account[]) {
  const ids = new Set(project.team.flatMap(row => [row.accountId, ...(row.engineers || []).map(engineer => engineer.accountId)]).filter(Boolean))
  return accounts.filter(account => account.role === "spm" && ids.has(account.id))
}
export function appointmentFor(project: Project, account: Account) {
  return project.docs.find(doc => doc.uploaded && (doc.subjectId === account.id || doc.label === `${account.name} — Engagement Agreement`))
}
export default function SitePmAppointmentAgreements({ project, accounts, onPreview, onUpload, onClose }: {
  project: Project
  accounts: Account[]
  onPreview: (doc: Doc) => void
  onUpload: (account: Account, doc: Doc) => void | boolean | Promise<void | boolean>
  onClose: () => void
}) {
  const staff = appointmentStaff(project, accounts)
  return <Modal title="Site PM Appointment Agreements" subtitle={project.name} onClose={onClose} wide>
    <div className="site-pm-appointment-agreements">
      <p className="section-description">Project-specific appointments for assigned Site PMs.</p>
      {staff.length ? staff.map(account => {
        const agreement = appointmentFor(project, account)
        return <section className="appointment-agreement-row" key={account.id}>
          <span className="avatar small">{initials(account.name)}</span>
          <div className="appointment-agreement-person"><strong>{account.name}</strong><small>Site Project Manager</small>{agreement && <p>{agreement.name}</p>}</div>
          {agreement ? <div className="appointment-agreement-actions">
            <Badge tone="green">Agreement on file</Badge>
            <Button icon="eye" aria-label={`View appointment agreement for ${account.name}`} onClick={() => onPreview(agreement)}>View</Button>
            <Button icon="download" aria-label={`Download appointment agreement for ${account.name}`} onClick={() => downloadDoc(agreement)}>Download</Button>
          </div> : project.status === "completed" ? <Badge>Not on file</Badge> : <Upload label={`${account.name} — Engagement Agreement`} onSave={doc => onUpload(account, doc)} />}
        </section>
      }) : <Empty title="No Site PM appointments">Assigned Site PMs and their appointment agreements will appear here.</Empty>}
    </div>
    <div className="modal-actions"><Button onClick={onClose}>Close</Button></div>
  </Modal>
}

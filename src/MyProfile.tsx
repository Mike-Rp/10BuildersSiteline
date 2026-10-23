import { useState } from "react"
import { dateLabel, initials, licenseState, ROLE_NAMES, type Account, type Doc, type Project } from "./model"
import { DocumentList, Preview } from "./panels"
import { Badge, Modal } from "./ui"

export default function MyProfile({ actor, projects, onClose }: {
  actor: Account
  projects: Project[]
  onClose: () => void
}) {
  const [preview, setPreview] = useState<Doc>()
  const assigned = projects.filter(p => p.opmId === actor.id || p.team.some(t => t.accountId === actor.id))
  // Keep a single dialog mounted so document previews retain keyboard focus correctly.
  if (preview) return <Preview doc={preview} viewer={actor.name} downloadable={false} onClose={() => setPreview(undefined)} />
  return <Modal title="My profile" onClose={onClose}>
    <div className="detail-hero">
      <span className="avatar extra-large">{initials(actor.name)}</span>
      <div><small>{ROLE_NAMES[actor.role]}</small><h2>{actor.name}</h2><p>{actor.email}</p></div>
      <Badge>{actor.status}</Badge>
    </div>
    <div className="detail-grid account-detail-grid">
      <div><small>CONTACT NUMBER</small><strong>{actor.phone || "Not provided"}</strong></div>
      <div><small>ADDED</small><strong>{actor.added ? dateLabel(actor.added) : "Not on file"}</strong></div>
      <div><small>DISCIPLINE / SPECIALIZATION</small><strong>{[...actor.scope, ...actor.projectTypes].join(", ") || "Not on file"}</strong></div>
      <div><small>WORKLOAD</small><strong>{assigned.filter(p => p.status === "active").length} active projects</strong></div>
    </div>
    <section className="detail-section">
      <h3>Professional credentials</h3>
      <p>License: {actor.license || "Not on file"}</p>
      <p>Expiry: {actor.expiry ? dateLabel(actor.expiry) : "Not on file"} · {licenseState(actor)}</p>
      <p>Certifications: {actor.certifications?.join(", ") || "Not on file"}</p>
    </section>
    <section className="detail-section">
      <h3>My documents</h3>
      {actor.docs.length ? <DocumentList docs={actor.docs} onPreview={setPreview} /> : <p>No documents on file.</p>}
    </section>
    <section className="detail-section">
      <h3>My assignments</h3>
      {assigned.length ? assigned.map(p => <div className="history-row" key={p.id}>
        <div><strong>{p.name}</strong><p>{p.status} · {p.opmId === actor.id ? "Office PM" : p.team.filter(t => t.accountId === actor.id).map(t => `${t.phase} (${t.status})`).join(", ")}</p></div>
      </div>) : <p>No assignments on file.</p>}
    </section>
    <p className="notice">Contact your Administrator to update official account details, professional credentials, or assignments.</p>
  </Modal>
}

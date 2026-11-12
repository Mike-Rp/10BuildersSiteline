import type { Account, Project } from "./model"
import { projectClients } from "./project-clients"

export default function ProjectClientDetails({ project, accounts }: { project: Project; accounts: Account[] }) {
  const clients = projectClients(project, accounts)
  return <section className="project-client-details" aria-label="Project client account">
    <h3>{clients.length > 1 ? "Client accounts" : "Client account"}</h3>
    {clients.length ? clients.map(client => <dl className="project-client-contact" key={client.id}>
      <div><dt>Client name</dt><dd>{client.name}</dd></div>
      <div><dt>Contact number</dt><dd>{client.phone || "Not on file"}</dd></div>
      <div><dt>Email address</dt><dd>{client.email || "Not on file"}</dd></div>
      {client.contactPerson && <div><dt>Contact person</dt><dd>{client.contactPerson}</dd></div>}
    </dl>) : <p className="role-muted">No linked client account is available. Ask the Administrator to check this project’s client assignment.</p>}
  </section>
}

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { api } from "./api/client"
import AccountSignInDetails, { type CreatedAccountDetails } from "./AccountSignInDetails"
import { Button, Field } from "./ui"
import "./project-client-account.css"

type Client = { id: string; full_name: string; email: string; phone?: string; status: string }
type Draft = { company_name: string; contact_person: string; email: string; phone: string }
type AccountData = { clients: Client[]; editable: boolean; defaults: Draft }
const empty: Draft = { company_name: "", contact_person: "", email: "", phone: "" }

export default function ProjectClientAccount({ projectId, onSaved }: {
  projectId: string; onSaved?: () => unknown | Promise<unknown>
}) {
  const [data, setData] = useState<AccountData>()
  const [draft, setDraft] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [credentials, setCredentials] = useState<CreatedAccountDetails>()
  const [reload, setReload] = useState(0)
  const saving = useRef(false)
  useEffect(() => {
    let live = true
    setData(undefined); setError(""); setMessage(""); setCredentials(undefined)
    api<AccountData>(`/projects/${projectId}/client-account`).then(next => {
      if (live) { setData(next); setDraft({ ...empty, ...next.defaults }) }
    }).catch(reason => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [projectId, reload])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      const client = await api<Client & { reused: boolean; temp_password?: string }>("/projects/intake/client-account", {
        method: "POST", json: { ...draft, project_id: projectId },
      })
      setData(current => current && { ...current, clients: [client] })
      setMessage(client.reused ? "Existing client account linked to this project." : "Client account created and linked. Awaiting first sign-in.")
      if (client.temp_password) setCredentials({ name: client.full_name, email: client.email, password: client.temp_password, role: "client" })
      try { await onSaved?.() }
      catch { setError("Client account saved. Refresh the workspace to load the latest project information.") }
    } catch (reason) { setError((reason as Error).message) }
    finally { saving.current = false; setBusy(false) }
  }

  return <section className="project-client-account detail-section" aria-label="Client account setup">
    <h3>Client account</h3>
    {!data && !error && <p role="status">Loading client account…</p>}
    {!!data?.clients?.length && data.clients.map(client => <div className="project-client-account-record" key={client.id}>
      <strong>{client.full_name}</strong><span>{client.email}</span>
      <span>{client.status === "invited" ? "Awaiting first sign-in" : client.status === "active" ? "Active" : "Account needs attention"}</span>
      {!["active", "invited"].includes(client.status) && <p>Admin needs to review this account in Team & accounts before project activation.</p>}
    </div>)}
    {data && !data.clients?.length && (data.editable ? <form onSubmit={save}>
      <p>Use the client's existing personal or business email, such as Gmail. An existing client account can be linked using its registered email. Complete this step before project activation.</p>
      <p>New account sign-in details are displayed for manual handover to the client during onboarding.</p>
      <div className="project-client-account-fields">
        <Field label="Client / company name"><input required maxLength={150} value={draft.company_name} disabled={busy} onChange={event => setDraft({ ...draft, company_name: event.target.value })} /></Field>
        <Field label="Contact person"><input required maxLength={150} value={draft.contact_person} disabled={busy} onChange={event => setDraft({ ...draft, contact_person: event.target.value })} /></Field>
        <Field label="Client login email"><input type="email" required maxLength={254} placeholder="client@gmail.com" value={draft.email} disabled={busy} onChange={event => setDraft({ ...draft, email: event.target.value })} /></Field>
        <Field label="Contact number (optional)"><input type="tel" value={draft.phone} disabled={busy} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></Field>
      </div>
      <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving client account…" : "Create or link client account"}</Button>
    </form> : <p>No client account is linked. Ask Admin to review this project's client assignment.</p>)}
    {message && <p role="status">{message}</p>}
    {error && <div role="alert"><p>{error}</p>{!data && <Button onClick={() => setReload(current => current + 1)}>Try again</Button>}</div>}
    {credentials && createPortal(<AccountSignInDetails details={credentials} onClose={() => setCredentials(undefined)} />, document.body)}
  </section>
}

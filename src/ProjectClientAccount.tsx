import { useEffect, useRef, useState } from "react"
import { api } from "./api/client"
import { clientActivationLabel, type ClientActivationStatus } from "./client-activation"
import { Button, Field } from "./ui"
import "./project-client-account.css"

type Client = { id: string; full_name: string; email: string; status?: string; activation_status?: ClientActivationStatus }
type AccountData = {
  mode?: "client_owned"
  contact_email?: string
  clients: Client[]
  status?: string
  next_action?: string
  can_recover?: boolean
  managed: boolean
  existing?: Client
  can_issue_activation_code: boolean
  defaults: { email: string }
}
type ActivationCode = { email?: string; contact_email?: string; code: string; expires_at: string }
const expiry = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })

export default function ProjectClientAccount({ projectId, onSaved }: {
  projectId: string; onSaved?: () => unknown | Promise<unknown>
}) {
  const [data, setData] = useState<AccountData>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [ownershipVerified, setOwnershipVerified] = useState(false)
  const [email, setEmail] = useState("")
  const [activation, setActivation] = useState<ActivationCode>()
  const [reload, setReload] = useState(0)
  const saving = useRef(false)
  const path = `/projects/${projectId}/client-account`

  useEffect(() => {
    const request = new AbortController()
    setData(undefined)
    setError("")
    setOwnershipVerified(false)
    setActivation(undefined)
    api<AccountData>(path, { signal: request.signal }).then(result => { if (!request.signal.aborted) { setData(result); setEmail(result.defaults.email) } }).catch(reason => {
      if (!request.signal.aborted) setError(reason.message)
    })
    return () => request.abort()
  }, [path, reload])

  async function run(action: () => Promise<void>) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError("")
    setMessage("")
    try { await action() }
    catch (reason) { setError((reason as Error).message) }
    finally { saving.current = false; setBusy(false) }
  }

  async function linkVerifiedClient() {
    if (!data?.existing || !ownershipVerified) return
    const client = data.existing
    await api(`/projects/${projectId}/client`, {
      method: "POST", json: { client_user_id: client.id, ownership_verified: true },
    })
    setData({ ...data, clients: [{ ...client, activation_status: "active" }], existing: undefined, can_recover:false, status:"active", next_action:"none" })
    setMessage("Verified client account linked to the project.")
    try { await onSaved?.() }
    catch { setError("The account was linked. Refresh the workspace to see the latest project information.") }
  }

  return <section className="project-client-account detail-section" aria-label="Client account setup">
    <h3>Client account</h3>
    {!data && !error && <p role="status">Loading client account…</p>}
    {data?.clients.map(client => <div className="project-client-account-record" key={client.id}>
      <strong>{client.full_name}</strong>{data.mode !== "client_owned" && <span>{client.email}</span>}
      <span className={`project-client-account-status ${client.activation_status === "active" || !client.activation_status && client.status === "active" ? "active" : "pending"}`}>{client.activation_status ? clientActivationLabel(client.activation_status)
        : client.status === "active" ? "Active" : client.status === "invited" ? "Awaiting first sign-in" : "Account needs attention"}</span>
    </div>)}
    {data?.mode === "client_owned" && <p>Contact email address: {data.contact_email || "Not provided"}</p>}
    {data && !data.clients.length && <p>{data.status === "project_not_active" ? "Client account creation is available in Active sites after the project is activated." : data.mode === "client_owned" ? "The client registers with their own email and password using a project invitation." : data.next_action === "request_email_correction"
      ? "Request a corrected client email. An Administrator must verify ownership before restoring access."
      : "Ask an Administrator to verify the client?s identity and registered email."}</p>}
    {data?.can_recover && !data.existing && <form onSubmit={event => {
      event.preventDefault()
      void run(async () => {
        await api(path + "/recover", {method:"POST",json:{email,ownership_verified:ownershipVerified}})
        setReload(value => value+1)
        await onSaved?.()
      })
    }}>
      <Field label="Verified client email"><input required type="email" value={email} onChange={event => { setEmail(event.target.value); setOwnershipVerified(false) }} /></Field>
      <label><input type="checkbox" checked={ownershipVerified} onChange={event => setOwnershipVerified(event.target.checked)} /> I verified that this client owns this email.</label>
      <Button type="submit" disabled={busy || !email || !ownershipVerified}>Recover client account</Button>
    </form>}
    {data?.status === "account_unavailable" && <p>Ask an Administrator to review the existing client link before activation.</p>}
    {data?.existing && <form onSubmit={event => { event.preventDefault(); void run(linkVerifiedClient) }}>
      <p>{data.existing.full_name} · {data.existing.email}</p>
      <label><input type="checkbox" checked={ownershipVerified} onChange={event => setOwnershipVerified(event.target.checked)} disabled={busy} /> I verified that this client owns the registered email.</label>
      <Button type="submit" variant="primary" disabled={!ownershipVerified || busy}>Link verified account</Button>
    </form>}
    {data?.can_issue_activation_code && <div className="project-client-activation-action">
      <p>Verify the client’s identity, then share the code privately so they can set their password.</p>
      {data.mode === "client_owned" && !activation && <label><input type="checkbox" checked={ownershipVerified} disabled={busy} onChange={event => setOwnershipVerified(event.target.checked)} /> I verified the intended client's identity for this project.</label>}
      {!activation && <Button disabled={busy || data.mode === "client_owned" && !ownershipVerified} onClick={() => void run(async () => {
        setActivation(await api<ActivationCode>(`${path}/activation-code`, { method: "POST", json: { recipient_verified: ownershipVerified } }))
      })}>{busy ? "Issuing code…" : "Issue activation code"}</Button>}
      {activation && <div className="notice" role="status">
        <div><p><strong>One-time activation code</strong></p>
          <Field label="Activation code"><input readOnly value={activation.code} onFocus={event => event.target.select()} /></Field>
          <p>Expires {expiry.format(new Date(activation.expires_at))}. Issuing a new code replaces the previous one.</p>
          <Button onClick={() => setActivation(undefined)}>Hide code</Button>
        </div>
      </div>}
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <div role="alert"><p>{error}</p>{!data && <Button onClick={() => setReload(current => current + 1)}>Try again</Button>}</div>}
  </section>
}

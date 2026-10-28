import { useEffect, useState, type ReactNode } from "react"
import { api } from "./api/client"
import { Button, Field, Modal } from "./ui"
export type PasswordResetRequest = { id: string; full_name: string; email: string; requested_at: string }
export default function PasswordResetRequests({ children }: { children: (requests: PasswordResetRequest[], open: (id: string) => void) => ReactNode }) {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([])
  const [selected, setSelected] = useState<PasswordResetRequest>()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState("")
  useEffect(() => {
    let live = true
    const refresh = () => api<PasswordResetRequest[]>("/accounts/password-reset-requests").then(rows => { if (live) { setRequests(rows); setError("") } }).catch(e => { if (live) setError(e.message) })
    refresh()
    const timer = setInterval(refresh, 10000)
    window.addEventListener("focus", refresh)
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", refresh) }
  }, [])
  return <>
    {children(requests, id => { setSelected(requests.find(request => request.id === id)); setPassword(""); setError("") })}
    {error && !selected && <p role="alert" className="error">{error}</p>}
    {selected && <Modal title="Reset account password" subtitle={selected.email} onClose={() => { if (!busy) { setSelected(undefined); setPassword("") } }}>
      <form onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError("")
        try {
          const result = await api<{temp_password: string}>("/accounts/" + selected.id + "/regenerate-password", { method: "POST", json: { adminPassword: password } })
          setIssued(result.temp_password); setRequests(current => current.filter(item => item.id !== selected.id)); setSelected(undefined); setPassword("")
        } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}>
        <p>This generates a random temporary password and signs out their existing sessions.</p>
        <Field label="Your administrator password"><input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="modal-actions"><Button disabled={busy} onClick={() => { setSelected(undefined); setPassword("") }}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "Resetting?" : "Reset password"}</Button></div>
      </form>
    </Modal>}
    {issued && <Modal title="Password reset complete" onClose={() => setIssued("")}><p>Share this temporary password with the account owner:</p><div className="password-display"><code>{issued}</code></div><p>They must choose a new password after signing in.</p><Button onClick={() => setIssued("")}>Done</Button></Modal>}
  </>
}

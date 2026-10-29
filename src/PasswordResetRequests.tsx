import { useEffect, useState, type ReactNode } from "react"
import { api } from "./api/client"
import { Button, Field, Modal } from "./ui"
export type PasswordResetRequest = {
  id: string; full_name: string; email: string; role?: string; requested_at: string;
  status?: "pending" | "completed"; read_at?: string | null; completed_at?: string; completed_by?: string;
}
export default function PasswordResetRequests({ children }: { children: (requests: PasswordResetRequest[], open: (id: string, requestedAt?: string) => void) => ReactNode }) {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([])
  const [selected, setSelected] = useState<PasswordResetRequest>()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loadError,setLoadError] = useState("")
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState("")
  useEffect(() => {
    let live = true, sequence = 0
    const refresh = async () => {
      const version=++sequence
      try { const rows=await api<PasswordResetRequest[]>("/accounts/password-reset-requests?include_completed=true"); if(live && version===sequence) {setLoadError("");setRequests(current=>rows.map(row=>{const previous=current.find(r=>r.id===row.id && r.requested_at===row.requested_at);return previous?.status==='completed' && row.status!=='completed' ? previous : {...row,read_at:row.read_at || previous?.read_at}}))} }
      catch(e) { if(live) setLoadError((e as Error).message) }
    }
    void refresh()
    const timer=setInterval(refresh,10000)
    window.addEventListener("focus",refresh)
    return ()=>{live=false;clearInterval(timer);window.removeEventListener("focus",refresh)}
  },[])
  async function open(id: string, requestedAt?: string) {
    const item=requests.find(r=>r.id===id && (!requestedAt || r.requested_at===requestedAt))
    if(!item) return
    setSelected(item);setPassword("");setError("")
    if(item.status==='completed' || item.read_at) return
    try {
      const result=await api<{read_at:string}>(`/accounts/${id}/password-reset-requests/read`,{method:'POST',json:{requestedAt:item.requested_at}})
      setRequests(rows=>rows.map(r=>r.id===id && r.requested_at===item.requested_at ? {...r,read_at:result.read_at} : r))
    } catch(e) {setError((e as Error).message)}
  }
  return <>
    {children(requests,(id,requestedAt)=>{void open(id,requestedAt)})}
    {loadError && <p role="alert" className="error">{loadError}</p>}
    {error && !selected && <p role="alert" className="error">{error}</p>}
    {selected && <Modal title={selected.status==='completed' ? 'Completed password reset' : 'Reset account password'} subtitle={selected.email} onClose={()=>{if(!busy){setSelected(undefined);setPassword("")}}}>
      <p><strong>{selected.full_name}</strong></p>
      <p>Requested: {new Date(selected.requested_at).toLocaleString('en-PH')}</p>
      {selected.status==='completed' ? <><p>Password reset completed {selected.completed_at ? new Date(selected.completed_at).toLocaleString('en-PH') : ''}. The temporary password is not retained in this history.</p><Button onClick={()=>setSelected(undefined)}>Close</Button></> : <form onSubmit={async event=>{
        event.preventDefault();setBusy(true);setError("")
        try {
          const result=await api<{temp_password:string}>(`/accounts/${selected.id}/regenerate-password`,{method:'POST',json:{adminPassword:password,requestedAt:selected.requested_at}})
          const completed={...selected,status:'completed' as const,completed_at:new Date().toISOString()}
          setIssued(result.temp_password)
          setRequests(rows=>rows.map(r=>r.id===selected.id && r.requested_at===selected.requested_at ? completed : r))
          setSelected(undefined);setPassword("")
        } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
      }}>
        <p>Verify the requester before resetting access. This generates a random temporary password and signs out their existing sessions.</p>
        <Field label="Your administrator password"><input required type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} /></Field>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="modal-actions"><Button disabled={busy} onClick={()=>{setSelected(undefined);setPassword("")}}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy?'Resetting…':'Reset password'}</Button></div>
      </form>}
    </Modal>}
    {issued && <Modal title="Password reset complete" onClose={()=>setIssued("")}><p>Share this temporary password with the account owner:</p><div className="password-display"><code>{issued}</code></div><p>They must choose a new password after signing in.</p><Button onClick={()=>setIssued("")}>Done</Button></Modal>}
  </>
}

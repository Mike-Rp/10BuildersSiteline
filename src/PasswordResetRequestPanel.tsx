import { useState } from "react"
import { Badge, Button, Empty, Field, Icon, Modal } from "./ui"
import type { PasswordResetRequest } from "./PasswordResetRequests"

const roleName = (role?: string) => ({admin:"Administrator",opm:"Office PM",spm:"Site PM",client:"Client"}[role || ""] || "Account holder")
const timeLabel = (value: string) => new Date(value).toLocaleString("en-PH", {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})
export default function PasswordResetRequestPanel({requests,onOpen}:{requests:PasswordResetRequest[];onOpen:(id:string,requestedAt?:string)=>void}) {
  const [all,setAll]=useState(false),[search,setSearch]=useState(""),[filter,setFilter]=useState("pending"),[page,setPage]=useState(1)
  const pending=requests.filter(r=>r.status!=='completed'),completed=requests.filter(r=>r.status==='completed')
  const unread=pending.filter(r=>!r.read_at).length
  const filtered=requests.filter(r=>(filter==='all' || (r.status || 'pending')===filter) && `${r.full_name} ${r.email} ${roleName(r.role)}`.toLowerCase().includes(search.toLowerCase()))
  const pages=Math.max(1,Math.ceil(filtered.length/6)),current=Math.min(page,pages)
  const row=(r:PasswordResetRequest)=><li key={`${r.id}:${r.requested_at}`} className={`reset-request-row ${r.status!=='completed' && !r.read_at?'is-unread':''}`}>
    <div className="reset-request-person"><span>{r.full_name} {r.status!=='completed' && !r.read_at && <span className="reset-unread-dot" aria-hidden="true" />}</span><small>{roleName(r.role)} · {r.status==='completed'?'Reset finished':r.read_at?'Read by you':'Unread'}</small></div>
    <time dateTime={r.requested_at}>{timeLabel(r.requested_at)}</time>
    <Badge tone={r.status==='completed'?'green':'amber'}>{r.status==='completed'?'Completed':'Pending'}</Badge>
    <Button onClick={()=>{setAll(false);onOpen(r.id,r.requested_at)}}>{r.status==='completed'?'View details':'Review request'}</Button>
  </li>
  return <section className="reset-request-panel" aria-labelledby="reset-requests-title">
    <header><Icon name="shield" size={24}/><div><h2 id="reset-requests-title">Password reset requests</h2><p>Opening a request marks it as read. It stays pending until the reset is completed.</p></div><Badge tone="amber">{pending.length} pending · {unread} unread</Badge></header>
    {pending.length?<ul>{pending.slice(0,3).map(row)}</ul>:<Empty title="No pending password reset requests">New requests will appear here.</Empty>}
    {completed.length>0 && <><h3 className="reset-completed-label">Recently completed</h3><ul>{completed.slice(0,3).map(row)}</ul></>}
    <footer><small>Blue highlight: unread · White: read and pending · Green badge: completed</small><Button variant="text-button" onClick={()=>setAll(true)}>View all requests <Icon name="arrow" size={15}/></Button></footer>
    {all && <Modal title="Password reset requests" subtitle="Pending requests and the 20 most recent completed resets" wide onClose={()=>setAll(false)}>
      <div className="reset-request-tools"><Field label="Search requests"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search name, role or email…"/></Field><Field label="Status"><select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="pending">Pending ({pending.length})</option><option value="completed">Completed ({completed.length})</option><option value="all">All requests</option></select></Field></div>
      {filtered.length?<ul className="reset-all-list">{filtered.slice((current-1)*6,current*6).map(row)}</ul>:<Empty title="No matching requests">Try another search or status.</Empty>}
      <div className="modal-actions"><Button disabled={current===1} onClick={()=>setPage(current-1)}>Previous</Button><span>Page {current} of {pages}</span><Button disabled={current===pages} onClick={()=>setPage(current+1)}>Next</Button></div>
    </Modal>}
  </section>
}

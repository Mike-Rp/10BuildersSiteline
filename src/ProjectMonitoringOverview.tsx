import { useEffect, useRef, useState } from "react"
import { dateLabel, initials, projectPhaseNames, type Doc, type Project, type State } from "./model"
import { workflowFor } from "./workflows"
import { downloadApiFile } from "./api/client"
import { Badge, Icon } from "./ui"
import OverallProjectProgress from "./OverallProjectProgress"
import PhaseTimeline from "./PhaseTimeline"
import ScheduleStatusBadge, { useScheduleToday } from "./ScheduleStatus"
import "./project-monitoring.css"
import { projectClientNames } from "./project-clients"

function ProjectPhoto({ docs, onOpen }: {docs:Doc[];onOpen:(doc:Doc)=>void}) {
  const [index,setIndex]=useState(0)
  const ids=docs.map(doc=>doc.id).join("|")
  useEffect(()=>setIndex(0),[ids])
  const doc=docs[index]
  // Photos live only in memory while this carousel is mounted. `urls` holds finished downloads,
  // `pending` shares an in-flight request, and a failed request is forgotten so it can be retried.
  const urls=useRef(new Map<string,string>()),pending=useRef(new Map<string,Promise<void>>()),current=useRef(new Set<string>()),alive=useRef(true)
  const [,refresh]=useState(0)
  useEffect(()=>{
    alive.current=true
    const cache=urls.current
    return ()=>{alive.current=false;cache.forEach(url=>URL.revokeObjectURL(url));cache.clear()}
  },[])
  useEffect(()=>{
    current.current=new Set(docs.map(item=>item.id))
    for(const [id,url] of urls.current)if(!current.current.has(id)){URL.revokeObjectURL(url);urls.current.delete(id)}
  },[ids])
  useEffect(()=>{
    if(!doc||urls.current.has(doc.id)||pending.current.has(doc.id))return
    const id=doc.id
    const request=downloadApiFile(id).then(blob=>{
      if(!alive.current||!current.current.has(id)||!blob||!/^image\/(png|jpeg)$/.test(blob.type))return
      urls.current.set(id,URL.createObjectURL(blob));refresh(n=>n+1)
    }).catch(()=>{}).finally(()=>{pending.current.delete(id);if(alive.current)refresh(n=>n+1)})
    pending.current.set(id,request)
  },[doc?.id])
  useEffect(()=>{
    if(docs.length<2)return
    const timer=window.setInterval(()=>setIndex(current=>(current+1)%docs.length),5000)
    return ()=>window.clearInterval(timer)
  },[docs.length,ids])
  if(!doc)return <div className="monitor-photo-empty"><Icon name="building" size={40}/><p>No OPM-approved site photos yet.</p></div>
  const image=urls.current.get(doc.id)
  return <div className="monitor-photo-roulette">
    <button type="button" className="monitor-photo" onClick={()=>onOpen(doc)}>
      {image ? <img src={image} alt={doc.name}/> : <span className="monitor-photo-empty"><Icon name="doc" size={32}/>View photograph</span>}
      <span>{doc.name}<small>OPM approved · {dateLabel(doc.date)}</small></span>
    </button>
    {docs.length>1&&<div className="monitor-photo-controls"><button type="button" aria-label="Previous approved photo" onClick={()=>setIndex(i=>(i-1+docs.length)%docs.length)}>‹</button><span>{index+1} / {docs.length}</span><button type="button" aria-label="Next approved photo" onClick={()=>setIndex(i=>(i+1)%docs.length)}>›</button></div>}
  </div>
}

/** Staff summary uses already-authorized project data; all editing stays in existing controls. */
export default function ProjectMonitoringOverview({ project:p, state, onPreview, showClient = false }: {
  project:Project;state:State;onPreview:(doc:Doc)=>void;showClient?:boolean
}) {
  const work=workflowFor(p),today=useScheduleToday()
  // Client visibility is the persisted result of OPM approval. Older approved
  // uploads may not have review-status or MIME metadata populated consistently.
  const photos=[...(work.photos || [])].filter(doc=>doc.uploaded && doc.clientVisible && /\.(png|jpe?g)$/i.test(doc.name)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))
  const people=[...new Set([p.opmId,...p.team.flatMap(row=>[row.accountId,...(row.engineers||[]).map(e=>e.accountId)])])].map(id=>state.accounts.find(account=>account.id===id)).filter(account=>!!account)
  const selected=work.selections?.find(row=>row.status==='accepted')
  const company=selected?state.companies.find(row=>row.id===selected.companyId):undefined
  const updates=[...p.history].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3)
  const clientNames=projectClientNames(p,state.accounts)
  return <section className="project-monitoring" aria-label={`${p.name} monitoring overview`}>
    <header className="monitor-heading">
      <div><span className="eyebrow">{p.type}</span><h2>{p.name}</h2>
        {showClient && <p className="monitor-client" aria-label="Linked project clients"><Icon name="users" size={17}/><span>{clientNames.length ? <>{clientNames.length>1?'Clients':'Client'}: <strong>{clientNames.join(', ')}</strong></> : 'No linked client account'}</span></p>}
        <div className="monitor-badges"><Badge tone={p.status==='active'||p.status==='completed'?'green':'amber'}>{p.status==='completed'?'Completed':p.status==='active'?'Active':p.status.replace(/_/g,' ')}</Badge><Badge tone="blue">Current phase: {p.phase}</Badge><ScheduleStatusBadge project={p} today={today}/></div></div>
      <div className="monitor-totals"><OverallProjectProgress name={p.name} verifiedProgress={p.verifiedProgress}/><div className="monitor-target"><small>Target completion</small><strong>{p.end?dateLabel(p.end):'Not set'}</strong></div></div>
    </header>
    <div className="monitor-grid">
      <section className="monitor-card"><h3><Icon name="building" size={20}/>Project overview</h3><ProjectPhoto key={p.id} docs={photos} onOpen={onPreview}/><dl className="monitor-facts"><div><dt>Floor area</dt><dd>{p.area} sqm</dd></div><div><dt>Target start</dt><dd>{dateLabel(p.start)}</dd></div><div><dt>Floors</dt><dd>{p.floors}</dd></div></dl><h4>Recent project records</h4>{updates.length?<ul className="monitor-updates">{updates.map((row,i)=><li key={row.id||i}><p>{row.text}</p><small>{dateLabel(row.date)}</small></li>)}</ul>:<p className="monitor-muted">No project updates recorded yet.</p>}</section>
      <section className="monitor-card monitor-phases"><h3><Icon name="check" size={20}/>Construction phases</h3><PhaseTimeline phase={p.phase} phases={projectPhaseNames(p)} completed={p.status==='completed'} detailed/><p className="monitor-note">Phase sequence is separate from approved overall progress. Some activities may overlap; existing sign-off rules still apply.</p></section>
      <div className="monitor-side">
        <section className="monitor-card"><h3><Icon name="users" size={20}/>Assigned team</h3>{people.length?people.map(account=><div className="monitor-person" key={account.id}><span className="avatar">{initials(account.name)}</span><div><strong>{account.name}</strong><small>{account.role==='opm'?'Office Project Manager':'Site Project Manager'}</small></div></div>):<p className="monitor-muted">No personnel assigned.</p>}</section>
        <section className="monitor-card"><h3><Icon name="building" size={20}/>Subcontractor company</h3><strong>{company?.name || p.clientSubconCompany?.name || p.clientSubcon || 'Not assigned'}</strong>{company?.capabilityReview?.reviewedAt && <><p className="monitor-muted">Verified company trades</p><div className="tag-list">{company.capabilityReview.disciplines.map(trade=><span key={trade}>{trade}</span>)}</div></>}</section>
        {work.pendingUpdate && <section className="monitor-card monitor-review"><h3><Icon name="clock" size={20}/>Pending review</h3><p>A project update is awaiting review.</p><p className="monitor-muted">Use the existing review controls below to inspect the submission.</p></section>}
      </div>
    </div>
  </section>
}

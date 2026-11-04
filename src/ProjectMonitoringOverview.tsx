import { useEffect, useState } from "react"
import { dateLabel, initials, projectPhaseNames, type Doc, type Project, type State } from "./model"
import { workflowFor } from "./workflows"
import { downloadApiFile } from "./api/client"
import { Badge, Icon } from "./ui"
import OverallProjectProgress from "./OverallProjectProgress"
import PhaseTimeline from "./PhaseTimeline"
import ScheduleStatusBadge, { useScheduleToday } from "./ScheduleStatus"
import "./project-monitoring.css"

function ProjectPhoto({ docs, onOpen }: {docs:Doc[];onOpen:(doc:Doc)=>void}) {
  const [index,setIndex]=useState(0)
  useEffect(()=>setIndex(0),[docs.map(doc=>doc.id).join("|")])
  const doc=docs[index]
  const [image,setImage]=useState<{id:string;url:string}>()
  useEffect(()=>{
    if(!doc)return
    let active=true,url=""
    void downloadApiFile(doc.id).then(blob=>{
      if(!active || !blob || !/^image\/(png|jpeg)$/.test(blob.type))return
      url=URL.createObjectURL(blob);setImage({id:doc.id,url})
    }).catch(()=>{})
    return ()=>{active=false;if(url)URL.revokeObjectURL(url)}
  },[doc?.id])
  useEffect(()=>{
    if(docs.length<2)return
    const timer=window.setInterval(()=>setIndex(current=>(current+1)%docs.length),5000)
    return ()=>window.clearInterval(timer)
  },[docs.length,docs.map(item=>item.id).join("|")])
  if(!doc)return <div className="monitor-photo-empty"><Icon name="building" size={40}/><p>No OPM-approved site photos yet.</p></div>
  return <div className="monitor-photo-roulette">
    <button type="button" className="monitor-photo" onClick={()=>onOpen(doc)}>
      {image?.id===doc.id ? <img src={image.url} alt={doc.name}/> : <span className="monitor-photo-empty"><Icon name="doc" size={32}/>View photograph</span>}
      <span>{doc.name}<small>OPM approved · {dateLabel(doc.date)}</small></span>
    </button>
    {docs.length>1&&<div className="monitor-photo-controls"><button type="button" aria-label="Previous approved photo" onClick={()=>setIndex(i=>(i-1+docs.length)%docs.length)}>‹</button><span>{index+1} / {docs.length}</span><button type="button" aria-label="Next approved photo" onClick={()=>setIndex(i=>(i+1)%docs.length)}>›</button></div>}
  </div>
}

/** Staff summary uses already-authorized project data; all editing stays in existing controls. */
export default function ProjectMonitoringOverview({ project:p, state, onPreview }: {
  project:Project;state:State;onPreview:(doc:Doc)=>void
}) {
  const work=workflowFor(p),today=useScheduleToday()
  // Client visibility is the persisted result of OPM approval. Older approved
  // uploads may not have review-status or MIME metadata populated consistently.
  const photos=[...(work.photos || [])].filter(doc=>doc.uploaded && doc.clientVisible && /\.(png|jpe?g)$/i.test(doc.name)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))
  const people=[...new Set([p.opmId,...p.team.map(row=>row.accountId)])].map(id=>state.accounts.find(account=>account.id===id)).filter(account=>!!account)
  const selected=work.selections?.find(row=>row.status==='accepted')
  const company=selected?state.companies.find(row=>row.id===selected.companyId):undefined
  const updates=[...p.history].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3)
  return <section className="project-monitoring" aria-label={`${p.name} monitoring overview`}>
    <header className="monitor-heading">
      <div><span className="eyebrow">{p.type}</span><h2>{p.name}</h2><div className="monitor-badges"><Badge tone={p.status==='active'||p.status==='completed'?'green':'amber'}>{p.status==='completed'?'Completed':p.status==='active'?'Active':p.status.replace(/_/g,' ')}</Badge><Badge tone="blue">Current phase: {p.phase}</Badge><ScheduleStatusBadge project={p} today={today}/></div></div>
      <div className="monitor-totals"><OverallProjectProgress name={p.name} verifiedProgress={p.verifiedProgress}/><div className="monitor-target"><small>Target completion</small><strong>{p.end?dateLabel(p.end):'Not set'}</strong></div></div>
    </header>
    <div className="monitor-grid">
      <section className="monitor-card"><h3><Icon name="building" size={20}/>Project overview</h3><ProjectPhoto docs={photos} onOpen={onPreview}/><dl className="monitor-facts"><div><dt>Floor area</dt><dd>{p.area} sqm</dd></div><div><dt>Target start</dt><dd>{dateLabel(p.start)}</dd></div><div><dt>Floors</dt><dd>{p.floors}</dd></div>{p.location && <div><dt>Location</dt><dd>{p.location}</dd></div>}</dl><h4>Recent project records</h4>{updates.length?<ul className="monitor-updates">{updates.map((row,i)=><li key={row.id||i}><p>{row.text}</p><small>{dateLabel(row.date)}</small></li>)}</ul>:<p className="monitor-muted">No project updates recorded yet.</p>}</section>
      <section className="monitor-card monitor-phases"><h3><Icon name="check" size={20}/>Construction phases</h3><PhaseTimeline phase={p.phase} phases={projectPhaseNames(p)} completed={p.status==='completed'} detailed/><p className="monitor-note">Phase sequence is separate from approved overall progress. Some activities may overlap; existing sign-off rules still apply.</p></section>
      <div className="monitor-side">
        <section className="monitor-card"><h3><Icon name="users" size={20}/>Assigned team</h3>{people.length?people.map(account=><div className="monitor-person" key={account.id}><span className="avatar">{initials(account.name)}</span><div><strong>{account.name}</strong><small>{account.role==='opm'?'Office Project Manager':'Site Project Manager'}</small></div></div>):<p className="monitor-muted">No personnel assigned.</p>}</section>
        <section className="monitor-card"><h3><Icon name="building" size={20}/>Subcontractor company</h3><strong>{company?.name || p.clientSubconCompany?.name || p.clientSubcon || 'Not assigned'}</strong>{company?.capabilityReview?.reviewedAt && <><p className="monitor-muted">Verified company trades</p><div className="tag-list">{company.capabilityReview.disciplines.map(trade=><span key={trade}>{trade}</span>)}</div></>}</section>
        {work.pendingUpdate && <section className="monitor-card monitor-review"><h3><Icon name="clock" size={20}/>Pending review</h3><p>A project update is awaiting review.</p><p className="monitor-muted">Use the existing review controls below to inspect the submission.</p></section>}
      </div>
    </div>
  </section>
}

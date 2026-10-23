import {useEffect,useRef,useState} from "react"
import {api} from "./api/client"
import {Button,Modal} from "./ui"
import {downloadBlob} from "./panels"
import {currentReportMonth,monthlyPrintDocument,reportDate,reportFraction,type MonthlyReport as Report} from "./monthly-report"
import "./monthly-report.css"
import ReportProjectSearch from "./ReportProjectSearch"

export default function MonthlyReport({projects,initialProjectId,onClose}:{projects:{id:string;name:string}[];initialProjectId:string;onClose:()=>void}) {
  const [projectId,setProjectId]=useState(initialProjectId)
  const [month,setMonth]=useState(currentReportMonth)
  const [data,setData]=useState<{report:Report;snapshot:string}>()
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[exporting,setExporting]=useState(false)
  const revision=useRef(0),printFrame=useRef<HTMLIFrameElement|null>(null)
  useEffect(()=>()=>{revision.current++;printFrame.current?.remove()},[])
  useEffect(()=>{
    let active=true;revision.current++;setData(undefined);setError("")
    if(!projectId||!/^\d{4}-\d{2}$/.test(month)||month>currentReportMonth()){setLoading(false);return}
    setLoading(true)
    api<{report:Report;snapshot:string}>(`/projects/${projectId}/monthly-report?month=${encodeURIComponent(month)}`)
      .then(result=>{if(active)setData(result)}).catch(reason=>{if(active)setError(reason.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[projectId,month,refresh])
  async function exportReport(format:"csv"|"print") {
    if(!data||exporting)return
    const current=revision.current;setExporting(true);setError("")
    try {
      const result=await api<{csv?:string;report?:Report}>(`/projects/${data.report.project.id}/monthly-report/export`,{method:"POST",json:{snapshot:data.snapshot,format}})
      if(current!==revision.current)return
      if(format==="csv")downloadBlob(new Blob([result.csv||""],{type:"text/csv;charset=utf-8"}),`${data.report.project.name.replace(/[\\/:*?"<>|]/g,"-")} — ${data.report.period.month}.csv`)
      else if(result.report){
        printFrame.current?.remove()
        const frame=document.createElement("iframe");frame.className="monthly-print-frame";frame.title="Monthly report print preview";frame.setAttribute("aria-hidden","true");document.body.append(frame);printFrame.current=frame
        let printed=false
        frame.onload=()=>{if(!printed&&frame.contentDocument?.title==="Monthly Project Progress Summary"){printed=true;frame.contentWindow?.focus();frame.contentWindow?.print()}}
        frame.srcdoc=monthlyPrintDocument(result.report)
      }
    }catch(reason){setError((reason as Error).message)}finally{setExporting(false)}
  }
  const report=data?.report,pending=report?.pending
  return <Modal title="Monthly Project Progress Summary" subtitle={report?.project.name||projects.find(p=>p.id===projectId)?.name} wide onClose={onClose}>
    <div className="monthly-report">
      <div className="monthly-report-controls">
        <ReportProjectSearch projects={projects} value={projectId} onChange={setProjectId} />
        <label>Reporting month<input type="month" min="2000-01" max={currentReportMonth()} value={month} onChange={e=>setMonth(e.target.value)}/></label>
        <Button onClick={()=>setRefresh(n=>n+1)} disabled={loading||!month||!projectId}>Refresh</Button>
      </div>
      {!projects.length&&<p>No authorized projects are available.</p>}
      {month>currentReportMonth()&&<p role="alert" className="error">Future reporting months are unavailable.</p>}
      {loading&&<p role="status">Loading monthly report…</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      {report&&<>
        <p className="role-muted">{report.project.type} · {report.period.monthToDate?"Month to date":"Month-end snapshot"} · {report.period.timezone}</p>
        <p className="role-muted">{reportDate(report.period.start)} → {reportDate(report.period.cutoff)} (exclusive)<br/>Generated {reportDate(report.period.generatedAt)}</p>
        {report.createdAfterPeriod&&<p className="notice">This project was created after the selected reporting period.</p>}
        {report.limitations.map(text=><p className="monthly-report-limitation" key={text}>{text}</p>)}
        <div className="monthly-report-metrics">
          <section><h3>Verified progress</h3><strong>{report.opening.percentage===null?"Unavailable":`${report.opening.percentage.toFixed(1)}%`} → {report.closing.percentage===null?"Unavailable":`${report.closing.percentage.toFixed(1)}%`}</strong><p className="role-muted">Opening → closing</p></section>
          {report.projection!=="client"&&<section><h3>Activities approved</h3><strong>{report.approvals?.events??"Unavailable"}</strong><p className="role-muted">{report.approvals?`${report.approvals.distinctActivities} distinct activities`:"Historical or authorized detail unavailable"}</p></section>}
          <section><h3>Phases completed</h3><strong>{report.completedPhases?.length??"Unavailable"}</strong><p className="role-muted">Verified completion during period</p></section>
        </div>
        {report.projection!=="client"&&<><p className="role-muted">{report.scopeLabel}</p><div className="monthly-report-secondary"><span>Rework confirmed: <strong>{report.rework?.confirmed??"Unavailable"}</strong></span><span>Approvals withdrawn: <strong>{report.rework?.withdrawals??"Unavailable"}</strong></span><span>Pending reviews: <strong>{pending?pending.evidence+pending.reports+pending.rework:"Unavailable"}</strong></span></div>{pending&&<p className="role-muted">Evidence {pending.evidence} · Reports {pending.reports} · Rework requests {pending.rework}, at the reporting cutoff</p>}</>}
        <h3>Monthly progress movement</h3>
        <div className="monthly-report-table"><table><thead><tr><th>Record</th><th>Verified value</th></tr></thead><tbody>
          <tr><td>Opening verified progress</td><td>{reportFraction(report.opening)}</td></tr>
          {report.movement&&<><tr><td>Credit awarded from approvals</td><td>+{report.movement.awarded}</td></tr><tr><td>Credit withdrawn for rework</td><td>−{report.movement.withdrawn}</td></tr>{report.movement.scopeChanges>0&&<tr><td>Scope revision records ({report.movement.scopeChanges})</td><td>{report.movement.scopeDelta} credit change; denominator may differ</td></tr>}</>}
          <tr><td>Closing verified progress</td><td>{reportFraction(report.closing)}</td></tr>
        </tbody></table></div>
        <p className="role-muted">Verified progress uses approved required checklist activities. Uploads awaiting review earn no credit.{report.netChange!==null?` Net change: ${report.netChange.toFixed(1)} percentage points.`:""}</p>
        <h3>Phases completed during period</h3>
        {report.completedPhases===null?<p>Historical phase-completion records unavailable.</p>:report.completedPhases.length?<ul>{report.completedPhases.map(p=><li key={p.id}>{p.phase} · {reportDate(p.date)} · {p.stillComplete?"Verified complete":"In progress at cutoff"}</li>)}</ul>:<p>No phases reached verified completion during this period.</p>}
        <h3>{report.projection==="client"?"Shared project updates":"Period activity"}</h3>
        <div className="monthly-report-table"><table><thead><tr><th>Date</th><th>Phase</th><th>Record</th></tr></thead><tbody>
          {(report.projection==="client"?report.updates||[]:report.activity||[]).map((row,i)=><tr key={i}><td>{reportDate(row.date)}</td><td>{row.phase}</td><td>{"text" in row?row.text:row.record}</td></tr>)}
        </tbody></table></div>
        {!(report.projection==="client"?report.updates?.length:report.activity?.length)&&<p>No activity records are available for this period.</p>}
        <p className="role-muted">Historical coverage starts {report.coverageFrom?reportDate(report.coverageFrom):"when reporting history is installed"}. Print / Save as PDF uses your browser’s print dialog.</p>
      </>}
      <div className="modal-actions"><Button onClick={onClose}>Close</Button><Button disabled={!data||loading||exporting} onClick={()=>void exportReport("print")}>Print / Save as PDF</Button><Button variant="primary" disabled={!data||loading||exporting} onClick={()=>void exportReport("csv")}>{exporting?"Preparing…":"Export CSV"}</Button></div>
    </div>
  </Modal>
}

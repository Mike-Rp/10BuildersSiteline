import {useEffect,useRef,useState} from "react"
import {api} from "./api/client"
import {Button,Icon,Modal} from "./ui"
import {downloadBlob} from "./panels"
import {currentReportMonth,monthlyPrintDocument,reportDate,reportFraction,type MonthlyReport as Report} from "./monthly-report"
import "./monthly-report.css"
import ReportProjectSearch from "./ReportProjectSearch"
import ReportExportActions, { type ReportExportFormat } from "./ReportExportActions"
import ReportPdfRecovery from "./ReportPdfRecovery"
import { createReportPdfSafely, PdfExporterLoadError } from "./report-pdf-loader"

export default function MonthlyReport({projects,initialProjectId,initialMonth,onClose,allowProjectChange=true,onProjectChange}:{projects:{id:string;name:string}[];initialProjectId:string;initialMonth?:string;onClose:()=>void;allowProjectChange?:boolean;onProjectChange?:(id:string)=>void}) {
  const [projectId,setProjectId]=useState(initialProjectId)
  const [projectSearchOpen,setProjectSearchOpen]=useState(allowProjectChange && !initialProjectId)
  const [month,setMonth]=useState(()=>initialMonth||currentReportMonth())
  const [data,setData]=useState<{report:Report;snapshot:string}>()
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[exporting,setExporting]=useState(false)
  const [pdfNeedsReload,setPdfNeedsReload]=useState(false)
  const revision=useRef(0),printFrame=useRef<HTMLIFrameElement|null>(null)
  useEffect(()=>()=>{revision.current++;printFrame.current?.remove()},[])
  useEffect(()=>{
    let active=true;revision.current++;setData(undefined);setError("");setPdfNeedsReload(false)
    if(!projectId||!/^\d{4}-\d{2}$/.test(month)||month>currentReportMonth()){setLoading(false);return}
    setLoading(true)
    api<{report:Report;snapshot:string}>(`/projects/${projectId}/monthly-report?month=${encodeURIComponent(month)}`)
      .then(result=>{if(active)setData(result)}).catch(reason=>{if(active)setError(reason.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[projectId,month,refresh])
  async function exportReport(format:ReportExportFormat) {
    if(!data||exporting||data.report.createdAfterPeriod)return
    const current=revision.current;setExporting(true);setError("");setPdfNeedsReload(false)
    try {
      const result=await api<{csv?:string;report?:Report}>(`/projects/${data.report.project.id}/monthly-report/export`,{method:"POST",json:{snapshot:data.snapshot,format:format==="pdf"?"print":format}})
      if(current!==revision.current)return
      if(format==="csv")downloadBlob(new Blob([result.csv||""],{type:"text/csv;charset=utf-8"}),`${data.report.project.name.replace(/[\\/:*?"<>|]/g,"-")} — ${data.report.period.month}.csv`)
      else if(format==="pdf" && result.report){
        const blob=await createReportPdfSafely(monthlyPrintDocument(result.report))
        if(current!==revision.current)return
        downloadBlob(blob,`${data.report.project.name.replace(/[\\/:*?"<>|]/g,"-")} — ${data.report.period.month}.pdf`)
      }
      else if(result.report){
        printFrame.current?.remove()
        const frame=document.createElement("iframe");frame.className="monthly-print-frame";frame.title="Monthly report print preview";frame.setAttribute("aria-hidden","true");document.body.append(frame);printFrame.current=frame
        let printed=false
        frame.onload=()=>{if(!printed&&frame.contentDocument?.title==="Monthly Project Progress Summary"){printed=true;frame.contentWindow?.focus();frame.contentWindow?.print()}}
        frame.srcdoc=monthlyPrintDocument(result.report)
      }
    }catch(reason){if(current===revision.current){if(reason instanceof PdfExporterLoadError)setPdfNeedsReload(true);else setError((reason as Error).message)}}finally{setExporting(false)}
  }
  const report=data?.report,pending=report?.pending
  return <Modal title="Monthly progress report" subtitle={[report?.project.name||projects.find(p=>p.id===projectId)?.name,report?.project.type].filter(Boolean).join(" · ")} wide onClose={onClose}>
    <div className="monthly-report">
      <div className="monthly-report-controls">
        <label>Reporting month<input type="month" min="2000-01" max={currentReportMonth()} value={month} onChange={e=>setMonth(e.target.value)}/></label>
        {allowProjectChange && projects.length > 1 && <Button icon="building" aria-expanded={projectSearchOpen} onClick={()=>setProjectSearchOpen(open=>!open)}>{projectSearchOpen ? "Cancel project change" : "Change project"}</Button>}
        {projectSearchOpen && <ReportProjectSearch projects={projects} value={projectId} onChange={id=>{
          setProjectId(id);setProjectSearchOpen(false);onProjectChange?.(id)
        }} />}
      </div>
      {!projects.length&&<p>No authorized projects are available.</p>}
      {month>currentReportMonth()&&<p role="alert" className="error">Future reporting months are unavailable.</p>}
      {loading&&<p role="status">Loading monthly report…</p>}
      {error&&<div className="monthly-report-error" role="alert"><p className="error">{error}</p><Button disabled={loading||!month||!projectId} onClick={()=>setRefresh(n=>n+1)}>Retry report</Button></div>}
      {pdfNeedsReload&&<ReportPdfRecovery />}
      {report&&<>
        <section className="monthly-report-info" aria-label="Reporting information">
          <span className="monthly-report-period-kind">{report.period.monthToDate?"Month to date":"Month-end snapshot"}</span>
          <dl><div><dt>Reporting period</dt><dd>{reportDate(report.period.start)} → {reportDate(report.period.cutoff)} <span>(exclusive cutoff)</span></dd></div>
          <div><dt>Generated</dt><dd>{reportDate(report.period.generatedAt)}</dd></div><div><dt>Timezone</dt><dd>{report.period.timezone === "Asia/Manila" ? "Philippine time" : report.period.timezone}</dd></div></dl>
        </section>
        {report.createdAfterPeriod ? <section className="monthly-report-not-applicable" role="status">
          <h3>Not applicable for this month</h3>
          <p>This project was created after the selected reporting period. Monthly progress and phase completions do not apply to this period.</p>
          <h4>Choose a month within the project period</h4>
          <p>Select a month from project creation onward to view verified progress and phases completed during that month.</p>
          <p className="role-muted">Project Overview shows current progress. This report covers only the selected historical month.</p>
        </section> : <>
        {!!report.limitations.length && <section className="monthly-report-limitation" aria-label="Reporting limitations"><Icon name="alert" size={18}/><div>{report.limitations.map(text=><p key={text}>{text}</p>)}</div></section>}
        <div className="monthly-report-metrics">
          <section><h3>Verified progress</h3><strong>{report.closing.percentage===null?"Unavailable":`${report.closing.percentage.toFixed(1)}%`}</strong><p className="role-muted">Closing progress · Opening: {report.opening.percentage===null?"Unavailable":`${report.opening.percentage.toFixed(1)}%`}</p></section>
          {report.projection!=="client"&&<section><h3>Activities approved</h3><strong>{report.approvals?.events??"Unavailable"}</strong><p className="role-muted">{report.approvals?`${report.approvals.distinctActivities} distinct activities`:"Historical or authorized detail unavailable"}</p></section>}
          <section><h3>Phases completed</h3><strong>{report.completedPhases?.length??"Unavailable"}</strong><p className="role-muted">Verified completion during period</p></section>
        </div>
        {report.projection!=="client"&&<section className="monthly-report-activity"><h3>Project activity</h3><p className="role-muted">{report.scopeLabel} Pending review counts are measured at the reporting cutoff.</p><dl className="monthly-report-secondary">
          <div><dt>Rework confirmed</dt><dd>{report.rework?.confirmed??"Unavailable"}</dd></div>
          <div><dt>Approvals withdrawn</dt><dd>{report.rework?.withdrawals??"Unavailable"}</dd></div>
          <div><dt>Pending reviews</dt><dd>{pending?pending.evidence+pending.reports+pending.rework:"Unavailable"}</dd></div>
          <div><dt>Evidence</dt><dd>{pending?.evidence??"Unavailable"}</dd></div>
          <div><dt>Reports</dt><dd>{pending?.reports??"Unavailable"}</dd></div>
          <div><dt>Rework requests</dt><dd>{pending?.rework??"Unavailable"}</dd></div>
        </dl></section>}
        <h3>Monthly progress movement</h3>
        <div className="monthly-report-table monthly-report-movement"><table><thead><tr><th scope="col">Record</th><th scope="col">Verified value</th></tr></thead><tbody>
          <tr><td>Opening verified progress</td><td>{reportFraction(report.opening)}</td></tr>
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
        <p className="role-muted">Historical coverage starts {report.coverageFrom?reportDate(report.coverageFrom):"when reporting history is installed"}. {report.partialFrom?<strong> Partial month: figures cover {reportDate(report.partialFrom)} onward only.</strong>:null} Download PDF saves a file directly; Print opens your browser’s print dialog.</p>
        </>}
      </>}
      <div className="modal-actions"><Button onClick={onClose}>Close</Button>{!report?.createdAfterPeriod && <ReportExportActions disabled={!data||loading} busy={exporting} onExport={format=>void exportReport(format)} />}</div>
    </div>
  </Modal>
}

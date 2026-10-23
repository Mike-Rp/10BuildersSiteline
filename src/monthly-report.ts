export type ReportBalance={earned:number|null;total:number|null;percentage:number|null;reason:string|null}
export type MonthlyReport={
  project:{id:string;name:string;type:string;status:string}
  period:{month:string;timezone:string;start:string;end:string;cutoff:string;monthToDate:boolean;generatedAt:string}
  coverageFrom:string|null;opening:ReportBalance;closing:ReportBalance;netChange:number|null
  projection:"staff"|"site"|"client";scopeLabel?:string;limitations:string[];createdAfterPeriod:boolean
  completedPhases:{id:string;phase:string;date:string;stillComplete:boolean}[]|null
  approvals?:{events:number;distinctActivities:number;earned:number}|null
  rework?:{confirmed:number;withdrawals:number|null;withdrawn:number|null}|null
  pending?:{evidence:number;reports:number;rework:number}|null
  movement?:{awarded:number;withdrawn:number;scopeDelta:number;scopeChanges:number}|null
  activity?:{date:string;phase:string;kind:string;record:string;change:number|null}[]
  updates?:{date:string;phase:string;record:string;text:string}[]
}
export const REPORT_TIMEZONE="Asia/Manila"
export function currentReportMonth(date=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:REPORT_TIMEZONE,year:"numeric",month:"2-digit"}).formatToParts(date).map(p=>[p.type,p.value]))
  return `${parts.year}-${parts.month}`
}
export const reportDate=(date:string)=>new Intl.DateTimeFormat("en-PH",{timeZone:REPORT_TIMEZONE,dateStyle:"medium",timeStyle:"short"}).format(new Date(date))
export const reportFraction=(balance:ReportBalance)=>balance.percentage===null?"Unavailable":`${balance.earned} / ${balance.total} · ${balance.percentage.toFixed(1)}%`
const escapeHtml=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")
export function monthlyPrintDocument(report:MonthlyReport) {
  const table=(head:string[],rows:unknown[][])=>`<table><thead><tr>${head.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  const phases=report.completedPhases?.map(p=>[p.phase,reportDate(p.date),p.stillComplete?"Verified complete":"In progress at cutoff"])||[["Unavailable"]]
  const events=report.projection==="client"?(report.updates||[]).map(e=>[reportDate(e.date),e.phase,e.text]):(report.activity||[]).map(e=>[reportDate(e.date),e.phase,e.record,e.change??""])
  return `<!doctype html><html><head><meta charset="utf-8"><title>Monthly Project Progress Summary</title><style>body{font:14px/1.5 Arial,sans-serif;color:#172b4d;margin:24px}h1{font-size:22px}h2{font-size:17px;margin-top:22px}table{width:100%;border-collapse:collapse;margin:12px 0;table-layout:fixed}th,td{padding:8px;border-bottom:1px solid #d8e0e8;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{overflow-wrap:anywhere}h2{break-after:avoid}@page{margin:15mm}body{print-color-adjust:exact}</style></head><body>
  <h1>Monthly Project Progress Summary</h1><h2>${escapeHtml(report.project.name)}</h2>
  <p>${escapeHtml(report.project.type)} · ${escapeHtml(report.period.month)} · ${report.period.monthToDate?"Month to date":"Month-end snapshot"}</p>
  <p>Timezone: ${escapeHtml(report.period.timezone)}<br>Period start: ${escapeHtml(reportDate(report.period.start))}<br>Cutoff (exclusive): ${escapeHtml(reportDate(report.period.cutoff))}<br>Generated: ${escapeHtml(reportDate(report.period.generatedAt))}</p>
  ${report.limitations.map(l=>`<p>${escapeHtml(l)}</p>`).join("")}
  ${table(["Opening verified progress","Closing verified progress"],[[reportFraction(report.opening),reportFraction(report.closing)]])}
  ${report.projection!=="client"?`<p>${escapeHtml(report.scopeLabel)}</p>${table(["Approval events","Rework confirmed","Withdrawals","Pending reviews"],[[report.approvals?.events??"Unavailable",report.rework?.confirmed??"Unavailable",report.rework?.withdrawals??"Unavailable",report.pending?report.pending.evidence+report.pending.reports+report.pending.rework:"Unavailable"]])}${report.movement?table(["Credit awarded","Credit withdrawn","Credit change from scope","Scope revision records"],[[report.movement.awarded,report.movement.withdrawn,report.movement.scopeDelta,report.movement.scopeChanges]]):""}`:""}
  <h2>Phases completed during period</h2>${table(["Phase","Date","State at cutoff"],phases)}
  <h2>${report.projection==="client"?"Shared project updates":"Period activity"}</h2>${table(report.projection==="client"?["Date","Phase","Update"]:["Date","Phase","Record","Credit change"],events.length?events:[["No activity recorded during this period."]])}
  <p>Verified progress uses approved required checklist activities. Uploads awaiting review earn no credit.</p></body></html>`
}

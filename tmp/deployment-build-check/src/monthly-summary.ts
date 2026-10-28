import {reportDate} from "./monthly-report.ts"
import {formatPoints,summaryMetrics,type MonthlySummary,type SummaryRow,type SummaryTotal,type SummaryView} from "../Thesis-Backend/src/domain/monthly-summary.js"
export {SUMMARY_FILTERS,filterSummaryRows,formatPoints,normalizeSummaryFilters,summaryHighlights,summaryMetrics,summarizeRows,summaryView} from "../Thesis-Backend/src/domain/monthly-summary.js"
export type {MonthlySummary,SummaryFilters,SummaryRow,SummaryTotal,SummaryTotals,SummaryView} from "../Thesis-Backend/src/domain/monthly-summary.js"

export const UNAVAILABLE="Unavailable"
export const REPORTS_PURPOSE="The Reports module summarizes monthly construction progress, approvals, completed phases, rework, and pending reviews so the team can track accomplishments, identify outstanding work, and export clear project records."
export const monthName=(month:string)=>{const [y,m]=month.split("-").map(Number);return new Intl.DateTimeFormat("en-PH",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,1)))}
export const percentText=(value:number|null)=>value===null?UNAVAILABLE:`${value.toFixed(1)}%`
export const changeText=(row:SummaryRow)=>row.change===null?UNAVAILABLE:formatPoints(row.change)
export const totalText=(total:SummaryTotal)=>total.value===null?UNAVAILABLE:String(total.value)
export const coverageText=(total:SummaryTotal)=>total.value===null?"No project has complete history for this figure":total.partial?`Partial · ${total.contributing} of ${total.of} projects contributed`:`All ${total.of} ${total.of===1?"project":"projects"} contributed`
export const pendingCount=(row:SummaryRow)=>row.pending?row.pending.evidence+row.pending.reports+row.pending.rework:null
export const periodLabel=(summary:MonthlySummary)=>summary.period.monthToDate?"Month to date":"Month-end snapshot"

const escapeHtml=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")
export const SUMMARY_PRINT_TITLE="Overall Monthly Project Summary"
export function summaryPrintDocument(summary:MonthlySummary,view:SummaryView) {
  const metrics=summaryMetrics(summary.projection),{totals,highlights,filters}=view
  const table=(head:string[],rows:unknown[][])=>`<table><thead><tr>${head.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  const list=(items:string[])=>`<ul>${items.map(text=>`<li>${escapeHtml(text)}</li>`).join("")}</ul>`
  const figure=(total:SummaryTotal)=>`${totalText(total)}${total.partial&&total.value!==null?` (partial: ${total.contributing} of ${total.of})`:""}`
  const during=[["Projects shown",totals.projects],["Phases completed",figure(totals.completedPhases)],
    ...(totals.approvals?[["Approval events",figure(totals.approvals)]]:[]),...(totals.rework?[["Confirmed rework",figure(totals.rework)]]:[])]
  const head=["Project","Type","Progress at month start","Progress at cutoff","Change",...(metrics.approvals?["Approval events"]:[]),"Phases completed",...(metrics.rework?["Confirmed rework"]:[]),...(metrics.pending?["Pending reviews"]:[])]
  const rows=view.rows.map(row=>[row.name,row.type,percentText(row.opening),percentText(row.closing),changeText(row),...(metrics.approvals?[row.approvals??UNAVAILABLE]:[]),
    row.completedPhases?.length??UNAVAILABLE,...(metrics.rework?[row.rework??UNAVAILABLE]:[]),...(metrics.pending?[pendingCount(row)??UNAVAILABLE]:[])])
  return `<!doctype html><html><head><meta charset="utf-8"><title>${SUMMARY_PRINT_TITLE}</title><style>body{font:14px/1.5 Arial,sans-serif;color:#172b4d;margin:24px}h1{font-size:22px}h2{font-size:17px;margin-top:22px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px;border-bottom:1px solid #d8e0e8;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p,li{overflow-wrap:anywhere}h2{break-after:avoid}@page{margin:15mm}body{print-color-adjust:exact}</style></head><body>
  <h1>${SUMMARY_PRINT_TITLE}</h1><h2>${escapeHtml(monthName(summary.period.month))} · ${periodLabel(summary)}</h2>
  <p>Timezone: ${escapeHtml(summary.period.timezone)}<br>Period start: ${escapeHtml(reportDate(summary.period.start))}<br>Cutoff (exclusive): ${escapeHtml(reportDate(summary.period.cutoff))}<br>Generated: ${escapeHtml(reportDate(summary.period.generatedAt))}</p>
  <p>${escapeHtml(summary.inclusion.rule)} ${summary.inclusion.included} included; ${summary.inclusion.excludedAfterCutoff} created on or after the cutoff excluded.</p>
  <p>Filters: ${escapeHtml(filters.search?`name contains “${filters.search}”`:"no name search")} · ${escapeHtml(filters.type||"all types")}${metrics.pending?` · ${escapeHtml({all:"all review states",pending:"with pending reviews",none:"no pending reviews"}[filters.outstanding])}`:""}</p>
  <h2>During the month</h2>${table(["Figure","Value"],during)}
  ${totals.pending?`<h2>At the reporting cutoff</h2>${table(["Pending reviews","Evidence","Reports","Rework"],[[figure(totals.pending),totals.pending.evidence,totals.pending.reports,totals.pending.rework]])}`:""}
  <h2>Monthly accomplishments</h2>${list(highlights.during)}
  ${highlights.outstanding.length?`<h2>Outstanding work at cutoff</h2>${list(highlights.outstanding)}`:""}
  ${highlights.coverage.map(text=>`<p>${escapeHtml(text)}</p>`).join("")}
  <h2>Projects</h2>${table(head,rows.length?rows:[["No projects match the selected filters."]])}
  <p>Verified progress uses approved required checklist activities. Uploads awaiting review earn no credit. Project percentages are not combined into an overall figure.</p></body></html>`
}

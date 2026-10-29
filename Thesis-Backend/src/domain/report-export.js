import { summaryMetrics } from "./monthly-summary.js";

export const fraction=balance=>balance?.percentage==null?"Unavailable":`${balance.earned} / ${balance.total} (${balance.percentage.toFixed(1)}%)`;
export function reportRows(report) {
  const rows=[
    ["10BuildLine — Monthly Project Progress Summary"],
    ["Project",report.project.name],["Type",report.project.type],["Reporting month",report.period.month],
    ["Timezone",report.period.timezone],["Period start",report.period.start],["Cutoff (exclusive)",report.period.cutoff],
    ["Generated",report.period.generatedAt],["Period",report.period.monthToDate?"Month to date":"Month-end snapshot"],
    ["Historical coverage from",report.coverageFrom||"Unavailable"],
    ["Opening verified progress",fraction(report.opening)],["Closing verified progress",fraction(report.closing)],
    ["Net percentage-point change",report.netChange??"Unavailable / scope changed"],
    ...report.limitations.map(text=>["Limitation",text]),
  ];
  if(report.projection!=="client")rows.push(
    ["Detail scope",report.scopeLabel],["Approval events",report.approvals?.events??"Unavailable"],
    ["Distinct activities approved",report.approvals?.distinctActivities??"Unavailable"],
    ["Credit awarded",report.movement?.awarded??"Unavailable"],["Credit withdrawn",report.movement?.withdrawn??"Unavailable"],
    ["Scope revision records",report.movement?.scopeChanges??"Unavailable"],["Credit change from scope",report.movement?.scopeDelta??"Unavailable"],
    ["Confirmed rework requests",report.rework?.confirmed??"Unavailable"],["Effective withdrawals",report.rework?.withdrawals??"Unavailable"],
    ["Pending evidence",report.pending?.evidence??"Unavailable"],["Pending reports",report.pending?.reports??"Unavailable"],["Pending rework",report.pending?.rework??"Unavailable"]);
  rows.push([], ["Phases completed during period"],["Phase","Completed at","State at cutoff"]);
  if(report.completedPhases===null)rows.push(["Unavailable"]);
  else for(const phase of report.completedPhases)rows.push([phase.phase,phase.date,phase.stillComplete?"Verified complete":"In progress at cutoff"]);
  rows.push([], ["Date","Phase","Record",...(report.projection==="client"?["Shared update"]:["Credit change"])]);
  for(const row of report.projection==="client"?report.updates:report.activity)rows.push([row.date,row.phase,row.record,report.projection==="client"?row.text:row.change??""]);
  return rows;
}
export function csvCell(value) {
  let text=String(value??"");
  const first=text.trimStart().charAt(0);
  if(["=","+","@","-"].includes(first)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function reportCsv(report) {return "\uFEFF"+reportRows(report).map(row=>row.map(csvCell).join(",")).join("\r\n");}

const percent=value=>value===null?"Unavailable":`${value.toFixed(1)}%`;
const totalText=total=>total.value===null?"Unavailable":total.partial?`${total.value} (partial: ${total.contributing} of ${total.of} projects)`:total.value;
const OUTSTANDING_LABELS={all:"All projects",pending:"With pending reviews",none:"No pending reviews"};
export function summaryRows(summary,view) {
  const {period,projection,inclusion}=summary,{totals,highlights,filters}=view;
  const metrics=summaryMetrics(projection);
  const rows=[
    ["10BuildLine \u2014 Overall Monthly Project Summary"],
    ["Reporting month",period.month],["Timezone",period.timezone],["Period start",period.start],["Cutoff (exclusive)",period.cutoff],
    ["Generated",period.generatedAt],["Period",period.monthToDate?"Month to date":"Month-end snapshot"],
    ["Inclusion",inclusion.rule],["Projects in report",inclusion.included],["Excluded (created on or after cutoff)",inclusion.excludedAfterCutoff],
    ["Search filter",filters.search||"None"],["Project type filter",filters.type||"All types"],
    ...(metrics.pending?[["Outstanding reviews filter",OUTSTANDING_LABELS[filters.outstanding]]]:[]),
    [],["During the month"],["Projects shown",totals.projects],["Phases completed",totalText(totals.completedPhases)],
  ];
  if(totals.approvals)rows.push(["Approval events",totalText(totals.approvals)]);
  if(totals.rework)rows.push(["Confirmed rework",totalText(totals.rework)]);
  if(totals.pending)rows.push([],["At the reporting cutoff"],["Pending reviews",totalText(totals.pending)],
    ["Pending evidence",totals.pending.evidence],["Pending reports",totals.pending.reports],["Pending rework",totals.pending.rework]);
  rows.push([],["Monthly accomplishments"],...highlights.during.map(text=>[text]));
  if(highlights.outstanding.length)rows.push([],["Outstanding work at cutoff"],...highlights.outstanding.map(text=>[text]));
  rows.push(...highlights.coverage.map(text=>["Limitation",text]));
  rows.push([],["Project","Type","Verified progress at month start","Verified progress at cutoff","Change (percentage points)",
    ...(metrics.approvals?["Approval events"]:[]),"Phases completed",...(metrics.rework?["Confirmed rework"]:[]),...(metrics.pending?["Pending reviews"]:[])]);
  for(const row of view.rows)rows.push([row.name,row.type,percent(row.opening),percent(row.closing),row.change===null?`Unavailable \u2014 ${row.changeNote}`:row.change.toFixed(1),
    ...(metrics.approvals?[row.approvals??"Unavailable"]:[]),row.completedPhases?.length??"Unavailable",...(metrics.rework?[row.rework??"Unavailable"]:[]),
    ...(metrics.pending?[row.pending?row.pending.evidence+row.pending.reports+row.pending.rework:"Unavailable"]:[])]);
  if(!view.rows.length)rows.push(["No projects match the selected filters."]);
  return rows;
}
export function summaryCsv(summary,view) {return "\uFEFF"+summaryRows(summary,view).map(row=>row.map(csvCell).join(",")).join("\r\n");}

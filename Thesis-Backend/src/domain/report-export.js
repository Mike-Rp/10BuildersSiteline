export const fraction=balance=>balance?.percentage==null?"Unavailable":`${balance.earned} / ${balance.total} (${balance.percentage.toFixed(1)}%)`;
export function reportRows(report) {
  const rows=[
    ["SITELINE — Monthly Project Progress Summary"],
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

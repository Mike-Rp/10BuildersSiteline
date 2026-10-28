import assert from "node:assert/strict"
import test from "node:test"
import {buildMonthlyReport,reportPeriod} from "../Thesis-Backend/src/domain/monthly-report.js"
import {buildMonthlySummary,summaryRow,summaryView,summarizeRows,summaryHighlights,filterSummaryRows,normalizeSummaryFilters} from "../Thesis-Backend/src/domain/monthly-summary.js"
import {summaryCsv} from "../Thesis-Backend/src/domain/report-export.js"
import {summaryPrintDocument} from "../src/monthly-summary.ts"

const period=()=>reportPeriod("2026-10",new Date("2026-11-01T00:00:00Z"))
const project=(id,name,type="Residential")=>({id,name,type,status:"active",created_at:"2026-08-01T00:00:00Z"})
const source=id=>({projects:[{id,project_type_id:1}],project_type_stages:[{project_type_id:1,project_stage_id:1,sort_order:1},{project_type_id:1,project_stage_id:2,sort_order:2}],project_stages:[{id:1,code:"Foundation"},{id:2,code:"Structure"}],project_phase_checklists:[{project_id:id,project_stage_id:1},{project_id:id,project_stage_id:2}],project_phase_checklist_items:[{id:1,project_id:id,project_stage_id:1,weight:10,required:true},{id:2,project_id:id,project_stage_id:2,weight:20,required:true}],project_phase_evidence:[],pending_rework_requests:[],project_phase_updates:[],project_progress_history:[]})
const baseline=(id,from="2026-09-01T00:00:00Z")=>({covered_from:from,data:source(id)})
const event=(id,pid,table,after,before=null,at=`2026-10-${String(id+1).padStart(2,"0")}T00:00:00Z`)=>({id,source_table:table,project_id:pid,operation:before?"UPDATE":"INSERT",before_row:before,after_row:after,occurred_at:at,transaction_id:`${pid}-${id}`})
const evidence=(id,pid,status="approved",item=1)=>({id,project_id:pid,project_stage_id:item,checklist_item_id:item,status,reviewed_by:status==="pending"?null:"opm",reviewed_at:status==="pending"?null:"2026-10-01T00:00:00Z"})

// A: approval completes Foundation, then a pending upload on Structure (no credit). B: no history. C: rework confirmed, no activity credit.
function reports(role="admin",visiblePhaseIds=[]) {
  const a=[event(1,"a","project_phase_evidence",evidence(1,"a")),event(2,"a","project_phase_evidence",evidence(2,"a","pending",2)),
    // After the October cutoff: must not count in October.
    event(3,"a","project_phase_evidence",evidence(2,"a","approved",2),evidence(2,"a","pending",2),"2026-11-03T00:00:00Z")]
  const c=[event(1,"c","pending_rework_requests",{id:"r1",project_id:"c",project_stage_id:1,status:"approved"},{id:"r1",project_id:"c",project_stage_id:1,status:"pending"}),
    event(2,"c","project_phase_updates",{id:"u1",selected_stage_id:2,status:"pending"})]
  return [
    buildMonthlyReport({project:project("a","Alpha Tower"),baseline:baseline("a"),events:a,period:period(),role,visiblePhaseIds}),
    buildMonthlyReport({project:project("b","Bravo Plaza","Commercial"),baseline:null,events:[],period:period(),role,visiblePhaseIds}),
    buildMonthlyReport({project:project("c","Charlie Homes"),baseline:baseline("c"),events:c,period:period(),role,visiblePhaseIds}),
  ]
}

test("summary rows are projections of each project report and totals never fabricate missing history",()=>{
  const summary=buildMonthlySummary({reports:reports(),period:period(),projection:"staff",excludedAfterCutoff:1})
  assert.deepEqual(summary.rows.map(r=>r.name),["Alpha Tower","Bravo Plaza","Charlie Homes"])
  const [a,b,c]=summary.rows
  assert.equal(a.opening,0);assert.equal(a.closing,10/30*100);assert.equal(a.change,10/30*100)
  assert.equal(a.approvals,1,"the post-cutoff approval belongs to November");assert.equal(a.completedPhases.length,1)
  assert.deepEqual(a.pending,{evidence:1,reports:0,rework:0},"an upload awaiting review is outstanding and earns no credit")
  for(const key of ["opening","closing","change","approvals","rework","pending","completedPhases"])assert.equal(b[key],null,`${key} is unavailable, never zero`)
  assert.equal(b.limited,true)
  assert.equal(c.rework,1);assert.equal(c.pending.reports,1);assert.equal(c.change,0)
  const totals=summarizeRows(summary.rows,"staff")
  assert.deepEqual(totals.approvals,{value:1,contributing:2,of:3,partial:true})
  assert.deepEqual(totals.completedPhases,{value:1,contributing:2,of:3,partial:true})
  assert.deepEqual(totals.rework,{value:1,contributing:2,of:3,partial:true})
  assert.equal(totals.pending.value,2);assert.equal(totals.pending.evidence,1);assert.equal(totals.pending.reports,1)
  assert.equal(Object.hasOwn(totals,"progress"),false,"project percentages are not summed into an overall figure")
  const none=summarizeRows([summary.rows[1]],"staff")
  assert.deepEqual(none.approvals,{value:null,contributing:0,of:1,partial:true})
  assert.equal(summary.inclusion.excludedAfterCutoff,1);assert.match(summary.inclusion.rule,/created on or after the cutoff are excluded/)
})

test("highlights state recorded facts only and list unavailable history",()=>{
  const rows=buildMonthlySummary({reports:reports(),period:period(),projection:"staff"}).rows
  const h=summaryHighlights(rows,"staff")
  assert.match(h.during[0],/1 project recorded a verified progress increase: Alpha Tower \(\+33\.3 pts\)/)
  assert.match(h.during[1],/1 phase reached verified completion: Alpha Tower — Foundation/)
  assert.ok(h.during.some(t=>/1 rework request confirmed: Charlie Homes \(1\)/.test(t)))
  assert.match(h.outstanding.join(" "),/1 pending evidence review: Alpha Tower \(1\)/)
  assert.match(h.outstanding.join(" "),/1 pending progress report review: Charlie Homes \(1\)/)
  assert.match(h.outstanding.join(" "),/No pending rework reviews/)
  assert.match(h.coverage[0],/Bravo Plaza/)
  assert.doesNotMatch(JSON.stringify(h),/delay|behind|schedule|because|late/i)
})

test("Site PM and client summaries hide metrics their projection cannot see",()=>{
  const site=buildMonthlySummary({reports:reports("spm",["2"]),period:period(),projection:"site"})
  for(const row of site.rows){assert.equal(Object.hasOwn(row,"approvals"),false);assert.equal(Object.hasOwn(row,"rework"),false)}
  assert.deepEqual(site.rows[0].pending,{evidence:1,reports:0,rework:0},"pending reviews follow the assigned phase")
  assert.deepEqual(buildMonthlySummary({reports:reports("spm",["1"]),period:period(),projection:"site"}).rows[0].pending,{evidence:0,reports:0,rework:0})
  const siteTotals=summarizeRows(site.rows,"site");assert.equal(siteTotals.approvals,null);assert.equal(siteTotals.rework,null)
  const client=buildMonthlySummary({reports:reports("client"),period:period(),projection:"client"})
  for(const row of client.rows)for(const key of ["approvals","rework","pending"])assert.equal(Object.hasOwn(row,key),false)
  assert.equal(summarizeRows(client.rows,"client").pending,null)
  assert.deepEqual(summaryHighlights(client.rows,"client").outstanding,[])
  assert.equal(summaryView(client,{outstanding:"pending"}).rows.length,3,"a hidden outstanding filter cannot remove client rows")
  assert.doesNotMatch(summaryCsv(client,summaryView(client)),/Pending|Approval events|Confirmed rework|Outstanding reviews filter/)
})

test("filters are normalized and drive the same rows, totals and statements in CSV and print",()=>{
  const summary=buildMonthlySummary({reports:reports(),period:period(),projection:"staff"})
  assert.deepEqual(normalizeSummaryFilters({search:"  alp ",type:7,outstanding:"bogus"}),{search:"alp",type:"",outstanding:"all"})
  assert.deepEqual(filterSummaryRows(summary.rows,{outstanding:"pending"}).map(r=>r.id),["a","c"])
  assert.deepEqual(filterSummaryRows(summary.rows,{outstanding:"none"}).map(r=>r.id),[],"unavailable pending counts are neither pending nor clear")
  assert.deepEqual(filterSummaryRows(summary.rows,{type:"Commercial"}).map(r=>r.id),["b"])
  const view=summaryView(summary,{search:"CHAR"})
  assert.deepEqual(view.rows.map(r=>r.id),["c"]);assert.equal(view.totals.projects,1);assert.equal(view.totals.rework.partial,false)
  const csv=summaryCsv(summary,view)
  assert.ok(csv.includes('"Charlie Homes"'));assert.equal(csv.includes("Alpha Tower"),false,"filtered-out projects are not exported")
  assert.ok(csv.includes(summary.period.generatedAt));assert.ok(csv.includes('"Search filter","CHAR"'))
  const html=summaryPrintDocument(summary,view)
  assert.ok(html.includes("Charlie Homes"));assert.equal(html.includes("Alpha Tower"),false)
  const unsafe=buildMonthlySummary({reports:[buildMonthlyReport({project:project("x",'=HYPERLINK("x")<script>'),period:period(),role:"admin"})],period:period(),projection:"staff"})
  assert.match(summaryCsv(unsafe,summaryView(unsafe)),/"'=HYPERLINK\(""x""\)/)
  assert.equal(summaryPrintDocument(unsafe,summaryView(unsafe)).includes("<script>"),false)
  assert.match(summaryCsv(unsafe,summaryView(unsafe)),/Unavailable/)
})

test("month boundaries: activity after a past month's cutoff and before its start is excluded",()=>{
  const sept=reportPeriod("2026-09",new Date("2026-11-01T00:00:00Z"))
  const events=[event(1,"a","project_phase_evidence",evidence(1,"a"),null,"2026-09-30T15:59:59Z"),event(2,"a","project_phase_evidence",evidence(2,"a","approved",2),null,"2026-09-30T16:00:00Z")]
  const report=buildMonthlyReport({project:project("a","Alpha Tower"),baseline:baseline("a","2026-08-01T00:00:00Z"),events,period:sept,role:"admin"})
  const row=summaryRow(report)
  assert.equal(row.approvals,1,"23:59:59 Manila on 30 September is in September; midnight is October")
  assert.equal(row.closing,10/30*100)
  const october=summaryRow(buildMonthlyReport({project:project("a","Alpha Tower"),baseline:baseline("a","2026-08-01T00:00:00Z"),events,period:period(),role:"admin"}))
  assert.equal(october.opening,10/30*100);assert.equal(october.approvals,1);assert.equal(october.closing,100)
})

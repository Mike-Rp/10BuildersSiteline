import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {citext} from "@electric-sql/pglite/contrib/citext"
import {buildMonthlyReport,reportBalance,reportPeriod,reportingMonth,HISTORY_UNAVAILABLE} from "../Thesis-Backend/src/domain/monthly-report.js"
import {csvCell,reportCsv} from "../Thesis-Backend/src/domain/report-export.js"
import {migrateMonthlyReports} from "../Thesis-Backend/scripts/migrate-monthly-reports.js"
import {monthlyPrintDocument} from "../src/monthly-report.ts"

const project={id:"p",name:"Test Project",type:"Residential",status:"active",created_at:"2026-08-01T00:00:00Z"}
const period=()=>reportPeriod("2026-10",new Date("2026-11-01T00:00:00Z"))
const source=()=>({projects:[{id:"p",project_type_id:1}],project_type_stages:[{project_type_id:1,project_stage_id:1,sort_order:1},{project_type_id:1,project_stage_id:2,sort_order:2}],project_stages:[{id:1,code:"Foundation"},{id:2,code:"Structure"}],project_phase_checklists:[{project_id:"p",project_stage_id:1},{project_id:"p",project_stage_id:2}],project_phase_checklist_items:[{id:1,project_id:"p",project_stage_id:1,weight:10,required:true},{id:2,project_id:"p",project_stage_id:2,weight:20,required:true}],project_phase_evidence:[],pending_rework_requests:[],project_phase_updates:[],project_progress_history:[]})
const baseline=()=>({covered_from:"2026-09-01T00:00:00Z",data:source()})
const event=(id,table,after,before=null,at=`2026-10-${String(id+1).padStart(2,"0")}T00:00:00Z`,tx=id)=>({id,source_table:table,project_id:"p",operation:before?"UPDATE":"INSERT",before_row:before,after_row:after,occurred_at:at,transaction_id:tx})
const evidence=(id,status="approved",item=1)=>({id,project_id:"p",project_stage_id:item,checklist_item_id:item,status,submitted_by:"spm",reviewed_by:status==="pending"?null:"opm",reviewed_at:status==="pending"?null:"2026-10-01T00:00:00Z"})

test("Manila reporting boundaries handle month/year rollover, MTD and future/invalid months",()=>{
  const p=reportPeriod("2026-10",new Date("2026-10-21T17:00:00Z"))
  assert.equal(p.start,"2026-09-30T16:00:00.000Z")
  assert.equal(p.end,"2026-10-31T16:00:00.000Z")
  assert.equal(p.cutoff,"2026-10-21T17:00:00.000Z")
  assert.equal(p.monthToDate,true)
  assert.equal(reportingMonth(new Date("2026-12-31T17:00:00Z")),"2027-01")
  assert.equal(reportPeriod("2026-12",new Date("2027-01-01T00:00:00Z")).end,"2026-12-31T16:00:00.000Z")
  for(const month of ["2026-13","2026-1","2026-11","bad"])assert.throws(()=>reportPeriod(month,new Date("2026-10-22T00:00:00Z")),/valid/)
})

test("approval, withdrawal and reapproval count real credit transitions, not duplicate reviews or phase handoffs",()=>{
  const approved=evidence(1),withdrawal={...evidence(2,"rejected"),rework_request_id:"r"}
  const events=[event(1,"project_phase_evidence",approved),event(2,"project_phase_evidence",{...approved,review_note:"duplicate"},approved),
    event(3,"project_phase_evidence",withdrawal),event(4,"pending_rework_requests",{id:"r",project_id:"p",project_stage_id:1,status:"approved"},{id:"r",status:"pending"}),
    event(5,"project_phase_evidence",{...withdrawal,id:3}),event(6,"project_phase_evidence",evidence(4,"pending")),
    event(7,"project_phase_evidence",evidence(4),evidence(4,"pending")),event(8,"project_progress_history",{id:1,project_stage_id:1,entry_type:"handoff"})]
  const report=buildMonthlyReport({baseline:baseline(),events,period:period(),project,role:"opm"})
  assert.equal(report.opening.earned,0)
  assert.equal(report.closing.earned,10)
  assert.equal(report.closing.percentage,10/30*100)
  assert.deepEqual(report.approvals,{events:2,distinctActivities:1,earned:20})
  assert.deepEqual(report.rework,{confirmed:1,withdrawals:1,withdrawn:10})
  assert.equal(report.completedPhases.length,1)
  assert.equal(report.completedPhases[0].stillComplete,true)
  assert.equal(report.activity.filter(a=>a.kind==='handoff').length,1)
  assert.equal(report.closing.earned,report.opening.earned+report.movement.awarded-report.movement.withdrawn)
  const withdrawn=buildMonthlyReport({baseline:baseline(),events:events.slice(0,4),period:period(),project,role:"admin"})
  assert.equal(withdrawn.completedPhases[0].stillComplete,false)
})

test("scope revisions, historical pending queues and coverage gaps are not fabricated",()=>{
  const b=baseline();b.data.project_phase_evidence=[evidence(1)]
  const old=b.data.project_phase_checklist_items[1],changed={...old,weight:50}
  const pending=evidence(2,"pending",2)
  const events=[event(1,"project_phase_checklist_items",changed,old),event(2,"project_phase_evidence",pending),
    event(3,"project_phase_evidence",evidence(2,"approved",2),pending,"2026-11-02T00:00:00Z")]
  const report=buildMonthlyReport({baseline:b,events,period:period(),project,role:"admin"})
  assert.equal(report.opening.total,30);assert.equal(report.closing.total,60);assert.equal(report.netChange,null)
  assert.equal(report.pending.evidence,1,"next month's approval must not resolve last month's queue")
  assert.equal(report.movement.scopeChanges,1)
  b.covered_from="2026-10-05T00:00:00Z"
  const gap=buildMonthlyReport({baseline:b,events,period:period(),project,role:"admin"})
  assert.equal(gap.opening.percentage,null);assert.equal(gap.approvals,null);assert.equal(gap.pending,null)
  assert.ok(gap.limitations.includes(HISTORY_UNAVAILABLE))
  const missing=buildMonthlyReport({period:period(),project,role:"client"})
  assert.equal(missing.closing.percentage,null)
  assert.equal(reportBalance({...source(),project_phase_checklists:[]}).project.percentage,null)
  assert.equal(reportBalance({...source(),project_phase_team:[{project_stage_id:99}]}).project.percentage,null,"orphaned historical phase scope cannot disappear from the denominator")
  const future=buildMonthlyReport({period:period(),project:{...project,created_at:"2026-11-01T00:00:00Z"},role:"admin"})
  assert.equal(future.createdAfterPeriod,true)
})

test("client and Site PM projections omit restricted activity and sensitive internal fields",()=>{
  const b=baseline()
  const events=[event(1,"project_phase_evidence",evidence(1)),event(2,"project_phase_evidence",evidence(2,"approved",2)),
    event(3,"project_progress_history",{id:1,project_stage_id:1,entry_type:"issue",note:"private reason",is_client_visible:false,recorded_at:"2026-10-04T00:00:00Z"}),
    event(4,"project_progress_history",{id:2,project_stage_id:1,entry_type:"update",note:"Shared update",is_client_visible:true,recorded_at:"2026-10-05T00:00:00Z"})]
  const client=buildMonthlyReport({baseline:b,events,period:period(),project,role:"client"})
  for(const key of ["activity","rework","pending","approvals","movement"])assert.equal(Object.hasOwn(client,key),false)
  assert.doesNotMatch(JSON.stringify(client),/private reason|reviewed_by|submitted_by/)
  assert.equal(client.updates[0].text,"Shared update")
  const site=buildMonthlyReport({baseline:b,events,period:period(),project,role:"spm",visiblePhaseIds:["1"]})
  assert.ok(site.activity.every(a=>a.phase==='Foundation'))
  assert.equal(site.closing.percentage,100,"aggregate progress covers whole authorized project")
  assert.equal(site.rework,null)
})

test("month-end excludes an entire transaction whose final reporting mutation is after cutoff",()=>{
  const events=[event(1,"project_phase_evidence",evidence(1),null,"2026-10-31T15:59:59Z",99),
    event(2,"project_phase_evidence",evidence(2,"approved",2),null,"2026-10-31T16:00:01Z",99)]
  const report=buildMonthlyReport({baseline:baseline(),events,period:period(),project,role:"admin"})
  assert.equal(report.closing.earned,0)
  assert.equal(report.approvals.events,0)
  assert.equal(report.completedPhases.length,0)
})

test("CSV and print share the snapshot, escape content, and never leak omitted fields",()=>{
  const report=buildMonthlyReport({baseline:baseline(),period:period(),project:{...project,name:'=HYPERLINK("evil")\n日本'},role:"client"})
  const csv=reportCsv(report),html=monthlyPrintDocument({...report,project:{...report.project,name:'<script>alert(1)</script>'}})
  assert.match(csv,/"'=HYPERLINK\(""evil""\)/)
  assert.ok(csv.includes('日本'))
  assert.equal(csvCell('a,"b"\nc'),'"a,""b""\nc"')
  assert.equal(csvCell("\t=1"),'"\'\t=1"')
  assert.doesNotMatch(csv,/Withdrawals|Credit withdrawn|Pending evidence|Rework/)
  assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false)
  assert.ok(csv.includes(report.period.generatedAt));assert.ok(html.includes('Monthly Project Progress Summary'))
})

test("local migration dry-run, reapply, immutable history and trigger events preserve project records",{timeout:60000},async t=>{
  const read=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8")
  const db=new PGlite({extensions:{citext}});t.after(()=>db.close())
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  await db.exec(read("../Thesis-Backend/migrations/003-react-integration.sql"))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  await db.exec(read("../Thesis-Backend/migrations/004-verified-activity-progress.sql"))
  const original=(await db.query("select id,current_pct from projects order by id")).rows
  const evidence=(await db.query("select * from project_phase_evidence order by id")).rows
  const dry=await migrateMonthlyReports(db)
  console.log("Monthly reporting migration dry run:",JSON.stringify(dry))
  assert.equal((await db.query("select to_regclass('public.monthly_report_baselines') as table")).rows[0].table,null)
  const first=await migrateMonthlyReports(db,{apply:true})
  const coverage=(await db.query("select project_id,covered_from from monthly_report_baselines order by project_id")).rows
  assert.deepEqual(await migrateMonthlyReports(db,{apply:true}),first)
  assert.deepEqual((await db.query("select project_id,covered_from from monthly_report_baselines order by project_id")).rows,coverage)
  assert.deepEqual((await db.query("select id,current_pct from projects order by id")).rows,original)
  assert.deepEqual((await db.query("select * from project_phase_evidence order by id")).rows,evidence)
  const id=original[0].id
  await db.query("update projects set name=name||' Test' where id=$1",[id])
  const event=(await db.query("select * from monthly_report_events where project_id=$1",[id])).rows[0]
  assert.equal(event.source_table,"projects");assert.ok(event.before_row.name);assert.ok(event.after_row.name.endsWith(' Test'))
  await assert.rejects(db.query("delete from monthly_report_events"),/immutable/)
  await assert.rejects(db.query("update monthly_report_baselines set covered_from=now()"),/immutable/)
  const beforeRollback=(await db.query("select count(*)::int as n from monthly_report_events")).rows[0].n
  await db.query("BEGIN")
  await db.query("update projects set name=name||' Rolled back' where id=$1",[id])
  await db.query("ROLLBACK")
  assert.equal((await db.query("select count(*)::int as n from monthly_report_events")).rows[0].n,beforeRollback)
  const phase=(await db.query("select * from project_phase_team where project_id=$1 limit 1",[id])).rows[0]
  if(phase){await db.query("update project_phase_team set responded_at=now() where id=$1",[phase.id]);assert.ok((await db.query("select 1 from monthly_report_events where source_table='project_phase_team'")).rowCount>0)}
  await db.exec("set role authenticated")
  await assert.rejects(db.query("select * from monthly_report_events"),e=>e.code==='42501')
  await db.exec("reset role")
})

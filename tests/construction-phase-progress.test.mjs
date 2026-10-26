import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { constructionPhaseProgress } from "../Thesis-Backend/src/domain/construction-phase-progress.js"
import { standardActivities } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import { snapshotProjectChecklists, readVerifiedProgress } from "../Thesis-Backend/src/services/progress/verified.utility.js"
import { readChecklist, assertPhaseUnlocked } from "../Thesis-Backend/src/services/progress/phase.utility.js"
import { verifiedComplete } from "../Thesis-Backend/src/services/progress/lifecycle.utility.js"
import { assessPhaseHandoff } from "../Thesis-Backend/src/services/progress/handoff.utility.js"
import { constructionPhaseRows } from "../src/project-progress.ts"

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8")
const activities = status => standardActivities(1, 3).map(item => ({...item, required:true, status, approvalValid:status === "approved"}))

test("statuses use standard identities, valid approvals, explicit holds and real starts", () => {
  assert.deepEqual(constructionPhaseProgress(1,3), {required:3,approved:0,status:"Not Started",complete:false,onHold:false})
  assert.equal(constructionPhaseProgress(1,3,[],{started:true}).status,"Ongoing")
  const items=activities("pending")
  assert.equal(constructionPhaseProgress(1,3,items).status,"Pending Approval")
  assert.equal(constructionPhaseProgress(1,3,items).approved,0)
  items[0]={...items[0],status:"approved",approvalValid:true}
  assert.equal(constructionPhaseProgress(1,3,items).status,"Pending Approval")
  items[1].status="missing"
  assert.equal(constructionPhaseProgress(1,3,items).status,"Ongoing")
  for(const status of ["rejected","rework_required"]) {
    items[1].status=status
    assert.equal(constructionPhaseProgress(1,3,items).status,"Ongoing")
    assert.equal(constructionPhaseProgress(1,3,items).approved,1)
  }
  const approved=activities("approved")
  assert.equal(constructionPhaseProgress(1,3,approved).status,"Completed")
  assert.equal(constructionPhaseProgress(1,3,approved,{onHold:true}).status,"On Hold")
  assert.equal(constructionPhaseProgress(1,3,approved,{onHold:true}).complete,false)
  approved[0].approvalValid=false
  assert.equal(constructionPhaseProgress(1,3,approved).complete,false)
  assert.equal(constructionPhaseProgress(1,3,approved).approved,2)
  const legacy=[...activities("approved"),{code:"legacy",required:true,status:"rejected",approvalValid:false}]
  assert.equal(constructionPhaseProgress(1,3,legacy).required,3)
  assert.equal(constructionPhaseProgress(1,3,legacy).approved,3)
  assert.equal(constructionPhaseProgress(1,3,legacy).status,"Ongoing")
  assert.equal(constructionPhaseProgress(1,3,[...activities("approved"),activities("approved")[0]]).complete,false)
})

test("browser rows use phase totals with absent or legacy aggregates and never infer completion", () => {
  const phases=["Mobilization","Design","Closeout"]
  assert.deepEqual(constructionPhaseRows(phases).map(row=>[row.approved,row.required,row.status]),[[0,4,"Not Started"],[0,3,"Not Started"],[0,4,"Not Started"]])
  const legacy=[{id:"1",name:"Design",configured:true,required:8,approved:8}]
  assert.equal(constructionPhaseRows(phases,legacy)[1].approved,0)
  assert.equal(constructionPhaseRows(phases,[{...legacy[0],required:3,approved:3}])[1].status,"Ongoing")
})

test("database summaries, reconciliation, holds and sequential locks survive fresh reads for all project types", {timeout:60000}, async t => {
  const db=new PGlite({extensions:{citext}})
  t.after(()=>db.close())
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  for(const name of ["003-react-integration.sql","004-project-type-workflows.sql","004-verified-activity-progress.sql","005-targeted-rework.sql"])
    await db.exec(read("../Thesis-Backend/migrations/"+name))
  const reviewer=(await db.query("select id from users order by id limit 1")).rows[0].id
  const evidence=async(project,item,status)=>db.query(`insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by,reviewed_by,reviewed_at)
    values($1,$2,$3,$4,$5,$6,$7)`,[project,item.project_stage_id,item.id,status,reviewer,status==="pending"?null:reviewer,status==="pending"?null:new Date()])
  const migration=read("../Thesis-Backend/migrations/012-construction-phase-hold.sql")
  for(const type of ["Residential","Commercial","Mixed-Use"]) {
    const id=randomUUID()
    await db.query("insert into projects(id,name,project_type_id,client_name,lifecycle_status) select $1,$2::text,id,'Test','active' from project_types where code=$2::text",[id,type])
    const scope=(await db.query(`select w.project_stage_id from projects p join project_type_stages w on w.project_type_id=p.project_type_id where p.id=$1 order by w.sort_order`,[id])).rows
    await db.query("update projects set current_stage_id=$2 where id=$1",[id,scope[0].project_stage_id])
    const summary=async()=> (await readVerifiedProgress(db,[id])).get(id)
    let initial=await summary()
    assert.deepEqual(initial.construction.map(row=>row.required),[4,...Array(scope.length-2).fill(3),4])
    assert.ok(initial.construction.every(row=>row.approved===0&&row.status==="Not Started"))
    assert.ok(initial.construction.slice(1).every(row=>row.locked))
    assert.deepEqual(await summary(),initial,"fresh reads preserve unstarted totals")
    await snapshotProjectChecklists(db,id)
    const first=scope[0].project_stage_id
    const items=(await db.query("select * from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by sort_order",[id,first])).rows
    await evidence(id,items[0],"approved")
    assert.equal((await summary()).construction[0].status,"Ongoing")
    assert.equal((await summary()).construction[0].approved,1)
    for(const item of items.slice(1))await evidence(id,item,"pending")
    assert.equal((await summary()).construction[0].status,"Pending Approval")
    await evidence(id,items[1],"rejected")
    assert.equal((await summary()).construction[0].status,"Ongoing")
    assert.equal((await summary()).construction[0].approved,1)
    await evidence(id,items[1],"pending")
    for(const item of items.slice(1))await evidence(id,item,"approved")
    initial=await summary()
    assert.equal(initial.construction[0].status,"Completed")
    assert.equal(initial.construction[0].approved,4)
    assert.deepEqual(await summary(),initial,"refresh counts latest evidence once")
    await assert.rejects(assertPhaseUnlocked(db,{id},scope[1].project_stage_id),/locked/)
    await assertPhaseUnlocked(db,{id},first)
    const extra=(await db.query("insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order,weight) values($1,$2,'legacy_document','Existing mandatory document',true,99,25) returning *",[id,first])).rows[0]
    assert.equal((await summary()).construction[0].status,"Ongoing")
    assert.equal(verifiedComplete((await readChecklist(db,id,first)).verified),false)
    await evidence(id,extra,"approved")
    assert.equal((await summary()).construction[0].status,"Completed")
    const records=async()=>({
      evidence:(await db.query("select * from project_phase_evidence where project_id=$1 order by id",[id])).rows,
      history:(await db.query("select * from project_progress_history where project_id=$1 order by id",[id])).rows,
    })
    const before=await records()
    // A missing standard identity cannot inherit an unrelated legacy approval.
    await db.query("update project_phase_checklist_items set code='legacy_possession',title='Original document title' where id=$1",[items[0].id])
    assert.equal((await summary()).construction[0].approved,3)
    await readChecklist(db,id,first)
    assert.deepEqual(await records(),before)
    assert.equal((await db.query("select title from project_phase_checklist_items where id=$1",[items[0].id])).rows[0].title,"Original document title")
    const counts=async()=> (await db.query("select count(*)::int n from audit_log where new_values->>'_checklist_scope_extension'='standard-4-3-4'")).rows[0].n
    const audits=await counts()
    await readChecklist(db,id,first)
    assert.equal(await counts(),audits,"reconciliation is idempotent")
    assert.equal((await summary()).construction[0].approved,3)
    await db.exec(migration)
    await db.exec(migration)
    await db.query("update project_phase_checklists set on_hold=true where project_id=$1 and project_stage_id=$2",[id,first])
    assert.equal((await summary()).construction[0].status,"On Hold")
    assert.equal(verifiedComplete((await readChecklist(db,id,first)).verified),false)
    assert.equal((await assessPhaseHandoff(db,{id,lifecycle_status:"active",current_stage_id:first})).reasonCode,"phase_on_hold")
    await assert.rejects(assertPhaseUnlocked(db,{id},first),/on hold/)
    assert.deepEqual(await summary(),await summary(),"explicit hold survives fresh reads")
    await db.query("update project_phase_checklists set on_hold=false where project_id=$1 and project_stage_id=$2",[id,first])
    assert.equal((await summary()).construction[0].status,"Ongoing")
    assert.deepEqual(await records(),before,"migration and holds preserve evidence and historical progress")
  }
})

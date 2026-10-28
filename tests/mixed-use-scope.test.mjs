import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { defaultMixedUseScope, mixedUsePhaseReview, mixedUseScopeError, normalizeMixedUseScope } from "../Thesis-Backend/src/domain/mixed-use-scope.js"
import { projectWorkflowSql } from "../Thesis-Backend/src/services/projects/project-workflow.utility.js"
import { validatePhaseTeam } from "../Thesis-Backend/src/services/projects/type-phases.utility.js"
import { snapshotProjectChecklists, readVerifiedProgress } from "../Thesis-Backend/src/services/progress/verified.utility.js"
import { stageOptions, resolveStage } from "../Thesis-Backend/src/services/progress/phase-update.utility.js"
import { readChecklist, assertPhaseUnlocked } from "../Thesis-Backend/src/services/progress/phase.utility.js"
import { assessPhaseHandoff } from "../Thesis-Backend/src/services/progress/handoff.utility.js"
import { reportBalance } from "../Thesis-Backend/src/domain/monthly-report.js"
import { PROJECT_PHASE_DEFINITIONS, headcount, emptyState, spmCandidates } from "../src/model.ts"
import { allocationPhases } from "../src/subcontractor-allocation.ts"
import { allocationContext } from "../Thesis-Backend/src/services/workspace/subcontractor-allocation.utility.js"

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8")
const scope=()=>({...defaultMixedUseScope(),basis:"Client brief reviewed: mixed-use new building with the selected uses and design features.",confirmed:true})

test("scope keeps core work for all supported use and feature combinations and never accepts client-provided phase names",()=>{
  assert.deepEqual(normalizeMixedUseScope(scope()).phases,PROJECT_PHASE_DEFINITIONS["Mixed-Use"].map(row=>row.name))
  for(let uses=0;uses<16;uses++)for(let features=0;features<16;features++){
    const draft=scope()
    draft.uses=["residential","retail","office","hotel"].filter((_,i)=>uses&(1<<i))
    draft.features=Object.fromEntries(["podium","tower","curtainWall","landscaping"].map((key,i)=>[key,!!(features&(1<<i))]))
    if(draft.uses.length<2){assert.ok(mixedUseScopeError(draft));continue}
    const saved=normalizeMixedUseScope({...draft,phases:["Closeout"],confirmedBy:"spoofed"})
    const phases=mixedUsePhaseReview(saved).filter(row=>row.included)
    const project={type:"Mixed-Use",phaseScope:saved,team:phases.map((phase,sequence)=>({phase:phase.name,sequence,requiredDisciplines:phase.disciplines}))}
    assert.deepEqual(allocationPhases(emptyState(),project),phases.map(({name,disciplines})=>({name,disciplines})),"company allocation uses the same confirmed work packages")
    assert.ok(phases.filter(row=>!row.required).every(row=>row.reason===""),"included packages never show a non-applicability reason")
    for(const name of ["Mobilization","Design","Foundation","MEP Rough-In","Fire & Life Safety","Closeout"])assert.ok(saved.phases.includes(name))
    assert.equal(saved.phases.includes("Residential Fit-Out"),draft.uses.includes("residential"))
    assert.equal(saved.phases.includes("Office Fit-Out"),draft.uses.includes("office"))
    assert.equal(saved.phases.includes("Hotel Fit-Out"),draft.uses.includes("hotel"))
    assert.equal(saved.phases.includes("Retail/Commercial Fit-Out"),draft.uses.includes("retail"))
    assert.equal(saved.phases.includes("Structure"),!draft.features.tower)
    assert.ok(saved.phases.includes(draft.features.curtainWall?"Envelope / Curtain Wall":"Envelope"))
    assert.ok(saved.phases.includes(draft.features.landscaping?"Landscape & Site Works":"Site Works"))
    assert.equal(new Set(saved.phases).size,saved.phases.length)
    assert.equal(saved.confirmedBy,undefined)
    assert.equal(headcount("Mixed-Use","100","1",phases).base,phases.filter(row=>row.name!=="Closeout").reduce((sum,row)=>sum+row.disciplines.length,0))
  }
  for(const invalid of [null,{}, {...scope(),confirmed:false},{...scope(),uses:["office","office"]},{...scope(),uses:["office","unknown"]},{...scope(),basis:""},{...scope(),features:{}},{...scope(),features:{...scope().features,fireSafety:false}}])assert.throws(()=>normalizeMixedUseScope(invalid))
  const state=emptyState()
  state.accounts=[{id:"civil",role:"spm",name:"Civil",status:"active",expiry:"2099-01-01",scope:["Civil"],projectTypes:[],docs:[]},{id:"electrical",role:"spm",name:"Electrical",status:"active",expiry:"2099-01-01",scope:["Electrical"],projectTypes:[],docs:[]}]
  assert.deepEqual(spmCandidates(state,"Mixed-Use","Office Fit-Out","new",["Interior/Finishes","Acoustic","Electrical"]).map(row=>row.account.id),["electrical"])
})

test("saved scopes drive checklists, options, sequential handoff and historical totals while legacy projects are preserved",{timeout:60000},async t=>{
  const db=new PGlite({extensions:{citext}});t.after(()=>db.close())
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  for(const migration of ["003-react-integration.sql","004-project-type-workflows.sql","004-verified-activity-progress.sql","005-targeted-rework.sql","009-engineer-license-workflow.sql"])await db.exec(read("../Thesis-Backend/migrations/"+migration))
  const original=(await db.query(`SELECT id,current_stage_id,current_pct,lifecycle_status FROM projects ORDER BY id`)).rows
  const originalWorkflows=(await db.query(projectWorkflowSql)).rows
  await db.exec(read("../Thesis-Backend/migrations/014-mixed-use-project-scope.sql"))
  await db.exec(read("../Thesis-Backend/migrations/014-mixed-use-project-scope.sql"))
  assert.deepEqual((await db.query(`SELECT id,current_stage_id,current_pct,lifecycle_status FROM projects ORDER BY id`)).rows,original)
  assert.deepEqual((await db.query(projectWorkflowSql)).rows,originalWorkflows)
  const type=(await db.query("SELECT id FROM project_types WHERE code='Mixed-Use'")).rows[0].id
  const reviewer=(await db.query("SELECT id FROM users ORDER BY id LIMIT 1")).rows[0].id
  const saved=normalizeMixedUseScope({...scope(),uses:["office","retail"],features:{podium:false,tower:false,curtainWall:false,landscaping:false}})
  const id=randomUUID()
  await db.query("INSERT INTO projects(id,name,project_type_id,client_name,lifecycle_status,phase_scope) VALUES($1,'Scope fixture',$2,'Test','active',$3)",[id,type,JSON.stringify(saved)])
  const phases=await stageOptions(db,type,id)
  assert.deepEqual(phases.map(row=>row.code),saved.phases)
  const companyContext=await allocationContext(db,{id,project_type_id:type})
  assert.deepEqual(companyContext.phases.map(row=>row.name),saved.phases)
  assert.ok(companyContext.phases.find(row=>row.name==="Office Fit-Out").disciplines.includes("Electrical"))
  await db.query("UPDATE projects SET current_stage_id=$2 WHERE id=$1",[id,phases[0].id])
  for(const phase of phases)await db.query("INSERT INTO project_phase_team(project_id,project_stage_id,spm_user_id,status,is_lead) VALUES($1,$2,$3,'confirmed',$4)",[id,phase.id,reviewer,phase.code==="Mobilization"])
  await validatePhaseTeam(db,type,phases.map(row=>({stage:row.code})),{projectId:id})
  await assert.rejects(validatePhaseTeam(db,type,phases.slice(1).map(row=>({stage:row.code})),{projectId:id}),/confirmed project scope/)
  await assert.rejects(resolveStage(db,{stage:"Residential Fit-Out"},null,type,id),/Unknown/)
  await assert.rejects(resolveStage(db,{stage:"Tower Structure"},null,type,id),/Unknown/)
  await snapshotProjectChecklists(db,id)
  const initial=(await readVerifiedProgress(db,[id])).get(id)
  assert.deepEqual(initial.construction.map(row=>row.name),saved.phases)
  assert.deepEqual(initial.construction.map(row=>row.required),[4,...Array(phases.length-2).fill(3),4])
  assert.equal(initial.project.total,(8+3*(phases.length-2))*10)
  const excluded=(await db.query("SELECT id FROM project_stages WHERE code='Residential Fit-Out'")).rows[0].id
  assert.deepEqual((await readChecklist(db,id,excluded)).items,[],"an excluded phase cannot silently initialize a checklist")
  const foundation=phases.find(row=>row.code==="Foundation")
  await db.query("UPDATE projects SET current_stage_id=$2 WHERE id=$1",[id,foundation.id])
  await assert.rejects(assertPhaseUnlocked(db,{id},phases.find(row=>row.code==="MEP Rough-In").id),/locked/)
  const items=(await readChecklist(db,id,foundation.id)).items
  for(const item of items)await db.query("INSERT INTO project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by,reviewed_by,reviewed_at) VALUES($1,$2,$3,'approved',$4,$4,now())",[id,foundation.id,item.id,reviewer])
  const next=await assessPhaseHandoff(db,{id,lifecycle_status:"active",current_stage_id:foundation.id})
  assert.equal(next.state,"ready")
  assert.equal(next.phase.code,"Structure","handoff skips only genuinely non-applicable packages")
  const snapshot={}
  for(const table of ["projects","project_stages","project_type_stages","project_phase_checklists","project_phase_checklist_items","project_phase_evidence","project_phase_team"])
    snapshot[table]=(await db.query(table==="projects"?"SELECT * FROM projects WHERE id=$1":["project_stages","project_type_stages"].includes(table)?`SELECT * FROM ${table}`:`SELECT * FROM ${table} WHERE project_id=$1`,["project_stages","project_type_stages"].includes(table)?[]:[id])).rows
  const balance=reportBalance(snapshot)
  assert.deepEqual(balance.phases.map(row=>row.name),saved.phases)
  assert.equal(balance.project.total,initial.project.total)
  assert.equal(balance.project.earned,30)
  assert.deepEqual((await readVerifiedProgress(db,[id])).get(id),(await readVerifiedProgress(db,[id])).get(id),"fresh reads retain the saved scope and evidence totals")
})

import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { STANDARD_PHASE_ACTIVITIES, MOBILIZATION_ACTIVITIES, CLOSEOUT_ACTIVITIES } from "../Thesis-Backend/src/domain/standard-phase-checklist.js"
import { reviseStandardChecklists } from "../Thesis-Backend/scripts/revise-standard-checklists.js"
import { blockingReviews } from "../Thesis-Backend/src/services/progress/lifecycle.utility.js"
import { submitChecklist } from "../Thesis-Backend/src/services/progress/phase-submission.utility.js"
import { snapshotProjectChecklists } from "../Thesis-Backend/src/services/progress/verified.utility.js"
import { CHECKLISTS, checklistFor } from "../src/workflows.ts"
import { PROJECT_PHASE_DEFINITIONS } from "../src/model.ts"
const read = path => fs.readFileSync(new URL(path,import.meta.url),"utf8")

test("browser uses 4-3-4 defaults and preserves saved scopes and historical records", () => {
  const labels=STANDARD_PHASE_ACTIVITIES.map(item=>item.title)
  for(const definitions of Object.values(PROJECT_PHASE_DEFINITIONS)) {
    const p={team:definitions.map((phase,sequence)=>({phase:phase.name,sequence})),workflow:{checklist:{}}}
    for(const phase of definitions.slice(1,-1)) assert.deepEqual(checklistFor(p,phase.name).map(item=>item.label),labels)
    assert.deepEqual(checklistFor(p,definitions[0].name).map(item=>item.label),CHECKLISTS.Mobilization)
    assert.deepEqual(checklistFor(p,definitions.at(-1).name).map(item=>item.label),CHECKLISTS.Closeout)
    const saved=[{id:"existing",label:"Existing evidence and scope",required:true,weight:10,status:"approved"}]
    p.workflow.checklist[definitions[1].name]=saved
    assert.deepEqual(checklistFor(p,definitions[1].name),saved)
    saved.push({id:"retired",label:"Historical requirement",required:false,status:"submitted"})
    assert.deepEqual(checklistFor(p,definitions[1].name),[saved[0]])
    assert.equal(saved.length,2,"historical records are retained")
  }
})

test("4-3-4 snapshots and explicit existing-scope revision preserve approval IDs and history; dry run and repeat are safe", async t => {
  const db=new PGlite({extensions:{citext}});t.after(()=>db.close())
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  await db.exec(read("../Thesis-Backend/migrations/003-react-integration.sql"))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  await db.exec(read("../Thesis-Backend/migrations/004-project-type-workflows.sql"))
  await db.exec(read("../Thesis-Backend/migrations/004-verified-activity-progress.sql"))
  const templates=async()=> (await db.query("select * from phase_checklist_templates order by id")).rows
  const originals=await templates()
  const snapshots=async()=> {
    const result={}
    for(const table of ["project_phase_checklists","project_phase_checklist_items","project_phase_evidence","project_progress_history"])
      result[table]=(await db.query(`select * from ${table} order by 1,2`)).rows
    return result
  }
  const before=await snapshots()
  // New snapshots follow the standard even before the default-template rollout.
  for(const type of Object.keys(PROJECT_PHASE_DEFINITIONS)) {
    const id=randomUUID()
    await db.query("insert into projects(id,name,project_type_id,client_name,lifecycle_status) select $1,$2::text,id,'Disposable checklist test','draft' from project_types where code=$2::text",[id,type])
    await snapshotProjectChecklists(db,id)
    assert.equal((await db.query("select sum(weight)::int as total from project_phase_checklist_items where project_id=$1 and required",[id])).rows[0].total,type==='Mixed-Use'?380:290)
    const phases=(await db.query("select s.id,s.code from project_type_stages w join project_stages s on s.id=w.project_stage_id join project_types t on t.id=w.project_type_id where t.code=$1 order by w.sort_order",[type])).rows
    for(const phase of phases.slice(1,-1)) {
      const rows=(await db.query("select code,title,required,weight from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by sort_order",[id,phase.id])).rows
      assert.deepEqual(rows,STANDARD_PHASE_ACTIVITIES.map(item=>({...item,required:true})))
    }
    for(const [phase,activities] of [[phases[0],MOBILIZATION_ACTIVITIES],[phases.at(-1),CLOSEOUT_ACTIVITIES]]) {
      const rows=(await db.query("select code,title,required,weight from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by sort_order",[id,phase.id])).rows
      assert.deepEqual(rows,activities.map(item=>({...item,required:true})))
    }
  }
  const allSnapshots=await snapshots()
  const migration=read("../Thesis-Backend/migrations/006-standard-middle-phase-checklists.sql")
  await db.exec(migration.replace(/COMMIT;\s*$/,"ROLLBACK;"))
  assert.deepEqual(await templates(),originals)
  assert.deepEqual(await snapshots(),allSnapshots)
  await db.exec(migration)
  const once=await templates()
  await db.exec(migration)
  assert.deepEqual(await templates(),once)
  assert.deepEqual(await snapshots(),allSnapshots)
  for(const phase of ["Mobilization","Closeout"]) {
    const id=(await db.query("select id from project_stages where code=$1",[phase])).rows[0].id
    assert.deepEqual(once.filter(row=>row.project_stage_id===id),originals.filter(row=>row.project_stage_id===id))
  }
  for(const [table,rows] of Object.entries(before)) {
    const after=allSnapshots[table]
    for(const row of rows) assert.ok(after.some(candidate=>JSON.stringify(candidate)===JSON.stringify(row)),`original ${table} row retained`)
  }
  console.log("Standard checklist dry run rolled back; repeat apply preserved all project snapshots, evidence and history.")

  const id=randomUUID()
  const stage=(await db.query("select id from project_stages where code='Foundation'")).rows[0].id
  const first=(await db.query("select id from project_stages where code='Mobilization'")).rows[0].id
  const reviewer=(await db.query("select id from users order by id limit 1")).rows[0].id
  await db.query("insert into projects(id,name,project_type_id,client_name,lifecycle_status,current_stage_id) select $1,'Active revision fixture',id,'Disposable test','active',$2 from project_types where code='Residential'",[id,stage])
  await snapshotProjectChecklists(db,id)
  await db.query("update project_phase_checklist_items set title='Historical starting phase' where project_id=$1 and project_stage_id=$2",[id,first])
  const extra=(await db.query("insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order,weight) values($1,$2,'previous_acceptance','Previous acceptance',true,4,10) returning id",[id,stage])).rows[0].id
  const approved=(await db.query("select id from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 and code='work_inspection'",[id,stage])).rows[0].id
  await db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by,reviewed_by,reviewed_at) values($1,$2,$3,'approved',$4,$4,now())",[id,stage,approved,reviewer])
  await db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by) values($1,$2,$3,'pending',$4)",[id,stage,extra,reviewer])
  assert.equal(await blockingReviews(db,id),true,"pending previous requirement blocks before revision")
  const oldRecords=await snapshots()
  const previousPhase=(await db.query("select * from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by id",[id,first])).rows
  const archived=async()=> (await db.query("select i.* from project_phase_checklist_items i join projects p on p.id=i.project_id where p.lifecycle_status<>'active' order by i.id")).rows
  const archivedBefore=await archived()
  const dry=await reviseStandardChecklists(db)
  assert.equal(dry.mode,"dry-run (rolled back)")
  assert.deepEqual(await snapshots(),oldRecords,"dry run restores all project records")
  const applied=await reviseStandardChecklists(db,{apply:true})
  console.log("4-3-4 scope revision dry run:",JSON.stringify({mode:dry.mode,before:dry.before,after:dry.after}))
  const items=(await db.query("select * from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by sort_order",[id,stage])).rows
  assert.deepEqual(items.filter(i=>i.required).map(i=>i.code),STANDARD_PHASE_ACTIVITIES.map(i=>i.code))
  assert.equal(items.find(i=>i.code==='work_inspection').id,approved,"matching activity ID and approval retained")
  assert.equal(items.find(i=>i.id===extra).required,false,"extra item retained as historical")
  await assert.rejects(submitChecklist(db,{id,current_stage_id:stage},{id:reviewer},{item_id:extra}),/historical/)
  assert.equal((await db.query("select current_pct from projects where id=$1",[id])).rows[0].current_pct,33)
  assert.equal(await blockingReviews(db,id),false,"retired pending evidence does not block handoff")
  assert.deepEqual((await db.query("select * from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by id",[id,first])).rows,previousPhase)
  assert.deepEqual(await archived(),archivedBefore,"inactive projects retain historical scope")
  const last=(await db.query("select s.id from project_type_stages w join project_stages s on s.id=w.project_stage_id join projects p on p.project_type_id=w.project_type_id where p.id=$1 order by w.sort_order desc limit 1",[id])).rows[0].id
  assert.deepEqual((await db.query("select code from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 and required order by sort_order",[id,last])).rows.map(i=>i.code),CLOSEOUT_ACTIVITIES.map(i=>i.code))
  const revised=await snapshots()
  for(const table of ["project_phase_evidence","project_progress_history"]) assert.deepEqual(revised[table],oldRecords[table],`${table} preserved exactly`)
  const again=await reviseStandardChecklists(db,{apply:true})
  assert.deepEqual(again.after,applied.after,"repeat does not duplicate revision events")
  assert.deepEqual(await snapshots(),revised,"repeat apply is idempotent")
  const required=(await db.query("select id from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 and code='method_statement'",[id,stage])).rows[0].id
  await db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,status,submitted_by) values($1,$2,$3,'pending',$4)",[id,stage,required,reviewer])
  assert.equal(await blockingReviews(db,id),true,"required pending evidence still blocks")
})

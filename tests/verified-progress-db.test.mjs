import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { migrateVerifiedProgress, assertLocalDatabase } from "../Thesis-Backend/scripts/migrate-verified-progress.js"
import { readVerifiedProgress, snapshotProjectChecklists } from "../Thesis-Backend/src/services/progress/verified.utility.js"

const read = path => fs.readFileSync(new URL(path,import.meta.url),"utf8")
const projectId = "5400952f-e868-4d7c-87d5-30ac7612599c"

test("migration refuses non-local configuration before any connection",()=>{
  for (const host of ["localhost","127.0.0.1","::1"]) assert.doesNotThrow(()=>assertLocalDatabase(host))
  for (const host of [undefined,"","db.example.com","127.0.0.2","localhost.example.com"]) assert.throws(()=>assertLocalDatabase(host),/localhost/)
})

test("local migration, trusted aggregates, evidence versions and stable snapshots",{timeout:60000},async t=>{
  const db=new PGlite({extensions:{citext}})
  t.after(()=>db.close())
  await db.exec("create role authenticated; create role anon; create role service_role; create schema extensions; create schema auth; create schema storage;")
  await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  await db.exec(read("../supabase/seed/dummy-data.sql"))
  const client={query:(sql,args)=>sql.includes("ALTER TABLE")?db.exec(sql).then(results=>results.at(-1)):db.query(sql,args)}
  const original=(await db.query("select id,current_pct from projects order by id")).rows
  const dryRun=await migrateVerifiedProgress(client)
  assert.equal(dryRun.mode,"dry-run (rolled back)")
  assert.equal(dryRun.project_activities,dryRun.default_value_activities)
  assert.equal((await db.query("select column_name from information_schema.columns where table_name='project_phase_checklist_items' and column_name='weight'")).rows.length,0)
  console.log("Disposable database migration dry-run:",JSON.stringify(dryRun))
  const applied=await migrateVerifiedProgress(client,{apply:true})
  assert.deepEqual({...applied,mode:dryRun.mode},dryRun)
  assert.deepEqual(await migrateVerifiedProgress(client,{apply:true}),applied)
  assert.deepEqual((await db.query("select id,current_pct from projects order by id")).rows,original)
  assert.equal((await db.query("select count(*)::int as n from project_phase_evidence")).rows[0].n,dryRun.evidence_rows)
  for(const value of [0,-1,NaN,Infinity]) {
    await assert.rejects(db.query("update project_phase_checklist_items set weight=$1 where project_id=$2",[value,projectId]))
  }

  const readProject=async()=> (await readVerifiedProgress(db,[projectId])).get(projectId)
  const initial=await readProject()
  assert.equal(initial.project.percentage,null,"uninitialized earlier/future scope is not assumed complete")
  assert.ok(initial.project.reason)
  const structure=initial.phases.find(p=>p.name==="Structure")
  assert.deepEqual([structure.earned,structure.total,structure.percentage],[30,50,60])

  // This is a disposable test fixture, not a backfill of an existing user database.
  await snapshotProjectChecklists(db,projectId)
  const complete=await readProject()
  assert.deepEqual([complete.project.earned,complete.project.total],[30,260])
  assert.equal(complete.project.percentage,30/260*100)
  await db.query("update phase_checklist_templates set weight=50")
  await snapshotProjectChecklists(db,projectId)
  assert.deepEqual(await readProject(),complete,"template edits cannot rewrite existing project snapshots")

  const item=(await db.query(`select i.* from project_phase_checklist_items i where project_id=$1
    and not exists(select 1 from project_phase_evidence e where e.checklist_item_id=i.id) order by i.id limit 1`,[projectId])).rows[0]
  const reviewer=(await db.query("select suggested_opm_id as id from projects where id=$1",[projectId])).rows[0].id
  const insert=status=>db.query(`insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,
    status,submitted_by,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$5,now())`,[projectId,item.project_stage_id,item.id,status,reviewer])
  await insert("approved")
  await insert("approved")
  assert.equal((await readProject()).project.earned,40,"latest evidence counts one activity, not two approvals")
  await insert("rejected")
  assert.equal((await readProject()).project.earned,30,"the latest rejected evidence cannot retain older credit")
  await db.query("update project_phase_checklist_items set weight=25 where id=$1",[item.id])
  const changed=await readProject()
  assert.equal(changed.project.total,275)
  assert.equal(changed.project.earned,30)
  assert.deepEqual((await db.query("select id,current_pct from projects order by id")).rows,original,"verified reads never rewrite legacy progress")
})

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import test from "node:test"
import ts from "typescript"
import {PGlite} from "@electric-sql/pglite"
import {citext} from "@electric-sql/pglite/contrib/citext"
import {migrateActivityProgress,verifyActivityProgress} from "../Thesis-Backend/scripts/check-activity-progress.js"

const root=new URL("../",import.meta.url)
const read=p=>fs.readFileSync(new URL(p,root),"utf8")
async function database(t) {
  const db=new PGlite({extensions:{citext}});t.after(()=>db.close())
  await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;")
  await db.exec(read("supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""))
  for(const name of ["001-phase-checklists.sql","002-phase-update-confirmation.sql","003-react-integration.sql"])
    await db.exec(read("Thesis-Backend/migrations/"+name))
  await db.exec(read("supabase/seed/dummy-data.sql"))
  return db
}
const client=db=>({query:(sql,args)=>/DO \$\$|-- Recovery migration/.test(sql)?db.exec(sql).then(rows=>rows.at(-1)):db.query(sql,args)})
async function preserved(db) {
  const data={}
  for(const table of ["project_phase_evidence","project_progress_history","project_phase_checklists","projects"])
    data[table]=(await db.query(`select row_to_json(t) as row from ${table} t order by row_to_json(t)::text`)).rows
  for(const entry of data.project_phase_evidence)delete entry.row.rework_request_id
  data.items=(await db.query("select id,project_id,project_stage_id,code,title,required,sort_order from project_phase_checklist_items order by id")).rows
  return data
}
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith(".js")?[path.join(dir,e.name)]:[])}
function queries(source,file) {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),result=[]
  function visit(node) {
    if(ts.isCallExpression(node)&&node.arguments.length&&
       ((ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==="query")||
        (ts.isIdentifier(node.expression)&&node.expression.text==="execute"))) {
      const arg=node.arguments[0]
      if(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)) {
        if(/^\s*(select|insert|update|delete|with)\b/i.test(arg.text))result.push({sql:arg.text,line:ast.getLineAndCharacterOfPosition(arg.getStart()).line+1})
      }
    }
    ts.forEachChild(node,visit)
  }visit(ast);return result
}

test("additive recovery dry run rolls back; repeat apply preserves evidence, history, scope and legacy percentages",{timeout:60000},async t=>{
  const db=await database(t),before=await preserved(db),api=client(db)
  await assert.rejects(verifyActivityProgress(db),/weight/)
  const dry=await migrateActivityProgress(api)
  console.log("Recovery dry-run:",JSON.stringify(dry))
  assert.ok(dry.added_columns.includes("project_phase_checklist_items.weight:integer"))
  await assert.rejects(verifyActivityProgress(db),/weight/)
  assert.deepEqual(await preserved(db),before)
  const applied=await migrateActivityProgress(api,{apply:true})
  const twice=await migrateActivityProgress(api,{apply:true})
  assert.equal(twice.added_columns.length,0)
  assert.equal(twice.evidence,applied.evidence);assert.equal(twice.history,applied.history)
  assert.deepEqual(await preserved(db),before)
  for(const table of ["phase_checklist_templates","project_phase_checklist_items"]) {
    assert.equal((await db.query(`select count(*)::int as n from ${table} where weight<>10`)).rows[0].n,0)
    for(const value of [0,-1])await assert.rejects(db.query(`update ${table} set weight=$1`,[value]),error=>error.code==="23514")
  }
  const policies=(await db.query("select tablename,policyname from pg_policies where policyname like 'verified_%'")).rows
  assert.equal(policies.length,4)
  await db.exec("set role authenticated")
  await assert.rejects(db.query("select * from project_rework_activities"),error=>error.code==="42501")
  await db.exec("reset role")
  const definition=(await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='project_phase_evidence'::regclass and conname='project_phase_evidence_status_check'")).rows[0].definition
  assert.equal(definition.includes("rework_required"),false,"legacy status CHECK is never dropped or widened")
  const original=(await db.query("select * from project_phase_evidence where status='approved' order by id limit 1")).rows[0]
  const request=(await db.query("insert into pending_rework_requests(project_id,project_stage_id,reason,submitted_by) values($1,$2,'Disposable old-writer compatibility test',$3) returning id",[original.project_id,original.project_stage_id,original.submitted_by])).rows[0]
  const marker=(await db.query(`insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,file_id,status,submitted_by,reviewed_by,reviewed_at,rework_request_id)
    values($1,$2,$3,$4,'rework_required',$5,$6,now(),$7) returning status`,[original.project_id,original.project_stage_id,original.checklist_item_id,original.file_id,original.submitted_by,original.reviewed_by,request.id])).rows[0]
  assert.equal(marker.status,"rejected","the old deployed writer works without dropping the strict status constraint")
  assert.deepEqual((await db.query("select * from project_phase_evidence where id=$1",[original.id])).rows[0],original)
  const sql=read("Thesis-Backend/migrations/004-verified-activity-progress.sql").replace(/--[^\n]*/g,"")
  assert.doesNotMatch(sql,/^\s*(DROP|RENAME|DELETE|UPDATE|TRUNCATE)\b|ALTER\s+TABLE[^;]+\b(DROP|RENAME)\b/mi)
})

test("rework evidence links enforce activity, project and phase scope, including existing recovery tables",{timeout:60000},async t=>{
  const db=await database(t),api=client(db)
  await migrateActivityProgress(api,{apply:true})
  const item=(await db.query("select * from project_phase_checklist_items order by id limit 1")).rows[0]
  const user=(await db.query("select id from users order by id limit 1")).rows[0].id
  const otherProject=(await db.query("select id from projects where id<>$1 limit 1",[item.project_id])).rows[0].id
  const otherStage=(await db.query("select id from project_stages where id<>$1 limit 1",[item.project_stage_id])).rows[0].id
  const request=(await db.query(`insert into pending_rework_requests(project_id,project_stage_id,reason,submitted_by)
    values($1,$2,'Evidence scope regression',$3) returning id`,[item.project_id,item.project_stage_id,user])).rows[0].id
  await db.query(`insert into project_rework_activities(request_id,project_id,project_stage_id,checklist_item_id)
    values($1,$2,$3,$4)`,[request,item.project_id,item.project_stage_id,item.id])
  async function evidence(activity) {
    return (await db.query(`insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,submitted_by)
      values($1,$2,$3,$4) returning id`,[activity.project_id,activity.project_stage_id,activity.id,user])).rows[0].id
  }
  const correct=await evidence(item)
  const wrong=[]
  for(const [project,stage] of [[item.project_id,item.project_stage_id],[item.project_id,otherStage],[otherProject,item.project_stage_id]]) {
    await db.query("insert into project_phase_checklists(project_id,project_stage_id) values($1,$2) on conflict do nothing",[project,stage])
    const activity=(await db.query(`insert into project_phase_checklist_items(project_id,project_stage_id,code,title,sort_order)
      values($1,$2,'scope_regression','Scope regression',999) returning *`,[project,stage])).rows[0]
    wrong.push(await evidence(activity))
  }
  for(const column of ["withdrawn_evidence_id","correction_evidence_id"]) {
    await db.query(`update project_rework_activities set ${column}=$2 where request_id=$1`,[request,correct])
    for(const id of wrong)await assert.rejects(
      db.query(`update project_rework_activities set ${column}=$2 where request_id=$1`,[request,id]),
      error=>error.code==="23503")
    await db.query(`update project_rework_activities set ${column}=null where request_id=$1`,[request])
  }
  // Simulate a table installed by the older recovery migration.
  await db.exec(`alter table project_rework_activities drop constraint verified_withdrawn_evidence_scope;
    alter table project_rework_activities drop constraint verified_correction_evidence_scope;`)
  await db.query("update project_rework_activities set correction_evidence_id=$2 where request_id=$1",[request,wrong[0]])
  await assert.rejects(migrateActivityProgress(api,{apply:true}),error=>error.code==="23503")
  assert.equal((await db.query("select correction_evidence_id from project_rework_activities where request_id=$1",[request])).rows[0].correction_evidence_id,wrong[0])
  await db.query("update project_rework_activities set correction_evidence_id=$2 where request_id=$1",[request,correct])
  await migrateActivityProgress(api,{apply:true})
  await migrateActivityProgress(api,{apply:true})
  for(const column of ["withdrawn_evidence_id","correction_evidence_id"])await assert.rejects(
    db.query(`update project_rework_activities set ${column}=$2 where request_id=$1`,[request,wrong[0]]),
    error=>error.code==="23503")
})

test("migration coverage: PostgreSQL prepares backend static SQL against base + recovery + monthly-report migration",{timeout:60000},async t=>{
  const db=await database(t)
  await migrateActivityProgress(client(db),{apply:true})
  await db.exec(read("Thesis-Backend/migrations/008-monthly-report-history.sql"))
  await db.exec(read("Thesis-Backend/migrations/009-engineer-license-workflow.sql"))
  await db.exec(read("Thesis-Backend/migrations/010-photo-release.sql"))
  await db.exec(read("Thesis-Backend/migrations/010-id-numbers.sql"))
  await db.exec(read("Thesis-Backend/migrations/011-manpower-submissions.sql"))
  const directory=fileURLToPath(new URL("Thesis-Backend/src/",root))
  let count=0;const failures=[]
  for(const file of files(directory)) {
    for(const query of queries(fs.readFileSync(file,"utf8"),file)) {
      try {await db.exec(`PREPARE coverage_${count++} AS ${query.sql}`)}
      catch(error){failures.push(`${path.relative(directory,file)}:${query.line}: ${error.code}: ${error.message}`)}
    }
  }
  console.log(`Schema contract: prepared ${count} static backend SQL statements.`)
  assert.deepEqual(failures,[],"A backend query requires an unmigrated or invalid database object")
  assert.ok(count>100)
  await assert.rejects(db.exec("PREPARE missing_column AS SELECT future_unmigrated_value FROM project_phase_checklist_items"),error=>error.code==="42703")
  await assert.rejects(db.exec("PREPARE missing_table AS SELECT * FROM future_unmigrated_table"),error=>error.code==="42P01")
})

test("recovery preserves existing integer values, workflow mappings and table policies",{timeout:60000},async t=>{
  const db=await database(t)
  await db.exec(`alter table phase_checklist_templates add column weight integer not null default 10;
    alter table project_phase_checklist_items add column weight integer not null default 10;
    update project_phase_checklist_items set weight=25 where id=(select min(id) from project_phase_checklist_items);
    create table project_type_stages(project_type_id smallint references project_types(id),project_stage_id smallint references project_stages(id),sort_order smallint,
      primary key(project_type_id,project_stage_id),unique(project_type_id,sort_order));
    insert into project_type_stages select t.id,s.id,s.sort_order from project_types t cross join project_stages s;
    alter table project_type_stages enable row level security;
    create policy existing_lookup on project_type_stages for select to authenticated using(true);
    grant select on project_type_stages to authenticated;`)
  const before=(await db.query("select * from project_type_stages order by project_type_id,sort_order")).rows
  await migrateActivityProgress(client(db),{apply:true})
  assert.deepEqual((await db.query("select * from project_type_stages order by project_type_id,sort_order")).rows,before)
  assert.equal((await db.query("select count(*)::int as n from project_phase_checklist_items where weight=25")).rows[0].n,1)
  assert.equal((await db.query("select has_table_privilege('authenticated','project_type_stages','SELECT') as allowed")).rows[0].allowed,true)
  assert.deepEqual((await db.query("select policyname from pg_policies where tablename='project_type_stages'")).rows,[{policyname:"existing_lookup"}])
})

test("an older floating-point weight installation stops without conversion or partial DDL",{timeout:60000},async t=>{
  const db=await database(t)
  await db.exec(read("Thesis-Backend/migrations/004-verified-activity-values.sql"))
  const before=await preserved(db)
  await assert.rejects(migrateActivityProgress(client(db),{apply:true}),/expected integer/)
  assert.deepEqual(await preserved(db),before)
  assert.equal((await db.query("select to_regclass('project_rework_activities') as object")).rows[0].object,null)
})

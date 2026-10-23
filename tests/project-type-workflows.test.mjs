import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { PROJECT_PHASE_DEFINITIONS } from "../src/model.ts";
const read=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8");
test("type workflows migrate seeded projects without losing assignments, evidence or files",async t=>{
 const db=new PGlite({extensions:{citext}});t.after(()=>db.close());
 await db.exec("create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;");
 await db.exec(read("../supabase/migrations/20261017000002_thesis_backend_schema.sql").replace(/^create extension if not exists pgcrypto.*$/m,""));
 await db.exec(read("../Thesis-Backend/migrations/003-react-integration.sql"));
 await db.exec(read("../supabase/seed/scaled-test-data.sql"));
 const snapshots=async()=>({
  teams:(await db.query("select id,spm_user_id,status from project_phase_team where spm_user_id is not null order by id")).rows,
  evidence:(await db.query("select id,checklist_item_id,file_id,status from project_phase_evidence order by id")).rows,
  files:(await db.query("select id,md5(content) as bytes from project_phase_files order by id")).rows,
  projects:(await db.query("select id,lifecycle_status,current_pct from projects order by id")).rows,
  docs:(await db.query("select id,file_ref,status from project_documents order by id")).rows,
 });
 const before=await snapshots();
 const migration=read("../Thesis-Backend/migrations/004-project-type-workflows.sql");
 await db.exec(migration);
 assert.deepEqual(await snapshots(),before);
 for(const [type,definitions] of Object.entries(PROJECT_PHASE_DEFINITIONS)){
  const {rows}=await db.query("select s.code from project_type_stages w join project_types t on t.id=w.project_type_id join project_stages s on s.id=w.project_stage_id where t.code=$1 order by w.sort_order",[type]);
  assert.deepEqual(rows.map(r=>r.code),definitions.map(p=>p.name));
 }
 const mismatches=await db.query(`select p.id from projects p join project_types pt on pt.id=p.project_type_id
 where lifecycle_status<>'draft' and (select count(*) from project_phase_team where project_id=p.id)<>
 (select count(*) from project_type_stages where project_type_id=p.project_type_id)`);
 assert.equal(mismatches.rows.length,0);
 assert.ok((await db.query("select count(*)::int as n from project_phase_team where spm_user_id is null and status='pending'")).rows[0].n>0);
 const mixed=await db.query(`select s.code from projects p join project_types t on t.id=p.project_type_id
 join project_stages s on s.id=p.current_stage_id where t.code='Mixed-Use'`);
 assert.ok(mixed.rows.every(r=>PROJECT_PHASE_DEFINITIONS["Mixed-Use"].some(p=>p.name===r.code)));
 const teamsBefore=(await db.query("select count(*)::int as n from project_phase_team")).rows[0].n;
 await db.exec(migration);
 assert.deepEqual(await snapshots(),before);
 assert.equal((await db.query("select count(*)::int as n from project_phase_team")).rows[0].n,teamsBefore);
});

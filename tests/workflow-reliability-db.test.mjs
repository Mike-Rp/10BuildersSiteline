import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {citext} from '@electric-sql/pglite/contrib/citext'
import {credentialEligible} from '../Thesis-Backend/src/domain/engineer-credentials.js'
import {assertEligibleManager} from '../Thesis-Backend/src/common/utilities/license-eligibility.utility.js'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const migration=read('Thesis-Backend/migrations/027-workflow-reliability.sql')
test('reliability migration preserves original records, canonical eligibility, reverification, RLS and rollback',{timeout:60000},async t=>{
 const pg=new PGlite({extensions:{citext}});t.after(()=>pg.close())
 const db={query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}}}
 await pg.exec('create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;')
 await pg.exec(read('supabase/migrations/20261017000002_thesis_backend_schema.sql').replace(/^create extension if not exists pgcrypto.*$/m,''))
 for(const f of ['001-phase-checklists.sql','002-phase-update-confirmation.sql','003-react-integration.sql','004-verified-activity-progress.sql','009-engineer-license-workflow.sql','015-engineer-credentials.sql','019-engineer-phase-commitments.sql','020-engineer-phase-responsibilities.sql'])await pg.exec(read('Thesis-Backend/migrations/'+f))
 await pg.exec(read('supabase/seed/dummy-data.sql'))
 await assert.rejects(pg.exec(migration),/Apply migrations 025 and 026/);await pg.exec('rollback')
 assert.equal((await pg.query("select exists(select 1 from information_schema.columns where table_name='project_phase_evidence' and column_name='responsibility_id') as ready")).rows[0].ready,false)
 // Simulate an old damaged deployment that lost its pending-report index.
 // Migration 025 must stop atomically, rather than discard conflicting reports.
 const source=(await pg.query('select * from projects limit 1')).rows[0],duplicateProject=randomUUID()
 const submitter=(await pg.query("select u.id from users u join roles r on r.id=u.role_id where r.code='spm' limit 1")).rows[0].id
 await pg.query("insert into projects select(jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Migration duplicate preflight'))).* from projects p where id=$1",[source.id,duplicateProject])
 await pg.exec('drop index if exists one_pending_phase_update')
 const duplicates=[]
 for(let i=0;i<2;i++)duplicates.push((await pg.query("insert into project_phase_updates(project_id,selected_stage_id,prior_stage_id,prior_pct,note,submitted_by) values($1,$2,$2,0,'Retained conflicting report',$3) returning id",[duplicateProject,source.current_stage_id,submitter])).rows[0].id)
 await assert.rejects(pg.exec(read('Thesis-Backend/migrations/025-independent-spm-workspaces.sql')),e=>e.code==='23505');await pg.exec('rollback')
 assert.equal((await pg.query("select to_regclass('public.project_phase_evidence_files') as relation")).rows[0].relation,null)
 assert.equal((await pg.query('select count(*)::int as n from project_phase_updates where project_id=$1',[duplicateProject])).rows[0].n,2)
 const reviewer=(await pg.query("select u.id from users u join roles r on r.id=u.role_id where r.code='admin' limit 1")).rows[0].id
 await pg.query("update project_phase_updates set status='rejected',resolved_by=$2,resolved_at=now(),resolution_note='Explicit disposable fixture reconciliation; original report retained.' where id=$1",[duplicates[1],reviewer])
 for(const f of ['025-independent-spm-workspaces.sql','026-credential-specializations.sql'])await pg.exec(read('Thesis-Backend/migrations/'+f))
 const tables=['projects','project_phase_team','project_phase_responsibilities','project_phase_evidence','project_phase_files','project_progress_history','user_licenses','license_renewal_requests','engineer_specializations']
 async function snapshot(){const result={};for(const table of tables)result[table]=(await pg.query(`select to_jsonb(t)-'responsibility_id'-'revoked_at'-'revoked_by'-'revocation_note'-'correction_required' as row from ${table} t order by id` .replace('engineer_specializations t order by id','engineer_specializations t order by user_id,specialization'))).rows;return result}
 const before=await snapshot()
 await pg.exec(migration.replace(/^BEGIN;/m,'BEGIN;').replace(/COMMIT;\s*$/,'ROLLBACK;'))
 assert.deepEqual(await snapshot(),before)
 await pg.exec(migration);await pg.exec(migration)
 assert.deepEqual(await snapshot(),before)
 const invalid=(await pg.query("select count(*)::int as n from user_licenses where (license_number is null or license_number !~ '^[0-9]{7}$') and not correction_required")).rows[0].n
 assert.equal(invalid,0)
 for(const role of ['anon','authenticated']){
  await pg.exec('set role '+role)
  for(const table of ['project_request_receipts','project_phase_evidence_files'])await assert.rejects(pg.query('select * from '+table),e=>e.code==='42501')
  await pg.exec('reset role')
 }
 const admin=(await pg.query("select u.id from users u join roles r on r.id=u.role_id where r.code='admin' limit 1")).rows[0].id
 const user=(await pg.query("select u.id from users u join roles r on r.id=u.role_id where r.code='spm' and u.status='active' limit 1")).rows[0].id
 await pg.query('update user_licenses set superseded_at=now() where user_id=$1',[user])
 const today=(await pg.query("select (current_timestamp at time zone 'Asia/Manila')::date::text as d")).rows[0].d
 let valid
 for(const number of ['0000123','1234567','123456','12345678','ABCDEF1','PRC-123',null,'',' 1234567','1234567 ','1234567\n']){
  const c=(await pg.query(`insert into user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,profession,verification_status,verified_by,verified_at,specializations)
   values($1,$2,current_date+400,'uploaded','retained-proof','Civil Engineer','verified',$3,now(),array['Civil']) returning *,license_expiry::text as license_expiry`,[user,number,admin])).rows[0]
  const expected=['0000123','1234567'].includes(number)
  assert.equal(credentialEligible(c,today),expected,JSON.stringify(number))
  if(expected)await assertEligibleManager(db,user,'spm');else await assert.rejects(assertEligibleManager(db,user,'spm'),{status:422})
  assert.equal((await pg.query('select exists(select 1 from engineer_qualified_scopes where user_id=$1) as eligible',[user])).rows[0].eligible,expected)
  if(expected)valid=c
  await pg.query('update user_licenses set superseded_at=now() where id=$1',[c.id])
 }
 await pg.query('update user_licenses set superseded_at=null where id=$1',[valid.id])
 await pg.query("select set_config('app.current_user_id',$1,false)",[admin])
 await pg.query("update user_licenses set license_number='0000009' where id=$1",[valid.id])
 const changed=(await pg.query('select * from user_licenses where id=$1',[valid.id])).rows[0]
 assert.equal(changed.verification_status,'needs_review');assert.equal(changed.correction_required,true)
 assert.equal(changed.verified_by,valid.verified_by);assert.deepEqual(changed.verified_at,valid.verified_at)
 assert.ok((await pg.query("select 1 from audit_log where table_name='user_licenses' and record_id=$1 and old_values->>'license_number'=$2",[valid.id,valid.license_number])).rows.length)
 await assert.rejects(assertEligibleManager(db,user,'spm'),{status:422})
 const project=(await pg.query('select id from projects limit 1')).rows[0].id,key=randomUUID()
 await pg.exec('begin')
 await pg.query("insert into project_request_receipts values($1,$2,$3,'test','hash','{}',now())",[project,user,key])
 await pg.exec('rollback')
 assert.equal((await pg.query('select count(*)::int as n from project_request_receipts')).rows[0].n,0)
 await assert.rejects(pg.query("insert into project_request_receipts values($1,$2,$3,'test','hash','{}',now())",[randomUUID(),user,key]),e=>e.code==='23503')
 await pg.exec(read('Thesis-Backend/scripts/preflight-workflow-reliability.sql'))
})

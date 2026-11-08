import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {PGlite} from '@electric-sql/pglite'
import {citext} from '@electric-sql/pglite/contrib/citext'
import {PGLiteSocketServer} from '@electric-sql/pglite-socket'
import {installCredentialFixture} from './helpers/credential-fixture.mjs'
import {readChecklist} from '../Thesis-Backend/src/services/progress/phase.utility.js'
import {readVerifiedProgress} from '../Thesis-Backend/src/services/progress/verified.utility.js'
import {canWorkPhase} from '../src/workflows.ts'
import {mapProject} from '../src/api/adapter.ts'

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
const freePort=()=>new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})})

test('independent SPM workspaces through the real API and Supabase PostgreSQL schema',{timeout:120000},async t=>{
 const pg=new PGlite({extensions:{citext}})
 const db={exec:sql=>pg.exec(sql),query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}}}
 let server,socket
 t.after(async()=>{
  if(server){server.kill();await new Promise(resolve=>server.once('exit',resolve))}
  if(socket)await socket.stop()
  await pg.close()
 })
 await pg.exec('create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;')
 await pg.exec(read('../supabase/migrations/20261017000002_thesis_backend_schema.sql').replace(/^create extension if not exists pgcrypto.*$/m,''))
 for(const f of ['001-phase-checklists.sql','002-phase-update-confirmation.sql','003-react-integration.sql','004-verified-activity-progress.sql','009-engineer-license-workflow.sql','010-photo-release.sql','017-project-photo-review.sql','019-engineer-phase-commitments.sql','020-engineer-phase-responsibilities.sql','023-engineer-reassignment-offers.sql']) {
  if(f==='019-engineer-phase-commitments.sql') {
   await pg.exec(read('../supabase/seed/dummy-data.sql'))
   await installCredentialFixture(db)
  }
  await pg.exec(read('../Thesis-Backend/migrations/'+f))
 }
 const migration=read('../Thesis-Backend/migrations/025-independent-spm-workspaces.sql')
 const before=(await pg.query('select count(*)::int as n from project_phase_evidence')).rows[0].n
 await pg.exec(migration);await pg.exec(migration)
 assert.equal((await pg.query('select count(*)::int as n from project_phase_evidence')).rows[0].n,before)
 await pg.exec('update user_licenses set license_expiry=current_date+400 where superseded_at is null')
 const users=(await pg.query("select u.id,u.email,r.code as role from users u join roles r on r.id=u.role_id where u.status='active' order by u.id")).rows
 const [a,b,c]=users.filter(u=>u.role==='spm'), admin=users.find(u=>u.role==='admin')
 const source=(await pg.query("select * from projects where lifecycle_status='active' limit 1")).rows[0]
 const opm=users.find(u=>u.id===source.suggested_opm_id)
 assert.ok(a&&b&&opm)
 const projectId=randomUUID()
 await db.query(`insert into projects select(jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Concurrent workspace QA','lifecycle_status','active','current_pct',0))).* from projects p where id=$1`,[source.id,projectId])
 const stages=(await pg.query('select s.id,s.code from project_type_stages w join project_stages s on s.id=w.project_stage_id where w.project_type_id=$1 order by w.sort_order',[source.project_type_id])).rows
 assert.ok(stages.length>1)
 await db.query('update projects set current_stage_id=$2 where id=$1',[projectId,stages[0].id])
 for(const [index,stage] of stages.entries()) {
  await db.query("insert into project_phase_team(project_id,project_stage_id,spm_user_id,status,is_lead) values($1,$2,$3,'confirmed',$4)",[projectId,stage.id,a.id,index===0])
  await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) values($1,$2,$3,array['Civil'],'confirmed')",[projectId,stage.id,a.id])
 }
 await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) values($1,$2,$3,array['Structural'],'confirmed')",[projectId,stages[0].id,b.id])
 await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) values($1,$2,$3,array['Structural'],'confirmed')",[projectId,stages[1].id,c.id])
 await db.query("insert into project_engineers(project_id,user_id,project_role_label) values($1,$2,'Site PM'),($1,$3,'Site PM')",[projectId,a.id,b.id])
 await db.query("insert into project_engineers(project_id,user_id,project_role_label) values($1,$2,'Site PM')",[projectId,c.id])
 const checklist=await readChecklist(db,projectId,stages[0].id)
 const itemIds=[...new Set(checklist.items.map(i=>String(i.id)))]
 assert.equal(checklist.required_count,itemIds.length*2)
 const port=await freePort(),dbPort=await freePort()
 socket=new PGLiteSocketServer({db:pg,port:dbPort,host:'127.0.0.1'});await socket.start()
 let logs=''
 server=spawn(process.execPath,['src/index.js'],{cwd:fileURLToPath(new URL('../Thesis-Backend/',import.meta.url)),env:{...process.env,NODE_ENV:'development',DB_SERVER:'127.0.0.1',DB_PORT:String(dbPort),DB_NAME:'postgres',DB_USER:'postgres',DB_PASSWORD:'x',DB_POOL_MAX:'1',PGSSLMODE:'disable',JWT_SECRET:'test-multi-spm-workspaces-secret-0123456789',PORT:String(port),HOST:'127.0.0.1',ARCHIVE_MAINTENANCE_ENABLED:'false'},stdio:['ignore','pipe','pipe']})
 server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d)
 const base=`http://127.0.0.1:${port}/api/v1`
 let ready=false
 for(let i=0;i<100;i++){try{ready=(await fetch(base+'/health')).ok}catch{}if(ready)break;await new Promise(r=>setTimeout(r,150))}
 assert.ok(ready,logs)
 async function call(user,path,{method='GET',json,body,status=200}={}) {
  const response=await fetch(base+path,{method,headers:{...(user?.token?{Authorization:'Bearer '+user.token}:{}),...(json?{'Content-Type':'application/json'}:{})},body:body|| (json?JSON.stringify(json):undefined)})
  const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result.data
 }
 for(const user of [a,b,c,opm,admin]) {
  const result=await call(null,user.role==='admin'?'/auth/admin/login':'/auth/staff/login',{method:'POST',json:{email:user.email,password:'Password@123'}})
  user.token=result.token
  assert.ok(user.token)
 }
 const root='/projects/'+projectId
 const aPhotoId=randomUUID()
 async function upload(user,stage=stages[0]){const form=new FormData();form.set('file',new Blob(['%PDF-test'],{type:'application/pdf'}),'evidence.pdf');form.set('stage_id',stage.id);return call(user,root+'/phase-files',{method:'POST',body:form,status:201})}
 const [a1,a2,b1]=await Promise.all([upload(a),upload(a),upload(b)])
 await t.test('upcoming phases are locked and another SPM cannot attach owned files',async()=>{
  const form=new FormData();form.set('file',new Blob(['%PDF-test']),'future.pdf');form.set('stage_id',stages[1].id)
  await call(a,root+'/phase-files',{method:'POST',body:form,status:422})
  await call(b,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[a1.id]},status:400})
  await call(c,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{submission_note:'Future assignment'},status:403})
  await call(c,root+'/notes',{method:'POST',json:{note_text:'Future assignment'},status:403})
  const photo=new FormData();photo.set('id',aPhotoId);photo.set('file',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'}),'first-phase.png')
  await call(a,'/files',{method:'POST',body:photo})
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'add_photo',doc:{id:aPhotoId}}})
 })
 let ae,be
 await t.test('two SPMs submit the same shared requirement independently with multiple attachments',async()=>{
  [ae,be]=await Promise.all([
   call(a,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[a1.id,a2.id]},status:201}),
   call(b,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[b1.id]},status:201})
  ])
  assert.notEqual(ae.id,be.id)
  const own=await call(a,root+'/phase-overview')
  assert.equal(own.checklist.items[0].files.length,2)
  assert.ok(own.checklist.items.every(i=>i.workspace_user_id===a.id))
  assert.equal((await call(opm,root+'/phase-overview')).checklist.items.length,itemIds.length*2)
  await call(a,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[a2.id]},status:409})
 })
 const reports=[]
 await t.test('concurrent reports do not block the other workspace',async()=>{
  reports.push(...await Promise.all([a,b].map(user=>call(user,root+'/phase-updates',{method:'POST',json:{note:'Independent field report'},status:201}))))
  assert.equal(reports.length,2)
  const parts=(await call(opm,'/workspace/project-data')).find(p=>p.list.id===projectId)
  assert.equal(mapProject({...parts,clientId:'',register:()=>{}}).workflow.pendingUpdates.length,2)
  await call(a,root+'/phase-updates',{method:'POST',json:{note:'Duplicate'},status:409})
  for(const report of reports) await call(opm,root+'/phase-updates/'+report.id+'/approve',{method:'POST',json:{}})
 })
 async function approve(evidence){const preview=await call(opm,root+'/evidence/'+evidence.id+'/review-preview');return call(opm,root+'/evidence/'+evidence.id+'/approve',{method:'POST',json:{expected_review_token:preview.review_token}})}
 await t.test('individual approvals do not affect another SPM and cannot be repeated',async()=>{
  await approve(ae)
  assert.equal((await call(b,root+'/phase-overview')).checklist.items[0].status,'pending')
  assert.equal((await call(a,root+'/phase-overview')).checklist.items[0].status,'approved')
  await call(opm,root+'/evidence/'+ae.id+'/review-preview',{status:409})
  await call(a,root+'/evidence/'+be.id+'/approve',{method:'POST',json:{},status:403})
 })
 await t.test('returning one submission preserves the other approval and all historical files',async()=>{
  const preview=await call(opm,root+'/evidence/'+be.id+'/review-preview')
  await call(opm,root+'/evidence/'+be.id+'/reject',{method:'POST',json:{expected_review_token:preview.review_token,review_note:'Add a corrected inspection'}})
  const oldId=be.id
  be=await call(b,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[b1.id]},status:201})
  assert.notEqual(be.id,oldId)
  assert.equal((await call(a,root+'/phase-overview')).checklist.items[0].status,'approved')
  assert.equal((await pg.query('select status from project_phase_evidence where id=$1',[oldId])).rows[0].status,'rejected')
  assert.equal((await pg.query('select count(*)::int as n from project_phase_evidence_files where evidence_id=$1',[oldId])).rows[0].n,1)
 })
 const responsibilities=(await pg.query('select * from project_phase_responsibilities where project_id=$1 and project_stage_id=$2',[projectId,stages[0].id])).rows
 const ar=responsibilities.find(r=>r.user_id===a.id),br=responsibilities.find(r=>r.user_id===b.id)
 const complete=(user,row,action,fileId)=>call(user,root+'/engineer-responsibilities/'+row.id,{method:'POST',json:{action,note:'Completed independently',fileId}})
 await t.test('completion requires the SPM checklist and preserves project Lead SPM',async()=>{
  await call(b,root+'/engineer-responsibilities/'+ar.id,{method:'POST',json:{action:'submit_completion',note:'Not mine',fileId:b1.id},status:403})
  await call(a,root+'/engineer-responsibilities/'+ar.id,{method:'POST',json:{action:'submit_completion',note:'Too early',fileId:a1.id},status:409})
  for(const id of itemIds.slice(1)) {const ev=await call(a,root+'/checklist-items/'+id+'/submit',{method:'POST',json:{file_ids:[a1.id,a2.id]},status:201});await approve(ev)}
  await complete(a,ar,'submit_completion',a1.id)
  await complete(opm,ar,'approve_completion')
  assert.equal((await call(a,root+'/phase-overview')).can_submit,false)
  assert.equal((await call(b,root+'/phase-overview')).can_submit,true)
  const p=(await pg.query('select current_stage_id from projects where id=$1',[projectId])).rows[0]
  assert.equal(p.current_stage_id,stages[0].id)
  assert.equal((await pg.query('select spm_user_id from project_phase_team where project_id=$1 and is_lead',[projectId])).rows[0].spm_user_id,a.id)
 })
 await t.test('approved assignment rejects uploads, reports, notes and gallery changes but keeps evidence readable',async()=>{
  const form=new FormData();form.set('file',new Blob(['%PDF-test']),'locked.pdf')
  await call(a,root+'/phase-files',{method:'POST',body:form,status:409})
  await call(a,root+'/phase-updates',{method:'POST',json:{note:'Locked'},status:409})
  await call(a,root+'/notes',{method:'POST',json:{note_text:'Locked'},status:409})
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'add_photo',doc:{id:a1.id}},status:409})
  const downloaded=await fetch(base+root+'/phase-files/'+a2.id,{headers:{Authorization:'Bearer '+a.token}});assert.equal(downloaded.status,200)
  await call(b,root+'/notes',{method:'POST',json:{note_text:'Still working'},status:201})
  assert.equal((await pg.query('select project_stage_id from project_notes where project_id=$1',[projectId])).rows[0].project_stage_id,stages[0].id)
  const photoId=randomUUID()
  const photo=new FormData();photo.set('id',photoId);photo.set('file',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'}),'site.png')
  await call(b,'/files',{method:'POST',body:photo})
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'add_photo',doc:{id:photoId}},status:409})
  await call(b,root+'/workspace-command',{method:'POST',json:{type:'add_photo',doc:{id:photoId}}})
  assert.deepEqual((await pg.query('select uploaded_by,project_stage_id from project_photos where project_id=$1 and uploaded_by=$2',[projectId,b.id])).rows,[{uploaded_by:b.id,project_stage_id:stages[0].id}])
 })
 await t.test('all SPM approvals unlock exactly the next phase and trusted totals agree',async()=>{
  await approve(be)
  const issue=await call(b,root+'/issues',{method:'POST',json:{reason:'Correct my inspection',affected_activity_ids:[itemIds[0]]},status:201})
  const impact=await call(opm,'/rework-requests/'+issue.id+'/preview',{method:'POST',json:{}})
  assert.equal(impact.before.phase.total,itemIds.length*20)
  assert.equal(impact.before.phase.earned-impact.after.phase.earned,10)
  await call(opm,'/rework-requests/'+issue.id+'/approve',{method:'POST',json:{resolution_note:'Correct this SPM inspection only',expected_review_token:impact.review_token,selected_activity_ids:[itemIds[0]]}})
  assert.equal((await call(a,root+'/phase-overview')).checklist.items[0].status,'approved')
  const corrected=await upload(b)
  const correction=await call(b,root+'/checklist-items/'+itemIds[0]+'/submit',{method:'POST',json:{file_ids:[corrected.id]},status:201})
  await approve(correction)
  for(const id of itemIds.slice(1)){const ev=await call(b,root+'/checklist-items/'+id+'/submit',{method:'POST',json:{file_ids:[b1.id]},status:201});await approve(ev)}
  await complete(b,br,'submit_completion',b1.id);await complete(opm,br,'approve_completion')
  assert.equal((await pg.query('select current_stage_id from projects where id=$1',[projectId])).rows[0].current_stage_id,stages[1].id)
  const totals=(await readVerifiedProgress(db,[projectId])).get(projectId)
  assert.equal(totals.phases.find(p=>p.id===String(stages[0].id)).percentage,100)
  assert.equal(totals.construction[0].complete,true)
  assert.equal((await call(a,root+'/phase-overview',{ })).can_submit,true)
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'add_photo',doc:{id:aPhotoId}}})
  assert.deepEqual((await pg.query('select project_stage_id from project_photos where project_id=$1 and file_ref=$2 order by created_at,id',[projectId,'db://'+aPhotoId])).rows.map(p=>p.project_stage_id),[stages[0].id,stages[1].id],'reusing a photograph never rewrites its original phase record')
  const history=await call(b,root+'/phase-overview?stage_id='+stages[0].id)
  assert.equal(history.can_submit,false);assert.ok(history.checklist.items.every(i=>i.status==='approved'))
 })
 await t.test('frontend mapping retains each SPM and every attachment with distinct review identities',async()=>{
  const parts=(await call(opm,'/workspace/project-data')).find(p=>p.list.id===projectId)
  assert.ok(parts)
  const project=mapProject({...parts,clientId:'',register:()=>{}})
  assert.equal(project.phase,stages[1].code)
  assert.equal(canWorkPhase({...project,phase:stages[0].code,team:[{phase:stages[0].code,accountId:a.id,status:'confirmed',engineers:[{accountId:a.id,status:'confirmed',completionStatus:'approved'},{accountId:b.id,status:'confirmed',completionStatus:'unfinished'}]}]},b.id),true)
 })
 await t.test('a peer SPM retains archived workspace and file access after the project releases engineers',async()=>{
  await db.query("update projects set lifecycle_status='archived',archived_at=now() where id=$1",[projectId])
  await db.query('update project_engineers set unassigned_at=now() where project_id=$1',[projectId])
  assert.equal((await pg.query('select count(*)::int as n from project_phase_team where project_id=$1 and spm_user_id=$2',[projectId,b.id])).rows[0].n,0)
  const parts=(await call(b,'/workspace/project-data')).find(p=>p.list.id===projectId)
  assert.ok(parts,'peer history remains in the workspace loader')
  assert.ok((await call(b,'/projects')).some(p=>p.id===projectId))
  const historical=await call(b,root+'/phase-overview?stage_id='+stages[0].id)
  assert.equal(historical.can_submit,false)
  const file=await fetch(base+root+'/phase-files/'+b1.id,{headers:{Authorization:'Bearer '+b.token}})
  assert.equal(file.status,200)
  await call(b,root+'/notes',{method:'POST',json:{note_text:'Archived'},status:422})
 })
})

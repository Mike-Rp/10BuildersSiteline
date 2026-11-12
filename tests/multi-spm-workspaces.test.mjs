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
import {pendingChecklistFor,canWorkPhase} from '../src/workflows.ts'
import {mapProject, peopleFromProjects, stubAccount} from '../src/api/adapter.ts'

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
const freePort=()=>new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})})

test('independent SPM workspaces through the real API and Supabase PostgreSQL schema',{timeout:120000},async t=>{
 const pg=new PGlite({extensions:{citext}})
 const db={exec:sql=>pg.exec(sql),query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}}}
 let server,socket
 t.after(async()=>{
  if(server&&server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited}
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
 await pg.exec(read('../Thesis-Backend/migrations/026-credential-specializations.sql'))
 const preserved=(await pg.query('select id,project_id,project_stage_id,checklist_item_id,submitted_by,file_id,status,reviewed_by,reviewed_at from project_phase_evidence order by id')).rows
 await pg.exec(read('../Thesis-Backend/migrations/027-workflow-reliability.sql'));await pg.exec(read('../Thesis-Backend/migrations/027-workflow-reliability.sql'))
 assert.deepEqual((await pg.query('select id,project_id,project_stage_id,checklist_item_id,submitted_by,file_id,status,reviewed_by,reviewed_at from project_phase_evidence order by id')).rows,preserved)
 const users=(await pg.query("select u.id,u.full_name,u.email,u.phone,r.code as role from users u join roles r on r.id=u.role_id where u.status='active' order by u.id")).rows
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
 // An active project has its six registered documents; replacement engineers cannot accept without them (SPM-DASH-004).
 await db.query("insert into project_documents(project_id,document_type_id,status) select $1,id,'uploaded' from document_types where code=any($2::text[])",[projectId,['notice_to_proceed','building_permit','owner_contract','registered_plans','environmental_certificate','budget_boq']])
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
 await t.test('the assigned Office PM receives work contacts for each phase engineer',async()=>{
  const part=(await call(opm,'/workspace/project-data')).find(project=>project.list.id===projectId)
  assert.ok(part.detail.phase_team.every(row=>row.spm_user_id===a.id))
  const expected=[a,b,c].map(({id,full_name,email,phone})=>({id,full_name,email,phone}))
  assert.deepEqual(new Map(part.detail.site_pm_contacts.map(contact=>[contact.id,contact])),new Map(expected.map(contact=>[contact.id,contact])))
  const {accounts}=peopleFromProjects(stubAccount(opm.id,opm.full_name,'opm'),[part.list],new Map([[part.list.id,part.detail]]))
  for(const person of expected) {
   const contact=accounts.find(account=>account.id===person.id)
   assert.equal(contact.name,person.full_name)
   assert.equal(contact.email,person.email)
   assert.equal(contact.phone,person.phone??'')
  }
  const spmPart=(await call(b,'/workspace/project-data')).find(project=>project.list.id===projectId)
  assert.ok(spmPart)
  assert.ok(!Object.hasOwn(spmPart.detail,'site_pm_contacts'))
 })
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
 const reports=[],reportRequestId=randomUUID()
 await t.test('concurrent reports do not block the other workspace',async()=>{
  reports.push(...await Promise.all([a,b].map(user=>call(user,root+'/phase-updates',{method:'POST',json:{request_id:reportRequestId,note:'Independent field report'},status:201}))))
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
  // Approval of the last item completes this engineer's workspace automatically.
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
 await t.test('replacement preserves approved and pending versions, original attachments, independent review queue and phase gates',async()=>{
  await db.query("update projects set lifecycle_status='active',archived_at=null where id=$1",[projectId])
  await db.query('update project_engineers set unassigned_at=null where project_id=$1',[projectId])
  await db.query("update project_phase_team set status='declined' where project_id<>$1 and spm_user_id in ($2,$3)",[projectId,b.id,c.id])
  await db.query("update project_phase_responsibilities set status='released' where project_id<>$1 and user_id in ($2,$3)",[projectId,b.id,c.id])
  const tag=(await db.query('select d.code from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id join project_stage_discipline_links l on l.discipline_id=d.id where q.user_id=$1 and l.project_type_id=$2 and l.project_stage_id=$3 limit 1',[b.id,source.project_type_id,stages[1].id])).rows[0].code
  const slot=(await db.query('update project_phase_responsibilities set assigned_disciplines=array[$3] where project_id=$1 and project_stage_id=$2 and user_id=$4 returning id',[projectId,stages[1].id,tag,c.id])).rows[0]
  const replace=async(from,to)=>{
   await call(admin,root+'/engineer-responsibilities/'+slot.id,{method:'POST',json:{action:'replace',newUserId:to.id,note:'Audited replacement test from '+from.id}})
   await call(to,root+'/engineer-responsibilities/'+slot.id,{method:'POST',json:{action:'accept'}})
  }
  await replace(c,b);await replace(b,c) // Empty workspace and repeated replacements.
  const files=[await upload(c,stages[1]),await upload(c,stages[1])]
  const items=[...new Set((await call(c,root+'/phase-overview')).checklist.items.map(i=>String(i.id)))]
  const evidence=[]
  for(const id of items)evidence.push(await call(c,root+'/checklist-items/'+id+'/submit',{method:'POST',json:{file_ids:files.map(f=>f.id)},status:201}))
  await approve(evidence[0])
  const pending=evidence[1]
  const stale=await call(opm,root+'/evidence/'+pending.id+'/review-preview')
  await replace(c,b)
  await db.query("update users set status='suspended' where id=$1",[c.id])
  const overview=await call(b,root+'/phase-overview')
  assert.equal(overview.checklist.items[0].status,'approved')
  assert.equal(overview.checklist.items[1].status,'pending')
  assert.equal(overview.checklist.items[1].submitted_by,c.id)
  assert.equal(overview.checklist.items[1].files.length,2)
  await call(b,root+'/checklist-items/'+items[0]+'/submit',{method:'POST',json:{file_ids:[]},status:409})
  await call(b,root+'/checklist-items/'+items[1]+'/submit',{method:'POST',json:{file_ids:[]},status:409})
  const managed=(await call(opm,'/workspace/project-data')).find(p=>p.list.id===projectId)
  const mapped=mapProject({...managed,clientId:'',register:()=>{}})
  assert.ok(pendingChecklistFor(mapped).some(i=>i.evidenceId===String(pending.id)&&i.submittedBy===c.id))
  await call(opm,root+'/advance-phase',{method:'POST',json:{},status:409})
  const preview=await call(opm,root+'/evidence/'+pending.id+'/review-preview')
  assert.ok(preview.after.phase.percentage<=100)
  // A stale token may remain valid when contribution is unchanged; either way the next review is explicit.
  assert.equal(preview.review_token,stale.review_token)
  const result=await Promise.all([0,1].map(()=>fetch(base+root+'/evidence/'+pending.id+'/approve',{method:'POST',headers:{Authorization:'Bearer '+opm.token,'Content-Type':'application/json'},body:JSON.stringify({expected_review_token:preview.review_token})})))
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409])
  const history=await call(opm,root+'/evidence-history')
  assert.ok(history.some(e=>String(e.evidence_id)===String(pending.id)&&e.submitted_by===c.id&&e.status==='approved'&&e.files.length===2))
  const download=await fetch(base+root+'/phase-files/'+files[0].id,{headers:{Authorization:'Bearer '+opm.token}});assert.equal(download.status,200)
  assert.equal((await db.query('select spm_user_id from project_phase_team where project_id=$1 and is_lead',[projectId])).rows[0].spm_user_id,a.id)
  await db.query("update users set status='active' where id=$1",[c.id])
 })
 await t.test('upload and report retry receipts replay one committed result and reject key reuse',async()=>{
  const key=randomUUID(),fileKey=randomUUID()
  const form=()=>{const f=new FormData();f.set('request_id',fileKey);f.set('file',new Blob(['%PDF-retry']),'retry.pdf');return f}
  const first=await call(a,root+'/phase-files',{method:'POST',body:form(),status:201})
  const again=await call(a,root+'/phase-files',{method:'POST',body:form(),status:201});assert.equal(first.id,again.id)
  const body={request_id:key,note:'Retry-safe field report',file_ids:[first.id]}
  const [one,two]=await Promise.all([0,1].map(()=>call(a,root+'/phase-updates',{method:'POST',json:body,status:201})))
  assert.equal(one.id,two.id)
  await call(opm,root+'/phase-updates/'+one.id+'/approve',{method:'POST',json:{}})
  assert.equal((await call(a,root+'/phase-updates',{method:'POST',json:body,status:201})).id,one.id)
  await call(a,root+'/phase-updates',{method:'POST',json:{...body,note:'Changed'},status:409})
  assert.equal((await db.query('select count(*)::int as n from project_phase_updates where id=$1',[one.id])).rows[0].n,1)
 })

 await t.test('transaction failures leave no report or retry receipt, and 100 percent never bypasses orphan review',async()=>{
  const failedKey=randomUUID()
  const count=async()=>(await db.query('select count(*)::int as n from project_phase_updates where project_id=$1',[projectId])).rows[0].n
  const before=await count()
  await call(a,root+'/phase-updates',{method:'POST',json:{request_id:failedKey,note:'Should roll back',checklist_submissions:[{item_id:itemIds[0]}]},status:404})
  assert.equal(await count(),before)
  assert.equal((await db.query('select count(*)::int as n from project_request_receipts where request_id=$1',[failedKey])).rows[0].n,0)
  const files={}
  for(const user of [a,b])files[user.id]=await upload(user,stages[1])
  const slots=(await db.query('select * from project_phase_responsibilities where project_id=$1 and project_stage_id=$2',[projectId,stages[1].id])).rows
  const items=(await db.query('select * from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 and required',[projectId,stages[1].id])).rows
  for(const slot of slots)for(const item of items)await db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,file_id,submitted_by,status,reviewed_by,reviewed_at,responsibility_id) values($1,$2,$3,$4,$5,'approved',$6,now(),$7)",[projectId,stages[1].id,item.id,files[slot.user_id].id,slot.user_id,opm.id,slot.id])
  await db.query("update project_phase_responsibilities set completion_status='approved',reviewed_by=$3,reviewed_at=now() where project_id=$1 and project_stage_id=$2",[projectId,stages[1].id,opm.id])
  const originalFile=(await db.query('select id from project_phase_files where project_id=$1 and project_stage_id=$2 and uploaded_by=$3 limit 1',[projectId,stages[1].id,c.id])).rows[0].id
  const orphan=(await db.query("insert into project_phase_evidence(project_id,project_stage_id,checklist_item_id,file_id,submitted_by) values($1,$2,$3,$4,$5) returning id",[projectId,stages[1].id,items[0].id,originalFile,c.id])).rows[0]
  assert.equal((await call(opm,root+'/phase-overview')).checklist.pct,100)
  await call(opm,root+'/advance-phase',{method:'POST',json:{},status:409})
  const preview=await call(opm,root+'/evidence/'+orphan.id+'/review-preview')
  assert.equal(preview.before.phase.percentage,100);assert.equal(preview.after.phase.percentage,100)
  assert.equal(preview.before.project.earned,preview.after.project.earned)
  await approve(orphan)
  const stable=(await db.query('select submitted_by,file_id from project_phase_evidence where id=$1',[orphan.id])).rows[0]
  assert.deepEqual(stable,{submitted_by:c.id,file_id:originalFile})
  await call(b,root+'/evidence-history',{status:403})
  await assert.rejects(db.query('update project_phase_evidence set submitted_by=$2 where id=$1',[orphan.id,b.id]),e=>e.code==='23514')
  await assert.rejects(db.query('insert into project_phase_evidence_files values($1,$2)',[orphan.id,files[a.id].id]),e=>e.code==='23514')
 })

 await t.test('legacy declined-assignment reassignment moves the same responsibility and preserves evidence provenance',async()=>{
  const stage=stages[2]
  const tag=(await db.query('select d.code from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id join project_stage_discipline_links l on l.discipline_id=d.id where q.user_id=$1 and l.project_type_id=$2 and l.project_stage_id=$3 limit 1',[c.id,source.project_type_id,stage.id])).rows[0].code
  const slot=(await db.query('update project_phase_responsibilities set assigned_disciplines=array[$4] where project_id=$1 and project_stage_id=$2 and user_id=$3 returning *',[projectId,stage.id,a.id,tag])).rows[0]
  const team=(await db.query("update project_phase_team set status='declined' where project_id=$1 and project_stage_id=$2 returning id",[projectId,stage.id])).rows[0]
  await call(admin,'/archive/phase-assignments/'+team.id+'/reassign',{method:'POST',json:{new_user_id:c.id,note:'Reviewed legacy reassignment with responsibility synchronization.'}})
  const changed=(await db.query('select * from project_phase_responsibilities where id=$1',[slot.id])).rows[0]
  assert.equal(changed.user_id,c.id);assert.equal(changed.status,'pending')
  assert.deepEqual(changed.assigned_disciplines,slot.assigned_disciplines)
  assert.equal((await db.query('select spm_user_id from project_phase_team where id=$1',[team.id])).rows[0].spm_user_id,c.id)
  assert.ok((await db.query("select 1 from audit_log where table_name='project_phase_responsibilities' and record_id=$1 and new_values->>'_archive_event'='replace' and new_values->'previous'->>'user_id'=$2",[String(slot.id),a.id])).rows.length)
 })

})

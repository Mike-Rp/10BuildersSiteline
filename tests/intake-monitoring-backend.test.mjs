import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {citext} from '@electric-sql/pglite/contrib/citext';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {installCredentialFixture} from './helpers/credential-fixture.mjs';
import {snapshotProjectChecklists,readVerifiedProgress} from '../Thesis-Backend/src/services/progress/verified.utility.js';
import {inquiryScopeConfiguration} from '../Thesis-Backend/src/services/projects/phase-engineer-scopes.utility.js';
import {COMPANY_TRADES} from '../Thesis-Backend/src/domain/company-trades.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const freePort=()=>new Promise(resolve=>{const server=net.createServer().listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});

test('intake monitoring v1 through the real API: company decisions, independent overlap, dependencies and explicit turnover',{timeout:180000},async t=>{
 const pg=new PGlite({extensions:{citext}}),db={exec:sql=>pg.exec(sql),query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};}};
 let child,socket,logs='';
 t.after(async()=>{if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}if(socket)await socket.stop();await pg.close();});
 await pg.exec('create role authenticated;create role anon;create role service_role;create schema extensions;create schema auth;create schema storage;');
 await pg.exec(read('supabase/migrations/20261017000002_thesis_backend_schema.sql').replace(/^create extension if not exists pgcrypto.*$/m,''));
 for(const name of ['001-phase-checklists','002-phase-update-confirmation','003-react-integration','004-verified-activity-progress','009-engineer-license-workflow'])await pg.exec(read('Thesis-Backend/migrations/'+name+'.sql'));
 await pg.exec(read('supabase/seed/dummy-data.sql'));await installCredentialFixture(db);
 for(const name of ['004-project-type-workflows','010-photo-release','011-independent-notifications','013-trade-subcontractor-allocation','014-mixed-use-project-scope','015-engineer-credentials','016-user-id-numbers','017-project-photo-review','018-phase-foreman-allocation','019-engineer-phase-commitments','020-engineer-phase-responsibilities','022-engineer-experience-months','023-engineer-reassignment-offers','024-chunked-file-uploads','025-independent-spm-workspaces','026-credential-specializations','027-workflow-reliability','028-storage-backed-files','030-foundation-progress-weighting','031-project-inquiries','032-inquiry-engineer-specialties'])await pg.exec(read('Thesis-Backend/migrations/'+name+'.sql'));
 const legacy=(await db.query('select id,current_stage_id,lifecycle_status from projects order by id')).rows;
 await pg.exec(read('Thesis-Backend/migrations/033-intake-monitoring.sql'));await pg.exec(read('Thesis-Backend/migrations/033-intake-monitoring.sql'));
 assert.deepEqual((await db.query('select id,current_stage_id,lifecycle_status from projects order by id')).rows,legacy);
 assert.equal((await db.query('select count(*)::int as n from projects where intake_monitoring_version is not null')).rows[0].n,0);
 await pg.exec("update user_licenses set license_expiry=current_date+1000 where superseded_at is null;update users set temp_password_issued=false where not coalesce(is_deleted,false)");
 const users=(await db.query("select u.id,u.full_name,u.email,r.code as role from users u join roles r on r.id=u.role_id where u.status='active' and not coalesce(u.is_deleted,false)")).rows;
 const qualified=(await db.query("SELECT s.user_id FROM user_project_type_specializations s JOIN project_types t ON t.id=s.project_type_id WHERE t.code='Commercial'")).rows.map(row=>row.user_id);
 const [a,b,c]=users.filter(u=>u.role==='spm'),admin=users.find(u=>u.role==='admin'),opm=users.find(u=>u.role==='opm'&&qualified.includes(u.id)),otherOpm=users.find(u=>u.role==='opm'&&u.id!==opm.id);
 await db.query("UPDATE user_licenses SET verification_status='verified',verified_by=$1,verified_at=now() WHERE superseded_at IS NULL",[admin.id]);
 await db.query("DELETE FROM license_renewal_requests WHERE file_ref LIKE 'seed/licenses/renewal-%'");
 async function license(person,profession,specializations) {
  const current=(await db.query('SELECT id FROM user_licenses WHERE user_id=$1 AND profession=$2 AND superseded_at IS NULL',[person.id,profession])).rows[0];
  if(current)await db.query('UPDATE user_licenses SET specializations=$2 WHERE id=$1',[current.id,specializations]);
  else await db.query("INSERT INTO user_licenses(user_id,license_number,license_expiry,upload_status,upload_file_ref,profession,verification_status,verified_by,verified_at,specializations) VALUES($1,'0000123',current_date+1000,'uploaded','disposable-qualified-proof',$2,'verified',$3,now(),$4)",[person.id,profession,admin.id,specializations]);
 }
 await license(a,'Civil Engineer',['Civil','Structural Engineering','Construction Engineering']);
 await license(a,'Electrical Engineer',['Electrical Design Engineering','Electrical Installation Engineering']);
 await license(b,'Mechanical Engineer',['Mechanical Building Services Engineering']);
 await license(b,'Sanitary Engineer',['Plumbing Systems Engineering']);
 await license(c,'Mechanical Engineer',['Fire Protection Engineering (Mechanical Systems)']);
 await license(c,'Electronics Engineer',['Fire Detection and Alarm Systems Engineering']);
 assert.ok(a&&b&&c&&opm&&otherOpm);
 const commercial=(await db.query("select id from project_types where code='Commercial'")).rows[0].id;
 await pg.exec("UPDATE projects SET lifecycle_status='archived';UPDATE project_engineers SET unassigned_at=now() WHERE unassigned_at IS NULL");
 const stages=(await db.query('select s.id,s.code from project_type_stages w join project_stages s on s.id=w.project_stage_id where w.project_type_id=$1 order by w.sort_order',[commercial])).rows;
 const stage=code=>stages.find(s=>s.code===code),envelope=stage('Envelope / Curtain Wall'),mep=stage('MEP Rough-In'),fire=stage('Fire & Life Safety');
 const source=(await db.query('select id from projects limit 1')).rows[0];
 async function project(arrangement='Highly concurrent phases',status='active',phases=stages.map(s=>s.code)) {
  const id=randomUUID();
  const scopes=Object.fromEntries(phases.map(phase=>[phase,phase===mep.code?['Electrical Installation Engineering','Mechanical Building Services Engineering','Plumbing Systems Engineering']:phase===fire.code?['Fire Protection Engineering (Mechanical Systems)','Fire Detection and Alarm Systems Engineering']:phase===envelope.code?['Structural Engineering','Construction Engineering']:['Civil']]));
  await db.query(`insert into projects select(jsonb_populate_record(null::projects,to_jsonb(p)||jsonb_build_object('id',$2::text,'name','Contract v1 test','project_type_id',$3::smallint,'suggested_opm_id',$4::text,'lifecycle_status',$5::text,'current_stage_id',$6::smallint,'intake_monitoring_version',1,'subcontractor_allocation_version',0,'phase_scope',$7::jsonb,'inquiry_intake',$8::jsonb))).* from projects p where id=$1`,
   [source.id,id,commercial,opm.id,status,envelope.id,JSON.stringify({phases,engineerScopes:scopes}),JSON.stringify({assessment:{arrangement}})]);
  for(const [index,name]of phases.entries()) {
   const s=stage(name),person=name===fire.code?c:a;
   await db.query("insert into project_phase_team(project_id,project_stage_id,spm_user_id,status,is_lead) values($1,$2,$3,'confirmed',$4)",[id,s.id,person.id,index===0]);
   await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) values($1,$2,$3,$4,'confirmed')",[id,s.id,person.id,name===mep.code?['Electrical Installation Engineering']:scopes[name]]);
  }
  if(phases.includes(mep.code))await db.query("insert into project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) values($1,$2,$3,$4,'confirmed')",[id,mep.id,b.id,['Mechanical Building Services Engineering','Plumbing Systems Engineering']]);
  for(const person of [a,b,c])await db.query("insert into project_engineers(project_id,user_id,project_role_label) values($1,$2,'Site PM')",[id,person.id]);
  await snapshotProjectChecklists(db,id);
  return id;
 }
 const dbPort=await freePort(),apiPort=await freePort();socket=new PGLiteSocketServer({db:pg,port:dbPort,host:'127.0.0.1'});await socket.start();
 child=spawn(process.execPath,['src/index.js'],{cwd:fileURLToPath(new URL('../Thesis-Backend/',import.meta.url)),env:{...process.env,NODE_ENV:'development',DB_SERVER:'127.0.0.1',DB_PORT:String(dbPort),DB_NAME:'postgres',DB_USER:'postgres',DB_PASSWORD:'x',DB_POOL_MAX:'1',PGSSLMODE:'disable',JWT_SECRET:'intake-monitoring-isolated-test-secret-123456',PORT:String(apiPort),HOST:'127.0.0.1',ARCHIVE_MAINTENANCE_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const base=`http://127.0.0.1:${apiPort}/api/v1`;
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 async function call(user,path,{method='GET',json,body,status=200}={}) {
  const response=await fetch(base+path,{method,headers:{...(user?.token?{Authorization:'Bearer '+user.token}:{}),...(json?{'Content-Type':'application/json'}:{})},body:body||(json?JSON.stringify(json):undefined)});
  const result=await response.json();assert.equal(response.status,status,JSON.stringify(result)+'\n'+logs.slice(-1500));return result.data;
 }
 for(const u of [admin,opm,otherOpm,a,b,c]) {const login=await call(null,u.role==='admin'?'/auth/admin/login':'/auth/staff/login',{method:'POST',json:{email:u.email,password:'Password@123',replace_session:true}});u.token=login.token;}
 const overview=(id,user=opm)=>call(user,`/projects/${id}/phase-overview`).then(r=>r.overlap_monitoring);
 const responsibility=async(id,person,phase)=> (await db.query('select id from project_phase_responsibilities where project_id=$1 and user_id=$2 and project_stage_id=$3',[id,person.id,phase.id])).rows[0].id;
 const item=async(id,s,code)=>(await db.query('select id from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 and code=$3',[id,s.id,code])).rows[0].id;
 async function upload(id,person,r,itemId,{status=201}={}) {
  const form=new FormData();form.set('id',randomUUID());form.set('file',new File(['%PDF-1.4\nEvidence'],'evidence.pdf',{type:'application/pdf'}));
  const stored=await call(person,'/files',{method:'POST',body:form});
  return call(person,`/projects/${id}/phase-files`,{method:'POST',json:{file_id:stored.id,request_id:randomUUID(),responsibility_id:String(r),checklist_item_id:String(itemId)},status});
 }
 async function submit(id,person,r,itemId,file,status=201) {return call(person,`/projects/${id}/checklist-items/${itemId}/submit`,{method:'POST',json:{request_id:randomUUID(),responsibility_id:String(r),file_ids:[file.id],submission_note:'Individual evidence'},status});}
 async function review(id,evidence,decision='approve',status=200) {
  const preview=await call(opm,`/projects/${id}/evidence/${evidence.id}/review-preview`);
  return call(opm,`/projects/${id}/evidence/${evidence.id}/${decision}`,{method:'POST',json:{expected_review_token:preview.review_token,...(decision==='reject'?{review_note:'Correct this responsibility evidence.'}:{})},status});
 }
 await t.test('canonical additional scopes reject unsupported phases and preserve independent required qualifications',async()=>{
  const config=await inquiryScopeConfiguration(db,'Commercial',[mep.code],{[mep.code]:['Fire Detection and Alarm Systems Engineering']});
  assert.ok(config.required[mep.code].includes('Plumbing Systems Engineering'));assert.ok(config.required[mep.code].includes('Fire Detection and Alarm Systems Engineering'));
  assert.deepEqual(config.additional[mep.code],['Fire Detection and Alarm Systems Engineering']);
  await assert.rejects(inquiryScopeConfiguration(db,'Commercial',[mep.code],{Design:['Construction Engineering']}),{status:422});
  await assert.rejects(inquiryScopeConfiguration(db,'Commercial',[mep.code],{[mep.code]:['Fake Specialty']}),{status:422});
 });
 await t.test('planning restores extra scopes and intake rejects stale scopes before persisting verified requirements',async()=>{
  await db.query("UPDATE user_licenses SET specializations=$2 WHERE user_id=$1 AND profession='Civil Engineer' AND superseded_at IS NULL",[a.id,['Civil','Structural Engineering','Construction Engineering']]);
  await db.query("UPDATE user_licenses SET specializations=$2 WHERE user_id=$1 AND profession='Electrical Engineer' AND superseded_at IS NULL",[a.id,['Electrical Design Engineering','Electrical Installation Engineering']]);
  const inquiryId=randomUUID(),assessmentId=randomUUID(),extra='Electrical Design Engineering';
  const details={client_name:'Scope Client',email:'scope.client@gmail.com',phone:'09171234567',name:'Scope snapshot test',address:'Test commercial site',project_type:'Commercial',lot_area:200,land_area:200,floor_area_sqm:500,floor_count:3,consultation:30};
  const workflow={review:{start:'2092-01-01',end:'2093-01-01'},budget:1000000,assessment:{id:assessmentId,size:'Medium',suggestedEnd:'2092-09-01',technical:'Several specialized systems',arrangement:'Highly concurrent phases'}};
  await db.query("INSERT INTO project_inquiries(id,details,status,admin_id,opm_id) VALUES($1,$2,'approved',$3,$4)",[inquiryId,JSON.stringify({...details,opm_workflow:workflow}),admin.id,opm.id]);
  const form=new FormData(),fileId=randomUUID();form.set('id',fileId);form.set('file',new File(['%PDF-1.4\nSigned scope contract'],'scope-contract.pdf',{type:'application/pdf'}));await call(opm,'/files',{method:'POST',body:form});
  const input={...details,assessment_id:assessmentId,target_start_date:workflow.review.start,target_end_date:workflow.review.end,estimated_budget:workflow.budget};
  const path=`/projects/inquiries/${inquiryId}/planning`;
  let plan=await call(opm,path,{method:'POST',json:{...input,phases:['Structure'],contract_file_id:fileId,additional_scopes:{Structure:[extra]}}});
  assert.ok(plan.additional_scope_options.Structure.includes(extra));
  assert.ok(plan.team[0].required_specializations.includes(extra));
  assert.ok(plan.candidates.Structure.find(person=>person.id===a.id).qualifiedTags.includes(extra));
  const reopened=await call(opm,path,{method:'POST',json:input});assert.deepEqual(reopened.staffing.additional_scopes,{Structure:[extra]});
  const body={...input,inquiry_id:inquiryId,suggested_opm_id:opm.id,contract_file_id:fileId,phases:['Structure'],additional_scopes:{Structure:[extra]},phase_team:plan.team};
  await call(opm,'/projects/intake',{method:'POST',json:{...body,assessment_id:randomUUID()},status:409});
  await call(opm,'/projects/intake',{method:'POST',json:{...body,phases:['Design']},status:409});
  await call(opm,'/projects/intake',{method:'POST',json:{...body,additional_scopes:{Structure:[]}},status:409});
  const finalized=await call(opm,'/projects/intake',{method:'POST',json:body});
  const stored=(await db.query('SELECT phase_scope,inquiry_intake,intake_monitoring_version FROM projects WHERE id=$1',[finalized.project.id])).rows[0];
  assert.equal(stored.intake_monitoring_version,1);assert.deepEqual(stored.phase_scope.additional_scopes,{Structure:[extra]});
  assert.ok(stored.phase_scope.engineerScopes.Structure.includes(extra));
  assert.deepEqual(stored.inquiry_intake.additional_scopes,{Structure:[extra]});
  await call(opm,'/projects/intake',{method:'POST',json:{...body,additional_scopes:{Structure:[]}},status:409});
  assert.equal((await call(opm,'/projects/intake',{method:'POST',json:body})).project.id,finalized.project.id);
 });
 await t.test('Commercial: independent MEP/Fire uploads, targeted revision, final dependencies, rollup and explicit turnover',async()=>{
  const id=await project(),root=`/projects/${id}`,ra=await responsibility(id,a,mep),rb=await responsibility(id,b,mep),rc=await responsibility(id,c,fire),re=await responsibility(id,a,envelope);
  const envelopeItems=(await db.query('select id from project_phase_checklist_items where project_id=$1 and project_stage_id=$2 order by sort_order',[id,envelope.id])).rows;
  assert.equal(envelopeItems.length,3);
  for(const row of envelopeItems.slice(0,2)){const file=await upload(id,a,re,row.id);await review(id,await submit(id,a,re,row.id,file));}
  let view=await overview(id);assert.deepEqual(view.active_checklist,{approved:2,required:3});
  const early=await item(id,mep,'method_statement'),final=await item(id,mep,'inspection_testing');
  await upload(id,a,ra,early,{status:409});
  await call(admin,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(ra),expected_active_stage_id:String(envelope.id)},status:403});
  await call(otherOpm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(ra),expected_active_stage_id:String(envelope.id)},status:404});
  await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(ra),expected_active_stage_id:String(mep.id)},status:409});
  for(const r of [ra,rb,rc])await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(r),expected_active_stage_id:String(envelope.id)}});
  await upload(id,a,ra,final,{status:409});
  await upload(id,a,rb,early,{status:403});
  const first=await submit(id,a,ra,early,await upload(id,a,ra,early)),second=await submit(id,b,rb,early,await upload(id,b,rb,early));
  await review(id,first,'reject');await review(id,second);
  view=await overview(id);let rows=view.phases.find(p=>p.name===mep.code).responsibilities;
  assert.equal(rows.find(r=>r.id===String(ra)).items.find(i=>i.id===String(early)).status,'rework_required');
  assert.equal(rows.find(r=>r.id===String(rb)).items.find(i=>i.id===String(early)).status,'approved');
  assert.deepEqual(rows[0].items.find(i=>i.id===String(early)).responsibility_totals,{approved:1,required:2});
  const revised=await submit(id,a,ra,early,await upload(id,a,ra,early));await review(id,revised);
  const pendingItem=await item(id,mep,'work_inspection');
  await submit(id,b,rb,pendingItem,await upload(id,b,rb,pendingItem));
  const fireItem=await item(id,fire,'method_statement');await review(id,await submit(id,c,rc,fireItem,await upload(id,c,rc,fireItem)));
  const last=envelopeItems[2];await review(id,await submit(id,a,re,last.id,await upload(id,a,re,last.id)));
  assert.equal((await db.query('select current_stage_id from projects where id=$1',[id])).rows[0].current_stage_id,envelope.id,'Evidence approval does not advance the official phase');
  const finalFile=await upload(id,a,ra,final);await review(id,await submit(id,a,ra,final,finalFile));
  const history=await call(opm,root+'/evidence-history');assert.equal(history.filter(e=>String(e.responsibility_id)===String(ra)&&String(e.id)===String(early)).length,2);
  const before=(await db.query('select id,status,responsibility_id from project_phase_evidence where project_id=$1 order by id',[id])).rows;
  view=await overview(id);assert.equal(view.turnover.can_confirm,true,JSON.stringify(view.turnover));
  await call(opm,root+'/advance-phase',{method:'POST',json:{expected_stage_id:String(mep.id)},status:409});
  await call(opm,root+'/advance-phase',{method:'POST',json:{expected_stage_id:String(envelope.id)}});
  await call(opm,root+'/advance-phase',{method:'POST',json:{expected_stage_id:String(envelope.id)},status:409});
  assert.equal((await db.query('select current_stage_id from projects where id=$1',[id])).rows[0].current_stage_id,mep.id);
  assert.deepEqual((await overview(id)).active_checklist,{approved:1,required:3},'A shared item is credited only after every applicable responsibility is approved');
  assert.deepEqual((await db.query('select id,status,responsibility_id from project_phase_evidence where project_id=$1 order by id',[id])).rows,before);
  const ownHistory=await call(b,root+'/evidence-history');assert.ok(ownHistory.every(row=>row.submitted_by===b.id));
  const part=(await call(opm,'/workspace/project-data')).find(p=>p.list.id===id);assert.equal(part.overview.overlap_monitoring.version,1);
  assert.ok((await readVerifiedProgress(db,[id])).get(id).project.total>0);
 });
 await t.test('item applicability and responsibility-linked attachments cannot be bypassed at submission',async()=>{
  const id=await project(),root=`/projects/${id}`,ra=await responsibility(id,a,mep),rb=await responsibility(id,b,mep),early=await item(id,mep,'method_statement');
  await submit(id,a,ra,early,{id:randomUUID()},409);
  for(const r of [ra,rb])await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(r),expected_active_stage_id:String(envelope.id)}});
  await db.query('INSERT INTO project_checklist_responsibilities(checklist_item_id,responsibility_id) VALUES($1,$2)',[early,rb]);
  await upload(id,a,ra,early,{status:403});
  const file=await upload(id,b,rb,early);
  await submit(id,a,rb,early,file,403);
  await submit(id,b,rb,early,{id:randomUUID()},400);
  const final=await item(id,mep,'inspection_testing');await submit(id,b,rb,final,file,409);
  await submit(id,b,rb,early,file);
  const another=await project(),foreign=await responsibility(another,a,mep);
  await assert.rejects(db.query('INSERT INTO project_checklist_responsibilities(checklist_item_id,responsibility_id) VALUES($1,$2)',[early,foreign]),error=>error.code==='23514');
  for(const role of ['anon','authenticated']) {
   await pg.exec('SET ROLE '+role);
   await assert.rejects(db.query('SELECT * FROM project_parallel_upload_approvals'),error=>error.code==='42501');
   await pg.exec('RESET ROLE');
  }
 });
 await t.test('Sequential and partial overlap restrictions are enforced on approval and file routes',async()=>{
  for(const arrangement of ['Sequential phases','Partially overlapping phases']) {
   const id=await project(arrangement),root=`/projects/${id}`,r=await responsibility(id,a,mep),f=await responsibility(id,c,fire);
   await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(f),expected_active_stage_id:String(envelope.id)},status:409});
   await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(r),expected_active_stage_id:String(envelope.id)},status:arrangement==='Sequential phases'?409:200});
   const rb=await responsibility(id,b,mep);
   if(arrangement==='Partially overlapping phases')await call(opm,root+'/parallel-upload-approvals',{method:'POST',json:{responsibility_id:String(rb),expected_active_stage_id:String(envelope.id)}});
   await upload(id,c,f,await item(id,fire,'method_statement'),{status:409});
  }
 });
 await t.test('automatic one-company allocation, decline/reallocate/accept, stale requests and no eligible company',async()=>{
  await db.query("update workspace_company_metadata set metadata=jsonb_set(metadata,'{capabilityReview}',coalesce(metadata->'capabilityReview','{}')||'{\"unavailable\":true}'::jsonb)");
  const companySource=(await db.query('select id from subcontractors limit 1')).rows[0];
  for(const name of ['A Contract Company','B Contract Company']) {
   const id=randomUUID();await db.query("insert into subcontractors select(jsonb_populate_record(null::subcontractors,to_jsonb(s)||jsonb_build_object('id',$2::text,'company_name',$3::text,'directory_status','approved','is_deleted',false))).* from subcontractors s where id=$1",[companySource.id,id,name]);
   await db.query('insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2)',[id,JSON.stringify({capabilityReview:{reviewedAt:new Date().toISOString(),disciplines:COMPANY_TRADES,unavailable:false}})]);
  }
  const id=await project('Sequential phases','spm_review',['Structure']),root=`/projects/${id}`;
  await db.query("insert into project_documents(project_id,document_type_id,status) select $1,id,'uploaded' from document_types where code=any($2::text[])",[id,['notice_to_proceed','building_permit','owner_contract','registered_plans','environmental_certificate']]);
  const body=new FormData(),fileId=randomUUID();body.set('id',fileId);body.set('file',new File(['%PDF-1.4\nBOQ'],'boq.pdf',{type:'application/pdf'}));await call(opm,'/files',{method:'POST',body});
  await call(opm,root+'/workspace-command',{method:'POST',json:{type:'upload_registered',docIndex:5,doc:{id:fileId}}});
  let allocation=(await call(a,root)).project_company_allocation;
  assert.equal(allocation.company.name,'A Contract Company');assert.equal(allocation.can_record_decision,true);
  assert.equal((await call(opm,root)).project_company_allocation.can_record_decision,false);
  const respond=(user,action,value,status=200)=>call(user,root+'/project-company-allocation',{method:'POST',json:{action,expected_revision:value.revision,company_id:value.company?.id},status});
  await respond(b,'decline',allocation,403);const stale=allocation;
  allocation=await respond(a,'decline',allocation);assert.equal(allocation.status,'declined');
  await respond(a,'accept',stale,409);
  allocation=await respond(a,'reallocate',allocation);assert.equal(allocation.company.name,'B Contract Company');
  allocation=await respond(a,'accept',allocation);assert.equal(allocation.status,'accepted');assert.equal(allocation.history.length,2);
  await respond(a,'reallocate',allocation,409);
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'upload_agreement',company_id:randomUUID(),doc:{id:fileId}},status:409});
  await assert.rejects(db.query("update project_company_decisions set company_name='Rewritten' where project_id=$1",[id]),error=>error.code==='23514');
  const {ensureProjectCompanyAllocation}=await import('../Thesis-Backend/src/services/workspace/project-company-allocation.utility.js');
  const original=(await db.query('select revision from project_company_allocations where project_id=$1',[id])).rows[0].revision;
  await ensureProjectCompanyAllocation(db,{id});assert.equal((await db.query('select revision from project_company_allocations where project_id=$1',[id])).rows[0].revision,original);
  const client=(await db.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='client' AND u.status='active' LIMIT 1")).rows[0];
  await db.query('INSERT INTO user_client_project_links(user_id,project_id) VALUES($1,$2)',[client.id,id]);
  const agreementForm=new FormData(),agreementId=randomUUID();agreementForm.set('id',agreementId);agreementForm.set('file',new File(['%PDF-1.4\nAccepted company signed agreement'],'company-agreement.pdf',{type:'application/pdf'}));
  await call(a,'/files',{method:'POST',body:agreementForm});
  await call(a,root+'/workspace-command',{method:'POST',json:{type:'upload_agreement',company_id:allocation.company.id,doc:{id:agreementId}}});
  assert.equal((await db.query('SELECT lifecycle_status FROM projects WHERE id=$1',[id])).rows[0].lifecycle_status,'active');
  const linkedAgreement=(await db.query('SELECT agreement_file_id,agreement_company_id FROM project_company_allocations WHERE project_id=$1',[id])).rows[0];
  assert.equal(linkedAgreement.agreement_file_id,agreementId);assert.equal(linkedAgreement.agreement_company_id,allocation.company.id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM project_subcontractor_assignments WHERE project_id=$1 AND status='active'",[id])).rows[0].n,1);
  await db.query("update workspace_company_metadata set metadata=jsonb_set(metadata,'{capabilityReview}',coalesce(metadata->'capabilityReview','{}')||'{\"unavailable\":true}'::jsonb)");
  const empty=await project('Sequential phases','spm_review',['Structure']);
  await db.query("insert into project_documents(project_id,document_type_id,status) select $1,id,'uploaded' from document_types where code=any($2::text[])",[empty,['notice_to_proceed','building_permit','owner_contract','registered_plans','environmental_certificate','budget_boq']]);
  await ensureProjectCompanyAllocation(db,{id:empty});assert.equal((await call(a,`/projects/${empty}`)).project_company_allocation.status,'no_eligible_company');
  await db.query("UPDATE projects SET lifecycle_status='archived' WHERE name IN ('Contract v1 test','Scope snapshot test')");
  const last=await project('Sequential phases','spm_review',['Structure']),lastRoot=`/projects/${last}`;
  await db.query("UPDATE projects SET phase_scope=jsonb_set(phase_scope,'{engineerScopes,Structure}','[\"Civil\",\"Electrical\"]') WHERE id=$1",[last]);
  const pending=(await db.query("INSERT INTO project_phase_responsibilities(project_id,project_stage_id,user_id,assigned_disciplines,status) VALUES($1,$2,$3,array['Electrical'],'pending') RETURNING id",[last,stage('Structure').id,b.id])).rows[0];
  await db.query("INSERT INTO project_documents(project_id,document_type_id,status) SELECT $1,id,'uploaded' FROM document_types WHERE code=any($2::text[])",[last,['notice_to_proceed','building_permit','owner_contract','registered_plans','environmental_certificate','budget_boq']]);
  await ensureProjectCompanyAllocation(db,{id:last});assert.equal((await db.query('SELECT 1 FROM project_company_allocations WHERE project_id=$1',[last])).rowCount,0);
  await call(b,lastRoot+`/engineer-responsibilities/${pending.id}`,{method:'POST',json:{action:'accept'}});
  assert.equal((await call(a,lastRoot)).project_company_allocation.status,'no_eligible_company','Last Site PM response evaluates readiness as well as document uploads');
 });
});

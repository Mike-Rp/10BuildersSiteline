import { mkdir, writeFile } from 'node:fs/promises';
import { get, close } from '../src/common/pool-manager.js';
import { inquiryEngineerScopes } from '../src/domain/inquiry-engineer-scopes.js';
import { experienceMonths, EXPERIENCE_PROJECT_TYPES } from '../src/domain/engineer-experience.js';
const apply=process.argv.includes('--apply');
const db=await(await get()).connect();
try {
 await db.query('BEGIN'); await db.query("SET LOCAL lock_timeout='8s'");
 await db.query("SELECT pg_advisory_xact_lock(hashtext('demo-spm-phase-distribution-v1'))");
 const people=(await db.query(`SELECT u.id,u.full_name,u.status FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='spm' AND NOT coalesce(u.is_deleted,false) ORDER BY u.full_name,u.id FOR UPDATE OF u`)).rows;
 if(people.length!==215)throw Error('Expected exactly 215 SPMs; review changed population.');
 const phases=(await db.query(`SELECT DISTINCT s.code FROM project_type_stages w JOIN project_stages s ON s.id=w.project_stage_id ORDER BY s.code`)).rows.map(r=>r.code);
 const metadata=(await db.query('SELECT * FROM workspace_account_metadata WHERE user_id=ANY($1::uuid[])',[people.map(p=>p.id)])).rows;
 if(metadata.some(m=>m.metadata.demoPhaseAllocation))throw Error('Demo distribution already exists; refusing repeat changes.');
 const catalog=(await db.query('SELECT * FROM inquiry_engineer_specialties')).rows;
 const existingScopes=(await db.query('SELECT q.user_id,d.code FROM engineer_qualified_scopes q JOIN disciplines d ON d.id=q.discipline_id WHERE q.user_id=ANY($1::uuid[])',[people.map(p=>p.id)])).rows;
 const licenses=(await db.query('SELECT * FROM user_licenses WHERE user_id=ANY($1::uuid[])',[people.map(p=>p.id)])).rows;
 const actor=(await db.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='admin' AND u.status='active' AND NOT coalesce(u.is_deleted,false) ORDER BY u.id LIMIT 1")).rows[0]?.id;
 if(!actor)throw Error('No administrator for demo audit attribution.');
 const fingerprint=async()=> (await db.query(`SELECT 'projects' AS name,count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) AS checksum FROM projects t UNION ALL SELECT 'project_engineers',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM project_engineers t UNION ALL SELECT 'project_phase_team',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM project_phase_team t`)).rows;
 const before=await fingerprint();
 const plan=people.map((p,i)=>{
  const phase=phases[i%phases.length];
  const tags=[...new Set(EXPERIENCE_PROJECT_TYPES.flatMap(type=>inquiryEngineerScopes(type,[phase])[phase]??[]))].sort();
  if(!tags.length)throw Error('No inquiry scope definition for '+phase);
  const old=metadata.find(m=>m.user_id===p.id)?.metadata??{};
  const experience={...(old.experienceByType??{})};let changed=0;
  for(const type of EXPERIENCE_PROJECT_TYPES)if(experienceMonths(experience,type)===0){experience[type]={months:60};changed++;}
  return {...p,phase,tags,experience,changed};
 });
 const additions=[];
 let number=7000000;const used=new Set(licenses.map(l=>l.license_number));
 // Check numbers across all accounts, including OPMs.
 for(const r of (await db.query('SELECT license_number FROM user_licenses')).rows)used.add(r.license_number);
 for(const p of plan){
  const missing=p.tags.filter(tag=>!existingScopes.some(s=>s.user_id===p.id&&s.code===tag));
  const byProfession=new Map();
  for(const tag of missing){const profession=catalog.find(c=>c.specialty===tag)?.profession;if(!profession)throw Error('Unknown specialty '+tag);if(!byProfession.has(profession))byProfession.set(profession,[]);byProfession.get(profession).push(tag);}
  const template=licenses.find(l=>l.user_id===p.id&&l.upload_file_ref);
  if(!template)throw Error('Missing demo evidence for '+p.full_name);
  for(const [profession,tags]of byProfession)for(let i=0;i<tags.length;i+=3){while(used.has(String(number)))number++;const license_number=String(number++);used.add(license_number);additions.push({user_id:p.id,profession,specializations:tags.slice(i,i+3),license_number,upload_file_ref:template.upload_file_ref});}
 }
 const summary={people:plan.length,phases:phases.map(phase=>({phase,count:plan.filter(p=>p.phase===phase).length,required:plan.find(p=>p.phase===phase).tags})),zeroExperienceEntriesUpdated:plan.reduce((n,p)=>n+p.changed,0),newDemoLicenses:additions.length};
 if(!apply){await db.query('ROLLBACK');console.log(JSON.stringify({applied:false,...summary}));}
 else {
  const folder=new URL(`../audit-backups/demo-spm-phase-${Date.now()}/`,import.meta.url);await mkdir(folder,{recursive:true});
  await writeFile(new URL('before.json',folder),JSON.stringify({purpose:'User-authorized DEMO qualification redistribution; preserve original licenses and actual project assignments',actor,people,metadata,licenses,existingScopes,before,plan,additions},null,2));
  await db.query("SELECT set_config('app.current_user_id',$1,true)",[actor]);
  await db.query(`INSERT INTO user_licenses(user_id,profession,specializations,license_number,license_expiry,upload_file_ref,upload_status,verification_status,verified_by,verified_at,verification_note,created_by,updated_by)
   SELECT x.user_id,x.profession,x.specializations,x.license_number,(current_date+interval '10 years')::date,x.upload_file_ref,'uploaded','verified',$2,now(),'DEMO ONLY: synthetic qualifications for balanced phase demonstration; reuses existing demo upload. Not a real professional credential.',$2,$2
   FROM jsonb_to_recordset($1::jsonb) x(user_id uuid,profession text,specializations text[],license_number text,upload_file_ref text)`,[JSON.stringify(additions),actor]);
  await db.query(`INSERT INTO workspace_account_metadata(user_id,metadata)
   SELECT x.id,jsonb_build_object('experienceByType',x.experience,'demoPhaseAllocation',jsonb_build_object('phase',x.phase,'requiredSpecialties',x.tags,'demoOnly',true,'version',1,'updatedAt',now()))
   FROM jsonb_to_recordset($1::jsonb) x(id uuid,phase text,tags jsonb,experience jsonb)
   ON CONFLICT(user_id) DO UPDATE SET metadata=workspace_account_metadata.metadata||excluded.metadata`,[JSON.stringify(plan)]);
  const coverage=(await db.query(`SELECT x.id,x.phase,count(DISTINCT d.code)::int AS covered,jsonb_array_length(x.tags) AS required
   FROM jsonb_to_recordset($1::jsonb) x(id uuid,phase text,tags jsonb)
   LEFT JOIN engineer_qualified_scopes q ON q.user_id=x.id LEFT JOIN disciplines d ON d.id=q.discipline_id AND x.tags ? d.code GROUP BY x.id,x.phase,x.tags`,[JSON.stringify(plan)])).rows;
  if(coverage.length!==215||coverage.some(r=>r.covered!==r.required))throw Error('100% qualification verification failed.');
  if(JSON.stringify(before)!==JSON.stringify(await fingerprint()))throw Error('Existing project assignments changed.');
  const stored=(await db.query('SELECT user_id,metadata FROM workspace_account_metadata WHERE user_id=ANY($1::uuid[])',[people.map(p=>p.id)])).rows;
  if(stored.some(r=>EXPERIENCE_PROJECT_TYPES.some(t=>experienceMonths(r.metadata.experienceByType,t)<=0)))throw Error('Zero experience remains.');
  const report={applied:true,...summary,verified100Percent:coverage.length,existingProjectAssignmentsUnchanged:true,backup:folder.pathname,roster:plan.map(({id,full_name,status,phase,tags})=>({id,full_name,status,phase,tags}))};
  await writeFile(new URL('report.json',folder),JSON.stringify(report,null,2));
  await writeFile(new URL('roster.csv',folder),'Name,Status,Phase,Qualification\n'+plan.map(p=>[p.full_name,p.status,p.phase,'100%'].map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n'));
  await db.query('COMMIT');console.log(JSON.stringify({...report,roster:undefined}));
 }
}catch(e){await db.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{db.release();await close();}

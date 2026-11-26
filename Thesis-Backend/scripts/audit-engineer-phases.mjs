import {get,close} from "../src/common/pool-manager.js";
import {LICENSE_ELIGIBILITY_SQL} from "../src/common/utilities/license-eligibility.utility.js";
import {allocatePhaseCoverage} from "../src/domain/engineer-phase-coverage.js";
import {writeFileSync} from "node:fs";
try {
 const db=await get();
 const people=(await db.query(`select u.id,u.full_name,r.code as role,u.status,u.is_deleted,(${LICENSE_ELIGIBILITY_SQL}) as assignment_eligible,
 array(select d.code from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id where q.user_id=u.id order by d.code) as scopes,
 exists(select 1 from project_engineers e where e.user_id=u.id and e.unassigned_at is null) as assigned,
 exists(select 1 from user_licenses l where l.user_id=u.id and l.superseded_at is null and l.verification_status='verified' and l.specializations is not null and exists(select 1 from unnest(l.specializations) tag where tag like '%Engineering%' or tag='Construction Surveying' or tag='Land Surveying')) as detailed_license
 from users u join roles r on r.id=u.role_id where r.code in ('spm','opm') order by r.code,u.full_name`)).rows;
 const phases=(await db.query(`select t.code as type,s.code as phase,x.sort_order,array(select d.code from project_stage_discipline_links l join disciplines d on d.id=l.discipline_id where l.project_type_id=t.id and l.project_stage_id=s.id order by d.code) as required from project_type_stages x join project_types t on t.id=x.project_type_id join project_stages s on s.id=x.project_stage_id order by t.code,x.sort_order`)).rows;
 const pool=people.filter(p=>p.role==='spm'&&p.status==='active'&&!p.is_deleted&&p.assignment_eligible);
 const results=phases.map(p=>{const candidates=pool.filter(e=>p.required.some(s=>e.scopes.includes(s)));const coverage=allocatePhaseCoverage(p.required,candidates.map(e=>({id:e.id,qualifiedTags:e.scopes}))); return {...p,candidates:candidates.length,unassigned_candidates:candidates.filter(e=>!e.assigned).length,missing:coverage.missing,quota_met:coverage.quotaMet,scope_counts:Object.fromEntries(p.required.map(s=>[s,candidates.filter(e=>e.scopes.includes(s)).length]))};});
 const summary=Object.fromEntries(['spm','opm'].map(role=>{const all=people.filter(p=>p.role===role);const active=all.filter(p=>p.status==='active'&&!p.is_deleted);return [role,{total:all.length,active:active.length,eligible:active.filter(p=>p.assignment_eligible).length,no_scopes:active.filter(p=>!p.scopes.length).length,detailed_but_no_scopes:active.filter(p=>p.detailed_license&&!p.scopes.length).length}]}));
 const scopes=(await db.query(`select d.code,count(distinct u.id)::int as eligible_spms from disciplines d left join engineer_qualified_scopes q on q.discipline_id=d.id left join users u on u.id=q.user_id and u.id=any($1::uuid[]) group by d.code order by d.code`,[pool.map(e=>e.id)])).rows;
 const report={as_of:'2026-11-26',summary,scopes,phases:results,engineers:people.map(p=>({...p,matching_phases:results.filter(r=>r.required.some(s=>p.scopes.includes(s))).map(r=>`${r.type}: ${r.phase}`)}))};
 writeFileSync('engineer-phase-audit.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({summary,scopes,phases:results,unassigned_pool:pool.filter(e=>!e.assigned).length,blocked_examples:people.filter(p=>p.role==='spm'&&p.detailed_license&&!p.scopes.length).slice(0,12).map(p=>p.full_name)},null,2));
}finally{await close()}

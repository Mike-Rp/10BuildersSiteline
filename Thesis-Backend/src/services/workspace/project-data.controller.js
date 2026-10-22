
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, sendOk, handleError } from "../../common/utilities/access.utility.js";
import { LIST_SELECT, LIST_FROM, stripInternal } from "../projects/read.controller.js";
import { readVerifiedProgress } from "../progress/verified.utility.js";
import { verifiedComplete } from "../progress/lifecycle.utility.js";
import { transitionPhase, assessPhaseHandoff } from "../progress/handoff.utility.js";
import { ensureChecklist } from "../progress/phase.utility.js";

// Keep scope identical to the existing project endpoints; never accept a user ID from the browser.
const scope = `p.id in (
 select scoped.id from projects scoped where
 ($1='admin'
 or ($1='opm' and (scoped.suggested_opm_id=$2 or exists(
   select 1 from project_engineers e where e.project_id=scoped.id and e.user_id=$2 and e.unassigned_at is null)))
 or ($1='spm' and (exists(select 1 from project_phase_team t where t.project_id=scoped.id and t.spm_user_id=$2)
   or exists(select 1 from project_engineers e where e.project_id=scoped.id and e.user_id=$2 and e.unassigned_at is null)))
 or ($1='client' and scoped.lifecycle_status in ('active','archived') and exists(
   select 1 from user_client_project_links l where l.project_id=scoped.id and l.user_id=$2)))
)`;
const group = rows => {
 const result = new Map();
 for(const row of rows){const list=result.get(row.project_id)||[];list.push(row);result.set(row.project_id,list);}
 return result;
};
const download = row => ({...row,download_url:row.file_ref?.startsWith("db:")?
 "/api/v1/files/"+row.file_ref.replace(/^db:(\/\/)?/,"")+"/content":null});

// Explicit automation endpoint, not a mutation hidden inside a GET. No project,
// stage or percentage is accepted from the caller. Stored approvals alone
// establish eligibility; staff can only trigger checks within their existing scope.
export async function reconcilePhaseHandoffs(req,res) {
 try {
  const user=await requireUser(req,res,["admin","opm","spm"]);if(!user)return;
  const data=await withTransaction(async db=>{
   await db.query("select set_config('app.current_user_id',$1,true)",[user.id]);
   const candidates=(await db.query(`select p.id,p.current_stage_id,s.code AS current_stage from projects p
    left join project_stages s on s.id=p.current_stage_id where p.lifecycle_status='active'
    and not coalesce(p.is_deleted,false) and ${scope} order by p.id`,[user.role,user.id])).rows;
   const initial=await readVerifiedProgress(db,candidates.map(project=>project.id));
   const results=[];
   for(const candidate of candidates) {
    const initialPhase=initial.get(candidate.id)?.phases.find(phase=>phase.id===String(candidate.current_stage_id));
    if(!verifiedComplete(initialPhase)) {
     if(initialPhase?.reason)results.push({project_id:candidate.id,from:candidate.current_stage,advanced:false,reason:initialPhase.reason});
     continue;
    }
    // Every mutation uses the same lock order as activity review. Re-read after
    // acquiring the lock so simultaneous refreshes never advance the same phase twice.
    const project=(await db.query(`SELECT p.*,s.code AS current_stage FROM projects p
     LEFT JOIN project_stages s ON s.id=p.current_stage_id WHERE p.id=$1
     AND p.lifecycle_status='active' AND NOT COALESCE(p.is_deleted,false) FOR UPDATE OF p`,[candidate.id])).rows[0];
    if(!project || Number(project.current_stage_id)!==Number(candidate.current_stage_id))continue;
    const totals=(await readVerifiedProgress(db,[project.id])).get(project.id);
    const current=totals?.phases.find(phase=>phase.id===String(project.current_stage_id));
    if(!verifiedComplete(current))continue;
    // Final-phase completion remains with the existing closeout workflow.
    const next=(await db.query(`SELECT 1 FROM project_type_stages w WHERE w.project_type_id=$1
     AND w.sort_order>(SELECT sort_order FROM project_type_stages WHERE project_type_id=$1 AND project_stage_id=$2) LIMIT 1`,
     [project.project_type_id,project.current_stage_id])).rowCount;
    if(!next)continue;
    const handoff=await transitionPhase(db,project,null);
    results.push({project_id:project.id,from:project.current_stage,...handoff});
   }
   return results;
  });
  res.set("Cache-Control","private, no-store");
  return sendOk(res,"Automatic phase handoffs checked.",data.length,data);
 } catch(error){return handleError(res,error);}
}

export async function getProjectData(req,res) {
 try {
  const user=await requireUser(req,res,["admin","opm","spm","client"]);if(!user)return;
  const data=await withTransaction(async db=>{
   await db.query("select set_config('app.current_user_id',$1,true)",[user.id]);
   const projects=(await db.query(`select ${LIST_SELECT} ${LIST_FROM}
    where not coalesce(p.is_deleted,false) and ${scope} order by p.name,p.id`,[user.role,user.id])).rows;
   const ids=projects.map(p=>p.id);
   if(!ids.length)return [];
   const staff=user.role!=="client";
   // Only contacts linked to the already-authorized projects; never a global client directory.
   const clientAccounts=staff?group((await db.query(`select l.project_id,u.id,u.full_name,u.email,u.phone,
    m.metadata->>'contactPerson' as contact_person
    from user_client_project_links l join users u on u.id=l.user_id
    join roles r on r.id=u.role_id and r.code='client'
    left join workspace_account_metadata m on m.user_id=u.id
    where l.project_id=any($1::uuid[]) and not coalesce(u.is_deleted,false)
    order by u.full_name,u.id`,[ids])).rows):new Map();
   // Use the same standard as activation and evidence submission. Never replace
   // existing snapshots (including older phases with uploaded evidence).
   if(staff) {
    const missing=(await db.query(`select p.id,p.current_stage_id from projects p where p.id=any($1::uuid[])
     and p.current_stage_id is not null and not exists(select 1 from project_phase_checklists c
      where c.project_id=p.id and c.project_stage_id=p.current_stage_id)`,[ids])).rows;
    for(const project of missing)await ensureChecklist(db,project.id,project.current_stage_id);
   }
   const teams=(await db.query(`select t.project_id,t.project_stage_id as stage_id,s.code as stage,w.sort_order,
     t.spm_user_id,u.full_name as spm_name,t.status,t.is_lead,t.response_deadline_at,t.responded_at
     from project_phase_team t join projects p on p.id=t.project_id join project_type_stages w on w.project_type_id=p.project_type_id and w.project_stage_id=t.project_stage_id join project_stages s on s.id=t.project_stage_id
     left join users u on u.id=t.spm_user_id where t.project_id=any($1::uuid[]) order by w.sort_order`,[ids])).rows;
   const documents=(await db.query(`select p.id as project_id,d.id,t.code,t.label,
    t.is_client_visible_default as client_visible,d.status='uploaded' as uploaded,d.uploaded_at,
    f.original_name,f.content_type,f.byte_size,d.file_ref
    from projects p cross join document_types t
    left join project_documents d on d.project_id=p.id and d.document_type_id=t.id
    left join stored_files f on d.file_ref='db://'||f.id or d.file_ref='db:'||f.id
    where p.id=any($1::uuid[]) and ($2<>'client' or t.is_client_visible_default) order by t.id`,[ids,user.role])).rows.map(download);
   const history=(await db.query(`select * from(
    select h.project_id,h.id,s.code as stage_code,h.pct,h.note,h.is_issue,h.issue_categories,h.entry_type,h.recorded_at,
     row_number() over(partition by h.project_id order by h.recorded_at desc,h.id desc) as position
    from project_progress_history h left join project_stages s on s.id=h.project_stage_id
    where h.project_id=any($1::uuid[]) and ($2<>'client' or h.is_client_visible)
   ) recent where position<=50 order by recorded_at desc,id desc`,[ids,user.role])).rows;
   const photos=(await db.query(`select * from project_photos where project_id=any($1::uuid[])
    and ($2<>'client' or is_client_visible) order by created_at`,[ids,user.role])).rows.map(r=>download({...r,client_visible:r.is_client_visible}));
   const notes=staff?(await db.query(`select * from(
    select n.project_id,n.id,n.author_id,u.full_name as author,n.note_text,n.noted_at,
     row_number() over(partition by n.project_id order by n.noted_at desc) as position
    from project_notes n left join users u on u.id=n.author_id where n.project_id=any($1::uuid[])
   ) recent where position<=50 order by noted_at desc`,[ids])).rows:[];
   const checklist=staff?(await db.query(`select i.project_id,i.id,i.code,i.title,i.required,i.sort_order,i.weight,
    case when e.status='rejected' and e.rework_request_id is not null then 'rework_required' else coalesce(e.status,'missing') end as status,e.id as evidence_id,e.file_id,e.submitted_at,e.reviewed_at,
    e.review_note,e.submitted_by,e.submission_note,e.phase_update_id,e.rework_request_id,r.resolution_note AS rework_reason,f.original_name,f.content_type
    from project_phase_checklist_items i join projects p on p.id=i.project_id and p.current_stage_id=i.project_stage_id
    left join lateral(select * from project_phase_evidence where checklist_item_id=i.id order by id desc limit 1)e on true
    left join pending_rework_requests r on r.id=e.rework_request_id
    left join project_phase_files f on f.id=e.file_id
    where i.project_id=any($1::uuid[]) order by i.sort_order,i.id`,[ids])).rows:[];
   const updates=staff?(await db.query(`select u.*,selected.code as requested_stage,prior.code as prior_stage
    from project_phase_updates u join project_stages selected on selected.id=u.selected_stage_id
    left join project_stages prior on prior.id=u.prior_stage_id
    where u.project_id=any($1::uuid[]) and u.status='pending' order by u.id desc`,[ids])).rows:[];
   const issues=staff?(await db.query(`select r.project_id,r.id,r.reason,r.issue_categories,r.phase_update_id,r.status,
    r.submitted_by,r.submitted_at,r.resolved_at,r.resolution_note from pending_rework_requests r
    join projects p on p.id=r.project_id and p.current_stage_id=r.project_stage_id
    where r.project_id=any($1::uuid[]) order by r.submitted_at desc,r.id desc`,[ids])).rows:[];
   const assignments=(await db.query(`select a.project_id,a.id,a.subcontractor_id,s.company_name as subcontractor_name,
    t.code as trade,a.worker_count,a.status,a.assigned_at from project_subcontractor_assignments a
    join subcontractors s on s.id=a.subcontractor_id left join trades t on t.id=a.trade_id
    where a.project_id=any($1::uuid[]) and a.status='active' order by a.assigned_at desc`,[ids])).rows;
   const contracts=staff?(await db.query("select * from contracts where project_id=any($1::uuid[])",[ids])).rows:[];
   // Read only: never create future phase checklists or substitute mutable templates.
   // One latest evidence row per activity prevents repeated approvals from double counting.
   const progress=staff?(await db.query(`with phases as (
     select project_id,project_stage_id from project_phase_team where project_id=any($1::uuid[])
     union select project_id,project_stage_id from project_phase_checklists where project_id=any($1::uuid[])
     union select id,current_stage_id from projects where id=any($1::uuid[]) and current_stage_id is not null
   ) select ph.project_id,s.id::text as id,s.code as name,w.sort_order,
     (c.project_id is not null and count(i.id) filter(where i.required)>0) as configured,
     count(i.id) filter(where i.required)::int as required,
     count(i.id) filter(where i.required and e.status='approved')::int as approved
     from phases ph join projects p on p.id=ph.project_id join project_type_stages w on w.project_type_id=p.project_type_id and w.project_stage_id=ph.project_stage_id join project_stages s on s.id=ph.project_stage_id
     left join project_phase_checklists c on c.project_id=ph.project_id and c.project_stage_id=ph.project_stage_id
     left join project_phase_checklist_items i on i.project_id=ph.project_id and i.project_stage_id=ph.project_stage_id
     left join lateral(select status from project_phase_evidence
       where checklist_item_id=i.id and project_id=i.project_id and project_stage_id=i.project_stage_id
       order by id desc limit 1)e on true
     group by ph.project_id,s.id,s.code,w.sort_order,c.project_id order by w.sort_order,s.id`,[ids])).rows:[];
   const verified = staff ? await readVerifiedProgress(db,ids) : new Map();
   // Read the same gates as automatic handoff, only for already-authorized
   // Administrator projects. Do not initialize future scope for a banner read.
   const readiness = new Map();
   if (user.role === "admin") for (const project of projects) {
    const result = await assessPhaseHandoff(db, project);
    readiness.set(project.id, { state: result.state, stageId: String(project.current_stage_id),
     reason: result.reason, reasonCode: result.reasonCode });
   }
   const grouped=[teams,documents,history,photos,notes,checklist,updates,issues,assignments,contracts,progress].map(group);
   return projects.map(p=>{
    const [phaseTeam,docs,historyRows,photoRows,noteRows,items,pending,issueRows,assigned,contractRows,progressRows]=grouped.map(rows=>rows.get(p.id)||[]);
    const list=staff?p:stripInternal(p);
    return {list,detail:{...list,phase_team:phaseTeam,...(staff?{client_accounts:(clientAccounts.get(p.id)||[]).map(({project_id,...contact})=>contact)}:{})},documents:docs,history:historyRows,photos:photoRows,notes:noteRows,
     overview:staff?{checklist:{items},pending_update:pending[0]||null,issues:issueRows}:undefined,
     assignments:assigned,contracts:contractRows,pending:null,...(user.role === "admin" ? {handoffReadiness:readiness.get(p.id)} : {}),...(staff?{verifiedProgress:verified.get(p.id),checklistProgress:progressRows.map(({id,name,configured,required,approved})=>({id,name,configured,required,approved}))}:{})};
   });
  });
  res.set("Cache-Control","private, no-store");
  return sendOk(res,"Project workspace loaded.",data.length,data);
 } catch(error){return handleError(res,error);}
}

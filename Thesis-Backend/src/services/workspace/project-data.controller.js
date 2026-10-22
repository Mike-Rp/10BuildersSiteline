
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, sendOk, handleError } from "../../common/utilities/access.utility.js";
import { LIST_SELECT, LIST_FROM, stripInternal } from "../projects/read.controller.js";

// Keep scope identical to the existing project endpoints; never accept a user ID from the browser.
const scope = `p.id in (
 select scoped.id from projects scoped where
 ($1='admin'
 or ($1='opm' and (scoped.suggested_opm_id=$2 or exists(
   select 1 from project_engineers e where e.project_id=scoped.id and e.user_id=$2 and e.unassigned_at is null)))
 or ($1='spm' and (exists(select 1 from project_phase_team t where t.project_id=scoped.id and t.spm_user_id=$2)
   or exists(select 1 from project_engineers e where e.project_id=scoped.id and e.user_id=$2 and e.unassigned_at is null)))
 or ($1 in ('opm','spm') and exists(select 1 from engineer_assignment_history h where h.project_id=scoped.id and h.user_id=$2 and h.ended_at is not null))
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
   // Initialize missing current-phase checklists in one statement, preserving existing checklists.
   if(staff)await db.query(`with created as(
    insert into project_phase_checklists(project_id,project_stage_id)
    select p.id,p.current_stage_id from projects p where p.id=any($1::uuid[])
     and p.current_stage_id is not null and exists(
      select 1 from phase_checklist_templates t where t.project_stage_id=p.current_stage_id and t.required)
    on conflict do nothing returning project_id,project_stage_id)
    insert into project_phase_checklist_items(project_id,project_stage_id,code,title,required,sort_order)
    select c.project_id,c.project_stage_id,t.code,t.title,t.required,t.sort_order from created c
    join phase_checklist_templates t on t.project_stage_id=c.project_stage_id`,[ids]);
   const teams=(await db.query(`select t.project_id,t.project_stage_id as stage_id,s.code as stage,s.sort_order,
     t.spm_user_id,u.full_name as spm_name,t.status,t.is_lead,t.response_deadline_at,t.responded_at
     from project_phase_team t join project_stages s on s.id=t.project_stage_id
     left join users u on u.id=t.spm_user_id where t.project_id=any($1::uuid[]) order by s.sort_order`,[ids])).rows;
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
   const checklist=staff?(await db.query(`select i.project_id,i.id,i.code,i.title,i.required,i.sort_order,
    coalesce(e.status,'missing') as status,e.id as evidence_id,e.file_id,e.submitted_at,e.reviewed_at,
    e.review_note,e.submitted_by,su.full_name as submitted_by_name,e.submission_note,e.phase_update_id,f.original_name,f.content_type
    from project_phase_checklist_items i join projects p on p.id=i.project_id and p.current_stage_id=i.project_stage_id
    left join lateral(select * from project_phase_evidence where checklist_item_id=i.id order by id desc limit 1)e on true
    left join project_phase_files f on f.id=e.file_id
    left join users su on su.id=e.submitted_by
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
   const grouped=[teams,documents,history,photos,notes,checklist,updates,issues,assignments,contracts].map(group);
   return projects.map(p=>{
    const [phaseTeam,docs,historyRows,photoRows,noteRows,items,pending,issueRows,assigned,contractRows]=grouped.map(rows=>rows.get(p.id)||[]);
    const list=staff?p:stripInternal(p);
    return {list,detail:{...list,phase_team:phaseTeam},documents:docs,history:historyRows,photos:photoRows,notes:noteRows,
     overview:staff?{checklist:{items},pending_update:pending[0]||null,issues:issueRows}:undefined,
     assignments:assigned,contracts:contractRows,pending:null};
   });
  });
  res.set("Cache-Control","private, no-store");
  return sendOk(res,"Project workspace loaded.",data.length,data);
 } catch(error){return handleError(res,error);}
}

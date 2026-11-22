import { HttpError, isBigintId } from "../../common/utilities/access.utility.js";
import { monitoringProject } from "../projects/intake-monitoring.utility.js";
import { stageOptions } from "./phase-update.utility.js";
import { ensureChecklist } from "./phase.utility.js";
import { phaseProgress } from "../../domain/verified-progress.js";
import { assessPhaseHandoff } from "./handoff.utility.js";
import { recordArchiveEvent } from "../archive/audit.utility.js";

export async function configureMonitoringDependencies(db, projectId) {
  const p = await monitoringProject(db,{id:projectId});
  if (!p) return;
  await db.query(`INSERT INTO project_checklist_dependencies(checklist_item_id,required_stage_id)
    SELECT i.id,envelope.id FROM project_phase_checklist_items i
    JOIN project_stages s ON s.id=i.project_stage_id
    JOIN project_types t ON t.id=$2 AND t.code='Commercial'
    JOIN project_stages envelope ON envelope.code='Envelope / Curtain Wall'
    WHERE i.project_id=$1 AND s.code IN ('MEP Rough-In','Fire & Life Safety')
      AND i.code IN ('inspection_testing','commissioning_acceptance','final_turnover')
      AND EXISTS(SELECT 1 FROM project_phase_team WHERE project_id=$1 AND project_stage_id=envelope.id)
    ON CONFLICT DO NOTHING`, [p.id,p.project_type_id]);
}

async function checklistRows(db,p,stageId) {
  return (await db.query(`SELECT i.*,r.id AS responsibility_id,r.user_id AS workspace_user_id,
    u.full_name AS workspace_name,e.id AS evidence_id,coalesce(e.status,'missing') AS status,
    e.reviewed_by,e.reviewed_at,e.review_note,e.submission_note,e.submitted_by,e.submitted_at,e.file_id,e.phase_update_id,e.rework_request_id,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.original_name,'mime',f.content_type,'size',f.byte_size,
      'label',i.title,'uploaded',true,'clientVisible',false,'owner',u.full_name,'date',f.uploaded_at::date) ORDER BY f.uploaded_at,f.id)
      FROM project_phase_evidence_files ef JOIN project_phase_files f ON f.id=ef.file_id WHERE ef.evidence_id=e.id),'[]'::jsonb) AS attachments
    FROM project_phase_checklist_items i
    LEFT JOIN project_phase_responsibilities r ON r.project_id=i.project_id AND r.project_stage_id=i.project_stage_id AND r.status<>'released'
      AND (NOT EXISTS(SELECT 1 FROM project_checklist_responsibilities a WHERE a.checklist_item_id=i.id)
       OR EXISTS(SELECT 1 FROM project_checklist_responsibilities a WHERE a.checklist_item_id=i.id AND a.responsibility_id=r.id))
    LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN LATERAL(SELECT * FROM project_phase_evidence e WHERE e.checklist_item_id=i.id AND
      (e.responsibility_id=r.id OR (e.responsibility_id IS NULL AND e.submitted_by=r.user_id)) ORDER BY id DESC LIMIT 1)e ON true
    WHERE i.project_id=$1 AND i.project_stage_id=$2 ORDER BY i.sort_order,i.id,r.id`,[p.id,stageId])).rows;
}

export async function readResponsibilityChecklist(db,p,stageId,{initialize=true,userId=null}={}) {
  if(initialize) await ensureChecklist(db,p.id,stageId,{reconcile:true});
  const rows = (await checklistRows(db,p,stageId)).filter(row=>!userId || row.workspace_user_id===userId);
  const groups = new Map();
  for(const row of rows) { const group=groups.get(String(row.id))||[];group.push(row);groups.set(String(row.id),group); }
  const rollup = [...groups.values()].map(group=>{
    const approved=group.filter(row=>row.status==='approved'&&row.reviewed_by&&row.reviewed_at&&row.responsibility_id).length;
    return {...group[0],status:approved===group.length?'approved':group.some(row=>row.status==='pending')?'pending':group.some(row=>row.status==='rejected')?'rejected':'missing',
      responsibility_totals:{approved,required:group.length}};
  });
  const required = rollup.filter(row=>row.required), approved=required.filter(row=>row.status==='approved').length;
  const onHold=(await db.query("SELECT coalesce((to_jsonb(c)->>'on_hold')::boolean,false) AS held FROM project_phase_checklists c WHERE project_id=$1 AND project_stage_id=$2",[p.id,stageId])).rows[0]?.held||false;
  const verified=phaseProgress({id:String(stageId),configured:required.length>0,activities:rollup.map(row=>({id:String(row.id),required:row.required,weight:row.weight,status:row.status,approvalValid:row.status==='approved'}))});
  const complete=required.length>0&&approved===required.length&&!onHold;
  return {configured:required.length>0,approved_count:approved,required_count:required.length,
    pct:required.length?Math.round(100*approved/required.length):0,verified:{...verified,complete},
    construction:{complete,onHold,percentage:required.length?100*approved/required.length:null},items:userId?rows:rollup};
}

async function phaseAccess(db,p,responsibility) {
  const stages=await stageOptions(db,p.project_type_id,p.id);
  const active=stages.findIndex(row=>Number(row.id)===Number(p.current_stage_id));
  const selected=stages.findIndex(row=>Number(row.id)===Number(responsibility.project_stage_id));
  const arrangement=p.inquiry_intake?.assessment?.arrangement||'Sequential phases';
  let blocker='';
  if(p.lifecycle_status!=='active') blocker='Project activation is required before uploads.';
  else if(responsibility.status!=='confirmed') blocker='Accept this phase responsibility before uploading evidence.';
  else if(responsibility.completion_status==='approved'||selected<active) blocker='This completed responsibility is read-only.';
  else if(selected<0||active<0) blocker='This responsibility is outside the confirmed project phases.';
  else if((await db.query("SELECT coalesce((to_jsonb(c)->>'on_hold')::boolean,false) AS held FROM project_phase_checklists c WHERE project_id=$1 AND project_stage_id=$2",[p.id,responsibility.project_stage_id])).rows[0]?.held) blocker='This phase is explicitly on hold.';
  const future=selected>active;
  const allowedArrangement=arrangement==='Highly concurrent phases'||(arrangement==='Partially overlapping phases'&&selected===active+1);
  let approved=false;
  if(future&&!blocker) approved=allowedArrangement&&(await db.query("SELECT 1 FROM project_parallel_upload_approvals WHERE responsibility_id=$1 AND active_stage_id=$2 AND project_id=$3",[responsibility.id,p.current_stage_id,p.id])).rowCount>0;
  return {arrangement,future,canApprove:!blocker&&future&&allowedArrangement&&!approved,
    access:blocker||future&&!approved?'locked':future?'parallel':'open',
    blocker:blocker||(future&&!approved?(allowedArrangement?'Office PM approval for parallel uploads is required.':'The configured phase arrangement does not allow uploads in this succeeding phase.'):'')};
}

async function dependencyBlocker(db,p,itemId) {
  const dependencies=(await db.query(`SELECT d.required_stage_id,s.code FROM project_checklist_dependencies d
    JOIN project_stages s ON s.id=d.required_stage_id WHERE d.checklist_item_id=$1 ORDER BY s.sort_order`,[itemId])).rows;
  for(const dependency of dependencies) {
    const checklist=await readResponsibilityChecklist(db,p,dependency.required_stage_id,{initialize:false});
    if(!checklist.construction.complete) return `Complete all required ${dependency.code} checklist approvals before submitting this item.`;
  }
  return '';
}

export async function assertOverlapSubmission(db,project,user,responsibilityId,itemId,{checkStatus=true}={}) {
  if(!isBigintId(String(responsibilityId||''))||!isBigintId(String(itemId||''))) throw new HttpError(400,'A valid responsibility_id and checklist_item_id are required.');
  // Re-read the official active stage: a caller may be operating on a succeeding stage.
  const p=(await db.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[project.id])).rows[0];
  const r=(await db.query("SELECT * FROM project_phase_responsibilities WHERE id=$1 AND project_id=$2",[responsibilityId,p.id])).rows[0];
  if(!r||user.role!=='spm'||r.user_id!==user.id) throw new HttpError(403,'Only the assigned Site PM can upload for this responsibility.');
  const access=await phaseAccess(db,p,r);
  if(access.access==='locked') throw new HttpError(409,access.blocker);
  const items=await checklistRows(db,p,r.project_stage_id);
  const item=items.find(row=>String(row.id)===String(itemId)&&String(row.responsibility_id)===String(r.id));
  if(!item||!item.required) throw new HttpError(403,'This checklist item is not applicable to your responsibility.');
  const blocker=await dependencyBlocker(db,p,item.id);
  if(blocker) throw new HttpError(409,blocker);
  if(checkStatus&&['pending','approved'].includes(item.status)) throw new HttpError(409,item.status==='pending'?'This responsibility submission is already awaiting review.':'Approved evidence cannot be overwritten.');
  return {responsibility:r,item,project:p};
}

export async function approveParallelAccess(db,p,user,input) {
  if(!await monitoringProject(db,p)) throw new HttpError(409,'Overlap monitoring is not enabled for this project.');
  if(user.role!=='opm'||p.suggested_opm_id!==user.id) throw new HttpError(403,'Only the assigned Office PM can approve parallel uploads.');
  if(String(input.expected_active_stage_id)!==String(p.current_stage_id)) throw new HttpError(409,'The active phase changed. Refresh the project before approving parallel uploads.');
  if(!isBigintId(String(input.responsibility_id||''))) throw new HttpError(400,'A valid responsibility_id is required.');
  const r=(await db.query('SELECT * FROM project_phase_responsibilities WHERE id=$1 AND project_id=$2',[input.responsibility_id,p.id])).rows[0];
  if(!r) throw new HttpError(404,'Project responsibility not found.');
  const access=await phaseAccess(db,p,r);
  const prior=(await db.query('SELECT 1 FROM project_parallel_upload_approvals WHERE responsibility_id=$1 AND active_stage_id=$2',[r.id,p.current_stage_id])).rowCount;
  if(!prior&&!access.canApprove) throw new HttpError(409,access.blocker||'This responsibility is not eligible for parallel uploads.');
  if(!prior) {
    await db.query('INSERT INTO project_parallel_upload_approvals(responsibility_id,project_id,active_stage_id,approved_by) VALUES($1,$2,$3,$4)',[r.id,p.id,p.current_stage_id,user.id]);
    await recordArchiveEvent(db,user.id,'project_phase_responsibilities',String(r.id),'parallel_upload_approved',{project_id:p.id,active_stage_id:p.current_stage_id});
  }
  return {responsibility_id:String(r.id),upload_access:'parallel',active_stage_id:String(p.current_stage_id)};
}

export async function readOverlapMonitoring(db,project,user) {
  const p=await monitoringProject(db,project);
  if(!p||user.role==='client')return undefined;
  const stages=await stageOptions(db,p.project_type_id,p.id), current=stages.findIndex(row=>Number(row.id)===Number(p.current_stage_id));
  const responsibilities=(await db.query(`SELECT r.*,u.full_name AS name FROM project_phase_responsibilities r JOIN users u ON u.id=r.user_id
    WHERE r.project_id=$1 AND r.status<>'released' ORDER BY r.id`,[p.id])).rows;
  const active=await readResponsibilityChecklist(db,p,p.current_stage_id,{initialize:false});
  const readiness=await assessPhaseHandoff(db,p);
  const canReview=user.role==='opm'&&p.suggested_opm_id===user.id;
  const canViewAll=user.role==='admin'||canReview;
  const phases=[];
  for(const [position,stage]of stages.entries()) {
    const rows=await checklistRows(db,p,stage.id), people=[];
    for(const r of responsibilities.filter(r=>Number(r.project_stage_id)===Number(stage.id)&&(canViewAll||r.user_id===user.id))) {
      const access=await phaseAccess(db,p,r), items=[];
      for(const item of rows.filter(row=>String(row.responsibility_id)===String(r.id))) {
        const blocker=access.blocker||await dependencyBlocker(db,p,item.id);
        const peers=rows.filter(row=>String(row.id)===String(item.id));
        items.push({id:String(item.id),title:item.title,status:item.status==='pending'?'submitted':item.status==='rejected'?'rework_required':item.status,
          can_submit:user.role==='spm'&&r.user_id===user.id&&!blocker&&item.required&&!['pending','approved'].includes(item.status),
          can_review:canReview&&item.status==='pending',...(blocker?{blocker}:{}),
          ...(item.evidence_id?{evidence_id:String(item.evidence_id)}:{}),review_note:item.review_note,
          responsibility_totals:{approved:peers.filter(row=>row.status==='approved'&&row.reviewed_by&&row.reviewed_at).length,required:peers.length},attachments:item.attachments});
      }
      people.push({id:String(r.id),user_id:r.user_id,name:r.name,scopes:r.assigned_disciplines,assignment_status:r.status,
        upload_access:access.access,...(access.blocker?{blocker:access.blocker}:{}),
        can_approve_parallel_uploads:canReview&&access.canApprove,items});
    }
    phases.push({name:stage.code,status:p.lifecycle_status==='archived'||position<current?'completed':position===current?'active':'upcoming',responsibilities:people});
  }
  return {version:1,arrangement:p.inquiry_intake?.assessment?.arrangement||'Sequential phases',active_checklist:{approved:active.approved_count,required:active.required_count},
    turnover:{can_confirm:canViewAll&&p.lifecycle_status==='active'&&readiness.state==='ready',stage_id:String(p.current_stage_id),...(readiness.state!=='ready'?{blocker:readiness.reason||'Project activation is required.'}:{})},phases};
}

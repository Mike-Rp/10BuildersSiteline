import { createHash } from "node:crypto";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js";
import { HttpError,requireUser,handleError,sendOk,isUuid,isBigintId,isProjectOpmOrAdmin } from "../../common/utilities/access.utility.js";
import { phaseProject,readChecklist,recordPhaseHistory } from "./phase.utility.js";
import { readVerifiedProgress } from "./verified.utility.js";
import { reworkImpact } from "../../domain/verified-progress.js";
import { optionalNote,rejectProgressInput } from "./phase-update.utility.js";

async function loadReview(db,user,id){
  if(!isUuid(id))throw new HttpError(400,"Invalid rework request id.");
  const lookup=await db.query("SELECT project_id FROM pending_rework_requests WHERE id=$1",[id]);
  if(!lookup.rowCount)throw new HttpError(404,"Rework request not found.");
  const project=await phaseProject(db,user,lookup.rows[0].project_id,{active:true});
  if(!(await isProjectOpmOrAdmin(user,project.id,db)))throw new HttpError(404,"Rework request not found.");
  const row=await db.query("SELECT * FROM pending_rework_requests WHERE id=$1 AND project_id=$2 FOR UPDATE",[id,project.id]);
  const request=row.rows[0];
  if(!request||request.status!=="pending")throw new HttpError(409,"Rework request is already resolved.");
  if(Number(request.project_stage_id)!==Number(project.current_stage_id))throw new HttpError(409,"This request is outside the current phase. Cross-phase rollback is not supported.");
  const linked=await db.query("SELECT checklist_item_id::text AS id FROM project_rework_activities WHERE request_id=$1 ORDER BY checklist_item_id",[id]);
  const checklist=await readChecklist(db,project.id,project.current_stage_id);
  return {project,request,checklist,linked:linked.rows.map(row=>row.id)};
}

async function preview(db,review,body){
  const {project,request,checklist,linked}=review;
  const selected=body.selected_activity_ids===undefined ? linked : body.selected_activity_ids;
  if(!Array.isArray(selected)||selected.some(id=>!isBigintId(id))||new Set(selected.map(String)).size!==selected.length||selected.some(id=>!linked.includes(String(id)))) {
    throw new HttpError(422,"Choose distinct activities linked to this rework request.");
  }
  const ids=selected.map(String);
  const phase={id:String(project.current_stage_id),configured:checklist.configured,activities:checklist.items.map(item=>({
    id:String(item.id),required:item.required,weight:item.weight,status:item.status,approvalValid:!!item.reviewed_by&&!!item.reviewed_at,
  }))};
  if(linked.some(id=>!phase.activities.some(item=>item.id===id)))throw new HttpError(409,"The linked activity scope changed.");
  const impact=reworkImpact([phase],[phase.id],ids);
  if(impact.reason)throw new HttpError(409,impact.reason);
  const overall=(await readVerifiedProgress(db,[project.id])).get(project.id).project;
  const withdrawn=impact.before.earned-impact.after.earned;
  const after=overall.percentage===null ? overall : {...overall,earned:overall.earned-withdrawn,percentage:(overall.earned-withdrawn)/overall.total*100};
  const before={phase:impact.before,project:overall},next={phase:impact.after,project:after};
  const activities=checklist.items.filter(item=>linked.includes(String(item.id))).map(item=>({
    id:String(item.id),label:item.title,status:item.status,evidence_id:item.evidence_id==null?null:String(item.evidence_id),required:item.required,weight:item.weight,
  }));
  const review_token=createHash("sha256").update(JSON.stringify({id:request.id,selected:ids.slice().sort(),activities,before})).digest("hex");
  return {request_id:request.id,reason:request.reason,activities,selected:ids,before,after:next,
    loss:{phase:impact.loss,project:overall.total===null?null:withdrawn/overall.total*100},review_token};
}

export async function getReworkPreview(req,res){
  try{
    const user=await requireUser(req,res,["admin","opm"]);if(!user)return;
    rejectProgressInput(req.body);
    const data=await withTransaction(async db=>preview(db,await loadReview(db,user,req.params.id),req.body||{}));
    res.set?.("Cache-Control","private, no-store");
    return sendOk(res,"Targeted rework impact retrieved.",1,data);
  }catch(error){return handleError(res,error);}
}

const resolve=confirm=>async(req,res)=>{
  try{
    const user=await requireUser(req,res,["admin","opm"]);if(!user)return;
    rejectProgressInput(req.body);
    const note=optionalNote(req.body?.resolution_note,"resolution_note");
    if(!note)throw new HttpError(400,"A resolution reason is required.");
    if(confirm&&user.role!=="opm")throw new HttpError(403,"Only the authorized Office PM can withdraw activity approval.");
    const data=await withTransaction(async db=>{
      await assertLicenseActive(user,db);
      const review=await loadReview(db,user,req.params.id);
      const {project,request,checklist}=review;
      let impact=null;
      if(confirm){
        impact=await preview(db,review,req.body||{});
        if(!impact.selected.length)throw new HttpError(422,"Select affected activities. Legacy requests without activity links must be dismissed or reported again.");
        if(req.body?.expected_review_token!==impact.review_token)throw new HttpError(409,"The activity state or progress changed. Refresh the impact preview.");
        for(const id of impact.selected){
          const item=checklist.items.find(item=>String(item.id)===id);
          // Append a zero-credit state. The original evidence/reviewer remain unchanged.
          const marker=await db.query(`INSERT INTO project_phase_evidence(project_id,project_stage_id,checklist_item_id,file_id,
            status,submitted_by,reviewed_by,reviewed_at,review_note,rework_request_id)
            VALUES($1,$2,$3,$4,'rejected',$5,$6,now(),$7,$8) RETURNING id`,
            [project.id,project.current_stage_id,id,item.file_id||null,item.submitted_by||request.submitted_by,user.id,note,request.id]);
          await db.query(`UPDATE project_rework_activities SET withdrawn_evidence_id=$3,correction_evidence_id=$4
            WHERE request_id=$1 AND checklist_item_id=$2`,[request.id,id,item.status==="approved"?item.evidence_id:null,marker.rows[0].id]);
        }
      }
      await db.query(`UPDATE pending_rework_requests SET status=$2,resolved_by=$3,resolved_at=now(),resolution_note=$4,
        updated_by=$3,updated_at=now() WHERE id=$1`,[request.id,confirm?"approved":"rejected",user.id,note]);
      const current=await readChecklist(db,project.id,project.current_stage_id);
      await recordPhaseHistory(db,project,current.pct,`${confirm?"Targeted rework confirmed":"Rework dismissed"}: ${note}`,user.id,
        {isIssue:true,entryType:"issue",updateProject:confirm});
      return {id:request.id,status:confirm?"approved":"rejected",impact};
    });
    return sendOk(res,"Rework decision recorded.",1,data);
  }catch(error){return handleError(res,error);}
};
export const approveRework=resolve(true);
export const rejectRework=resolve(false);

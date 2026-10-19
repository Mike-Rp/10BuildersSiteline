import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertEligibleManager } from "../../common/utilities/license-eligibility.utility.js";
import { HttpError,requireUser,handleError,sendOk,sendError,isUuid,isBigintId,isProjectOpmOrAdmin } from "../../common/utilities/access.utility.js";
import { phaseProject } from "../progress/phase.utility.js";
import { archiveNote,businessDeadline,recordArchiveEvent } from "./audit.utility.js";
import { maybeCloseProject,sweepArchive } from "./policy.js";

export const closeProject = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm"]);
    if(!actor) return;
    const data=await withTransaction(async db=>{
      const p=await phaseProject(db,actor,req.params.id,{active:true});
      if(!(await isProjectOpmOrAdmin(actor,p.id,db))) throw new HttpError(403,"Not responsible for this project.");
      if(!(await maybeCloseProject(db,p,actor.id))) throw new HttpError(422,"Closeout must be fully approved and all pending reviews resolved.");
      return {project_id:p.id,status:"archived"};
    });
    return sendOk(res,"Completed project archived.",1,data);
  } catch(error) { return handleError(res,error); }
};
export const requestChanges = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm"]);
    if(!actor) return;
    const reason=archiveNote(req.body?.reason,true);
    const data=await withTransaction(async db=>{
      const p=await phaseProject(db,actor,req.params.id);
      if(p.lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");
      const event=await recordArchiveEvent(db,actor.id,"projects",p.id,"changes_requested",{project_id:p.id,reason});
      await db.query("UPDATE projects SET updated_by=$2,updated_at=now() WHERE id=$1",[p.id,actor.id]);
      return {event_id:event.id,project_id:p.id,flagged_at:event.changed_at,reason};
    });
    return sendOk(res,"Changes requested.",1,data,201);
  } catch(error) { return handleError(res,error); }
};
export const resolveChanges = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin","opm"]);
    if(!actor) return;
    if(!isBigintId(req.params.eventId)) return sendError(res,"Invalid event id.",400);
    const note=archiveNote(req.body?.note,true);
    const data=await withTransaction(async db=>{
      const p=await phaseProject(db,actor,req.params.id);
      if(p.lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");
      const found=await db.query(
        `SELECT id FROM audit_log WHERE id=$1 AND table_name='projects' AND record_id=$2::text
          AND new_values->>'_archive_event'='changes_requested'`,[req.params.eventId,p.id]);
      if(!found.rowCount) throw new HttpError(404,"Changes request not found.");
      const resolved=await db.query(
        "SELECT 1 FROM audit_log WHERE new_values->>'_archive_event'='changes_resolved' AND new_values->>'request_event_id'=$1",
        [req.params.eventId]);
      if(resolved.rowCount) throw new HttpError(409,"Changes request is already resolved.");
      const event=await recordArchiveEvent(db,actor.id,"projects",p.id,"changes_resolved",{project_id:p.id,request_event_id:req.params.eventId,note});
      await db.query("UPDATE projects SET updated_by=$2,updated_at=now() WHERE id=$1",[p.id,actor.id]);
      return {project_id:p.id,request_event_id:req.params.eventId,resolved_at:event.changed_at,note};
    });
    return sendOk(res,"Changes request resolved.",1,data);
  } catch(error) { return handleError(res,error); }
};
export const archiveSuspendedAccount = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    if(!isUuid(req.params.id)) return sendError(res,"Invalid account id.",400);
    if(req.params.id===actor.id) return sendError(res,"You cannot archive your own account.",422);
    const reason=archiveNote(req.body?.reason,true);
    const data=await withTransaction(async db=>{
      const found=await db.query("SELECT id,status,is_deleted FROM users WHERE id=$1 FOR UPDATE",[req.params.id]);
      if(!found.rowCount) throw new HttpError(404,"Account not found.");
      if(found.rows[0].status!=="suspended" || found.rows[0].is_deleted) throw new HttpError(409,"Only suspended, unremoved accounts can be archived.");
      await db.query(
        "UPDATE users SET is_deleted=true,deleted_at=now(),deleted_by=$2,updated_by=$2,updated_at=now() WHERE id=$1",[req.params.id,actor.id]);
      await db.query("DELETE FROM users_token WHERE user_id=$1",[req.params.id]);
      const event=await recordArchiveEvent(db,actor.id,"users",req.params.id,"account_removed",{reason});
      return {user_id:req.params.id,status:"removed",removed_at:event.changed_at};
    });
    return sendOk(res,"Suspended account permanently archived.",1,data);
  } catch(error) { return handleError(res,error); }
};
export const reinstateAccount = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    if(!isUuid(req.params.id)) return sendError(res,"Invalid account id.",400);
    const note=archiveNote(req.body?.note);
    const data=await withTransaction(async db=>{
      const updated=await db.query(
        `UPDATE users SET status='active',updated_by=$2,updated_at=now()
          WHERE id=$1 AND status='suspended' AND COALESCE(is_deleted,false)=false RETURNING id`,[req.params.id,actor.id]);
      if(!updated.rowCount) throw new HttpError(409,"Removed accounts cannot be reinstated; select a suspended account.");
      await recordArchiveEvent(db,actor.id,"users",req.params.id,"account_reinstated",{note});
      return {user_id:req.params.id,status:"active"};
    });
    return sendOk(res,"Suspended account reinstated.",1,data);
  } catch(error) { return handleError(res,error); }
};
export const reassignPhase = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    if(!isBigintId(req.params.assignmentId) || !isUuid(req.body?.new_user_id)) return sendError(res,"Invalid assignment or new_user_id.",400);
    const note=archiveNote(req.body?.note);
    const data=await withTransaction(async db=>{
      const lookup=await db.query("SELECT project_id FROM project_phase_team WHERE id=$1",[req.params.assignmentId]);
      if(!lookup.rowCount) throw new HttpError(404,"Assignment not found.");
      const p=await phaseProject(db,actor,lookup.rows[0].project_id);
      if(p.lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");
      const found=await db.query("SELECT * FROM project_phase_team WHERE id=$1 FOR UPDATE",[req.params.assignmentId]);
      const old=found.rows[0];
      if(!["declined","auto_expired"].includes(old.status)) throw new HttpError(409,"Only declined or expired assignments can be reassigned.");
      await assertEligibleManager(db,req.body.new_user_id,"spm");
      const clock=await db.query("SELECT now() AS now");
      const deadline=businessDeadline(clock.rows[0].now);
      await db.query(
        `UPDATE project_phase_team SET spm_user_id=$2,status='pending',responded_at=NULL,
          response_deadline_at=$3,updated_by=$4,updated_at=now() WHERE id=$1`,[old.id,req.body.new_user_id,deadline,actor.id]);
      await recordArchiveEvent(db,actor.id,"project_phase_team",old.id,"phase_reassigned",{
        project_id:p.id,from_user_id:old.spm_user_id,to_user_id:req.body.new_user_id,previous_status:old.status,note,
      });
      return {assignment_id:old.id,new_user_id:req.body.new_user_id,status:"pending",response_deadline_at:deadline};
    });
    return sendOk(res,"SPM assignment reassigned; prior response retained.",1,data);
  } catch(error) { if(error.status) return sendError(res,error.message,error.status);return handleError(res,error); }
};
export const runArchiveSweep = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    const data=await withTransaction(db=>sweepArchive(db,actor.id));
    return sendOk(res,"Archive maintenance completed.",1,data);
  } catch(error) { return handleError(res,error); }
};

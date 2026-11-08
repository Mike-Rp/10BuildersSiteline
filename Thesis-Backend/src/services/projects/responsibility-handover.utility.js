import { HttpError } from '../../common/utilities/access.utility.js';
import { responsibilitiesInstalled } from './phase-responsibilities.utility.js';
import { prepareEngineerAssignments } from './engineer-commitments.utility.js';
import { recordArchiveEvent } from '../archive/audit.utility.js';

export async function assertEvidenceHandoverReady(db, row) {
  const evidence=await db.query(`SELECT 1 FROM project_phase_evidence e WHERE e.project_id=$1 AND e.project_stage_id=$2
    AND (e.submitted_by=$3 OR to_jsonb(e)->>'responsibility_id'=$4::text) LIMIT 1`,[row.project_id,row.project_stage_id,row.user_id,String(row.id)]);
  if(evidence.rowCount && !(await db.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_phase_evidence' AND column_name='responsibility_id') AS ready`)).rows[0].ready)
    throw new HttpError(409,'Apply migration 027 before handing over a workspace with submitted evidence.');
}

// The caller holds the project lock. Legacy endpoints must move the same slot
// as the workspace endpoint, rather than leaving two conflicting assignees.
export async function handoverResponsibility(db, project, stageId, fromId, toId, actorId, note, {confirmed=false}={}) {
  if(!await responsibilitiesInstalled(db))return null;
  const row=(await db.query('SELECT * FROM project_phase_responsibilities WHERE project_id=$1 AND project_stage_id=$2 AND user_id=$3 FOR UPDATE',[project.id,stageId,fromId])).rows[0];
  if(!row)return null;
  if(row.completion_status==='approved')throw new HttpError(409,'Completed responsibilities remain historical records.');
  if((await db.query('SELECT 1 FROM project_phase_responsibilities WHERE project_id=$1 AND project_stage_id=$2 AND user_id=$3',[project.id,stageId,toId])).rowCount)
    throw new HttpError(409,'That engineer already has responsibilities in this phase.');
  await assertEvidenceHandoverReady(db,row);
  const stage=(await db.query('SELECT code FROM project_stages WHERE id=$1',[stageId])).rows[0];
  await prepareEngineerAssignments(db,project.project_type_id,[{stage:stage.code,user_id:toId,assigned_disciplines:row.assigned_disciplines}],{projectId:project.id});
  await db.query(`UPDATE project_phase_responsibilities SET user_id=$2,status=$3,completion_status='unfinished',
    responded_at=CASE WHEN $3='confirmed' THEN now() ELSE NULL END,completion_note=null,completion_file_id=null,
    reviewed_by=null,reviewed_at=null,review_note=$4 WHERE id=$1`,[row.id,toId,confirmed?'confirmed':'pending',note]);
  await recordArchiveEvent(db,actorId,'project_phase_responsibilities',row.id,'replace',{project_id:project.id,previous:row,replacement:toId,note});
  return row;
}

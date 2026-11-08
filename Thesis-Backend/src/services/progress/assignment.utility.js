import { HttpError } from "../../common/utilities/access.utility.js";
import { responsibilitiesInstalled } from "../projects/phase-responsibilities.utility.js";

export async function multiSpmInstalled(db) {
  return (await db.query("select to_regclass('public.project_phase_evidence_files') is not null as ready")).rows[0].ready;
}

// The existing team row retains project Lead SPM compatibility. Responsibility
// rows are peers; no additional lead role is introduced.
export async function participantsSql(db) {
  return await responsibilitiesInstalled(db) ? `
    SELECT project_id,project_stage_id,user_id,status,completion_status,id AS responsibility_id
      FROM project_phase_responsibilities WHERE status<>'released'
    UNION ALL
    SELECT t.project_id,t.project_stage_id,t.spm_user_id,t.status,NULL::text,NULL::bigint
      FROM project_phase_team t WHERE NOT EXISTS (
        SELECT 1 FROM project_phase_responsibilities r
        WHERE r.project_id=t.project_id AND r.project_stage_id=t.project_stage_id)
  ` : `SELECT project_id,project_stage_id,spm_user_id AS user_id,status,NULL::text AS completion_status,NULL::bigint AS responsibility_id FROM project_phase_team`;
}

export async function phaseAssignments(db, projectId, stageId) {
  return (await db.query(`SELECT a.*,u.full_name AS name FROM (${await participantsSql(db)}) a
    JOIN users u ON u.id=a.user_id WHERE a.project_id=$1 AND a.project_stage_id=$2`, [projectId,stageId])).rows;
}

export async function assertAssignmentWritable(db, user, project, stageId = project.current_stage_id) {
  if (user.role !== "spm") throw new HttpError(403,"Only an assigned Site PM can submit work.");
  const current=(await db.query("SELECT current_stage_id,lifecycle_status FROM projects WHERE id=$1",[project.id])).rows[0];
  if (current?.lifecycle_status !== "active" || Number(stageId)!==Number(current.current_stage_id)) {
    throw new HttpError(409,"Only the active phase workspace accepts changes. Upcoming and completed phases are read-only.");
  }
  const assignments=await phaseAssignments(db,project.id,stageId);
  const own=assignments.find(row=>row.user_id===user.id);
  if (!own || own.status!=="confirmed") throw new HttpError(403,"You must have a confirmed assignment in this phase.");
  if (own.completion_status==="approved") throw new HttpError(409,"Your approved workspace is read-only.");
  if ((await db.query(`SELECT COALESCE((to_jsonb(c)->>'on_hold')::boolean,false) AS on_hold
    FROM project_phase_checklists c WHERE project_id=$1 AND project_stage_id=$2`,[project.id,stageId])).rows[0]?.on_hold) {
    throw new HttpError(409,"This phase is explicitly on hold.");
  }
  return own;
}

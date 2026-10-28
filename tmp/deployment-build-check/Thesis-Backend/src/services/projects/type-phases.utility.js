import { HttpError } from "../../common/utilities/access.utility.js";
import { projectWorkflowSql } from "./project-workflow.utility.js";
export async function validatePhaseTeam(db,typeId,team,{projectId,phaseNames}={}) {
 const phases=phaseNames ? phaseNames.map(code=>({code})) : projectId ?
   (await db.query(`SELECT s.code FROM (${projectWorkflowSql}) w JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_id=$1 ORDER BY w.sort_order`,[projectId])).rows :
   (await db.query("SELECT s.code FROM project_type_stages w JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_type_id=$1 ORDER BY w.sort_order",[typeId])).rows;
 const names=team.map(row=>row?.stage);
 if(!phases.length || team.length!==phases.length || new Set(names).size!==names.length ||
 phases.some((p,index)=>names[index]!==p.code))throw new HttpError(422,"Assign every phase required by the confirmed project scope, in order, with no extra phases.");
}

export async function validateScopedQualifications(db,typeId,team) {
 for (const phase of team) {
  const matched=await db.query(`SELECT 1 FROM user_discipline_scopes u
   JOIN project_stage_discipline_links l ON l.discipline_id=u.discipline_id AND l.project_type_id=$1
   JOIN project_stages s ON s.id=l.project_stage_id
   WHERE u.user_id=$2 AND s.code=$3 LIMIT 1`,[typeId,phase.user_id,phase.stage]);
  if (!matched.rowCount) throw new HttpError(422,`Select a Site PM with matching discipline qualifications for ${phase.stage}.`);
 }
}

import { HttpError } from "../../common/utilities/access.utility.js";
export async function validatePhaseTeam(db,typeId,team) {
 const phases=(await db.query("SELECT s.code FROM project_type_stages w JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_type_id=$1 ORDER BY w.sort_order",[typeId])).rows;
 const names=team.map(row=>row?.stage);
 if(!phases.length || team.length!==phases.length || new Set(names).size!==names.length ||
 phases.some(p=>!names.includes(p.code)))throw new HttpError(422,"Assign every phase required by this project type, with no extra phases.");
}

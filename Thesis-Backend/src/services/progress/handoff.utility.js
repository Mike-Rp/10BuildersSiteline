import { blockingReviews, verifiedComplete } from "./lifecycle.utility.js";
import { readChecklist, recordPhaseHistory } from "./phase.utility.js";

// Caller owns the project row lock. Expected blockers return without undoing
// the activity approval; unexpected database failures still roll back atomically.
export async function transitionPhase(db, project, actorId) {
  const blocked = (reason, code = 422) => ({ advanced: false, reason, code });
  if (await blockingReviews(db, project.id)) return blocked("Resolve pending rework, progress and subcontractor reviews before advancing this phase.", 409);
  const owner = await db.query("SELECT 1 FROM project_phase_team WHERE project_id=$1 AND project_stage_id=$2 AND status='confirmed' AND spm_user_id IS NOT NULL", [project.id, project.current_stage_id]);
  if (!owner.rowCount) return blocked("The current phase SPM must confirm their assignment before handoff.");
  const checklist = await readChecklist(db, project.id, project.current_stage_id);
  if (!verifiedComplete(checklist.verified)) return blocked("All required checklist items must be approved before advancing.");
  const next = await db.query(
    `SELECT s.id AS project_stage_id, t.status, t.spm_user_id, s.code
       FROM projects p JOIN project_type_stages w ON w.project_type_id=p.project_type_id
       JOIN project_stages s ON s.id=w.project_stage_id
       LEFT JOIN project_phase_team t ON t.project_id=p.id AND t.project_stage_id=s.id
      WHERE p.id=$1 AND w.sort_order >
        (SELECT sort_order FROM project_type_stages WHERE project_type_id=p.project_type_id AND project_stage_id=$2)
      ORDER BY w.sort_order LIMIT 1`, [project.id, project.current_stage_id]);
  if (!next.rowCount) return blocked("This is the project's final assigned phase. Existing completion checks apply.", 409);
  const phase = next.rows[0];
  if (phase.status !== "confirmed" || !phase.spm_user_id) return blocked("The next phase SPM must confirm their assignment.");
  const upcoming = await readChecklist(db, project.id, phase.project_stage_id);
  if (upcoming.verified.percentage === null) return blocked("Configure valid required scope for the next phase before advancing.");
  await db.query("UPDATE projects SET current_stage_id = $2, current_pct = $3, updated_by = $4, updated_at = now() WHERE id = $1",
    [project.id, phase.project_stage_id, upcoming.pct, actorId]);
  await recordPhaseHistory(db, { ...project, current_stage_id: phase.project_stage_id }, upcoming.pct,
    `Automatic handoff: ${project.current_stage} checklist complete. ${phase.code} activated for its confirmed Site PM.`, actorId);
  return { advanced: true, project_id: project.id, current_stage_id: phase.project_stage_id,
    current_stage: phase.code, current_pct: upcoming.pct };
}

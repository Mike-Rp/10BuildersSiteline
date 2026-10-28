import {
  HttpError, hasProjectAccess, isUuid, isSmallintId,
} from "../../common/utilities/access.utility.js";
import { phaseProgress } from "../../domain/verified-progress.js";
import { projectChecklistTemplateSql } from "./checklist-template.utility.js";
import { markPhaseCompleted } from "../licenses/history.js";
import { constructionPhaseProgress } from "../../domain/construction-phase-progress.js";
import { projectWorkflowSql } from "../projects/project-workflow.utility.js";

export const checklistPct = (approved, required) => {
  if (!Number.isInteger(approved) || !Number.isInteger(required) ||
      approved < 0 || required < 0 || approved > required) throw new Error("Invalid checklist counts.");
  return required === 0 ? 0 : Math.round(approved * 100 / required);
};

export async function phaseProject(client, user, projectId, { active = false } = {}) {
  if (!isUuid(projectId)) throw new HttpError(400, "Invalid project id.");
  const found = await client.query(
    `SELECT p.*, s.code AS current_stage
       FROM projects p LEFT JOIN project_stages s ON s.id = p.current_stage_id
      WHERE p.id = $1 AND COALESCE(p.is_deleted, false) = false FOR UPDATE OF p`, [projectId]);
  if (!found.rowCount || !(await hasProjectAccess(user, projectId, client))) throw new HttpError(404, "Project not found.");
  const p = found.rows[0];
  if (active && p.lifecycle_status !== "active") throw new HttpError(422, "An active project is required.");
  return p;
}

export async function isProjectSpm(client, user, project) {
  if (user.role !== "spm") return false;
  const assigned = await client.query(
    `SELECT 1 FROM project_phase_team
      WHERE project_id = $1 AND spm_user_id = $2 AND status = 'confirmed'
      UNION ALL
      SELECT 1 FROM project_engineers WHERE project_id = $1 AND user_id = $2 AND unassigned_at IS NULL`,
    [project.id, user.id]);
  return assigned.rowCount > 0;
}
export async function assertProjectSpm(client, user, project) {
  if (!(await isProjectSpm(client, user, project))) throw new HttpError(403, "You must be a confirmed or assigned SPM on this project.");
}
// Compatibility for older callers: authorization is now at project level.
export async function assertPhaseOwner(client, user, project, requestedStage = project.current_stage_id) {
  if (!isSmallintId(requestedStage)) throw new HttpError(400, "Invalid stage_id.");
  await assertProjectSpm(client, user, project);
}

export async function assertPhaseUnlocked(client, project, stageId) {
  const result = await client.query(`SELECT selected.sort_order > current.sort_order AS locked,
    COALESCE((to_jsonb(c)->>'on_hold')::boolean,false) AS on_hold
    FROM projects p
    JOIN (${projectWorkflowSql}) current ON current.project_id=p.id AND current.project_stage_id=p.current_stage_id
    JOIN (${projectWorkflowSql}) selected ON selected.project_id=p.id AND selected.project_stage_id=$2
    LEFT JOIN project_phase_checklists c ON c.project_id=p.id AND c.project_stage_id=$2
    WHERE p.id=$1`, [project.id,stageId]);
  if (!result.rowCount || result.rows[0].locked) throw new HttpError(422, "This phase is locked until prior required evidence is approved and handoff is complete.");
  if (result.rows[0].on_hold) throw new HttpError(422, "This phase is explicitly on hold.");
}

export async function ensureChecklist(client, projectId, stageId, { reconcile = false } = {}) {
  if (!stageId) return;
  await client.query("SELECT id FROM project_stages WHERE id = $1 FOR SHARE", [stageId]);
  const initialized = await client.query(
    `INSERT INTO project_phase_checklists (project_id, project_stage_id)
     SELECT $1, $2 WHERE EXISTS (
       SELECT 1 FROM (${projectChecklistTemplateSql}) template WHERE required = true)
     ON CONFLICT DO NOTHING RETURNING project_id`, [projectId, stageId]);
  // Append existing standard requirements to legacy snapshots. Never rename,
  // retire or delete saved requirements, evidence, approvals or history.
  if (initialized.rowCount || reconcile) await client.query(
      `WITH added AS (INSERT INTO project_phase_checklist_items
         (project_id, project_stage_id, code, title, required, sort_order, weight)
       SELECT $1, project_stage_id, code, title, required, sort_order, weight
         FROM (${projectChecklistTemplateSql}) template
       ON CONFLICT (project_id, project_stage_id, code) DO UPDATE SET required=true
         WHERE project_phase_checklist_items.required=false AND EXCLUDED.required=true
       RETURNING id)
       INSERT INTO audit_log(table_name,record_id,operation,new_values)
       SELECT 'project_phase_checklists',$1::text||':'||$2::text,'UPDATE',
         jsonb_build_object('_checklist_scope_extension','standard-4-3-4', 'activity_ids',jsonb_agg(id))
       FROM added HAVING count(*)>0`, [projectId, stageId]);
}

export async function readChecklist(client, projectId, stageId, { initialize = true } = {}) {
  if (initialize) await ensureChecklist(client, projectId, stageId, { reconcile: true });
  const result = await client.query(
    `SELECT i.id, i.code, i.title, i.required, i.sort_order, i.weight,
            CASE WHEN e.status='rejected' AND e.rework_request_id IS NOT NULL THEN 'rework_required' ELSE COALESCE(e.status,'missing') END AS status,
            e.id AS evidence_id, e.file_id, e.submitted_at, e.reviewed_at, e.review_note, e.reviewed_by,
            e.submitted_by, su.full_name AS submitted_by_name, e.submission_note, e.phase_update_id,e.rework_request_id,r.resolution_note AS rework_reason, f.original_name, f.content_type
       FROM project_phase_checklist_items i
       LEFT JOIN LATERAL (
         SELECT * FROM project_phase_evidence WHERE checklist_item_id = i.id ORDER BY id DESC LIMIT 1
       ) e ON true
       LEFT JOIN pending_rework_requests r ON r.id=e.rework_request_id
       LEFT JOIN project_phase_files f ON f.id=e.file_id
       LEFT JOIN users su ON su.id=e.submitted_by
      WHERE i.project_id = $1 AND i.project_stage_id = $2 ORDER BY i.sort_order, i.id`, [projectId, stageId]);
  const required = result.rows.filter(i => i.required);
  const approved = required.filter(i => i.status === "approved" && i.reviewed_by && i.reviewed_at).length;
  const scope = await client.query(`SELECT w.project_stage_id,
    COALESCE((to_jsonb(c)->>'on_hold')::boolean,false) AS on_hold
    FROM projects p JOIN (${projectWorkflowSql}) w ON w.project_id=p.id
    LEFT JOIN project_phase_checklists c ON c.project_id=p.id AND c.project_stage_id=w.project_stage_id
    WHERE p.id=$1 ORDER BY w.sort_order`, [projectId]);
  const position = scope.rows.findIndex(row => Number(row.project_stage_id) === Number(stageId));
  const construction = constructionPhaseProgress(position, scope.rows.length,
    result.rows.map(item => ({ ...item, approvalValid: !!item.reviewed_by && !!item.reviewed_at })),
    { onHold: scope.rows[position]?.on_hold === true });
  return { configured: required.length > 0, approved_count: approved, required_count: required.length,
    construction,
    verified: { ...phaseProgress({ id: String(stageId), configured: required.length > 0,
      activities: result.rows.map(item => ({ id: String(item.id), required: item.required, weight: item.weight,
        status: item.status, approvalValid: !!item.reviewed_by && !!item.reviewed_at })) }), complete: construction.complete },
    pct: checklistPct(approved, required.length), items: result.rows };
}

export async function recordPhaseHistory(client, project, pct, note, userId, options = {}) {
  const { isIssue = false, issueCategories = [], entryType = "update", updateProject = true } = options;
  const result = await client.query(
    `INSERT INTO project_progress_history
       (project_id, project_stage_id, pct, note, is_issue, is_client_visible,
        recorded_by, recorded_at, created_by, updated_by, issue_categories, entry_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $7, $7, $8, $9) RETURNING id, recorded_at`,
    [project.id, project.current_stage_id, pct, note, isIssue, !isIssue, userId, issueCategories, entryType]);
  // A phase that reaches 100% is credited to whoever holds it (and to the engineer who took it over).
  if (Number(pct) === 100) await markPhaseCompleted(client, project.id, project.current_stage_id);
  if (updateProject) {
    // Reviewing an older stage must not overwrite the current stage's cached percentage.
    await client.query(
      `UPDATE projects SET current_pct = $2, updated_by = $3, updated_at = now()
        WHERE id = $1 AND current_stage_id = $4`, [project.id, pct, userId, project.current_stage_id]);
  }
  return result.rows[0];
}

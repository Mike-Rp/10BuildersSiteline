import {
  HttpError, hasProjectAccess, isUuid, isSmallintId,
} from "../../common/utilities/access.utility.js";
import { phaseProgress } from "../../domain/verified-progress.js";

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

export async function ensureChecklist(client, projectId, stageId) {
  if (!stageId) return;
  await client.query("SELECT id FROM project_stages WHERE id = $1 FOR SHARE", [stageId]);
  const initialized = await client.query(
    `INSERT INTO project_phase_checklists (project_id, project_stage_id)
     SELECT $1, $2 WHERE EXISTS (
       SELECT 1 FROM phase_checklist_templates WHERE project_stage_id = $2 AND required = true)
     ON CONFLICT DO NOTHING RETURNING project_id`, [projectId, stageId]);
  if (initialized.rowCount) {
    await client.query(
      `INSERT INTO project_phase_checklist_items
         (project_id, project_stage_id, code, title, required, sort_order, weight)
       SELECT $1, project_stage_id, code, title, required, sort_order, weight
         FROM phase_checklist_templates WHERE project_stage_id = $2`, [projectId, stageId]);
  }
}

export async function readChecklist(client, projectId, stageId) {
  await ensureChecklist(client, projectId, stageId);
  const result = await client.query(
    `SELECT i.id, i.code, i.title, i.required, i.sort_order, i.weight,
            COALESCE(e.status, 'missing') AS status,
            e.id AS evidence_id, e.file_id, e.submitted_at, e.reviewed_at, e.review_note, e.reviewed_by,
            e.submitted_by, e.submission_note, e.phase_update_id,e.rework_request_id,r.resolution_note AS rework_reason, f.original_name, f.content_type
       FROM project_phase_checklist_items i
       LEFT JOIN LATERAL (
         SELECT * FROM project_phase_evidence WHERE checklist_item_id = i.id ORDER BY id DESC LIMIT 1
       ) e ON true
       LEFT JOIN pending_rework_requests r ON r.id=e.rework_request_id
       LEFT JOIN project_phase_files f ON f.id=e.file_id
      WHERE i.project_id = $1 AND i.project_stage_id = $2 ORDER BY i.sort_order, i.id`, [projectId, stageId]);
  const required = result.rows.filter(i => i.required);
  const approved = required.filter(i => i.status === "approved").length;
  return { configured: required.length > 0, approved_count: approved, required_count: required.length,
    verified: phaseProgress({ id: String(stageId), configured: required.length > 0,
      activities: result.rows.map(item => ({ id: String(item.id), required: item.required, weight: item.weight,
        status: item.status, approvalValid: !!item.reviewed_by && !!item.reviewed_at })) }),
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
  if (updateProject) {
    // Reviewing an older stage must not overwrite the current stage's cached percentage.
    await client.query(
      `UPDATE projects SET current_pct = $2, updated_by = $3, updated_at = now()
        WHERE id = $1 AND current_stage_id = $4`, [project.id, pct, userId, project.current_stage_id]);
  }
  return result.rows[0];
}

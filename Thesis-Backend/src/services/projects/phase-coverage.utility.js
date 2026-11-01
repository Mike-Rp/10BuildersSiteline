import { HttpError } from "../../common/utilities/access.utility.js";

// Pure check: every required phase has exactly one row with a valid engineer that is confirmed.
// `required` comes only from the authoritative workflow; `rows` are the saved assignment rows.
export function evaluatePhaseCoverage(required, rows) {
  const result = { ok: false, missing: [], unassigned: [], unconfirmed: [], duplicate: [], extra: [] };
  if (!Array.isArray(required) || !required.length) return { ...result, unresolved: true };
  const byStage = new Map();
  for (const row of rows || []) {
    const key = String(row.project_stage_id);
    byStage.set(key, [...(byStage.get(key) || []), row]);
  }
  const requiredIds = new Set(required.map(p => String(p.project_stage_id)));
  for (const phase of required) {
    const found = byStage.get(String(phase.project_stage_id)) || [];
    if (!found.length) result.missing.push(phase.code);
    else if (found.length > 1) result.duplicate.push(phase.code);
    else if (!found[0].spm_user_id || !found[0].engineer_valid) result.unassigned.push(phase.code);
    else if (found[0].status !== "confirmed") result.unconfirmed.push(phase.code);
  }
  for (const [key, found] of byStage) if (!requiredIds.has(key)) result.extra.push(found[0].stage_code || key);
  result.ok = !result.missing.length && !result.unassigned.length && !result.unconfirmed.length && !result.duplicate.length && !result.extra.length;
  return result;
}

export function phaseCoverageMessage(c) {
  if (c.unresolved) return "The project workflow could not be resolved, so the project cannot be activated.";
  const parts = [["Missing assignments", c.missing], ["Unassigned or ineligible engineer", c.unassigned],
    ["Awaiting confirmation", c.unconfirmed], ["Duplicate assignments", c.duplicate], ["Not part of this workflow", c.extra]]
    .filter(([, list]) => list.length).map(([label, list]) => `${label}: ${list.join(", ")}`);
  return `Every required phase needs one confirmed Site PM before activation. ${parts.join(". ")}.`;
}

// Loads the authoritative workflow for the project's type and locks its assignment rows.
// Callers must already hold the project row lock (SELECT ... FOR UPDATE) in the same transaction.
export async function loadPhaseCoverage(db, projectId) {
  const required = (await db.query(`SELECT w.project_stage_id,s.code,w.sort_order FROM projects p
    JOIN project_type_stages w ON w.project_type_id=p.project_type_id JOIN project_stages s ON s.id=w.project_stage_id
    WHERE p.id=$1 ORDER BY w.sort_order`, [projectId])).rows;
  const rows = (await db.query(`SELECT t.project_stage_id,s.code AS stage_code,t.spm_user_id,t.status,
    (u.id IS NOT NULL AND r.code='spm' AND u.status='active' AND NOT COALESCE(u.is_deleted,false)) AS engineer_valid
    FROM project_phase_team t JOIN project_stages s ON s.id=t.project_stage_id
    LEFT JOIN users u ON u.id=t.spm_user_id LEFT JOIN roles r ON r.id=u.role_id
    WHERE t.project_id=$1 FOR UPDATE OF t`, [projectId])).rows;
  return evaluatePhaseCoverage(required, rows);
}

export async function assertPhaseCoverage(db, projectId) {
  const coverage = await loadPhaseCoverage(db, projectId);
  if (!coverage.ok) throw new HttpError(409, phaseCoverageMessage(coverage));
  return coverage;
}

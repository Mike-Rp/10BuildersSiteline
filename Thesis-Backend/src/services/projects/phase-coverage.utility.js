import { HttpError } from "../../common/utilities/access.utility.js";
import { projectWorkflowSql } from "./project-workflow.utility.js";
import { LICENSE_ELIGIBILITY_SQL } from "../../common/utilities/license-eligibility.utility.js";
import {responsibilitiesInstalled} from './phase-responsibilities.utility.js';
import { MAX_ENGINEERS_PER_PHASE, phaseCoverageQuota } from "../../domain/engineer-phase-coverage.js";

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

// Loads the authoritative workflow (validated project scope, else the type workflow) and locks assignment rows.
// Callers must already hold the project row lock (SELECT ... FOR UPDATE) in the same transaction.
export async function loadPhaseCoverage(db, projectId) {
  const resolved = (await db.query(`SELECT w.project_stage_id,s.code,w.sort_order FROM (${projectWorkflowSql}) w
    JOIN project_stages s ON s.id=w.project_stage_id WHERE w.project_id=$1 ORDER BY w.sort_order`, [projectId])).rows;
  // Phase names that do not resolve to a stage, or repeat, would silently shorten the list: fail closed instead.
  const expected = (await db.query(`SELECT jsonb_array_length(COALESCE(to_jsonb(p)->'phase_scope'->'phases',
    (SELECT jsonb_agg(w.project_stage_id) FROM project_type_stages w WHERE w.project_type_id=p.project_type_id),'[]'::jsonb)) AS n
    FROM projects p WHERE p.id=$1`, [projectId])).rows[0]?.n;
  const consistent = resolved.length === Number(expected) && new Set(resolved.map(p => String(p.project_stage_id))).size === resolved.length;
  const required = consistent ? resolved : [];
  const rows = (await db.query(`SELECT t.project_stage_id,s.code AS stage_code,t.spm_user_id,t.status,
    (u.id IS NOT NULL AND r.code='spm' AND u.status='active' AND NOT COALESCE(u.is_deleted,false)
      AND ${LICENSE_ELIGIBILITY_SQL}) AS engineer_valid
    FROM project_phase_team t JOIN project_stages s ON s.id=t.project_stage_id
    LEFT JOIN users u ON u.id=t.spm_user_id LEFT JOIN roles r ON r.id=u.role_id
    WHERE t.project_id=$1 FOR UPDATE OF t`, [projectId])).rows;
  const result=evaluatePhaseCoverage(required, rows);
  if(await responsibilitiesInstalled(db)) {
   const responsibilities=(await db.query(`select assignment.*,s.code,(u.status='active' and not coalesce(u.is_deleted,false) and ${LICENSE_ELIGIBILITY_SQL} and not exists(select 1 from unnest(assignment.assigned_disciplines) tag where not exists(select 1 from engineer_qualified_scopes q join disciplines d on d.id=q.discipline_id where q.user_id=u.id and d.code=tag))) as engineer_valid from project_phase_responsibilities assignment join project_stages s on s.id=assignment.project_stage_id join users u on u.id=assignment.user_id where assignment.project_id=$1 for update of assignment`,[projectId])).rows;
   if(responsibilities.length)for(const phase of required) {
    const assigned=responsibilities.filter(r=>String(r.project_stage_id)===String(phase.project_stage_id));
    const requiredTags=(await db.query('select d.code from projects p join project_stage_discipline_links l on l.project_type_id=p.project_type_id join disciplines d on d.id=l.discipline_id where p.id=$1 and l.project_stage_id=$2',[projectId,phase.project_stage_id])).rows.map(r=>r.code);
    const coveredTags = new Set(assigned.filter(r=>r.status==='confirmed'&&r.engineer_valid).flatMap(r=>r.assigned_disciplines||[]));
    const quota = phaseCoverageQuota(requiredTags);
    if(!assigned.length || assigned.length > MAX_ENGINEERS_PER_PHASE || assigned.some(r=>r.status!=='confirmed'||!r.engineer_valid) || requiredTags.filter(tag=>coveredTags.has(tag)).length < quota) {result.ok=false;result.unconfirmed.push(phase.code+' specialization responsibilities');}
   }
  }
  return result;
}

export async function assertPhaseCoverage(db, projectId) {
  const coverage = await loadPhaseCoverage(db, projectId);
  if (!coverage.ok) throw new HttpError(409, phaseCoverageMessage(coverage));
  return coverage;
}

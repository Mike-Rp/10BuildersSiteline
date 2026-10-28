import { phaseProgress, projectProgress } from "../../domain/verified-progress.js";
import { ensureChecklist } from "./phase.utility.js";
import { constructionPhaseProgress } from "../../domain/construction-phase-progress.js";
import { projectWorkflowSql } from "../projects/project-workflow.utility.js";

// Called at activation, under the existing project transaction/lock. Existing snapshots
// are never replaced; all newly activated phases are frozen before template edits.
export async function snapshotProjectChecklists(db, projectId) {
  const stages = await db.query(`SELECT w.project_stage_id FROM projects p
    JOIN (${projectWorkflowSql}) w ON w.project_id=p.id WHERE p.id=$1 ORDER BY w.sort_order`, [projectId]);
  for (const stage of stages.rows) await ensureChecklist(db, projectId, stage.project_stage_id);
}

// Read only, over the entire authorized project set, not a paginated evidence list.
// Missing snapshots stay missing: live templates are never used as a denominator.
export async function readVerifiedProgress(db, projectIds) {
  if (!projectIds.length) return new Map();
  const { rows } = await db.query(`WITH workflow AS (
    SELECT project_id,project_type_id,project_stage_id,sort_order,
      row_number() OVER(PARTITION BY project_id ORDER BY sort_order)-1 AS position,
      count(*) OVER(PARTITION BY project_id) AS phase_count FROM (${projectWorkflowSql}) effective
      WHERE project_id=ANY($1::uuid[])
  ), phases AS (
    SELECT project_id,project_stage_id FROM workflow
    UNION SELECT project_id,project_stage_id FROM project_phase_team WHERE project_id=ANY($1::uuid[])
    UNION SELECT project_id,project_stage_id FROM project_phase_checklists WHERE project_id=ANY($1::uuid[])
    UNION SELECT id,current_stage_id FROM projects WHERE id=ANY($1::uuid[]) AND current_stage_id IS NOT NULL
  ) SELECT ph.project_id,s.id::text AS phase_id,s.code AS name,
    w.project_stage_id IS NOT NULL AS expected,
    c.project_id IS NOT NULL AS configured,i.id::text AS activity_id,i.code,i.required,i.weight,
    w.position::int,w.phase_count::int,
    (SELECT position FROM workflow WHERE project_id=p.id AND project_stage_id=p.current_stage_id)::int AS current_position,
    COALESCE((to_jsonb(c)->>'on_hold')::boolean,false) AS on_hold,
    (EXISTS(SELECT 1 FROM project_phase_files f WHERE f.project_id=ph.project_id AND f.project_stage_id=ph.project_stage_id)
      OR EXISTS(SELECT 1 FROM project_phase_updates u WHERE u.project_id=ph.project_id AND u.selected_stage_id=ph.project_stage_id)
      OR EXISTS(SELECT 1 FROM project_progress_history h WHERE h.project_id=ph.project_id AND h.project_stage_id=ph.project_stage_id AND h.pct>0)) AS started,
    COALESCE(e.status,'missing') AS status,
    (e.status='approved' AND e.reviewed_by IS NOT NULL AND e.reviewed_at IS NOT NULL) AS approval_valid
    FROM phases ph JOIN projects p ON p.id=ph.project_id JOIN project_stages s ON s.id=ph.project_stage_id
    LEFT JOIN workflow w ON w.project_id=p.id AND w.project_stage_id=ph.project_stage_id
    LEFT JOIN project_phase_checklists c ON c.project_id=ph.project_id AND c.project_stage_id=ph.project_stage_id
    LEFT JOIN project_phase_checklist_items i ON i.project_id=ph.project_id AND i.project_stage_id=ph.project_stage_id
    LEFT JOIN LATERAL(SELECT status,reviewed_by,reviewed_at FROM project_phase_evidence
      WHERE checklist_item_id=i.id AND project_id=i.project_id AND project_stage_id=i.project_stage_id
      ORDER BY id DESC LIMIT 1)e ON true
    ORDER BY ph.project_id,COALESCE(w.sort_order,s.sort_order),s.id,i.sort_order,i.id`, [projectIds]);
  const grouped = new Map(projectIds.map(id => [id, new Map()]));
  for (const row of rows) {
    const phases = grouped.get(row.project_id);
    if (!phases.has(row.phase_id)) phases.set(row.phase_id, {
      id: row.phase_id, name: row.name, expected: row.expected, configured: row.configured, activities: [],
      position: row.position, count: row.phase_count, onHold: row.on_hold, started: row.started,
      currentPosition: row.current_position,
    });
    if (row.activity_id) phases.get(row.phase_id).activities.push({
      id: row.activity_id, code: row.code, required: row.required, weight: row.weight,
      status: row.status, approvalValid: row.approval_valid === true,
    });
  }
  return new Map([...grouped].map(([id, byPhase]) => {
    const phases = [...byPhase.values()];
    const construction = phases.filter(phase => phase.expected).map(phase => ({
      id: phase.id, name: phase.name, configured: true,
      ...constructionPhaseProgress(phase.position, phase.count, phase.activities, phase),
      locked: phase.position > (phase.currentPosition ?? 0),
    }));
    return [id, {
      project: { ...projectProgress(phases, phases.filter(phase => phase.expected).map(phase => phase.id)),
        complete: construction.length > 0 && construction.every(phase => phase.complete) },
      phases: phases.map(phase => ({ id: phase.id, name: phase.name, ...phaseProgress(phase),
        complete: construction.find(row => row.id === phase.id)?.complete ?? false })),
      construction,
    }];
  }));
}

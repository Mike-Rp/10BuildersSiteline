import { phaseProgress, projectProgress } from "../../domain/verified-progress.js";
import { ensureChecklist } from "./phase.utility.js";

// Called at activation, under the existing project transaction/lock. Existing snapshots
// are never replaced; all newly activated phases are frozen before template edits.
export async function snapshotProjectChecklists(db, projectId) {
  const stages = await db.query("SELECT project_stage_id FROM project_phase_team WHERE project_id=$1 ORDER BY project_stage_id", [projectId]);
  for (const stage of stages.rows) await ensureChecklist(db, projectId, stage.project_stage_id);
}

// Read only, over the entire authorized project set, not a paginated evidence list.
// Missing snapshots stay missing: live templates are never used as a denominator.
export async function readVerifiedProgress(db, projectIds) {
  if (!projectIds.length) return new Map();
  const { rows } = await db.query(`WITH phases AS (
    SELECT project_id,project_stage_id FROM project_phase_team WHERE project_id=ANY($1::uuid[])
    UNION SELECT project_id,project_stage_id FROM project_phase_checklists WHERE project_id=ANY($1::uuid[])
    UNION SELECT id,current_stage_id FROM projects WHERE id=ANY($1::uuid[]) AND current_stage_id IS NOT NULL
  ) SELECT ph.project_id,s.id::text AS phase_id,s.code AS name,
    EXISTS(SELECT 1 FROM project_phase_team t WHERE t.project_id=ph.project_id AND t.project_stage_id=ph.project_stage_id) AS expected,
    c.project_id IS NOT NULL AS configured,i.id::text AS activity_id,i.required,i.weight,
    COALESCE(e.status,'missing') AS status,
    (e.status='approved' AND e.reviewed_by IS NOT NULL AND e.reviewed_at IS NOT NULL) AS approval_valid
    FROM phases ph JOIN project_stages s ON s.id=ph.project_stage_id
    LEFT JOIN project_phase_checklists c ON c.project_id=ph.project_id AND c.project_stage_id=ph.project_stage_id
    LEFT JOIN project_phase_checklist_items i ON i.project_id=ph.project_id AND i.project_stage_id=ph.project_stage_id
    LEFT JOIN LATERAL(SELECT status,reviewed_by,reviewed_at FROM project_phase_evidence
      WHERE checklist_item_id=i.id AND project_id=i.project_id AND project_stage_id=i.project_stage_id
      ORDER BY id DESC LIMIT 1)e ON true
    ORDER BY ph.project_id,s.sort_order,s.id,i.sort_order,i.id`, [projectIds]);
  const grouped = new Map(projectIds.map(id => [id, new Map()]));
  for (const row of rows) {
    const phases = grouped.get(row.project_id);
    if (!phases.has(row.phase_id)) phases.set(row.phase_id, {
      id: row.phase_id, name: row.name, expected: row.expected, configured: row.configured, activities: [],
    });
    if (row.activity_id) phases.get(row.phase_id).activities.push({
      id: row.activity_id, required: row.required, weight: row.weight,
      status: row.status, approvalValid: row.approval_valid === true,
    });
  }
  return new Map([...grouped].map(([id, byPhase]) => {
    const phases = [...byPhase.values()];
    return [id, {
      project: projectProgress(phases, phases.filter(phase => phase.expected).map(phase => phase.id)),
      phases: phases.map(phase => ({ id: phase.id, name: phase.name, ...phaseProgress(phase) })),
    }];
  }));
}

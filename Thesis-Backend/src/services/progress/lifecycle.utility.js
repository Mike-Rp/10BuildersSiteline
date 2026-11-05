// All callers hold the project row lock for the surrounding transaction.
export async function blockingReviews(db, projectId) {
  const pending = await db.query(
    `SELECT 1 FROM project_phase_updates WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_rework_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_subcontractor_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM project_phase_evidence e JOIN project_phase_checklist_items i
       ON i.id=e.checklist_item_id AND i.project_id=e.project_id AND i.project_stage_id=e.project_stage_id
     WHERE e.project_id=$1 AND i.required
       AND (e.status IN ('pending','rework_required') OR (e.status='rejected' AND e.rework_request_id IS NOT NULL)) AND NOT EXISTS (
         SELECT 1 FROM project_phase_evidence newer WHERE newer.checklist_item_id=e.checklist_item_id AND newer.id>e.id)
     LIMIT 1`, [projectId]);
  return pending.rowCount > 0;
}

// Batch form of blockingReviews: the ids, among projectIds, that have at least one blocking review.
export async function blockedByReviews(db, projectIds) {
  if (!projectIds.length) return new Set();
  const pending = await db.query(
    `SELECT project_id FROM project_phase_updates WHERE project_id=ANY($1::uuid[]) AND status='pending'
     UNION SELECT project_id FROM pending_rework_requests WHERE project_id=ANY($1::uuid[]) AND status='pending'
     UNION SELECT project_id FROM pending_subcontractor_requests WHERE project_id=ANY($1::uuid[]) AND status='pending'
     UNION SELECT e.project_id FROM project_phase_evidence e JOIN project_phase_checklist_items i
       ON i.id=e.checklist_item_id AND i.project_id=e.project_id AND i.project_stage_id=e.project_stage_id
     WHERE e.project_id=ANY($1::uuid[]) AND i.required
       AND (e.status IN ('pending','rework_required') OR (e.status='rejected' AND e.rework_request_id IS NOT NULL)) AND NOT EXISTS (
         SELECT 1 FROM project_phase_evidence newer WHERE newer.checklist_item_id=e.checklist_item_id AND newer.id>e.id)`, [projectIds]);
  return new Set(pending.rows.map(row => row.project_id));
}

export const verifiedComplete = totals => !!totals && totals.total > 0 &&
  totals.percentage === 100 && totals.earned === totals.total;

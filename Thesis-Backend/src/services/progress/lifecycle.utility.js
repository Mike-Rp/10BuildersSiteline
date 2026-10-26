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

export const verifiedComplete = totals => !!totals && totals.complete !== false && totals.total > 0 &&
  totals.percentage === 100 && totals.earned === totals.total;

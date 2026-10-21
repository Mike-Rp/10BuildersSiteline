// All callers hold the project row lock for the surrounding transaction.
export async function blockingReviews(db, projectId) {
  const pending = await db.query(
    `SELECT 1 FROM project_phase_updates WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_rework_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_subcontractor_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM project_phase_evidence e WHERE e.project_id=$1
       AND e.status IN ('pending','rework_required') AND NOT EXISTS (
         SELECT 1 FROM project_phase_evidence newer WHERE newer.checklist_item_id=e.checklist_item_id AND newer.id>e.id)
     LIMIT 1`, [projectId]);
  return pending.rowCount > 0;
}

export const verifiedComplete = totals => !!totals && totals.total > 0 &&
  totals.percentage === 100 && totals.earned === totals.total;

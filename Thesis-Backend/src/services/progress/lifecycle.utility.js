// All callers hold the project row lock for the surrounding transaction.
import {responsibilitiesInstalled} from '../projects/phase-responsibilities.utility.js';
export async function unfinishedPhaseResponsibilities(db, projectId, stageId) {
  if (!await responsibilitiesInstalled(db)) return false;
  const result = await db.query(
    `SELECT 1 FROM project_phase_responsibilities
     WHERE project_id=$1 AND project_stage_id=$2 AND status<>'released'
       AND (status<>'confirmed' OR completion_status<>'approved') LIMIT 1`, [projectId, stageId]);
  return result.rowCount > 0;
}

export async function blockingReviews(db, projectId) {
  const pending = await db.query(
    `SELECT 1 FROM project_phase_updates WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_rework_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_subcontractor_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM project_phase_evidence e JOIN project_phase_checklist_items i
       ON i.id=e.checklist_item_id AND i.project_id=e.project_id AND i.project_stage_id=e.project_stage_id
     WHERE e.project_id=$1 AND i.required
       AND (e.status='pending' OR ((e.status='rework_required' OR (e.status='rejected' AND e.rework_request_id IS NOT NULL)) AND NOT EXISTS (
         SELECT 1 FROM project_phase_evidence newer WHERE newer.checklist_item_id=e.checklist_item_id AND newer.id>e.id AND
         (newer.submitted_by=e.submitted_by OR (to_jsonb(newer)->>'responsibility_id' IS NOT NULL AND to_jsonb(newer)->>'responsibility_id'=to_jsonb(e)->>'responsibility_id')))))
     LIMIT 1`, [projectId]);
  return pending.rowCount > 0;
}

export const verifiedComplete = totals => !!totals && totals.complete !== false && totals.total > 0 &&
  totals.percentage === 100 && totals.earned === totals.total;

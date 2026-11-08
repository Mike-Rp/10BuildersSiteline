import { multiSpmInstalled } from './assignment.utility.js';

// The caller supplies only authorized project IDs. Assignment changes and
// account deactivation must never remove submissions from this review/history.
export async function readEvidenceQueue(db, projectIds, { pendingOnly = true } = {}) {
  if (!projectIds.length) return [];
  const attachments = await multiSpmInstalled(db);
  return (await db.query(`SELECT i.*,s.code AS stage_code,e.id AS evidence_id,
    e.status,e.file_id,e.submitted_by,e.submitted_at,e.submission_note,e.reviewed_by,e.reviewed_at,e.review_note,
    e.phase_update_id,e.rework_request_id,u.full_name AS submitted_by_name,
    f.original_name,f.content_type,
    ${attachments ? `(SELECT coalesce(jsonb_agg(jsonb_build_object('id',af.id,'original_name',af.original_name,'content_type',af.content_type,'uploaded_by',af.uploaded_by,'uploaded_at',af.uploaded_at) ORDER BY af.uploaded_at,af.id),'[]'::jsonb)
      FROM project_phase_evidence_files ef JOIN project_phase_files af ON af.id=ef.file_id WHERE ef.evidence_id=e.id)` : "'[]'::jsonb"} AS files
    FROM project_phase_evidence e
    JOIN project_phase_checklist_items i ON i.id=e.checklist_item_id AND i.project_id=e.project_id AND i.project_stage_id=e.project_stage_id
    JOIN project_stages s ON s.id=e.project_stage_id
    LEFT JOIN users u ON u.id=e.submitted_by LEFT JOIN project_phase_files f ON f.id=e.file_id
    WHERE e.project_id=ANY($1::uuid[]) AND (NOT $2::boolean OR e.status='pending')
    ORDER BY e.submitted_at,e.id`, [projectIds,pendingOnly])).rows;
}

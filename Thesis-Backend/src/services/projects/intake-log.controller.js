import execute from "../../common/utilities/query.utility.js";
import { requireUser, handleError, sendOk, sendError, paging } from "../../common/utilities/access.utility.js";

export const getIntakeLog = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    if(req.query.period && !["all","week"].includes(req.query.period)) return sendError(res,"period must be all or week.",400);
    const {limit,offset}=paging(req);
    const start="date_trunc('week',now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'";
    const where="WHERE COALESCE(p.is_deleted,false)=false"+(req.query.period==="week" ? " AND p.created_at >= "+start : "");
    const weekly=await execute("SELECT count(*)::int AS count FROM projects WHERE COALESCE(is_deleted,false)=false AND created_at >= "+start);
    const count=await execute("SELECT count(*)::int AS total FROM projects p "+where);
    const rows=await execute(
      `SELECT p.id,p.name,t.code AS project_type,p.floor_area_sqm,p.floor_count,p.target_start_date,p.created_at,p.lifecycle_status,
        p.client_name,p.suggested_opm_id AS opm_id,o.full_name AS opm_name,lead.spm_user_id AS spm_id,lead.spm_name,
        CASE WHEN p.lifecycle_status='archived' THEN 'Archived'
          WHEN EXISTS (SELECT 1 FROM audit_log a WHERE a.table_name='projects' AND a.record_id=p.id::text
            AND a.new_values->>'_archive_event'='changes_requested' AND NOT EXISTS (SELECT 1 FROM audit_log r
              WHERE r.new_values->>'_archive_event'='changes_resolved' AND r.new_values->>'request_event_id'=a.id::text)) THEN 'Changes Requested'
          WHEN p.lifecycle_status='draft' THEN 'Draft'
          WHEN EXISTS (SELECT 1 FROM project_phase_team f WHERE f.project_id=p.id AND f.status='declined') THEN 'SPM Declined'
          WHEN EXISTS (SELECT 1 FROM assignment_confirmations c WHERE c.project_id=p.id AND c.role_context='opm'
            AND c.target_user_id=p.suggested_opm_id AND c.status='declined') THEN 'OPM Declined'
          WHEN p.lifecycle_status='suggested_allocation' THEN 'Suggested Allocation'
          WHEN p.lifecycle_status='sent_to_opm' THEN 'Awaiting OPM'
          WHEN p.lifecycle_status='spm_review' THEN 'SPM Review'
          WHEN p.lifecycle_status IN ('confirmed','active') THEN 'Confirmed'
          ELSE 'Archived' END AS status_label
        FROM projects p LEFT JOIN project_types t ON t.id=p.project_type_id
        LEFT JOIN users o ON o.id=p.suggested_opm_id
        LEFT JOIN LATERAL (SELECT f.spm_user_id,u.full_name AS spm_name FROM project_phase_team f
          JOIN users u ON u.id=f.spm_user_id JOIN project_stages s ON s.id=f.project_stage_id
          WHERE f.project_id=p.id ORDER BY f.is_lead DESC,s.sort_order LIMIT 1) lead ON true
        ${where} ORDER BY p.created_at DESC,p.id LIMIT $1 OFFSET $2`,[limit,offset]);
    return sendOk(res,"Intake log retrieved.",count.rows[0].total,
      {this_week_count:weekly.rows[0].count,timezone:"Asia/Taipei",projects:rows.rows});
  } catch(error) { return handleError(res,error); }
};

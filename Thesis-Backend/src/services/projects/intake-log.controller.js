import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError, requireUser, handleError, sendOk, sendError, paging } from "../../common/utilities/access.utility.js";

export const createIntakeDraft = async (req,res) => {
  try {
    const actor=await requireUser(req,res,["admin"]);
    if(!actor) return;
    const b=req.body || {};
    if(typeof b.name!=="string" || !b.name.trim() || b.name.trim().length>200 ||
      typeof b.project_type!=="string" || !b.project_type.trim()) return sendError(res,"Project name and project_type are required.",400);
    for(const [field,max,integer] of [["floor_area_sqm",100000000,false],["floor_count",32768,true]]) {
      if(b[field]!=null && (typeof b[field]!=="number" || !Number.isFinite(b[field]) || b[field]<=0 ||
        b[field]>=max || (integer && !Number.isInteger(b[field])))) return sendError(res,"Invalid "+field+".",400);
    }
    if(b.target_start_date!==undefined && (typeof b.target_start_date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.target_start_date) ||
      Number.isNaN(Date.parse(b.target_start_date)) || new Date(b.target_start_date).toISOString().slice(0,10)!==b.target_start_date)) {
      return sendError(res,"Invalid target_start_date.",400);
    }
    const data=await withTransaction(async db=>{
      const type=await db.query("SELECT id FROM project_types WHERE code=$1",[b.project_type]);
      if(!type.rowCount) throw new HttpError(400,"Unknown project_type.");
      const saved=await db.query(
        `INSERT INTO projects (name,project_type_id,floor_area_sqm,floor_count,target_start_date,lifecycle_status,crew_assigned,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,'draft',0,$6,$6) RETURNING id,name,lifecycle_status`,
        [b.name.trim(),type.rows[0].id,b.floor_area_sqm ?? null,b.floor_count ?? null,b.target_start_date ?? null,actor.id]);
      return saved.rows[0];
    });
    return sendOk(res,"Intake draft created.",1,data,201);
  } catch(error) { return handleError(res,error); }
};
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

import { HttpError } from "../../common/utilities/access.utility.js";

export const ARCHIVE_VIEWS = {
  admin:["closed-projects","dead-end-intake","expired-assignments","suspended-accounts"],
  opm:["accepted-projects","changes-requested","spm-responses"],
  spm:["completed-projects","subcontractor-requests","declined-assignments"],
};
export const responseCte = `WITH responses AS (
  SELECT a.id::text AS event_id,a.table_name,a.record_id,CASE WHEN a.operation='INSERT' THEN (a.new_values->>'responded_at')::timestamptz ELSE COALESCE((a.new_values->>'responded_at')::timestamptz,a.changed_at) END AS response_at,
    (a.new_values->>'project_id')::uuid AS project_id,
    (a.new_values->>'spm_user_id')::uuid AS spm_user_id,(a.new_values->>'project_stage_id')::smallint AS stage_id,
    CASE a.new_values->>'status' WHEN 'confirmed' THEN 'accepted' ELSE a.new_values->>'status' END AS response,
    (a.new_values->>'created_at')::timestamptz AS assigned_at,
    (a.new_values->>'response_deadline_at')::timestamptz AS deadline_at
  FROM audit_log a WHERE a.table_name='project_phase_team' AND a.operation IN ('UPDATE','INSERT')
    AND a.new_values->>'status' IN ('confirmed','declined','auto_expired')
    AND a.old_values->>'status' IS DISTINCT FROM a.new_values->>'status'
    AND NOT (a.new_values ? '_archive_event')
  UNION ALL
  SELECT a.id::text,a.table_name,a.record_id,CASE WHEN a.operation='INSERT' THEN (a.new_values->>'responded_at')::timestamptz ELSE COALESCE((a.new_values->>'responded_at')::timestamptz,a.changed_at) END,
    (a.new_values->>'project_id')::uuid,(a.new_values->>'target_user_id')::uuid,NULL::smallint,a.new_values->>'status',
    (a.new_values->>'created_at')::timestamptz,(SELECT (n.new_values->>'deadline_at')::timestamptz FROM audit_log n
      WHERE n.new_values->>'reference_audit_id'=a.id::text AND n.new_values->>'_archive_event'='assignment_expired' ORDER BY n.id DESC LIMIT 1)
  FROM audit_log a WHERE a.table_name='assignment_confirmations' AND a.operation IN ('UPDATE','INSERT')
    AND a.new_values->>'role_context'='spm' AND a.new_values->>'status' IN ('accepted','declined','auto_expired')
    AND a.old_values->>'status' IS DISTINCT FROM a.new_values->>'status'
    AND NOT (a.new_values ? '_archive_event')
)`;
const commonProject = `FROM projects p LEFT JOIN project_types t ON t.id=p.project_type_id
 LEFT JOIN users o ON o.id=p.suggested_opm_id
 LEFT JOIN LATERAL (SELECT array_agg(DISTINCT u.full_name) AS names FROM project_phase_team f
   JOIN users u ON u.id=f.spm_user_id WHERE f.project_id=p.id) spms ON true
 LEFT JOIN LATERAL (SELECT count(*)::int AS required_count,
   count(*) FILTER (WHERE pd.status='uploaded' AND pd.file_ref IS NOT NULL)::int AS uploaded_count
   FROM document_types d LEFT JOIN project_documents pd ON pd.document_type_id=d.id AND pd.project_id=p.id
   WHERE d.is_required_for_intake=true) docs ON true
 LEFT JOIN LATERAL (SELECT min(c.responded_at) AS accepted_at FROM assignment_confirmations c
   WHERE c.project_id=p.id AND c.role_context='opm' AND c.status='accepted') accepted ON true
 LEFT JOIN LATERAL (SELECT a.new_values->>'final_headcount' AS final_headcount,a.changed_at,
   a.new_values->>'archive_category' AS category FROM audit_log a
   WHERE a.table_name='projects' AND a.record_id=p.id::text AND a.new_values->>'_archive_event'='project_archived'
   ORDER BY a.id DESC LIMIT 1) closure ON true
 LEFT JOIN LATERAL (SELECT a.old_values->>'crew_assigned' AS final_headcount,a.old_values->>'lifecycle_status' AS previous_status FROM audit_log a
   WHERE a.table_name='projects' AND a.record_id=p.id::text AND a.new_values->>'lifecycle_status'='archived'
     AND a.old_values->>'lifecycle_status' IS DISTINCT FROM 'archived' AND NOT (a.new_values ? '_archive_event')
   ORDER BY a.id LIMIT 1) legacy_close ON true`;
const projectFields = `p.id AS project_id,p.name AS project_name,t.code AS project_type,o.full_name AS opm_name,
 spms.names AS spm_names,p.created_at,accepted.accepted_at,
 (SELECT min(a.changed_at) FROM audit_log a WHERE a.table_name='projects' AND a.record_id=p.id::text
   AND a.operation='UPDATE' AND a.new_values->>'lifecycle_status' IN ('confirmed','active')
   AND a.old_values->>'lifecycle_status' IS DISTINCT FROM a.new_values->>'lifecycle_status'
   AND NOT (a.new_values ? '_archive_event')) AS confirmed_at,p.archived_at AS closed_at,
 COALESCE(closure.final_headcount,legacy_close.final_headcount)::int AS final_headcount,
 docs.required_count AS docs_required,docs.uploaded_count AS docs_uploaded,
 docs.required_count>0 AS document_requirements_configured,p.lifecycle_status,
 closure.category AS archive_category`;
const opmScope = `(p.suggested_opm_id=$1 OR EXISTS (SELECT 1 FROM assignment_confirmations c
  WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='opm' AND c.status='accepted')
  OR EXISTS (SELECT 1 FROM project_engineers e WHERE e.project_id=p.id AND e.user_id=$1))`;
const spmScope = `(EXISTS (SELECT 1 FROM project_phase_team f WHERE f.project_id=p.id AND f.spm_user_id=$1 AND f.status='confirmed')
  OR EXISTS (SELECT 1 FROM project_engineers e WHERE e.project_id=p.id AND e.user_id=$1)
  OR EXISTS (SELECT 1 FROM assignment_confirmations c WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='spm' AND c.status='accepted')
  OR EXISTS (SELECT 1 FROM audit_log a WHERE a.table_name='project_phase_team' AND a.new_values->>'project_id'=p.id::text
     AND a.new_values->>'spm_user_id'=$1::uuid::text AND a.new_values->>'status'='confirmed'))`;
const completed = `p.lifecycle_status='archived' AND (closure.category='closed' OR
 (COALESCE(p.is_deleted,false)=false AND p.current_pct=100 AND EXISTS
  (SELECT 1 FROM project_stages s WHERE s.id=p.current_stage_id AND lower(s.code)='closeout')))`;

function definition(user, view, query) {
  if (!ARCHIVE_VIEWS[user.role]?.includes(view)) throw new HttpError(403,"This archive view is unavailable for your role.");
  const params = user.role==="admin" ? [] : [user.id];
  if(view==="closed-projects" || view==="completed-projects") {
    let select=projectFields;
    if(user.role==="spm") select+=`, COALESCE((SELECT min(CASE WHEN a.operation='INSERT' THEN COALESCE((a.new_values->>'created_at')::timestamptz,a.changed_at) ELSE a.changed_at END) FROM audit_log a
        WHERE a.table_name='project_phase_team' AND a.new_values->>'project_id'=p.id::text AND a.new_values->>'spm_user_id'=$1::uuid::text
          AND (a.operation='INSERT' OR a.old_values->>'spm_user_id' IS DISTINCT FROM a.new_values->>'spm_user_id')
          AND NOT (a.new_values ? '_archive_event')),
        (SELECT min(f.created_at) FROM project_phase_team f WHERE f.project_id=p.id AND f.spm_user_id=$1),
        (SELECT min(e.assigned_at) FROM project_engineers e WHERE e.project_id=p.id AND e.user_id=$1),
        (SELECT min(c.created_at) FROM assignment_confirmations c WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='spm')) AS assigned_at,
      COALESCE((SELECT min(CASE WHEN a.operation='INSERT' THEN (a.new_values->>'responded_at')::timestamptz ELSE COALESCE((a.new_values->>'responded_at')::timestamptz,a.changed_at) END) FROM audit_log a WHERE a.table_name='project_phase_team'
       AND a.new_values->>'project_id'=p.id::text AND a.new_values->>'spm_user_id'=$1::uuid::text
       AND a.new_values->>'status'='confirmed' AND a.old_values->>'status' IS DISTINCT FROM 'confirmed'
       AND NOT (a.new_values ? '_archive_event')),
      (SELECT min(c.responded_at) FROM assignment_confirmations c WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='spm' AND c.status='accepted')) AS spm_accepted_at`;
    return {sql:`SELECT ${select} ${commonProject} WHERE ${completed}${user.role==="spm" ? " AND "+spmScope : ""}`,params,sort:"closed_at"};
  }
  if(view==="accepted-projects") {
    return {sql:`SELECT ${projectFields},(SELECT min(c.responded_at) FROM assignment_confirmations c
      WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='opm' AND c.status='accepted') AS opm_accepted_at
      ${commonProject} WHERE ${opmScope} AND (EXISTS (SELECT 1 FROM assignment_confirmations c
      WHERE c.project_id=p.id AND c.target_user_id=$1 AND c.role_context='opm' AND c.status='accepted') OR (${completed}))`,params,sort:"opm_accepted_at"};
  }
  if(view==="dead-end-intake") {
    return {sql:`SELECT ${projectFields},(a.new_values->>'flagged_at')::timestamptz AS flagged_at,actor.full_name AS flagged_by,a.new_values->>'flag_type' AS flag_type,
      a.new_values->>'reason' AS reason,'Archived — No Revival'::text AS status
      ${commonProject} LEFT JOIN LATERAL (SELECT * FROM audit_log h WHERE h.table_name='projects'
        AND h.record_id=p.id::text AND h.new_values->>'_archive_event'='project_archived'
        AND h.new_values->>'archive_category'='dead_end' ORDER BY h.id DESC LIMIT 1) a ON true
      LEFT JOIN users actor ON actor.id=(a.new_values->>'flagged_by')::uuid
      WHERE p.lifecycle_status='archived' AND (closure.category='dead_end' OR legacy_close.previous_status IN ('draft','suggested_allocation','confirmed','sent_to_opm','spm_review'))`,params,sort:"closed_at"};
  }
  if(view==="changes-requested") {
    return {sql:`SELECT a.id::text AS event_id,p.id AS project_id,p.name AS project_name,a.new_values->>'reason' AS flagged_issue,
      a.changed_at AS flagged_at,resolved.changed_at AS resolved_at,resolved.new_values->>'note' AS resolution_note,
      flagger.full_name AS flagged_by
      FROM audit_log a JOIN projects p ON p.id::text=a.record_id LEFT JOIN users flagger ON flagger.id=a.changed_by
      LEFT JOIN LATERAL (SELECT r.changed_at,r.new_values FROM audit_log r
        WHERE r.new_values->>'_archive_event'='changes_resolved' AND r.new_values->>'request_event_id'=a.id::text
        ORDER BY r.id LIMIT 1) resolved ON true
      WHERE a.table_name='projects' AND a.new_values->>'_archive_event'='changes_requested' AND ${opmScope} AND (resolved.changed_at IS NOT NULL OR p.lifecycle_status='archived')
      UNION ALL SELECT r.id::text,p.id,p.name,r.reason,r.submitted_at,r.resolved_at,r.resolution_note,u.full_name
      FROM pending_rework_requests r JOIN projects p ON p.id=r.project_id LEFT JOIN users u ON u.id=r.submitted_by
      WHERE ${opmScope} AND (r.status<>'pending' OR p.lifecycle_status='archived')`,params,sort:"flagged_at"};
  }
  if(view==="spm-responses" || view==="declined-assignments") {
    const condition=user.role==="spm" ? "r.spm_user_id=$1 AND r.response='declined'" : opmScope+" AND r.response IN ('accepted','declined','auto_expired')";
    return {sql:`${responseCte} SELECT r.event_id,r.project_id,p.name AS project_name,u.full_name AS spm_name,
      o.full_name AS opm_name,r.response,r.response_at,CASE WHEN r.response='declined' THEN r.response_at ELSE NULL END AS declined_at,n.new_values->>'note' AS notes,n.new_values->>'reason' AS reason,
      COALESCE(final_response.spm_user_id,(replacement.new_values->>'to_user_id')::uuid) AS replacement_user_id,
      replacement_name.full_name AS replacement_spm_name,final_response.response AS replacement_response,
      final_response.response_at AS outcome_at,replacement.changed_at AS reassigned_at,
      CASE WHEN r.response='accepted' THEN 'accepted' WHEN final_response.response IS NOT NULL THEN 'reassigned_'||final_response.response
        WHEN replacement.id IS NOT NULL THEN 'reassigned_pending' WHEN p.lifecycle_status='archived' THEN 'archived'
        ELSE 'awaiting_admin_action' END AS outcome
      FROM responses r JOIN projects p ON p.id=r.project_id LEFT JOIN users u ON u.id=r.spm_user_id
      LEFT JOIN users o ON o.id=p.suggested_opm_id
      LEFT JOIN LATERAL (SELECT * FROM audit_log a WHERE a.new_values->>'reference_audit_id'=r.event_id
        AND a.new_values->>'_archive_event' IN ('phase_response','assignment_response','phase_expired','assignment_expired') ORDER BY a.id DESC LIMIT 1) n ON true
      LEFT JOIN LATERAL (SELECT * FROM audit_log a WHERE a.table_name=r.table_name AND a.record_id=r.record_id
        AND a.new_values->>'_archive_event' IN ('phase_reassigned','assignment_reassigned')
        AND a.id>r.event_id::bigint ORDER BY a.id LIMIT 1) replacement ON true
      LEFT JOIN LATERAL (SELECT x.spm_user_id,x.response,x.response_at FROM responses x
        WHERE x.project_id=r.project_id AND x.event_id::bigint>r.event_id::bigint AND x.response IN ('accepted','declined')
          AND ((r.table_name='project_phase_team' AND x.table_name='project_phase_team' AND x.stage_id=r.stage_id)
            OR (r.table_name='assignment_confirmations' AND x.table_name='assignment_confirmations' AND EXISTS (
              WITH RECURSIVE chain AS (
                SELECT c.id FROM assignment_confirmations c WHERE c.reassigned_from_id=r.record_id::bigint
                UNION ALL SELECT c.id FROM assignment_confirmations c JOIN chain ON c.reassigned_from_id=chain.id)
              SELECT 1 FROM chain WHERE id=x.record_id::bigint)))
        ORDER BY x.event_id::bigint LIMIT 1) final_response ON true
      LEFT JOIN users replacement_name ON replacement_name.id=COALESCE(final_response.spm_user_id,(replacement.new_values->>'to_user_id')::uuid)
      WHERE ${condition}`,params,sort:"response_at"};
  }
  if(view==="expired-assignments") {
    return {sql:`${responseCte} SELECT e.event_id,e.project_id,p.name AS project_name,u.full_name AS spm_name,
      e.deadline_at,e.response_at AS expired_at,final.response AS outcome,final.response_at AS resolved_at,
      replacement.full_name AS replacement_spm_name
      FROM responses e JOIN projects p ON p.id=e.project_id LEFT JOIN users u ON u.id=e.spm_user_id
      JOIN LATERAL (SELECT r.* FROM responses r WHERE r.project_id=e.project_id
        AND r.event_id::bigint>e.event_id::bigint
        AND r.response IN ('accepted','declined')
        AND (((r.table_name=e.table_name AND r.record_id=e.record_id) OR (e.table_name='project_phase_team' AND r.table_name='project_phase_team' AND r.stage_id=e.stage_id)) OR
          (e.table_name='assignment_confirmations' AND EXISTS (WITH RECURSIVE chain AS (
            SELECT c.id,c.reassigned_from_id FROM assignment_confirmations c WHERE c.reassigned_from_id=e.record_id::bigint
            UNION ALL SELECT c.id,c.reassigned_from_id FROM assignment_confirmations c JOIN chain ON c.reassigned_from_id=chain.id)
            SELECT 1 FROM chain WHERE id=r.record_id::bigint)))
        ORDER BY r.event_id::bigint LIMIT 1) final ON true
      LEFT JOIN users replacement ON replacement.id=final.spm_user_id
      WHERE e.response='auto_expired'`,params,sort:"resolved_at"};
  }
  if(view==="subcontractor-requests") {
    return {sql:`SELECT r.id AS request_id,s.company_name,t.code AS trade_scope,p.id AS project_id,p.name AS project_name,
      r.requested_at AS submitted_at,r.status,CASE r.status WHEN 'approved' THEN 'Accepted' ELSE 'Declined' END AS status_label,
      r.resolved_at,n.new_values->>'note' AS notes
      FROM pending_subcontractor_requests r JOIN projects p ON p.id=r.project_id
      JOIN subcontractors s ON s.id=r.subcontractor_id LEFT JOIN trades t ON t.id=COALESCE(r.trade_id,s.trade_id)
      LEFT JOIN LATERAL (SELECT a.new_values FROM audit_log a WHERE a.table_name='pending_subcontractor_requests'
        AND a.record_id=r.id::text AND a.new_values->>'_archive_event'='subcontractor_decision'
        ORDER BY a.id DESC LIMIT 1) n ON true
      WHERE r.requested_by=$1 AND r.status IN ('approved','rejected')`,params,sort:"submitted_at"};
  }
  const days=Number(query.threshold_days ?? 60);
  if(!Number.isInteger(days) || days<1 || days>3650) throw new HttpError(400,"threshold_days must be 1–3650.");
  params.push(days);
  return {sql:`SELECT u.id AS user_id,u.full_name,r.code AS role,CASE WHEN u.is_deleted THEN 'Removed' ELSE 'Suspended' END AS status,
    suspended.changed_at AS suspended_since,extract(day FROM now()-suspended.changed_at)::int AS days_suspended,
    u.deleted_at AS removed_at,removal.new_values->>'reason' AS reason,
    CASE WHEN u.is_deleted THEN 'archived' ELSE 'pending_review' END AS section
    FROM users u JOIN roles r ON r.id=u.role_id
    LEFT JOIN LATERAL (SELECT a.changed_at FROM audit_log a WHERE a.table_name='users' AND a.record_id=u.id::text AND a.operation='UPDATE'
      AND a.new_values->>'status'='suspended' AND a.old_values->>'status' IS DISTINCT FROM 'suspended'
      AND NOT (a.new_values ? '_archive_event') ORDER BY a.id DESC LIMIT 1) suspended ON true
    LEFT JOIN LATERAL (SELECT a.new_values FROM audit_log a WHERE a.table_name='users' AND a.record_id=u.id::text
      AND a.new_values->>'_archive_event'='account_removed' ORDER BY a.id DESC LIMIT 1) removal ON true
    WHERE u.is_deleted=true OR (u.status='suspended' AND COALESCE(u.is_deleted,false)=false
      AND suspended.changed_at <= now()-($1::int * interval '1 day'))`,params,sort:"suspended_since"};
}
export function archiveQuery(user,view,query={}) {
  const spec=definition(user,view,query);
  const size=Number(query.pageSize ?? query.limit ?? 20),page=Number(query.page ?? 1);
  if(!Number.isSafeInteger(size) || size<1 || size>100 || !Number.isSafeInteger(page) || page<1) throw new HttpError(400,"Invalid archive pagination.");
  const offset=query.offset===undefined ? (page-1)*size : Number(query.offset);
  if(!Number.isSafeInteger(offset) || offset<0) throw new HttpError(400,"Invalid archive offset.");
  const values=[...spec.params];
  let where="";
  if(query.q!==undefined) {
    if(typeof query.q!=="string" || query.q.length>300) throw new HttpError(400,"Invalid archive search.");
    values.push("%"+query.q.trim()+"%");
    // The exposed archive record only contains deliberately selected metadata.
    where=`WHERE row_to_json(records)::text ILIKE $${values.length}`;
  }
  const relation=`FROM (${spec.sql}) records ${where}`;
  return {countSql:`SELECT count(*)::int AS total ${relation}`,params:values,
    dataSql:`SELECT * ${relation} ORDER BY ${spec.sort} DESC NULLS LAST LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    dataParams:[...values,size,offset],limit:size,offset,page:Math.floor(offset/size)+1};
}

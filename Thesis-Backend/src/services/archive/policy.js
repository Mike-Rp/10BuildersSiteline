import { readChecklist } from "../progress/phase.utility.js";
import { businessDeadline, recordArchiveEvent } from "./audit.utility.js";

export async function maybeCloseProject(db, project, actorId = null) {
  if (project.lifecycle_status !== "active" || String(project.current_stage).toLowerCase() !== "closeout") return false;
  const checklist = await readChecklist(db,project.id,project.current_stage_id);
  if (!checklist.configured || checklist.approved_count !== checklist.required_count) return false;
  const pending = await db.query(
    `SELECT 1 FROM project_phase_updates WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_rework_requests WHERE project_id=$1 AND status='pending'
     UNION ALL SELECT 1 FROM pending_subcontractor_requests WHERE project_id=$1 AND status='pending' LIMIT 1`,[project.id]);
  if (pending.rowCount) return false;
  const crew = await db.query(
    "SELECT count(*)::int AS headcount FROM subcontractor_workers WHERE current_project_id=$1 AND availability_status='assigned' AND status='active'",
    [project.id]);
  await db.query(
    `UPDATE projects SET lifecycle_status='archived',archived_at=now(),current_pct=100,crew_assigned=0,updated_by=$2,updated_at=now()
      WHERE id=$1 AND lifecycle_status='active'`,[project.id,actorId]);
  await recordArchiveEvent(db,actorId,"projects",project.id,"project_archived",{
    project_id:project.id,archive_category:"closed",final_headcount:crew.rows[0].headcount,
    reason:"Closeout deliverables approved and all pending reviews resolved.",
  });
  await db.query("UPDATE project_engineers SET unassigned_at=now(),updated_by=$2,updated_at=now() WHERE project_id=$1 AND unassigned_at IS NULL",[project.id,actorId]);
  await db.query(
    `UPDATE subcontractor_workers SET current_project_id=NULL,current_project_until=NULL,availability_status='available',
      updated_by=$2,updated_at=now() WHERE current_project_id=$1`,[project.id,actorId]);
  await db.query(
    `UPDATE project_subcontractor_assignments SET status='released',released_at=now(),updated_by=$2,updated_at=now()
      WHERE project_id=$1 AND status='active'`,[project.id,actorId]);
  return true;
}
export async function sweepArchive(db, actorId = null) {
  const clock = await db.query("SELECT now() AS now");
  const now = clock.rows[0].now;
  let expired=0,closed=0,deadEnds=0;
  const projects = await db.query(
    `SELECT p.*,s.code AS current_stage FROM projects p LEFT JOIN project_stages s ON s.id=p.current_stage_id
      WHERE COALESCE(p.is_deleted,false)=false AND p.lifecycle_status <> 'archived' ORDER BY p.id FOR UPDATE OF p SKIP LOCKED`);
  for (const p of projects.rows) {
    const due = ["spm_review","active"].includes(p.lifecycle_status) ? await db.query(
      `SELECT * FROM project_phase_team WHERE project_id=$1 AND status='pending'
        AND response_deadline_at <= $2 FOR UPDATE`,[p.id,now]) : {rows:[]};
    for (const assignment of due.rows) {
      await db.query(
        `UPDATE project_phase_team SET status='auto_expired',responded_at=now(),updated_by=$2,updated_at=now() WHERE id=$1`,
        [assignment.id,actorId]);
      await recordArchiveEvent(db,actorId,"project_phase_team",assignment.id,"phase_expired",{
        project_id:p.id,user_id:assignment.spm_user_id,deadline_at:assignment.response_deadline_at,
        reason:"No response before the assignment deadline.",
      });
      expired++;
    }
    const generic = await db.query(
      "SELECT * FROM assignment_confirmations WHERE project_id=$1 AND role_context='spm' AND status='pending' FOR UPDATE",[p.id]);
    for (const assignment of generic.rows) {
      if(!assignment.created_at) continue;
      const deadline = businessDeadline(assignment.created_at);
      if (deadline > new Date(now)) continue;
      await db.query(
        `UPDATE assignment_confirmations SET status='auto_expired',responded_at=now(),escalated_to_admin=true,
          escalated_at=now(),updated_by=$2,updated_at=now() WHERE id=$1`,[assignment.id,actorId]);
      await recordArchiveEvent(db,actorId,"assignment_confirmations",assignment.id,"assignment_expired",{
        project_id:p.id,user_id:assignment.target_user_id,deadline_at:deadline.toISOString(),
        reason:"No response within three business days.",
      });
      expired++;
    }
    if (await maybeCloseProject(db,p,actorId)) { closed++;continue; }
    if (p.lifecycle_status === "active") continue;
    const stale = await db.query(
      `SELECT 1 FROM projects p WHERE id=$1 AND GREATEST(p.updated_at,
        COALESCE((SELECT max(c.uploaded_at) FROM contracts c WHERE c.project_id=p.id),p.updated_at),
        COALESCE((SELECT max(d.uploaded_at) FROM project_documents d WHERE d.project_id=p.id),p.updated_at),
        COALESCE((SELECT max(n.noted_at) FROM project_notes n WHERE n.project_id=p.id),p.updated_at))
        <= $2::timestamptz - interval '30 days'`,[p.id,now]);
    if (!stale.rowCount) continue;
    const unresolved = await db.query(
      `SELECT a.id,a.changed_at,a.new_values->>'reason' AS reason,a.changed_by FROM audit_log a
        WHERE a.table_name='projects' AND a.record_id=$1::text
          AND a.new_values->>'_archive_event'='changes_requested'
          AND NOT EXISTS (SELECT 1 FROM audit_log r WHERE r.new_values->>'_archive_event'='changes_resolved'
            AND r.new_values->>'request_event_id'=a.id::text)
        ORDER BY a.id DESC LIMIT 1`,[p.id]);
    const declined = await db.query(
      `SELECT 1 FROM project_phase_team WHERE project_id=$1 AND status='declined'
        UNION ALL SELECT 1 FROM assignment_confirmations c JOIN projects p ON p.id=c.project_id
          WHERE c.project_id=$1 AND c.role_context='opm' AND c.target_user_id=p.suggested_opm_id AND c.status='declined' LIMIT 1`,[p.id]);
    if (!unresolved.rowCount && !declined.rowCount) continue;
    const declineDetail=declined.rowCount ? await db.query(
      `SELECT a.id,a.changed_at,COALESCE(n.new_values->>'reason',NULL) AS reason,
        COALESCE(n.changed_by,a.changed_by) AS changed_by,
        CASE a.table_name WHEN 'project_phase_team' THEN 'spm_declined' ELSE 'opm_declined' END AS flag_type
       FROM audit_log a LEFT JOIN LATERAL (SELECT * FROM audit_log n
         WHERE n.new_values->>'reference_audit_id'=a.id::text
           AND n.new_values->>'_archive_event' IN ('phase_response','assignment_response') ORDER BY n.id DESC LIMIT 1) n ON true
       WHERE a.new_values->>'project_id'=$1::text AND a.new_values->>'status'='declined'
         AND a.old_values->>'status' IS DISTINCT FROM 'declined'
         AND NOT (a.new_values ? '_archive_event') AND
         ((a.table_name='project_phase_team' AND EXISTS (SELECT 1 FROM project_phase_team f
             WHERE f.id::text=a.record_id AND f.status='declined' AND f.spm_user_id::text=a.new_values->>'spm_user_id'))
          OR (a.table_name='assignment_confirmations' AND EXISTS (SELECT 1 FROM assignment_confirmations c
             WHERE c.id::text=a.record_id AND c.status='declined' AND c.target_user_id=$2)))
       ORDER BY a.id DESC LIMIT 1`,[p.id,p.suggested_opm_id]) : {rows:[]};
    const flag = unresolved.rows[0] ?? declineDetail.rows[0];
    if(!flag?.changed_at) continue;
    const idleSince=Math.max(new Date(p.updated_at).getTime(),new Date(flag.changed_at).getTime());
    if(new Date(now).getTime()-idleSince < 30*24*60*60*1000) continue;
    await db.query("UPDATE projects SET lifecycle_status='archived',archived_at=now(),updated_by=$2,updated_at=now() WHERE id=$1",[p.id,actorId]);
    await recordArchiveEvent(db,actorId,"projects",p.id,"project_archived",{
      project_id:p.id,archive_category:"dead_end",reason:flag?.reason ?? null,flagged_by:flag?.changed_by ?? null,
      flag_event_id:flag?.id?.toString() ?? null,flagged_at:flag.changed_at,
      flag_type:unresolved.rowCount ? "changes_requested" : flag.flag_type,
    });
    deadEnds++;
  }
  return {expired_assignments:expired,closed_projects:closed,dead_end_intakes:deadEnds};
}

import { HttpError } from "../../common/utilities/access.utility.js";

export function archiveNote(value, required = false) {
  if(value==null && !required) return null;
  if(typeof value!=="string" || value.length>10000 || (required && !value.trim())) {
    throw new HttpError(400,required ? "A nonempty reason or note is required." : "Invalid note.");
  }
  return value.trim() || null;
}
export function businessDeadline(start, days = 3) {
  if(start==null) throw new Error("Invalid business deadline.");
  const date = new Date(start);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days) || days < 1) throw new Error("Invalid business deadline.");
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const day = taipei.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}
export async function recordArchiveEvent(db, actorId, table, id, event, detail = {}) {
  const prior = await db.query(
    `SELECT id FROM audit_log WHERE table_name=$1 AND record_id=$2
      AND NOT (COALESCE(new_values,'{}'::jsonb) ? '_archive_event') ORDER BY id DESC LIMIT 1`,
    [table, String(id)]);
  const payload = { ...detail, _archive_event: event, reference_audit_id: prior.rows[0]?.id?.toString() ?? null };
  const inserted = await db.query(
    `INSERT INTO audit_log (table_name,record_id,operation,changed_by,new_values)
     VALUES ($1,$2,'UPDATE',$3,$4::jsonb) RETURNING id,changed_at`,
    [table,String(id),actorId ?? null,JSON.stringify(payload)]);
  return inserted.rows[0];
}
export async function archiveProjectAccess(db, user, id, acceptedOnly = true) {
  if (user.role === "admin") return true;
  if (user.role === "opm") {
    const found = await db.query(
      `SELECT 1 FROM projects p WHERE p.id=$1 AND (
        p.suggested_opm_id=$2 OR EXISTS (SELECT 1 FROM assignment_confirmations c WHERE c.project_id=p.id
          AND c.target_user_id=$2 AND c.role_context='opm' AND c.status='accepted')
        OR EXISTS (SELECT 1 FROM project_engineers e WHERE e.project_id=p.id AND e.user_id=$2))`,[id,user.id]);
    return found.rowCount > 0;
  }
  if (user.role === "spm") {
    const found = await db.query(
      `SELECT 1 FROM project_phase_team t WHERE t.project_id=$1 AND t.spm_user_id=$2
        AND ($3::boolean=false OR t.status='confirmed')
       UNION ALL SELECT 1 FROM project_engineers e WHERE e.project_id=$1 AND e.user_id=$2
       UNION ALL SELECT 1 FROM audit_log a WHERE a.table_name='project_phase_team'
         AND a.new_values->>'project_id'=$1::text AND a.new_values->>'spm_user_id'=$2::text
         AND ($3::boolean=false OR a.new_values->>'status'='confirmed')
       UNION ALL SELECT 1 FROM assignment_confirmations c WHERE c.project_id=$1 AND c.target_user_id=$2
         AND c.role_context='spm' AND ($3::boolean=false OR c.status='accepted')`,[id,user.id,acceptedOnly]);
    return found.rowCount > 0;
  }
  return false;
}

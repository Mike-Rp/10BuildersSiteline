import execute from './query.utility.js';

export const LICENSE_ELIGIBILITY_SQL = `NOT EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id AND m.metadata->>'assignmentHold'='true') AND (NOT EXISTS (SELECT 1 FROM roles credential_role WHERE credential_role.id=u.role_id AND credential_role.code='spm')
  OR EXISTS (SELECT 1 FROM engineer_qualified_scopes scope WHERE scope.user_id=u.id)) AND EXISTS (
  SELECT 1 FROM public.user_licenses valid_license
  WHERE valid_license.user_id = u.id
    AND valid_license.superseded_at IS NULL
    AND to_jsonb(valid_license)->>'verification_status' = 'verified'
    AND to_jsonb(valid_license)->>'verified_by' IS NOT NULL
    AND to_jsonb(valid_license)->>'verified_at' IS NOT NULL
    AND to_jsonb(valid_license)->>'profession' IN ('Civil Engineer','Mechanical Engineer','Electrical Engineer','Sanitary Engineer','Electronics Engineer','Geodetic Engineer')
    AND valid_license.license_number ~ '^[0-9]{7}$'
    AND to_jsonb(valid_license)->>'revoked_at' IS NULL
    AND NOT coalesce((to_jsonb(valid_license)->>'correction_required')::boolean,false)
    AND valid_license.upload_status = 'uploaded'
    AND valid_license.upload_file_ref IS NOT NULL
    AND valid_license.license_expiry > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 30
)`;

export async function assertEligibleManager(client, userId, role) {
  const check = await client.query(`
    SELECT u.id FROM public.users u
    JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = $1 AND lower(r.code) = $2
      AND u.status = 'active' AND COALESCE(u.is_deleted, false) = false
      AND ${LICENSE_ELIGIBILITY_SQL}
    FOR UPDATE OF u
  `, [userId, role]);
  if (check.rowCount !== 1) {
    // Name the person and the specific reason, so a team save that fails on someone already assigned is not blamed on the newly selected engineer.
    let who = "", why = "";
    try {
      const d = (await client.query(`
        SELECT u.full_name, u.status, coalesce(u.is_deleted,false) AS deleted,
          EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id AND m.metadata->>'assignmentHold'='true') AS hold,
          EXISTS (SELECT 1 FROM engineer_qualified_scopes s WHERE s.user_id=u.id) AS scoped,
          (SELECT max(l.license_expiry - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date) FROM public.user_licenses l WHERE l.user_id=u.id AND l.superseded_at IS NULL AND to_jsonb(l)->>'verification_status'='verified') AS days_left
        FROM public.users u WHERE u.id=$1`, [userId])).rows[0];
      if (d) {
        who = d.full_name;
        why = d.status !== "active" || d.deleted ? "the account is not active"
          : d.hold ? "the account has an assignment hold"
          : role === "spm" && !d.scoped ? "no verified discipline qualifications on record"
          : d.days_left === null ? "no verified current PRC license"
          : d.days_left <= 30 ? `the PRC license expires in ${d.days_left} days (within 30 days from today)`
          : "the PRC license record is incomplete (verification, profession, number or uploaded file)";
      }
    } catch { /* keep the generic message */ }
    const error = new Error(who
      ? `${who} cannot be assigned as ${role.toUpperCase()}: ${why}.`
      : `Selected ${role.toUpperCase()} is inactive, missing a verified current PRC license, or has a license expiring within 30 days.`);
    error.status = 422;
    throw error;
  }
}


export async function getLicenseEligibility(userId, db = execute) {
 const result=await db(`SELECT u.id,u.status as account_status, (u.status='active' AND NOT coalesce(u.is_deleted,false) AND ${LICENSE_ELIGIBILITY_SQL}) as eligible_for_new_assignment FROM users u WHERE u.id=$1`,[userId]);
 return result.rows[0]??null;
}

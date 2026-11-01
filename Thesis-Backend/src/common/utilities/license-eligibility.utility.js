import execute from './query.utility.js';

export const LICENSE_ELIGIBILITY_SQL = `NOT EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id AND m.metadata->>'assignmentHold'='true') AND EXISTS (
  SELECT 1 FROM public.user_licenses valid_license
  WHERE valid_license.user_id = u.id
    AND valid_license.superseded_at IS NULL
    AND to_jsonb(valid_license)->>'verification_status' = 'verified'
    AND to_jsonb(valid_license)->>'verified_by' IS NOT NULL
    AND to_jsonb(valid_license)->>'verified_at' IS NOT NULL
    AND to_jsonb(valid_license)->>'profession' IN ('Civil Engineer','Mechanical Engineer','Electrical Engineer','Sanitary Engineer','Electronics Engineer','Geodetic Engineer')
    AND length(valid_license.license_number) BETWEEN 1 AND 120
    AND valid_license.license_number=btrim(valid_license.license_number)
    AND valid_license.license_number !~ '[[:cntrl:]]'
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
    const error = new Error(`Selected ${role.toUpperCase()} is inactive, missing a verified current PRC license, or has a license expiring within 30 days.`);
    error.status = 422;
    throw error;
  }
}


export async function getLicenseEligibility(userId, db = execute) {
 const result=await db(`SELECT u.id,u.status as account_status, (u.status='active' AND NOT coalesce(u.is_deleted,false) AND ${LICENSE_ELIGIBILITY_SQL}) as eligible_for_new_assignment FROM users u WHERE u.id=$1`,[userId]);
 return result.rows[0]??null;
}

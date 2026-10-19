import execute from './query.utility.js';

export const LICENSE_ELIGIBILITY_SQL = `NOT EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id AND m.metadata->>'assignmentHold'='true') AND EXISTS (
  SELECT 1 FROM public.user_licenses valid_license
  WHERE valid_license.user_id = u.id
    AND valid_license.superseded_at IS NULL
    AND valid_license.upload_status = 'uploaded'
    AND valid_license.upload_file_ref IS NOT NULL
    AND valid_license.license_expiry >= CURRENT_DATE
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
    const error = new Error(`Selected ${role.toUpperCase()} is inactive, missing a verified current PRC license, or has an expired license.`);
    error.status = 422;
    throw error;
  }
}


export async function getLicenseEligibility(userId, db = execute) {
  const result = await db(`
    SELECT u.id,
      CASE WHEN l.id IS NULL THEN 'missing'
           WHEN l.upload_status <> 'uploaded' OR l.upload_file_ref IS NULL THEN 'pending_document'
           WHEN l.license_expiry < CURRENT_DATE THEN 'expired'
           WHEN l.license_expiry <= CURRENT_DATE + 30 THEN 'expiring_soon'
           ELSE 'valid' END AS license_status,
      l.license_expiry,
      CASE WHEN l.id IS NOT NULL
             AND l.upload_status = 'uploaded'
             AND l.upload_file_ref IS NOT NULL
             AND l.license_expiry >= CURRENT_DATE
           THEN true ELSE false END AS eligible_for_new_assignment
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT id, license_expiry, upload_status, upload_file_ref
      FROM public.user_licenses
      WHERE user_id = u.id AND superseded_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) l ON true
    WHERE u.id = $1
  `, [userId]);
  return result.rows[0] ?? null;
}

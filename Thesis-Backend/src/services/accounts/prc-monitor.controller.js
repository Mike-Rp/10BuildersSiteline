import { isUuid, requireUser, sendError, sendOk, handleError } from '../../common/utilities/access.utility.js';
import execute from '../../common/utilities/query.utility.js';
import { withTransaction } from '../../common/utilities/transaction.utility.js';

export const requireLicenseAdmin = async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['admin']);
    if (!user) return;
    req.licenseAdmin = user;
    req.body = { ...req.body, doc_type: 'license' };
    next();
  } catch (err) { handleError(res, err); }
};

export const listLicenseWarnings = async (req, res) => {
  try {
    const result = await execute(`
      SELECT u.id AS user_id, u.full_name, u.email, r.code AS role,
        l.license_number, l.license_expiry,
        CASE WHEN l.id IS NULL THEN 'missing'
             WHEN l.upload_status <> 'uploaded' OR l.upload_file_ref IS NULL THEN 'pending_document'
             WHEN l.license_expiry < CURRENT_DATE THEN 'expired'
             WHEN l.license_expiry <= CURRENT_DATE + 30 THEN 'expiring_soon'
             ELSE 'valid' END AS license_status,
        CASE WHEN l.license_expiry IS NOT NULL
             THEN l.license_expiry - CURRENT_DATE ELSE NULL END AS days_remaining
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      LEFT JOIN LATERAL (
        SELECT id, license_number, license_expiry, upload_status, upload_file_ref
        FROM public.user_licenses
        WHERE user_id = u.id AND superseded_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) l ON true
      WHERE lower(r.code) IN ('opm','spm')
        AND u.is_deleted = false AND u.status = 'active'
        AND (l.id IS NULL OR l.upload_status <> 'uploaded'
          OR l.upload_file_ref IS NULL OR l.license_expiry <= CURRENT_DATE + 30)
      ORDER BY l.license_expiry ASC NULLS FIRST, u.full_name ASC
    `);
    return sendOk(res, 'PRC license warnings retrieved.', result.rowCount, result.rows);
  } catch (err) { return handleError(res, err); }
};

export const renewPrcLicense = async (req, res) => {
  try {
    const { user_id, license_number, license_expiry } = req.body;
    if (!isUuid(user_id) || typeof license_number !== 'string' || !license_number.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(license_expiry || '')
      || Number.isNaN(Date.parse(`${license_expiry}T00:00:00Z`)) || !req.file) {
      return sendError(res, 'user_id, license_number, license_expiry (YYYY-MM-DD) and file are required.', 400);
    }
    if (new Date(`${license_expiry}T00:00:00Z`).toISOString().slice(0,10) !== license_expiry) {
      return sendError(res, 'Invalid license expiry date.', 400);
    }
    const result = await withTransaction(async (client) => {
      const account = await client.query(`
        SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND lower(r.code) IN ('opm','spm')
          AND u.is_deleted = false FOR UPDATE OF u
      `, [user_id]);
      if (!account.rowCount) {
        const e = new Error('User is not an active OPM or SPM account.'); e.status = 422; throw e;
      }
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [req.licenseAdmin.id]);
      await client.query(`UPDATE public.user_licenses
        SET superseded_at = NOW(), updated_by = $2, updated_at = NOW()
        WHERE user_id = $1 AND superseded_at IS NULL`, [user_id, req.licenseAdmin.id]);
      const inserted = await client.query(`
        INSERT INTO public.user_licenses (
          user_id, license_number, license_expiry, upload_file_ref,
          upload_status, superseded_at, created_by, updated_by
        ) VALUES ($1,$2,$3,$4,'uploaded',NULL,$5,$5)
        RETURNING id, user_id, license_number, license_expiry, upload_status
      `, [user_id, license_number.trim(), license_expiry, req.file.path, req.licenseAdmin.id]);
      return inserted.rows[0];
    });
    return sendOk(res, 'License renewal recorded by Admin.', 1, result);
  } catch (err) { return handleError(res, err); }
};

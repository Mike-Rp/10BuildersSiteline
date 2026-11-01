import { submitRenewal } from "../licenses/renewal.controller.js";
import { requireUser, sendOk, handleError } from '../../common/utilities/access.utility.js';
import execute from '../../common/utilities/query.utility.js';

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
        l.license_number, l.license_expiry,l.profession,l.verification_status,
        CASE WHEN l.id IS NULL THEN 'missing'
             WHEN l.verification_status<>'verified' OR l.profession IS NULL THEN 'needs_review'
             WHEN l.upload_status <> 'uploaded' OR l.upload_file_ref IS NULL THEN 'pending_document'
             WHEN l.license_expiry < CURRENT_DATE THEN 'expired'
             WHEN l.license_expiry <= CURRENT_DATE + 30 THEN 'expiring_soon'
             ELSE 'valid' END AS license_status,
        CASE WHEN l.license_expiry IS NOT NULL
             THEN l.license_expiry - CURRENT_DATE ELSE NULL END AS days_remaining
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      LEFT JOIN LATERAL (
        SELECT id, license_number, license_expiry, upload_status, upload_file_ref,profession,verification_status
        FROM public.user_licenses
        WHERE user_id = u.id AND superseded_at IS NULL
        ORDER BY profession, created_at DESC, id DESC
      ) l ON true
      WHERE lower(r.code) IN ('opm','spm')
        AND u.is_deleted = false AND u.status = 'active'
        AND (l.id IS NULL OR l.verification_status<>'verified' OR l.profession IS NULL OR l.upload_status <> 'uploaded'
          OR l.upload_file_ref IS NULL OR l.license_expiry <= CURRENT_DATE + 30)
      ORDER BY l.license_expiry ASC NULLS FIRST, u.full_name ASC
    `);
    return sendOk(res, 'PRC license warnings retrieved.', result.rowCount, result.rows);
  } catch (err) { return handleError(res, err); }
};

export const renewPrcLicense = submitRenewal;

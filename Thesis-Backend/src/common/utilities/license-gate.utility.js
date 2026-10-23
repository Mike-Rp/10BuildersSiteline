// Blocks an Office PM or Site PM whose license has expired from signing, submitting or approving.
// The check is made in the backend for every protected command, so the UI cannot bypass it.
// Viewing and signing in stay available while an Administrator updates the engineer's license.
import execute from "./query.utility.js";
import { HttpError } from "./access.utility.js";
import { localDay } from "./license-status.utility.js";

export const LICENSE_PAUSED_MESSAGE = "Paused until your license renewal is verified";
export const LICENSE_PAUSED_CODE = "LICENSE_PAUSED";

/**
 * Throws 403 when `user` is an Office PM or Site PM whose current license has expired.
 * Administrators, clients and engineers with no license on file are not affected here
 * (an engineer with no license is already excluded from new assignments).
 */
export async function assertLicenseActive(user, db = null, today = localDay()) {
  if (!user || !["opm", "spm"].includes(user.role)) return;
  const run = db ? (sql, params) => db.query(sql, params) : execute;
  const current = (await run(
    `select license_expiry::text as license_expiry from user_licenses
      where user_id = $1 and superseded_at is null order by created_at desc, id desc limit 1`, [user.id])).rows[0];
  if (current?.license_expiry && current.license_expiry.slice(0, 10) < today) {
    throw new HttpError(403, LICENSE_PAUSED_MESSAGE, LICENSE_PAUSED_CODE);
  }
}

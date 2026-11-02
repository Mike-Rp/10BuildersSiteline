import { licenseAccessPolicy } from "../../domain/license-access.js";
// Defense-in-depth gate for project writes at the 30-day renewal window.
// The check is made in the backend for every protected command, so the UI cannot bypass it.
// Workspace access stops at day 30. Self-service renewal closes at day 23.
import execute from "./query.utility.js";
import { HttpError } from "./access.utility.js";
import { localDay } from "./license-status.utility.js";

export const LICENSE_PAUSED_MESSAGE = "Paused until your license renewal is verified";
export const LICENSE_PAUSED_CODE = "LICENSE_PAUSED";

/**
 * Throws 403 when `user` is an Office PM or Site PM whose current license has 30 days or fewer remaining.
 * Administrators, clients and engineers with no license on file are not affected here
 * (an engineer with no license is already excluded from new assignments).
 */
export async function assertLicenseActive(user, db = null, today = localDay()) {
  if (!user || !["opm", "spm"].includes(user.role)) return;
  const run = db ? (sql, params) => db.query(sql, params) : execute;
  const current = (await run(
    `select license_expiry::text as license_expiry from user_licenses
      where user_id = $1 and superseded_at is null order by (to_jsonb(user_licenses)->>'verification_status'='verified') desc nulls last, license_expiry desc, created_at desc, id desc limit 1`, [user.id])).rows[0];
  if (licenseAccessPolicy(current?.license_expiry, today).mode === "view_only") {
    throw new HttpError(403, LICENSE_PAUSED_MESSAGE, LICENSE_PAUSED_CODE);
  }
}

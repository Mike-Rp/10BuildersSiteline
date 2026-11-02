import type { LicenseSelf } from "./licenseTypes"

// Pending renewals must never fall back to the staff dashboard, including older API responses.
export function requiresRenewalOnlyAccess(status?: LicenseSelf) {
  return !!status && (status.renewalOnly === true ||
    (status.status === "renewal_under_review" && status.renewal?.submissionKind !== "initial") ||
    (status.daysToExpiry != null && status.daysToExpiry <= 30))
}

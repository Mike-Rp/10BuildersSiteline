// License status is always CALCULATED from the expiry date against the server's local today.
// Nothing here is stored or typed in by a person.
import execute from "./query.utility.js";

export const DEFAULT_REMINDER_DAYS = [60, 30, 14, 7, 0];
export const DEFAULT_GRACE_DAYS = 30;

const pad = (n) => String(n).padStart(2, "0");
/** Local calendar day as YYYY-MM-DD. */
export const localDay = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayNumber = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
/** Whole days from one YYYY-MM-DD to another (positive when `to` is later). */
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const addDays = (iso, days) => {
  const date = new Date(dayNumber(iso) * 86400000 + days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export function cleanReminderDays(value) {
  const list = Array.isArray(value) ? value : DEFAULT_REMINDER_DAYS;
  const days = [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365))].sort((a, b) => b - a);
  return days.length ? days : DEFAULT_REMINDER_DAYS;
}

/**
 * status: valid | expiring_soon | expired | renewal_under_review | missing
 * restricted: true from the day after expiry until a renewal is verified (an upload alone never lifts it)
 */
export function computeLicenseStatus({ expiry, today = localDay(), reminderDays, graceDays = DEFAULT_GRACE_DAYS, renewalOpen = false } = {}) {
  if (!expiry) return { status: "missing", base: "missing", restricted: false, expiry: null, daysToExpiry: null, graceEndsOn: null, graceDaysLeft: null, graceEnded: false };
  const day = String(expiry).slice(0, 10);
  const reminders = cleanReminderDays(reminderDays);
  const daysToExpiry = daysBetween(today, day);
  const expired = daysToExpiry < 0;
  const graceEndsOn = addDays(day, graceDays);
  const graceEnded = expired && daysBetween(graceEndsOn, today) > 0;
  const base = expired ? "expired" : daysToExpiry <= Math.max(...reminders) ? "expiring_soon" : "valid";
  return {
    status: renewalOpen ? "renewal_under_review" : base,
    base,
    restricted: expired,
    expiry: day,
    daysToExpiry,
    graceEndsOn,
    graceEnded,
    // Counts today: the first expired day shows the full grace period, the last day shows 1.
    graceDaysLeft: expired && !graceEnded ? daysBetween(today, graceEndsOn) + 1 : null,
  };
}

export async function readLicenseRules(db) {
  const run = db ? (sql, params) => db.query(sql, params) : execute;
  const rules = (await run("select rules from workspace_settings where singleton")).rows[0]?.rules || {};
  const grace = Number.isInteger(rules.grace) && rules.grace > 0 ? rules.grace : DEFAULT_GRACE_DAYS;
  return { graceDays: grace, reminderDays: cleanReminderDays(rules.reminderDays), response: Number.isInteger(rules.response) ? rules.response : 3 };
}

/** The engineer's current license (newest not superseded) and any open renewal request. */
export async function loadLicenseState(userId, { db, today = localDay() } = {}) {
  const run = db ? (sql, params) => db.query(sql, params) : execute;
  const rules = await readLicenseRules(db);
  const license = (await run(
    `select id, license_number, license_expiry::text as license_expiry, upload_status
       from user_licenses where user_id = $1 and superseded_at is null order by created_at desc, id desc limit 1`, [userId])).rows[0];
  const renewal = (await run(
    `select id, status, license_number, license_expiry::text as license_expiry, submitted_at, reviewed_at, review_note
       from license_renewal_requests where user_id = $1 order by id desc limit 1`, [userId])).rows[0] || null;
  const computed = computeLicenseStatus({
    expiry: license?.license_expiry, today, reminderDays: rules.reminderDays, graceDays: rules.graceDays,
    renewalOpen: renewal?.status === "under_review",
  });
  return { ...computed, licenseId: license?.id || null, licenseNumber: license?.license_number || null, renewal, rules, today };
}

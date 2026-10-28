import { errorlog } from "../../common/utilities/logger.utility.js";
import { mirrorLegacyNotifications } from "../notifications/notification.utility.js";

// Matches licenseState() in the app, which calls a license "Expiring soon" within 90 days.
export const LICENSE_REMINDER_DAYS = 90;
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
let lastSweepAt = 0;

const REMINDERS = {
  missing: { title: "PRC license missing", detail: "No PRC license is on file." },
  pending_document: { title: "PRC license document pending", detail: "The license record has no uploaded document." },
  expired: { title: "PRC license expired", detail: "The PRC license has passed its expiry date." },
  expiring_soon: { title: "PRC license expiring soon", detail: `The PRC license expires within ${LICENSE_REMINDER_DAYS} days.` },
};

/**
 * Raises an in-app reminder (activity log entry plus notification recipients) for every active
 * Office PM / Site PM whose PRC license is missing, undocumented, expired or about to expire.
 * Pass { userId } to check a single account, as is done right after a license is saved.
 * The recipients are that person and every active administrator. Each reminder carries a
 * stable anchor_reference, so running the sweep again does not repeat it: expired and
 * expiring licenses remind once per expiry date, missing and undocumented ones once per month.
 */
export async function sweepLicenses(db, { userId = null } = {}) {
  const noticeType = await db.query("SELECT id FROM activity_types WHERE code = 'notice'");
  if (!noticeType.rowCount) return { checked: 0, reminders: 0, skipped: 0, note: "No notice activity type is configured." };

  const candidates = await db.query(
    `SELECT user_id, full_name, license_expiry, alert_level, to_char(CURRENT_DATE, 'YYYY-MM') AS period
       FROM (
         SELECT u.id AS user_id, u.full_name, l.license_expiry::text AS license_expiry,
                CASE WHEN l.id IS NULL THEN 'missing'
                     WHEN l.license_expiry < CURRENT_DATE THEN 'expired'
                     WHEN l.license_expiry <= CURRENT_DATE + $1::int THEN 'expiring_soon'
                     WHEN l.upload_status <> 'uploaded' OR l.upload_file_ref IS NULL THEN 'pending_document'
                END AS alert_level
           FROM users u
           JOIN roles r ON r.id = u.role_id
           LEFT JOIN LATERAL (
             SELECT x.id, x.license_expiry, x.upload_status, x.upload_file_ref
               FROM user_licenses x
              WHERE x.user_id = u.id AND x.superseded_at IS NULL
              ORDER BY x.created_at DESC, x.id DESC LIMIT 1) l ON true
          WHERE lower(r.code) IN ('opm', 'spm')
            AND u.status IN ('active', 'invited') AND COALESCE(u.is_deleted, false) = false
            AND ($2::uuid IS NULL OR u.id = $2::uuid)
       ) a
      WHERE alert_level IS NOT NULL
      ORDER BY user_id`,
    [LICENSE_REMINDER_DAYS, userId]);

  const admins = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'admin' AND u.status = 'active' AND COALESCE(u.is_deleted, false) = false`);

  let reminders = 0;
  let skipped = 0;
  for (const row of candidates.rows) {
    const dated = row.alert_level === "expired" || row.alert_level === "expiring_soon";
    const anchor = `license:${row.user_id}:${row.alert_level}:${dated ? row.license_expiry : row.period}`;
    const existing = await db.query("SELECT 1 FROM activity_log WHERE anchor_reference = $1 LIMIT 1", [anchor]);
    if (existing.rowCount) {
      skipped++;
      continue;
    }
    const reminder = REMINDERS[row.alert_level];
    const detail = `${row.full_name} · ${reminder.detail}${dated ? ` Expiry: ${row.license_expiry}.` : ""}`;
    const logged = await db.query(
      `INSERT INTO activity_log (activity_type_id, title, detail, anchor_reference)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [noticeType.rows[0].id, reminder.title, detail, anchor]);
    const recipients = [...new Set([row.user_id, ...admins.rows.map((admin) => admin.id)])];
    await db.query(
      `INSERT INTO notification_recipients (activity_log_id, recipient_user_id)
       SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [logged.rows[0].id, recipients]);
    await mirrorLegacyNotifications(db, [logged.rows[0].id]);
    reminders++;
  }
  return { checked: candidates.rowCount, reminders, skipped };
}

/**
 * Runs the sweep on the caller's own connection at most every 30 minutes per server
 * process, so reminders appear without waiting for the daily cron. It runs inside a
 * savepoint, so a failure is logged and never breaks the request that triggered it.
 */
export async function sweepLicensesIfDue(db) {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await db.query("SAVEPOINT license_sweep");
    await sweepLicenses(db);
    await db.query("RELEASE SAVEPOINT license_sweep");
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT license_sweep").catch(() => {});
    errorlog(error);
  }
}

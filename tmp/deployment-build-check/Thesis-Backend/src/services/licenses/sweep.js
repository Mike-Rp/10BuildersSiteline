// License maintenance, run by the 15-minute maintenance timer and (throttled) when a workspace loads:
//  - reminders at each configured day before expiry, then weekly during the grace period
//  - one alert to the Administrator when the grace period ends without a renewal
//  - reassignment requests that were not answered before their deadline
// Every reminder is recorded in license_reminders_sent, so it is sent once, however often this runs.
import { computeLicenseStatus, localDay, readLicenseRules } from "../../common/utilities/license-status.utility.js";
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { resolveNotifications } from "../notifications/notification.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";

/** The reminder due today for this license, or null. */
export function reminderKeyFor(state, reminderDays) {
  if (state.status === "missing") return null;
  if (!state.restricted) {
    const band = [...reminderDays].sort((a, b) => a - b).find((day) => state.daysToExpiry <= day);
    return band === undefined ? null : String(band);
  }
  if (state.graceEnded) return "grace-ended";
  return `grace-w${Math.floor((-state.daysToExpiry - 1) / 7)}`;
}

const when = (state) =>
  state.restricted
    ? `expired on ${state.expiry}`
    : state.daysToExpiry === 0 ? `expires today (${state.expiry})` : `expires on ${state.expiry} (${state.daysToExpiry} days)`;

async function superiorsOf(db, engineer) {
  if (engineer.role !== "spm") return [];
  return (await db.query(
    `select distinct p.suggested_opm_id as id from project_phase_team t join projects p on p.id=t.project_id
      where t.spm_user_id=$1 and t.status<>'declined' and p.lifecycle_status<>'archived'
        and not coalesce(p.is_deleted,false) and p.suggested_opm_id is not null`, [engineer.id])).rows.map((r) => r.id);
}

export async function sweepLicenses(db, { today = localDay(), now = new Date() } = {}) {
  const rules = await readLicenseRules(db);
  const admins = await adminIds(db);
  const engineers = (await db.query(
    `select u.id, u.full_name, r.code as role, l.license_expiry::text as license_expiry
       from users u join roles r on r.id=u.role_id
       join lateral (select license_expiry from user_licenses where user_id=u.id and superseded_at is null
                      order by created_at desc, id desc limit 1) l on true
      where r.code in ('opm','spm') and u.status='active' and not coalesce(u.is_deleted,false) and l.license_expiry is not null`)).rows;
  const underReview = new Set((await db.query("select user_id from license_renewal_requests where status='under_review'")).rows.map((r) => r.user_id));
  const result = { reminders: 0, graceEnded: 0, overridesExpired: 0 };

  for (const engineer of engineers) {
    if (underReview.has(engineer.id)) continue; // an Administrator is already reviewing the renewal
    const state = computeLicenseStatus({ expiry: engineer.license_expiry, today, reminderDays: rules.reminderDays, graceDays: rules.graceDays });
    const key = reminderKeyFor(state, rules.reminderDays);
    if (!key) continue;
    const first = await db.query(
      "insert into license_reminders_sent(user_id,license_expiry,reminder_key) values($1,$2,$3) on conflict do nothing returning id",
      [engineer.id, engineer.license_expiry, key]);
    if (!first.rowCount) continue;
    const others = [...admins, ...(await superiorsOf(db, engineer))].filter((id) => id !== engineer.id);
    if (key === "grace-ended") {
      await notify(db, { title: "Engineer license expired: assignment needs cover", recipientIds: others,
        detail: `${engineer.full_name} · license ${when(state)} · not renewed after the grace period` });
      await notify(db, { title: "Your license was not renewed", recipientIds: [engineer.id],
        detail: "The grace period has ended. An Administrator may reassign your work. Upload a renewed license to be considered for new assignments." });
      result.graceEnded++;
    } else {
      const left = state.graceDaysLeft;
      await notify(db, { title: "License renewal reminder", recipientIds: [engineer.id],
        detail: state.restricted
          ? `Your PRC license ${when(state)}. ${left} day${left === 1 ? "" : "s"} left in the grace period. Visit your Administrator with your renewed license. Only an Administrator can upload or update it.`
          : `Your PRC license ${when(state)}. Visit your Administrator with your renewed license. Only an Administrator can upload or update it.` });
      await notify(db, { title: "Engineer license reminder", recipientIds: others, detail: `${engineer.full_name} · license ${when(state)}` });
      result.reminders++;
    }
  }

  const stale = await db.query(
    `update license_overrides set status='declined', responded_at=now(), response_note='No response before the deadline'
      where status='pending_acceptance' and response_deadline_at < $1 returning id, project_id, project_stage_id, role_code`, [now]);
  for (const o of stale.rows) {
    await resolveNotifications(db, { subjectType: "license_override", subjectId: String(o.id), reason: "The response deadline expired." });
    const label = (await db.query(
      `select p.name, s.code as stage from projects p left join project_stages s on s.id=$2 where p.id=$1`, [o.project_id, o.project_stage_id])).rows[0];
    await notify(db, { title: "Reassignment request expired", recipientIds: admins, projectId: o.project_id,
      detail: `${label?.name || "Project"}${label?.stage ? " · " + label.stage : ""} · choose another engineer` });
    result.overridesExpired++;
  }
  return result;
}

let lastRun = 0;
/** Cheap enough to call when a workspace loads: runs at most once a minute per process. */
export async function sweepLicensesThrottled(db, ms = 60000) {
  if (Date.now() - lastRun < ms) return null;
  lastRun = Date.now();
  // A failed sweep (for example a database that is behind on migrations) must never break loading the workspace.
  await db.query("savepoint license_sweep");
  try {
    const result = await sweepLicenses(db);
    await db.query("release savepoint license_sweep");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint license_sweep");
    errorlog(error);
    return null;
  }
}
/** Runs the sweep now (no throttle) inside a savepoint; a failure is logged and returns null. Used by the cron route. */
export async function sweepLicensesSafe(db) {
  await db.query("savepoint license_sweep_safe");
  try {
    const result = await sweepLicenses(db);
    await db.query("release savepoint license_sweep_safe");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint license_sweep_safe");
    errorlog(error);
    return null;
  }
}
export const resetSweepThrottle = () => { lastRun = 0; };

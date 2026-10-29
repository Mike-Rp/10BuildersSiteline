import { HttpError, isUuid } from "../../common/utilities/access.utility.js";

// Explicit transition bridge: old deployments continue working before the reviewed migration is applied.
// V2 endpoints never fall back to activity_log if the new storage is unavailable.
export async function notificationsReady(db) {
  return (await db.query("SELECT to_regclass('public.notifications') IS NOT NULL AS ready")).rows[0]?.ready === true;
}
export async function requireNotifications(db) {
  if (!await notificationsReady(db)) throw new HttpError(503, "The notification module needs its pending database migration.");
}
function subject(type, id) {
  if ((type == null) !== (id == null) || (type != null && (typeof type !== "string" || !/^[a-z_]{1,60}$/.test(type)
    || typeof id !== "string" || !id || id.length > 200))) throw new HttpError(400, "Invalid notification task reference.");
}
function internalLink(link) {
  if (link != null && (typeof link !== "string" || link.length > 1000 || !/^\/[a-zA-Z0-9]/.test(link) || /[\\\s]/.test(link)
    || [...link].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)))
    throw new HttpError(400, "Notification links must stay inside SiteCore.");
}
export async function createNotification(db, { recipientId, type = "notice", title, message = "", link = null,
  priority = "normal", projectId = null, activityLogId = null, subjectType = null, subjectId = null }) {
  await requireNotifications(db);
  if (!isUuid(recipientId) || typeof type !== "string" || !type.trim() || type.length > 80
    || typeof title !== "string" || !title.trim() || title.length > 500 || typeof message !== "string"
    || !["normal", "urgent"].includes(priority)) throw new HttpError(400, "Invalid notification.");
  internalLink(link);
  subject(subjectType, subjectId);
  return (await db.query(`INSERT INTO notifications
    (recipient_user_id,type,title,message,link,priority,related_project_id,activity_log_id,subject_type,subject_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
  [recipientId, type, title, message, link, priority, projectId, activityLogId, subjectType, subjectId])).rows[0];
}

// Copies starting text once; wording and subsequent user changes are never overwritten by replays.
export async function mirrorLegacyNotifications(db, activityIds, { subjectType = null, subjectId = null, link = null, priority = "normal" } = {}) {
  if (!activityIds.length || !await notificationsReady(db)) return [];
  subject(subjectType, subjectId);
  internalLink(link);
  if (!["normal", "urgent"].includes(priority)) throw new HttpError(400, "Invalid notification priority.");
  return (await db.query(`INSERT INTO notifications
    (recipient_user_id,type,title,message,related_project_id,activity_log_id,created_at,read_at,legacy_key,legacy_snapshot,subject_type,subject_id,link,priority)
    SELECT n.recipient_user_id,t.code,a.title,coalesce(a.detail,''),a.related_project_id,a.id,
      coalesce(n.created_at,a.occurred_at),CASE WHEN n.is_read THEN coalesce(n.read_at,n.updated_at,n.created_at,a.occurred_at) END,
      'activity:'||a.id,jsonb_build_object('is_read',n.is_read,'read_at',n.read_at,'detail',a.detail,'created_at',n.created_at),$2,$3,$4,$5
    FROM notification_recipients n JOIN activity_log a ON a.id=n.activity_log_id
    JOIN activity_types t ON t.id=a.activity_type_id WHERE a.id=ANY($1::bigint[])
    ON CONFLICT(recipient_user_id,legacy_key) DO NOTHING RETURNING id`,
  [activityIds, subjectType, subjectId, link, priority])).rows;
}

export async function listNotifications(db, recipientId, { limit = 20, offset = 0, archived = false } = {}) {
  await requireNotifications(db);
  // One statement gives a consistent count and page even when another request marks a message read.
  const result = (await db.query(`SELECT
    (SELECT count(*)::int FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL AND dismissed_at IS NULL AND resolved_at IS NULL) AS unread_count,
    (SELECT count(*)::int FROM notifications WHERE recipient_user_id=$1 AND (dismissed_at IS NOT NULL)=$4) AS total,
    coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('id',page.id::text,'activity_log_id',page.activity_log_id::text) ORDER BY page.created_at DESC,page.id DESC) FROM (
      SELECT * FROM notifications WHERE recipient_user_id=$1 AND (dismissed_at IS NOT NULL)=$4
      ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3
    ) page),'[]'::jsonb) AS notifications`, [recipientId, limit, offset, archived])).rows[0];
  return { ...result, limit, offset };
}
export async function setNotificationRead(db, recipientId, id, read) {
  await requireNotifications(db);
  const row = (await db.query(`UPDATE notifications SET read_at=CASE WHEN $3 THEN coalesce(read_at,now()) ELSE NULL END
    WHERE id=$1 AND recipient_user_id=$2 RETURNING *`, [id, recipientId, read])).rows[0];
  if (!row) throw new HttpError(404, "Notification not found.");
  // During the transition the old frontend still reads notification_recipients.
  if (row.legacy_key === `activity:${row.activity_log_id}`) await db.query(`UPDATE notification_recipients SET is_read=$3,read_at=$4
    WHERE activity_log_id=$1 AND recipient_user_id=$2`, [row.activity_log_id, recipientId, read, row.read_at]);
  return row;
}
export async function dismissNotification(db, recipientId, id) {
  await requireNotifications(db);
  const row = (await db.query(`UPDATE notifications SET dismissed_at=coalesce(dismissed_at,now())
    WHERE id=$1 AND recipient_user_id=$2 RETURNING *`, [id, recipientId])).rows[0];
  if (!row) throw new HttpError(404, "Notification not found.");
  return row;
}
// Internal business-transaction API only. No HTTP handler accepts a recipient or a resolution request.
export async function resolveNotifications(db, { subjectType, subjectId, reason }) {
  if (!await notificationsReady(db)) return [];
  subject(subjectType, subjectId);
  if (!subjectType || typeof reason !== "string" || !reason.trim() || reason.length > 1000) throw new HttpError(400, "A resolution and task reference are required.");
  return (await db.query(`UPDATE notifications SET resolved_at=now(),resolved_reason=$3
    WHERE subject_type=$1 AND subject_id=$2 AND resolved_at IS NULL RETURNING id`, [subjectType, subjectId, reason])).rows;
}
export async function reviseNotification(db, recipientId, id, { title, message, link }) {
  await requireNotifications(db);
  if (typeof title !== "string" || !title.trim() || title.length > 500 || typeof message !== "string") throw new HttpError(400, "Invalid notification wording.");
  internalLink(link);
  const row = (await db.query(`UPDATE notifications SET title=$3,message=$4,link=$5 WHERE id=$1 AND recipient_user_id=$2 RETURNING *`,
    [id, recipientId, title, message, link ?? null])).rows[0];
  if (!row) throw new HttpError(404, "Notification not found.");
  return row;
}
export async function mirrorLegacyReads(db, recipientId, activityIds) {
  if (!activityIds.length || !await notificationsReady(db)) return;
  await mirrorLegacyNotifications(db, activityIds);
  await db.query(`UPDATE notifications x SET read_at=coalesce(x.read_at,n.read_at,now())
    FROM notification_recipients n WHERE n.activity_log_id=ANY($2::bigint[]) AND n.recipient_user_id=$1
    AND x.recipient_user_id=n.recipient_user_id AND x.legacy_key='activity:'||n.activity_log_id AND n.is_read`, [recipientId, activityIds]);
}

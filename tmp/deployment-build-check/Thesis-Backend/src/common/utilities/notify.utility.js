import { mirrorLegacyNotifications } from "../../services/notifications/notification.utility.js";
// Legacy event producer bridge until Stage 3 separates events from message creation.
export async function notify(db, { title, detail = "", actorId = null, projectId = null, recipientIds = [], type = "notice", ...notification }) {
  const ids = [...new Set(recipientIds.filter(Boolean))];
  if (!ids.length) return null;
  const created = await db.query(
    `insert into activity_log(activity_type_id,title,detail,actor_user_id,related_project_id)
     select id,$1,$2,$3,$4 from activity_types where code=$5 returning id`, [title, detail, actorId, projectId, type]);
  if (!created.rowCount) return null;
  await db.query(
    "insert into notification_recipients(activity_log_id,recipient_user_id) select $1,unnest($2::uuid[]) on conflict do nothing",
    [created.rows[0].id, ids]);
  await mirrorLegacyNotifications(db, [created.rows[0].id], notification);
  return created.rows[0].id;
}

export async function adminIds(db) {
  return (await db.query(
    `select u.id from users u join roles r on r.id=u.role_id
      where r.code='admin' and u.status='active' and not coalesce(u.is_deleted,false)`)).rows.map((r) => r.id);
}

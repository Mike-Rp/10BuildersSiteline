import { HttpError } from "../../common/utilities/access.utility.js";

// Taking a request locks it to that admin: nobody else can take or reset it, and
// the claim cannot be released. It only reopens to every admin when the hold below
// runs out, so a forgotten claim cannot hide a request forever.
export const CLAIM_HOLD_MS = 2 * 60 * 60 * 1000;
// A request nobody has finished turns amber after 4 hours and red after 24.
export const REMINDER_AFTER_MS = 4 * 60 * 60 * 1000;
export const REMINDER_REPEAT_MS = 12 * 60 * 60 * 1000;

export const activeClaim = (meta, now = Date.now()) => {
  const claim = meta?.passwordResetClaim;
  if (!claim || claim.requestedAt !== meta?.passwordResetRequestedAt) return null;
  const expires = Date.parse(claim.claimedAt) + CLAIM_HOLD_MS;
  return expires > now ? { ...claim, expiresAt: new Date(expires).toISOString() } : null;
};

export const claimFields = (meta, viewerId, now = Date.now()) => {
  const claim = activeClaim(meta, now);
  return claim
    ? { claimed_by: claim.by, claimed_by_name: claim.byName, claimed_at: claim.claimedAt, claim_expires_at: claim.expiresAt, claimed_by_me: claim.by === viewerId }
    : { claimed_by: null, claimed_by_name: null, claimed_at: null, claim_expires_at: null, claimed_by_me: false };
};

export const reminderDue = (meta, now = Date.now()) => {
  if (!meta?.passwordResetRequestedAt) return false;
  if (now - Date.parse(meta.passwordResetRequestedAt) < REMINDER_AFTER_MS) return false;
  const last = meta.passwordResetRemindedAt ? Date.parse(meta.passwordResetRemindedAt) : 0;
  return now - last >= REMINDER_REPEAT_MS;
};

export const waitingText = (requestedAt, now = Date.now()) => {
  const hours = Math.floor((now - Date.parse(requestedAt)) / 3600000);
  return hours < 1 ? "less than an hour" : hours < 48 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.floor(hours / 24)} days`;
};

const adminName = async (db, id) => (await db.query("select full_name from users where id=$1", [id])).rows[0]?.full_name || "an administrator";

export async function claimResetRequest(db, actor, accountId, requestedAt) {
  await db.query("select id from users where id=$1 for update", [accountId]);
  const meta = (await db.query("select metadata from workspace_account_metadata where user_id=$1", [accountId])).rows[0]?.metadata;
  if (!meta?.passwordResetRequestedAt || meta.passwordResetRequestedAt !== requestedAt)
    throw new HttpError(409, "This request has changed or was completed. Refresh the requests.");
  const existing = activeClaim(meta);
  if (existing && existing.by !== actor.id) throw new HttpError(409, `${existing.byName} is already handling this request.`);
  const claim = { by: actor.id, byName: await adminName(db, actor.id), requestedAt, claimedAt: new Date().toISOString() };
  await db.query("update workspace_account_metadata set metadata=metadata||jsonb_build_object('passwordResetClaim',$2::jsonb) where user_id=$1", [accountId, JSON.stringify(claim)]);
  return claimFields({ ...meta, passwordResetClaim: claim }, actor.id);
}

// Called while an admin loads the list. The conditional update means that if both
// admins load at the same moment, only one of them sends the reminder.
export async function sendDueReminders(db, actor, rows, notify, now = Date.now()) {
  for (const row of rows) {
    if (!reminderDue(row.metadata, now)) continue;
    const previous = row.metadata.passwordResetRemindedAt ?? null;
    const claimed = await db.query(
      `update workspace_account_metadata set metadata=metadata||jsonb_build_object('passwordResetRemindedAt',$3::text)
        where user_id=$1 and metadata->>'passwordResetRequestedAt'=$4 and metadata->>'passwordResetRemindedAt' is not distinct from $2 returning 1`,
      [row.id, previous, new Date(now).toISOString(), row.metadata.passwordResetRequestedAt]);
    if (!claimed.rowCount) continue;
    row.metadata.passwordResetRemindedAt = new Date(now).toISOString();
    await notify(db, actor, null, "Password reset still waiting",
      `${row.full_name}'s password reset request has been waiting ${waitingText(row.metadata.passwordResetRequestedAt, now)}. Open Password reset requests to handle it.`);
  }
}

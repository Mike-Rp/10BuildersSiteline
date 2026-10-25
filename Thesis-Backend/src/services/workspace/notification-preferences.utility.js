// Call inside the request transaction. Locking preserves unrelated account metadata
// and serializes preference toggles with client notice reads.
export async function updateNotificationPreferences(db, userId, patch) {
    await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,'{}') on conflict do nothing", [userId]);
    const row = (await db.query("select metadata from workspace_account_metadata where user_id=$1 for update", [userId])).rows[0];
    const preferences = { muted: [], ...row.metadata.preferences, ...patch };
    if (patch.readNoticeIds) preferences.readNoticeIds = [...new Set([...(row.metadata.preferences?.readNoticeIds || []), ...patch.readNoticeIds])];
    await db.query("update workspace_account_metadata set metadata=jsonb_set(metadata,'{preferences}',$2::jsonb) where user_id=$1", [userId, JSON.stringify(preferences)]);
    return preferences;
}

import { sessionTiming } from "../../domain/session-inactivity.js";

export async function readSessionTiming(db, payload) {
  const {rows} = await db.query("select metadata->'sessionActivity' as activity from workspace_account_metadata where user_id=$1", [payload.details.id]);
  return sessionTiming(payload, rows[0]?.activity);
}

export async function recordSessionActivity(db, userId, sessionId) {
  await db.query(`insert into workspace_account_metadata(user_id,metadata) values($1,jsonb_build_object('sessionActivity',jsonb_build_object('sessionId',$2::text,'lastActivityAt',clock_timestamp())))
    on conflict(user_id) do update set metadata=workspace_account_metadata.metadata || excluded.metadata`, [userId,sessionId]);
}

// Who held each phase (Site PM) or the project's Office PM role. Rows are closed, never deleted.
import { adminIds, notify } from "../../common/utilities/notify.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";

/** Makes sure the current holder has an open history row (older assignments predate the table). */
export async function ensureOpenHistory(db, { projectId, stageId = null, role, userId, startedAt = null, createdBy = null }) {
  const open = await db.query(
    `select id from engineer_assignment_history
      where project_id=$1 and coalesce(project_stage_id,0)=coalesce($2::smallint,0) and role_code=$3 and ended_at is null`,
    [projectId, stageId, role]);
  if (open.rowCount) return open.rows[0].id;
  return (await db.query(
    `insert into engineer_assignment_history(project_id,project_stage_id,role_code,user_id,kind,started_at,created_by)
     values($1,$2,$3,$4,'original',coalesce($5::timestamptz, now()),$6) returning id`,
    [projectId, stageId, role, userId, startedAt, createdBy])).rows[0].id;
}

export async function closeOpenHistory(db, { projectId, stageId = null, role }) {
  return db.query(
    `update engineer_assignment_history set ended_at=greatest(now(), started_at)
      where project_id=$1 and coalesce(project_stage_id,0)=coalesce($2::smallint,0) and role_code=$3 and ended_at is null
      returning id, user_id`, [projectId, stageId, role]);
}

export async function openTookOver(db, { projectId, stageId = null, role, userId, createdBy = null }) {
  return (await db.query(
    `insert into engineer_assignment_history(project_id,project_stage_id,role_code,user_id,kind,started_at,created_by)
     values($1,$2,$3,$4,'took_over',now(),$5) returning id`, [projectId, stageId, role, userId, createdBy])).rows[0].id;
}

/**
 * Called whenever a phase reaches 100%. Credits the current holder with "Completed phase".
 * Best effort: a problem here must never block the approval that triggered it.
 */
export async function markPhaseCompleted(db, projectId, stageId) {
  if (!projectId || !stageId) return;
  await db.query("savepoint phase_completed");
  try {
    const done = await db.query(
      `update engineer_assignment_history set completed_at=now()
        where project_id=$1 and project_stage_id=$2 and role_code='spm' and ended_at is null and completed_at is null
        returning user_id`, [projectId, stageId]);
    if (done.rowCount) {
      const took = await db.query(
        "select 1 from engineer_assignment_history where project_id=$1 and project_stage_id=$2 and kind='took_over' limit 1", [projectId, stageId]);
      if (took.rowCount) {
        const info = (await db.query(
          `select u.full_name, s.code as stage, p.suggested_opm_id from users u, project_stages s, projects p
            where u.id=$1 and s.id=$2 and p.id=$3`, [done.rows[0].user_id, stageId, projectId])).rows[0];
        await notify(db, { title: `${info.stage} completed by ${info.full_name}`, projectId,
          recipientIds: [...await adminIds(db), info.suggested_opm_id] });
      }
    }
    await db.query("release savepoint phase_completed");
  } catch (error) {
    await db.query("rollback to savepoint phase_completed");
    errorlog(error);
  }
}

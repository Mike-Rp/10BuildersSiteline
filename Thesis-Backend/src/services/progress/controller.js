import { v4 as uuidv4 } from "uuid";
import execute from "../../common/utilities/query.utility.js";
import {
  handleError, sendOk, sendError, requireUser,
  hasProjectAccess, isUuid, paging,
} from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { mirrorLegacyNotifications } from "../notifications/notification.utility.js";
 
import { submitPhaseUpdate } from "./phase.controller.js";
import { reportProjectIssue } from "./phase.controller.js";
export const submitProgressUpdate = submitPhaseUpdate;
export const getPendingUpdate = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);
 
    const result = await execute(
      `SELECT pu.id, pu.project_id, ps_prior.code AS prior_stage, pu.prior_pct,
              ps_req.code AS requested_stage, pu.requested_pct, pu.note,
              pu.is_material_change, pu.status, pu.submitted_at, pu.auto_approve_deadline_at
         FROM pending_progress_updates pu
         LEFT JOIN project_stages ps_prior ON ps_prior.id = pu.prior_stage_id
         LEFT JOIN project_stages ps_req   ON ps_req.id   = pu.requested_stage_id
        WHERE pu.project_id = $1 AND pu.status IN ('pending', 'escalated')
        ORDER BY pu.submitted_at DESC LIMIT 1`,
      [id]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows[0] ?? null);
  } catch (error) {
    return handleError(res, error);
  }
};
 
const retiredReview = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    return sendError(res, "Manual progress review is retired. Review individual checklist evidence instead.", 410);
  } catch (error) { return handleError(res, error); }
};
export const approveProgressUpdate = retiredReview;
export const rejectProgressUpdate = retiredReview;
export const sweepOverdueUpdates = retiredReview;
export const getEscalatedUpdates = retiredReview;

export const submitReworkRequest = reportProjectIssue;

export const getReworkRequests = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    const { limit, offset } = paging(req);
    const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
 
    const params = [status, limit, offset];
    let scope = "";
    if (user.role === "opm") {
      params.push(user.id);
      scope = `AND (p.suggested_opm_id = $4 OR EXISTS (
                 SELECT 1 FROM project_engineers pe
                  WHERE pe.project_id = p.id AND pe.user_id = $4 AND pe.unassigned_at IS NULL))`;
    }
 
    const result = await execute(
      `SELECT rw.id, rw.project_id, p.name AS project_name, ps.code AS stage_code,
              rw.reason, rw.issue_categories, rw.phase_update_id, rw.resulting_history_id, rw.status, rw.submitted_at, rw.resolved_at, rw.resolution_note
         FROM pending_rework_requests rw
         JOIN projects p ON p.id = rw.project_id
         LEFT JOIN project_stages ps ON ps.id = rw.project_stage_id
        WHERE rw.status = $1 ${scope}
        ORDER BY rw.submitted_at ASC
        LIMIT $2 OFFSET $3`,
      params
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};
 
export { approveRework, rejectRework, getReworkPreview } from "./rework.controller.js";

export const getProjectHistory = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!(await hasProjectAccess(user, id, null, { includeFormer: true }))) return sendError(res, "Project not found.", 404);
    const { limit, offset } = paging(req, 50, 200);
 
    const result = await execute(
      `SELECT h.id, ps.code AS stage_code, h.pct, h.note, h.is_issue, h.issue_categories, h.entry_type, h.recorded_at,
              ARRAY(SELECT file_id FROM project_phase_update_files f WHERE f.history_id = h.id) AS file_ids
         FROM project_progress_history h
         LEFT JOIN project_stages ps ON ps.id = h.project_stage_id
        WHERE h.project_id = $1
          ${user.role === "client" ? "AND h.is_client_visible = true" : ""}
        ORDER BY h.recorded_at DESC, h.id DESC
        LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};
 
export const addProjectNote = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    const { note_text } = req.body || {};
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!note_text || !String(note_text).trim()) return sendError(res, "note_text is required.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);
 
    const result = await execute(
      `INSERT INTO project_notes (id, project_id, author_id, note_text, noted_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, now(), $3, $3)
       RETURNING id, note_text, noted_at`,
      [uuidv4(), id, user.id, String(note_text).trim()]
    );
    return sendOk(res, "Note added.", 1, result.rows[0], 201);
  } catch (error) {
    return handleError(res, error);
  }
};
 
export const getProjectNotes = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);
    const { limit, offset } = paging(req, 50, 200);
 
    const result = await execute(
      `SELECT n.id,n.author_id, u.full_name AS author, n.note_text, n.noted_at
         FROM project_notes n
         LEFT JOIN users u ON u.id = n.author_id
        WHERE n.project_id = $1
        ORDER BY n.noted_at DESC
        LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeProjectNote = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    const { id, noteId } = req.params;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!isUuid(id) || !isUuid(noteId)) return sendError(res, "Invalid project or note id.", 400);
    if (reason.length < 5 || reason.length > 1000) return sendError(res, "Enter a removal reason between 5 and 1,000 characters.", 400);
    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);

    const data = await withTransaction(async db => {
      await db.query("select set_config('app.current_user_id',$1,true)", [user.id]);
      const project = (await db.query("select suggested_opm_id,lifecycle_status from projects where id=$1 and not coalesce(is_deleted,false) for update", [id])).rows[0];
      if (!project) return { error: [404, "Project not found."] };
      if (user.role === "opm" && project.suggested_opm_id !== user.id) return { error: [403, "Only the assigned Office PM can remove a site diary note."] };
      if (project.lifecycle_status === "archived") return { error: [409, "Completed project records are read-only."] };
      const note = (await db.query("select id,author_id,note_text from project_notes where id=$1 and project_id=$2 for update", [noteId, id])).rows[0];
      if (!note) return { error: [404, "Site diary note not found."] };

      await db.query("delete from project_notes where id=$1 and project_id=$2", [noteId, id]);
      const activity = await db.query(`insert into activity_log(activity_type_id,title,detail,actor_user_id,related_project_id)
        select id,'Site diary note removed',$1,$2,$3 from activity_types where code='notice' returning id`,
      [`Removal reason: ${reason}`, user.id, id]);
      if (activity.rowCount) {
        const recipients = [...new Set([user.id, note.author_id].filter(Boolean))];
        await db.query(`insert into notification_recipients(activity_log_id,recipient_user_id)
          select $1::bigint,recipient_id from unnest($2::uuid[]) as recipients(recipient_id) on conflict do nothing returning activity_log_id`,
        [activity.rows[0].id, recipients]);
        await mirrorLegacyNotifications(db, [activity.rows[0].id]);
      }
      return { removed: true };
    });
    if (data.error) return sendError(res, data.error[1], data.error[0]);
    return sendOk(res, "Site diary note removed from the project view. The removal is retained in the audit log.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

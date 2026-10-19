import { archiveNote,businessDeadline,recordArchiveEvent } from "../archive/audit.utility.js";
import { assertEligibleManager } from '../../common/utilities/license-eligibility.utility.js';
import { v4 as uuidv4 } from "uuid";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser,
  hasProjectAccess, isUuid, isBigintId, isSmallintId, paging,
} from "../../common/utilities/access.utility.js";


export const getMyConfirmations = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;

    const result = await execute(
      `SELECT ac.id, ac.project_id, p.name AS project_name, ac.role_context,
              ac.match_score, ac.status, ac.created_at
         FROM assignment_confirmations ac
         JOIN projects p ON p.id = ac.project_id
        WHERE ac.target_user_id = $1
          AND ac.status = 'pending'
          AND p.lifecycle_status <> 'archived' AND COALESCE(p.is_deleted, false) = false
        ORDER BY ac.created_at ASC`,
      [user.id]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getEscalatedConfirmations = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { limit, offset } = paging(req);

    const result = await execute(
      `SELECT ac.id, ac.project_id, p.name AS project_name, ac.target_user_id,
              u.full_name AS target_name, ac.role_context, ac.status,
              ac.escalated_at, ac.responded_at
         FROM assignment_confirmations ac
         JOIN projects p ON p.id = ac.project_id
         LEFT JOIN users u ON u.id = ac.target_user_id
        WHERE ac.escalated_to_admin = true
          AND ac.status IN ('declined', 'auto_expired')
        ORDER BY ac.escalated_at DESC NULLS LAST
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

export const acceptConfirmation = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    const note=archiveNote(req.body?.note);
    if (!isBigintId(id)) return sendError(res, "Invalid confirmation id.", 400);

    const data = await withTransaction(async (client) => {
      const owner=await client.query("SELECT project_id FROM assignment_confirmations WHERE id=$1 AND target_user_id=$2",[id,user.id]);
      if(!owner.rowCount) throw new HttpError(404,"Confirmation not found.");
      const p=await client.query("SELECT id,lifecycle_status FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[owner.rows[0].project_id]);
      if(!p.rowCount || p.rows[0].lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");

      const found = await client.query(
        `SELECT id, project_id, role_context, status
           FROM assignment_confirmations
          WHERE id = $1 AND target_user_id = $2
          FOR UPDATE`,
        [id, user.id]
      );
      if (found.rowCount === 0) throw new HttpError(404, "Confirmation not found.");
      const conf = found.rows[0];
      if (conf.status !== "pending") throw new HttpError(409, `Confirmation is already ${conf.status}.`);

      const updated = await client.query(
        `UPDATE assignment_confirmations
            SET status = 'accepted', responded_at = now(), updated_by = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, status, responded_at`,
        [id, user.id]
      );

      if (conf.role_context === "opm") {
        await client.query(
          `INSERT INTO project_engineers
             (id, project_id, user_id, project_role_label, assigned_at, created_by, updated_by)
           SELECT $1::uuid, $2::uuid, $3::uuid, 'Office PM (oversight)', now(), $3::uuid, $3::uuid
            WHERE NOT EXISTS (
              SELECT 1 FROM project_engineers
               WHERE project_id = $2::uuid AND user_id = $3::uuid
                 AND project_role_label = 'Office PM (oversight)'
                 AND unassigned_at IS NULL)`,
          [uuidv4(), conf.project_id, user.id]
        );

        await client.query(
          `UPDATE projects
              SET lifecycle_status = 'spm_review', updated_by = $2, updated_at = now()
            WHERE id = $1 AND lifecycle_status = 'sent_to_opm'`,
          [conf.project_id, user.id]
        );
      }
      await recordArchiveEvent(client,user.id,"assignment_confirmations",id,"assignment_response",{
        project_id:conf.project_id,user_id:user.id,response:"accepted",note});
      if(conf.role_context==="opm") {
        const clock=await client.query("SELECT now() AS now");
        await client.query("UPDATE project_phase_team SET response_deadline_at=$2,updated_by=$3,updated_at=now() WHERE project_id=$1 AND status='pending'",[conf.project_id,businessDeadline(clock.rows[0].now),user.id]);
      }
      return updated.rows[0];
    });

    return sendOk(res, "Confirmation accepted.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const declineConfirmation = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    const reason=archiveNote(req.body?.reason ?? req.body?.note,true);
    if (!isBigintId(id)) return sendError(res, "Invalid confirmation id.", 400);

    const data = await withTransaction(async (client) => {
      const owner=await client.query("SELECT project_id FROM assignment_confirmations WHERE id=$1 AND target_user_id=$2",[id,user.id]);
      if(!owner.rowCount) throw new HttpError(404,"Confirmation not found.");
      const p=await client.query("SELECT id,lifecycle_status FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[owner.rows[0].project_id]);
      if(!p.rowCount || p.rows[0].lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");

      const found = await client.query(
        `SELECT id, project_id, status FROM assignment_confirmations
          WHERE id = $1 AND target_user_id = $2 FOR UPDATE`,
        [id, user.id]
      );
      if (found.rowCount === 0) throw new HttpError(404, "Confirmation not found.");
      if (found.rows[0].status !== "pending") {
        throw new HttpError(409, `Confirmation is already ${found.rows[0].status}.`);
      }

      const updated = await client.query(
        `UPDATE assignment_confirmations
            SET status = 'declined', responded_at = now(),
                escalated_to_admin = true, escalated_at = now(),
                updated_by = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, status, responded_at`,
        [id, user.id]
      );
      await recordArchiveEvent(client,user.id,"assignment_confirmations",id,"assignment_response",{project_id:found.rows[0].project_id,user_id:user.id,response:"declined",reason});
      return updated.rows[0];
    });

    return sendOk(res, "Confirmation declined.", 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const reassignConfirmation = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { id } = req.params;
    const { new_user_id } = req.body || {};
    const note=archiveNote(req.body?.note);
    if (!isBigintId(id)) return sendError(res, "Invalid confirmation id.", 400);
    if (!isUuid(new_user_id)) return sendError(res, "new_user_id must be a valid UUID.", 400);

    const data = await withTransaction(async (client) => {
      const owner=await client.query("SELECT project_id FROM assignment_confirmations WHERE id=$1",[id]);
      if(!owner.rowCount) throw new HttpError(404,"Confirmation not found.");
      const p=await client.query("SELECT id,lifecycle_status FROM projects WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE",[owner.rows[0].project_id]);
      if(!p.rowCount || p.rows[0].lifecycle_status==="archived") throw new HttpError(409,"Archived projects are read-only.");

      const found = await client.query(
        `SELECT id, project_id, target_user_id, role_context, status
           FROM assignment_confirmations WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (found.rowCount === 0) throw new HttpError(404, "Confirmation not found.");
      const old = found.rows[0];
      if (!["declined", "auto_expired"].includes(old.status)) {
        throw new HttpError(422, `Only declined or expired confirmations can be reassigned (current: ${old.status}).`);
      }

     await assertEligibleManager(client, new_user_id, old.role_context);

      const target = await client.query(
        `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND u.status = 'active' AND r.code = $2`,
        [new_user_id, old.role_context]
      );
      if (target.rowCount === 0) {
        throw new HttpError(422, `new_user_id must be an active ${old.role_context.toUpperCase()}.`);
      }

      await client.query(
        `UPDATE assignment_confirmations
            SET status = 'reassigned', updated_by = $2, updated_at = now()
          WHERE id = $1`,
        [id, user.id]
      );

      const inserted = await client.query(
        `INSERT INTO assignment_confirmations
           (project_id, target_user_id, role_context, status, reassigned_from_id, created_by, updated_by)
         VALUES ($1, $2, $3, 'pending', $4, $5, $5)
         RETURNING id, status, reassigned_from_id`,
        [old.project_id, new_user_id, old.role_context, old.id, user.id]
      );

      if (old.role_context === "opm") {
        await client.query(
          `UPDATE projects
              SET suggested_opm_id = $2, suggested_opm_match_score = NULL,
                  updated_by = $3, updated_at = now()
            WHERE id = $1`,
          [old.project_id, new_user_id, user.id]
        );
      }
      await recordArchiveEvent(client,user.id,"assignment_confirmations",old.id,"assignment_reassigned",{project_id:old.project_id,from_user_id:old.target_user_id,to_user_id:new_user_id,to_confirmation_id:inserted.rows[0].id,note});
      return inserted.rows[0];
    });

    return sendOk(res, "Confirmation reassigned.", 1, data, 201);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getPhaseTeam = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid project id.", 400);

    if (!(await hasProjectAccess(user, id))) return sendError(res, "Project not found.", 404);

    const result = await execute(
      `SELECT pt.id AS assignment_id,pt.project_stage_id AS stage_id, ps.code AS stage_code, ps.sort_order,
              pt.spm_user_id, u.full_name AS spm_name, pt.status, pt.is_lead,
              pt.response_deadline_at, pt.responded_at
         FROM project_phase_team pt
         JOIN project_stages ps ON ps.id = pt.project_stage_id
         LEFT JOIN users u ON u.id = pt.spm_user_id
        WHERE pt.project_id = $1
        ORDER BY ps.sort_order ASC`,
      [id]
    );
    return sendOk(res, "Resource retrieved successfully.", result.rowCount, result.rows);
  } catch (error) {
    return handleError(res, error);
  }
};

const respondToPhase = (newStatus) => async (req, res) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    const { id, stageId } = req.params;
    const note=archiveNote(req.body?.note);
    const reason=newStatus==="declined" ? archiveNote(req.body?.reason ?? req.body?.note,true) : null;
    if (!isUuid(id) || !isSmallintId(stageId)) return sendError(res, "Invalid project or stage id.", 400);

    const data = await withTransaction(async (client) => {
      const project = await client.query(
        `SELECT id, lifecycle_status FROM projects WHERE id = $1 AND COALESCE(is_deleted, false) = false FOR UPDATE`, [id]);
      if (!project.rowCount) throw new HttpError(404, "Project not found.");
      if (!["spm_review", "active"].includes(project.rows[0].lifecycle_status)) {
        throw new HttpError(422, "The Office PM must accept the project before phase assignments can be confirmed.");
      }
      const found = await client.query(
        `SELECT id, status, response_deadline_at
           FROM project_phase_team
          WHERE project_id = $1 AND project_stage_id = $2 AND spm_user_id = $3
          FOR UPDATE`,
        [id, Number(stageId), user.id]
      );
      if (found.rowCount === 0) throw new HttpError(404, "Phase assignment not found.");
      const row = found.rows[0];
      if (row.status !== "pending") throw new HttpError(409, `Phase assignment is already ${row.status}.`);
      if (row.response_deadline_at && new Date(row.response_deadline_at) < new Date()) {
        throw new HttpError(409, "The response deadline has passed; ask an admin to reassign.");
      }

      const updated = await client.query(
        `UPDATE project_phase_team
            SET status = $2, responded_at = now(), updated_by = $3, updated_at = now()
          WHERE id = $1
          RETURNING project_stage_id AS stage_id, status, responded_at`,
        [row.id, newStatus, user.id]
      );

      if (newStatus === "confirmed") {
        const open = await client.query(
          `SELECT 1 FROM project_phase_team WHERE project_id = $1 AND status <> 'confirmed' LIMIT 1`,
          [id]
        );
        if (open.rowCount === 0) {
          await client.query(
            `UPDATE projects
                SET lifecycle_status = 'active',
                    current_stage_id = COALESCE(current_stage_id, (
                      SELECT t.project_stage_id FROM project_phase_team t
                      JOIN project_stages s ON s.id = t.project_stage_id
                      WHERE t.project_id = $1 AND t.status = 'confirmed' ORDER BY s.sort_order LIMIT 1)),
                    current_pct = CASE WHEN current_stage_id IS NULL THEN 0 ELSE current_pct END,
                    updated_by = $2, updated_at = now()
              WHERE id = $1 AND lifecycle_status = 'spm_review' AND EXISTS (SELECT 1 FROM project_documents d JOIN document_types t ON t.id=d.document_type_id WHERE d.project_id=$1 AND t.code='subcontractor_agreement' AND d.status='uploaded')
              AND EXISTS (SELECT 1 FROM project_subcontractor_assignments a WHERE a.project_id=$1 AND a.status='active')
              AND (SELECT count(*) FROM subcontractor_workers w WHERE w.current_project_id=$1 AND w.status='active' AND w.availability_status='assigned')>=crew_required`,
            [id, user.id]
          );
        }
      }
      await client.query("UPDATE projects SET updated_by=$2,updated_at=now() WHERE id=$1",[id,user.id]);
      await recordArchiveEvent(client,user.id,"project_phase_team",row.id,"phase_response",{project_id:id,user_id:user.id,stage_id:Number(stageId),response:newStatus==="confirmed" ? "accepted" : "declined",note,reason});
      return updated.rows[0];
    });

    return sendOk(res, `Phase assignment ${newStatus}.`, 1, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const acceptPhase = respondToPhase("confirmed");
export const declinePhase = respondToPhase("declined");
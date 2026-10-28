import { maybeCloseProject } from "../archive/policy.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser, isProjectOpmOrAdmin, isBigintId, paging,
} from "../../common/utilities/access.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js";
import { phaseProject, assertProjectSpm, readChecklist, recordPhaseHistory, assertPhaseUnlocked } from "./phase.utility.js";
import { insertFile } from "./phase-upload.utility.js";
import { submitChecklist } from "./phase-submission.utility.js";
import { updateBody, optionalNote, resolveStage, validateFiles, insertIssue, issueReason, rejectProgressInput } from "./phase-update.utility.js";

export const submitPhaseUpdate = async (req, res) => {
  try {
    const user = req.user ?? await requireUser(req, res, ["spm"]);
    if (!user) return;
    const body = updateBody(req.body);
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id, { active: true });
      await assertProjectSpm(client, user, p);
      await assertLicenseActive(user, client);
      const stage = await resolveStage(client, body, p.current_stage_id, p.project_type_id, p.id);
      await assertPhaseUnlocked(client, p, stage.id);
      const selected = { ...p, current_stage_id: stage.id, current_stage: stage.code };
      const existing = await client.query(
        "SELECT id FROM project_phase_updates WHERE project_id = $1 AND status = 'pending'", [p.id]);
      if (existing.rowCount) throw new HttpError(409, "This project already has an update awaiting OPM confirmation.");
      await validateFiles(client, selected, user.id, body.file_ids);
      const update = await client.query(
        `INSERT INTO project_phase_updates
           (project_id, selected_stage_id, prior_stage_id, prior_pct, note, issue_categories, issue_reason, submitted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, submitted_at`,
        [p.id, stage.id, p.current_stage_id, p.current_pct, body.note,
          body.issue_categories, body.issue_reason, user.id]);
      const id = update.rows[0].id;
      const files = [...body.file_ids];
      if (req.file) files.push((await insertFile(client, selected, req.file, user.id)).id);
      if (files.length) {
        await client.query(
          "INSERT INTO project_phase_submission_files (update_id, file_id) SELECT $1, unnest($2::uuid[])", [id, files]);
      }
      const checklist = await readChecklist(client, p.id, stage.id);
      const submissions = [];
      for (const item of body.checklist_submissions) {
        submissions.push(await submitChecklist(client, selected, user, item, id, checklist));
      }
      const isIssue = body.issue_categories.length > 0 || body.issue_reason !== null;
      if(isIssue&&Number(stage.id)!==Number(p.current_stage_id))throw new HttpError(422,"Issue reports must concern the current phase.");
      const issue = isIssue ? await insertIssue(client, selected, user.id, body, id) : null;
      return {
        ...update.rows[0], project_id: p.id, selected_stage_id: stage.id, selected_stage: stage.code,
        current_stage_id: p.current_stage_id, current_pct: p.current_pct,
        note: body.note, issue_categories: body.issue_categories, issue_id: issue?.id ?? null,
        file_ids: files, checklist_submissions: submissions,
      };
    });
    return sendOk(res, "Update submitted to the Office PM for confirmation.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

const resolvePhaseUpdate = decision => async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    if (!isBigintId(req.params.updateId)) return sendError(res, "Invalid update id.", 400);
    rejectProgressInput(req.body);
    const note = optionalNote(req.body?.resolution_note, "resolution_note");
    if (decision === "rejected" && !note) return sendError(res, "resolution_note is required for rejection.", 400);
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id, { active: true });
      if (!(await isProjectOpmOrAdmin(user, p.id, client))) throw new HttpError(403, "Office PM confirmation is required.");
      await assertLicenseActive(user, client);
      const found = await client.query(
        "SELECT * FROM project_phase_updates WHERE id = $1 AND project_id = $2 FOR UPDATE",
        [req.params.updateId, p.id]);
      if (!found.rowCount) throw new HttpError(404, "Update not found.");
      const update = found.rows[0];
      if (update.status !== "pending") throw new HttpError(409, `Update is already ${update.status}.`);
      if (decision === "rejected") {
        // Report review is independent of each evidence review and issue decision.
        await client.query(
          `UPDATE project_phase_updates SET status = 'rejected', resolved_by = $2, resolved_at = now(), resolution_note = $3
            WHERE id = $1`, [update.id, user.id, note]);
        return { id: update.id, status: "rejected", current_stage_id: p.current_stage_id, current_pct: p.current_pct };
      }
      if (Number(p.current_stage_id) !== Number(update.prior_stage_id)) {
        throw new HttpError(409, "The project's stage changed after submission. Reject this update and submit a new one.");
      }
      const stage = await resolveStage(client, { stage_id: update.selected_stage_id }, p.current_stage_id, p.project_type_id, p.id);
      const selected = { ...p, current_stage_id: stage.id, current_stage: stage.code };
      const checklist = await readChecklist(client, p.id, stage.id);
      const isIssue = update.issue_categories.length > 0 || update.issue_reason != null;
      const history = await recordPhaseHistory(client, selected, checklist.pct,
        update.note ?? (isIssue ? issueReason(update) : null), update.submitted_by,
        { isIssue, issueCategories: update.issue_categories, updateProject:false });
      await client.query(
        `INSERT INTO project_phase_update_files (history_id, file_id)
         SELECT $1, file_id FROM project_phase_submission_files WHERE update_id = $2`, [history.id, update.id]);
      await client.query(
        `UPDATE pending_rework_requests SET resulting_history_id = $2, updated_by = $3, updated_at = now()
          WHERE phase_update_id = $1`, [update.id, history.id, user.id]);
      await client.query(
        `UPDATE project_phase_updates SET status = 'approved', resolved_by = $2, resolved_at = now(),
          resolution_note = $3, history_id = $4 WHERE id = $1`, [update.id, user.id, note, history.id]);
      const projectArchived=await maybeCloseProject(client,p,user.id);
      return { id: update.id, status: "approved",project_archived:projectArchived,current_stage_id: p.current_stage_id,
        current_stage: p.current_stage, current_pct: p.current_pct, history_id: history.id };
    });
    return sendOk(res, `Update ${decision}.`, 1, data);
  } catch (error) { return handleError(res, error); }
};
export const approvePhaseUpdate = resolvePhaseUpdate("approved");
export const rejectPhaseUpdate = resolvePhaseUpdate("rejected");

export const getPhaseUpdates = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id);
      const result = await client.query(
        `SELECT u.*, s.code AS selected_stage,
           ARRAY(SELECT file_id FROM project_phase_submission_files WHERE update_id = u.id) AS file_ids,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.original_name, 'content_type', f.content_type,
             'byte_size', f.byte_size) ORDER BY f.uploaded_at, f.id), '[]'::jsonb)
            FROM project_phase_submission_files sf JOIN project_phase_files f ON f.id = sf.file_id AND f.project_id = u.project_id
            WHERE sf.update_id = u.id) AS files,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'item_id', e.checklist_item_id,
             'status', e.status, 'file_id', e.file_id, 'submission_note', e.submission_note)), '[]'::jsonb)
            FROM project_phase_evidence e WHERE e.phase_update_id = u.id) AS checklist_submissions
         FROM project_phase_updates u JOIN project_stages s ON s.id = u.selected_stage_id
         WHERE u.project_id = $1 ORDER BY u.id DESC LIMIT $2 OFFSET $3`,
        [p.id, paging(req).limit, paging(req).offset]);
      return result.rows;
    });
    return sendOk(res, "Project phase updates retrieved.", data.length, data);
  } catch (error) { return handleError(res, error); }
};

export const getPendingPhaseUpdates = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    const { limit, offset } = paging(req);
    const params = [limit, offset];
    let scope = "";
    if (user.role === "opm") {
      params.push(user.id);
      scope = `AND (p.suggested_opm_id = $3 OR EXISTS (SELECT 1 FROM project_engineers pe
        WHERE pe.project_id = p.id AND pe.user_id = $3 AND pe.unassigned_at IS NULL))`;
    }
    const result = await execute(
      `SELECT u.*, p.name AS project_name, s.code AS selected_stage
         FROM project_phase_updates u JOIN projects p ON p.id = u.project_id
         JOIN project_stages s ON s.id = u.selected_stage_id
        WHERE u.status = 'pending' AND COALESCE(p.is_deleted, false) = false ${scope}
        ORDER BY u.submitted_at, u.id LIMIT $1 OFFSET $2`, params);
    return sendOk(res, "Updates awaiting Office PM confirmation.", result.rowCount, result.rows);
  } catch (error) { return handleError(res, error); }
};

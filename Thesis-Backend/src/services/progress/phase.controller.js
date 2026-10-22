import { maybeCloseProject } from "../archive/policy.js";
import {
  HttpError, handleError, sendOk, sendError, requireUser,
  isProjectOpmOrAdmin, isUuid, isBigintId, isSmallintId,
} from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js";
import { insertFile } from "./phase-upload.utility.js";
import { submitChecklist } from "./phase-submission.utility.js";
import { optionalNote, resolveStage, stageOptions, ISSUE_CATEGORIES, updateBody, insertIssue } from "./phase-update.utility.js";
export { submitPhaseUpdate } from "./phase-update.controller.js";
import {
  phaseProject, assertProjectSpm, isProjectSpm, readChecklist, recordPhaseHistory,
} from "./phase.utility.js";

export const authorizePhaseUpload = async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    await withTransaction(async client => {
      const project = await phaseProject(client, user, req.params.id, { active: true });
      await assertProjectSpm(client, user, project);
      await assertLicenseActive(user, client);
    });
    req.user = user;
    return next();
  } catch (error) { return handleError(res, error); }
};

export const getPhaseOverview = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id);
      const stages = await stageOptions(client);
      const selected = await resolveStage(client, req.query ?? {}, p.current_stage_id ?? stages[0]?.id);
      const checklist = await readChecklist(client, p.id, selected.id);
      const canSubmit = p.lifecycle_status === "active" && await isProjectSpm(client, user, p);
      const owner = await client.query(
        `SELECT t.spm_user_id, u.full_name AS spm_name, t.status
           FROM project_phase_team t JOIN users u ON u.id = t.spm_user_id
          WHERE t.project_id = $1 AND t.project_stage_id = $2`, [p.id, selected.id]);
      const disciplines = await client.query(
        `SELECT DISTINCT d.id, d.code
           FROM project_stage_discipline_links l JOIN disciplines d ON d.id = l.discipline_id
          WHERE l.project_type_id = $1 AND l.project_stage_id = $2 ORDER BY d.code`,
        [p.project_type_id, selected.id]);
      const issues = await client.query(
        `SELECT id, reason, issue_categories, phase_update_id, status, submitted_by, submitted_at, resolved_at, resolution_note
           FROM pending_rework_requests WHERE project_id = $1 AND project_stage_id = $2
          ORDER BY submitted_at DESC, id DESC`, [p.id, selected.id]);
      const files = await client.query(
        `SELECT f.id, f.original_name, f.content_type, f.byte_size, f.uploaded_at
           FROM project_phase_files f
          WHERE f.project_id = $1 AND f.project_stage_id = $2
            AND NOT EXISTS (SELECT 1 FROM project_phase_evidence e WHERE e.file_id = f.id)
          ORDER BY f.uploaded_at DESC`, [p.id, selected.id]);
      const last = await client.query(
        `SELECT max(recorded_at) AS last_progress_updated_at FROM project_progress_history
          WHERE project_id = $1 AND project_stage_id = $2 AND entry_type <> 'issue'`, [p.id, p.current_stage_id]);
      const phaseOwner = owner.rows[0] ?? null;
      const pending = await client.query("SELECT * FROM project_phase_updates WHERE project_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1", [p.id]);
      const currentChecklist = selected.id === p.current_stage_id ? checklist : await readChecklist(client, p.id, p.current_stage_id);
      return {
        project_id: p.id, project_name: p.name, lifecycle_status: p.lifecycle_status,
        current_stage_id: p.current_stage_id, current_stage: p.current_stage,
        phase_owner: phaseOwner,
        your_phase_is_active: p.lifecycle_status === "active" &&
          selected.id === p.current_stage_id && phaseOwner?.status === "confirmed" && phaseOwner?.spm_user_id === user.id,
        can_submit: canSubmit, stages, issue_category_options: ISSUE_CATEGORIES,
        selected_stage_id: selected.id, selected_stage: selected.code, selected_stage_pct: checklist.pct,
        pending_update: pending.rows[0] ?? null,
        crew_assigned: p.crew_assigned, crew_required: p.crew_required,
        current_pct: currentChecklist.pct, progress_source: "approved_required_checklist_items",
        last_progress_updated_at: last.rows[0].last_progress_updated_at,
        checklist, recommended_disciplines: disciplines.rows, issues: issues.rows, files: files.rows,
      };
    });
    return sendOk(res, "Phase overview retrieved.", 1, data);
  } catch (error) { return handleError(res, error); }
};

async function itemProject(client, user, projectId, itemId, body = {}) {
  if (!isBigintId(itemId)) throw new HttpError(400, "Invalid checklist item id.");
  const p = await phaseProject(client, user, projectId, { active: true });
  await assertProjectSpm(client, user, p);
  const item = await client.query(
    "SELECT project_stage_id FROM project_phase_checklist_items WHERE id = $1 AND project_id = $2", [itemId, p.id]);
  if (!item.rowCount) throw new HttpError(404, "Checklist item not found.");
  const stage = await resolveStage(client, body, item.rows[0].project_stage_id);
  if (Number(stage.id) !== Number(item.rows[0].project_stage_id)) throw new HttpError(422, "The checklist item belongs to another stage.");
  return { ...p, current_stage_id: stage.id, current_stage: stage.code };
}

export const uploadEvidence = async (req, res) => {
  try {
    const data = await withTransaction(async client => {
      const p = await itemProject(client, req.user, req.params.id, req.params.itemId, req.body);
      const checklist = await readChecklist(client, p.id, p.current_stage_id);
      const item = checklist.items.find(i => String(i.id) === req.params.itemId);
      if (["pending", "approved"].includes(item?.status)) throw new HttpError(409, "Only missing or rejected evidence can be uploaded.");
      const file = await insertFile(client, p, req.file, req.user.id);
      const submission = await submitChecklist(client, p, req.user,
        { item_id: req.params.itemId, file_id: file.id, submission_note: optionalNote(req.body?.submission_note) }, null, checklist);
      return { ...submission, file };
    });
    return sendOk(res, "Evidence uploaded for Office PM review.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

export const markChecklistSubmitted = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    const body = updateBody({ stage_id: req.body?.stage_id, stage: req.body?.stage, checklist_submissions: [{
      item_id: req.params.itemId, file_id: req.body?.file_id, submission_note: req.body?.submission_note,
    }] });
    const data = await withTransaction(async client => {
      await assertLicenseActive(user, client);
      const p = await itemProject(client, user, req.params.id, req.params.itemId, body);
      return submitChecklist(client, p, user, body.checklist_submissions[0]);
    });
    return sendOk(res, "Checklist item submitted for Office PM verification.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

export const getProjectStages = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const stages = await withTransaction(async client => {
      await phaseProject(client, user, req.params.id);
      return stageOptions(client);
    });
    return sendOk(res, "Selectable stages retrieved.", stages.length, stages);
  } catch (error) { return handleError(res, error); }
};

export const reportProjectIssue = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["spm"]);
    if (!user) return;
    const body = updateBody({ ...req.body, issue_reason: req.body?.reason ?? req.body?.issue_reason });
    if (!body.issue_reason && !body.issue_categories.length) return sendError(res, "Provide a reason or an issue category.", 400);
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id, { active: true });
      await assertProjectSpm(client, user, p);
      await assertLicenseActive(user, client);
      const stage = await resolveStage(client, body, p.current_stage_id);
      const selected = { ...p, current_stage_id: stage.id, current_stage: stage.code };
      const checklist = await readChecklist(client, p.id, stage.id);
      const history = await recordPhaseHistory(client, selected, checklist.pct, body.issue_reason ?? body.note, user.id,
        { isIssue: true, issueCategories: body.issue_categories, entryType: "issue", updateProject: false });
      return insertIssue(client, selected, user.id, body, null, history.id);
    });
    return sendOk(res, "Issue reported.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

const reviewEvidence = decision => async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    if (!isBigintId(req.params.evidenceId)) return sendError(res, "Invalid evidence id.", 400);
    const note = optionalNote(req.body?.review_note);
    if (decision === "rejected" && !note) return sendError(res, "review_note is required for rejection.", 400);
    const data = await withTransaction(async client => {
      // All phase mutations lock the project first, then the evidence, to serialize approvals and transitions.
      const p = await phaseProject(client, user, req.params.id, { active: true });
      if (!(await isProjectOpmOrAdmin(user, p.id, client))) throw new HttpError(403, "Office PM approval is required.");
      await assertLicenseActive(user, client);
      const found = await client.query(
        `SELECT * FROM project_phase_evidence WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [req.params.evidenceId, p.id]);
      const evidence = found.rows[0];
      if (!evidence) throw new HttpError(404, "Evidence not found.");
      if (evidence.phase_update_id != null) throw new HttpError(409, "Confirm or reject the combined phase update instead.");
      const selected = { ...p, current_stage_id: evidence.project_stage_id };
      const latest = await client.query(
        `SELECT id FROM project_phase_evidence WHERE checklist_item_id = $1 ORDER BY id DESC LIMIT 1`,
        [evidence.checklist_item_id]);
      if (evidence.status !== "pending" || String(latest.rows[0].id) !== String(evidence.id)) {
        throw new HttpError(409, "Evidence is already reviewed or superseded.");
      }
      await client.query(
        `UPDATE project_phase_evidence SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
          WHERE id = $1`, [evidence.id, decision, user.id, note]);
      const checklist = await readChecklist(client, p.id, selected.current_stage_id);
      if (decision === "approved") {
        await recordPhaseHistory(client, selected, checklist.pct, note ?? "Checklist evidence approved.", user.id, { entryType: "checklist_review" });
      }
      const projectArchived=decision==="approved" && Number(p.current_stage_id)===Number(selected.current_stage_id)
        ? await maybeCloseProject(client,p,user.id) : false;
      return { evidence_id: evidence.id, status: decision,project_archived:projectArchived, stage_pct: checklist.pct, current_pct: Number(p.current_stage_id) === Number(selected.current_stage_id) ? checklist.pct : p.current_pct,
        approved_count: checklist.approved_count, required_count: checklist.required_count };
    });
    return sendOk(res, `Evidence ${decision}.`, 1, data);
  } catch (error) { return handleError(res, error); }
};
export const approveEvidence = reviewEvidence("approved");
export const rejectEvidence = reviewEvidence("rejected");

export const uploadPhaseFile = async (req, res) => {
  try {
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, req.user, req.params.id, { active: true });
      await assertProjectSpm(client, req.user, p);
      const stage = await resolveStage(client, req.body, p.current_stage_id);
      return insertFile(client, { ...p, current_stage_id: stage.id }, req.file, req.user.id);
    });
    return sendOk(res, "Optional phase file uploaded.", 1, data, 201);
  } catch (error) { return handleError(res, error); }
};

export const downloadPhaseFile = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    if (!isUuid(req.params.id) || !isUuid(req.params.fileId)) return sendError(res, "Invalid project or file id.", 400);
    const data = await withTransaction(async client => {
      await phaseProject(client, user, req.params.id);
      const file = await client.query(
        `SELECT original_name, content_type, content FROM project_phase_files
          WHERE id = $1 AND project_id = $2`, [req.params.fileId, req.params.id]);
      if (!file.rowCount) throw new HttpError(404, "File not found.");
      return file.rows[0];
    });
    res.set("Content-Type", data.content_type);
    res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(data.original_name)}`);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    return res.send(data.content);
  } catch (error) { return handleError(res, error); }
};

export const getProjectIssues = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm", "spm"]);
    if (!user) return;
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id);
      const issues = await client.query(
        `SELECT id, project_stage_id AS stage_id, reason, issue_categories, phase_update_id, resulting_history_id, status, submitted_at, resolved_at, resolution_note
           FROM pending_rework_requests WHERE project_id = $1 ORDER BY submitted_at DESC, id DESC`, [p.id]);
      return issues.rows;
    });
    return sendOk(res, "Issues retrieved.", data.length, data);
  } catch (error) { return handleError(res, error); }
};

export const advancePhase = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin", "opm"]);
    if (!user) return;
    const data = await withTransaction(async client => {
      const p = await phaseProject(client, user, req.params.id, { active: true });
      if (!(await isProjectOpmOrAdmin(user, p.id, client))) throw new HttpError(403, "Office PM approval is required.");
      await assertLicenseActive(user, client);
      const checklist = await readChecklist(client, p.id, p.current_stage_id);
      if (!checklist.configured || checklist.approved_count !== checklist.required_count) {
        throw new HttpError(422, "All required checklist items must be approved before advancing.");
      }
      const next = await client.query(
        `SELECT t.project_stage_id, t.status, s.code
           FROM project_phase_team t JOIN project_stages s ON s.id = t.project_stage_id
          WHERE t.project_id = $1 AND s.sort_order >
            (SELECT sort_order FROM project_stages WHERE id = $2)
          ORDER BY s.sort_order LIMIT 1`, [p.id, p.current_stage_id]);
      if (!next.rowCount) throw new HttpError(409, "This is the project's final assigned phase.");
      const phase = next.rows[0];
      if (phase.status !== "confirmed") throw new HttpError(422, "The next phase SPM must confirm their assignment.");
      const nextChecklist = await readChecklist(client, p.id, phase.project_stage_id);
      if (!nextChecklist.configured) throw new HttpError(422, "Configure the next phase's checklist before advancing.");
      await client.query(
        `UPDATE projects SET current_stage_id = $2, current_pct = $3, updated_by = $4, updated_at = now() WHERE id = $1`,
        [p.id, phase.project_stage_id, nextChecklist.pct, user.id]);
      await recordPhaseHistory(client, { ...p, current_stage_id: phase.project_stage_id },
        nextChecklist.pct, "Office PM activated the next phase.", user.id);
      return { project_id: p.id, current_stage_id: phase.project_stage_id,
        current_stage: phase.code, current_pct: nextChecklist.pct };
    });
    return sendOk(res, "Next phase activated.", 1, data);
  } catch (error) { return handleError(res, error); }
};

export const configurePhaseTemplate = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    if (!isSmallintId(req.params.stageId)) return sendError(res, "Invalid stage id.", 400);
    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length || items.length > 100 ||
        items.some(i => !i || typeof i.code !== "string" || !/^[a-z0-9_]{1,80}$/.test(i.code) ||
          typeof i.title !== "string" || !i.title.trim() || i.title.length > 500 ||
          (i.required !== undefined && typeof i.required !== "boolean")) ||
        new Set(items.map(i => i.code)).size !== items.length ||
        !items.some(i => i.required !== false)) {
      return sendError(res, "Provide 1–100 unique checklist items with code, title, and at least one required item.", 400);
    }
    await withTransaction(async client => {
      const stage = await client.query("SELECT id FROM project_stages WHERE id = $1 FOR UPDATE", [req.params.stageId]);
      if (!stage.rowCount) throw new HttpError(404, "Stage not found.");
      await client.query("DELETE FROM phase_checklist_templates WHERE project_stage_id = $1", [req.params.stageId]);
      for (const [index, item] of items.entries()) {
        await client.query(
          `INSERT INTO phase_checklist_templates (project_stage_id, code, title, required, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.stageId, item.code, item.title.trim(), item.required ?? true, index + 1]);
      }
    });
    return sendOk(res, "Template saved for phases whose checklists have not yet been initialized.", items.length, items);
  } catch (error) { return handleError(res, error); }
};
